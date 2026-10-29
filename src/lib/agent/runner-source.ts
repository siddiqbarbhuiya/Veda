/**
 * Source of `runner.mjs`. The server writes it into the sandbox before each run.
 * It needs `@anthropic-ai/claude-agent-sdk` installed next to it (the E2B template does this, see
 * docs/setup/claude-code-sandbox.md). It runs Claude Code through the Agent SDK, writes one JSON event per line
 * to `<run dir>/events.ndjson`, and writes the file changes at the end.
 *
 * Kept as a plain string on purpose: no template literals inside, so no escaping problems.
 * `src/lib/agent/__tests__/runner-source.test.ts` checks that it parses.
 */
export const RUNNER_SOURCE = String.raw`import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = process.argv[2];
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const RUN_DIR = path.dirname(inputPath);
const EVENTS = path.join(RUN_DIR, "events.ndjson");
const PROJECT = input.cwd;
const STOP_FILE = path.join(RUN_DIR, "stop");
const SKIP = new Set(["node_modules", ".git", ".claude", ".next", "dist", "build", "__pycache__", ".venv", ".veda"]);
const MAX_FILE_BYTES = 1000000;
const MAX_TOTAL_BYTES = 5000000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
function emit(e) {
  fs.appendFileSync(EVENTS, JSON.stringify(Object.assign({ seq: seq++ }, e)) + "\n");
}

function cut(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function summarize(name, inp) {
  inp = inp || {};
  if (name === "ExitPlanMode") return cut(inp.plan, 4000);
  if (name === "Bash") return cut(inp.command, 300);
  if (inp.file_path) return cut(inp.file_path, 300);
  if (inp.path) return cut(inp.path, 300);
  if (inp.pattern) return cut(inp.pattern, 300);
  return cut(JSON.stringify(inp), 200);
}

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? base + "/" + entry.name : entry.name;
    if (entry.isDirectory()) walk(full, rel, out);
    else if (entry.isFile()) out[rel] = full;
  }
}

function readText(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_FILE_BYTES) return null;
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

// Make the folder equal to the files from the browser: remove what the browser does not have.
function prune() {
  fs.mkdirSync(PROJECT, { recursive: true });
  const present = {};
  walk(PROJECT, "", present);
  for (const rel of Object.keys(present)) {
    if (!Object.prototype.hasOwnProperty.call(input.files, rel)) fs.rmSync(present[rel], { force: true });
  }
}

function collectChanges() {
  const now = {};
  walk(PROJECT, "", now);
  const changes = [];
  let total = 0;
  for (const rel of Object.keys(now)) {
    const text = readText(now[rel]);
    if (text === null) continue;
    const had = Object.prototype.hasOwnProperty.call(input.files, rel);
    if (had && input.files[rel] === text) continue;
    total += text.length;
    if (total > MAX_TOTAL_BYTES) return { tooLarge: true, changes: [] };
    changes.push({ path: rel, op: had ? "update" : "create", content: text });
  }
  for (const rel of Object.keys(input.files)) {
    if (!Object.prototype.hasOwnProperty.call(now, rel)) changes.push({ path: rel, op: "delete" });
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { tooLarge: false, changes };
}

const ac = new AbortController();
let stopped = false;
const stopTimer = setInterval(() => {
  if (!stopped && fs.existsSync(STOP_FILE)) {
    stopped = true;
    ac.abort();
  }
}, 500);
const deadlineTimer = setTimeout(() => {
  stopped = true;
  emit({ type: "error", code: "run_timeout", message: "The run took too long and was stopped." });
  ac.abort();
}, input.maxSeconds * 1000);

// Tools the student allowed for the rest of this run ("Allow all ... in this run").
const alwaysAllowed = new Set();
async function canUseTool(toolName, toolInput) {
  if (alwaysAllowed.has(toolName)) return { behavior: "allow", updatedInput: toolInput };
  const id = crypto.randomUUID();
  emit({ type: "permission", id: id, tool: toolName, summary: summarize(toolName, toolInput) });
  const answerFile = path.join(RUN_DIR, "perm-" + id + ".json");
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    if (stopped) return { behavior: "deny", message: "The run was stopped." };
    if (fs.existsSync(answerFile)) {
      let answer = {};
      try {
        answer = JSON.parse(fs.readFileSync(answerFile, "utf8"));
      } catch (e) {
        /* the file may be half written: read again */
        await sleep(100);
        continue;
      }
      if (answer.allow) {
        if (answer.always && (toolName === "Bash" || toolName === "Edit" || toolName === "Write")) alwaysAllowed.add(toolName);
        return { behavior: "allow", updatedInput: toolInput };
      }
      return { behavior: "deny", message: "The student did not allow this action." };
    }
    await sleep(300);
  }
  return { behavior: "deny", message: "The student did not answer in time." };
}

const APPEND =
  "You run inside Veda, a browser code editor for students. The project is the current folder. " +
  "Do not start development servers or long-running processes. " +
  "The student reviews your file changes before they apply, so keep changes focused. " +
  "Explain what you did in short, plain sentences.";

async function main() {
  emit({ type: "status", state: "running" });
  prune();

  const sessionFile = input.sessionFile;
  let resume;
  if (!input.newConversation && sessionFile && fs.existsSync(sessionFile)) {
    try {
      resume = JSON.parse(fs.readFileSync(sessionFile, "utf8")).sessionId;
    } catch (e) {
      resume = undefined;
    }
  }

  // The mode decides what runs without asking:
  //   manual: asks for every edit and command   edits: edits run, commands ask
  //   plan: reads and plans, then asks to leave plan mode   auto: nothing asks (the sandbox is the safety net)
  const MODE = input.mode || "edits";
  const READ_TOOLS = ["Read", "Glob", "Grep", "TodoWrite"];
  const options = {
    cwd: PROJECT,
    model: input.model,
    maxTurns: input.maxTurns,
    permissionMode: MODE === "manual" ? "default" : MODE === "plan" ? "plan" : MODE === "auto" ? "bypassPermissions" : "acceptEdits",
    allowedTools: MODE === "edits" || MODE === "auto" ? READ_TOOLS.concat(["Edit", "Write"]) : READ_TOOLS,
    disallowedTools: ["WebSearch", "WebFetch"],
    canUseTool: canUseTool,
    settingSources: ["project"],
    systemPrompt: { type: "preset", preset: "claude_code", append: APPEND },
    abortController: ac,
    env: Object.assign({}, process.env, { CLAUDE_AGENT_SDK_CLIENT_APP: "veda/1.0" }),
  };
  if (MODE === "auto") options.allowDangerouslySkipPermissions = true;
  if (resume) options.resume = resume;

  for await (const m of query({ prompt: input.prompt, options: options })) {
    if (m.type === "system" && m.subtype === "init" && sessionFile && m.session_id) {
      fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
      fs.writeFileSync(sessionFile, JSON.stringify({ sessionId: m.session_id }));
    } else if (m.type === "assistant") {
      for (const block of (m.message && m.message.content) || []) {
        if (block.type === "text" && block.text) emit({ type: "text", text: block.text });
        else if (block.type === "thinking" && block.thinking) emit({ type: "thinking", text: cut(block.thinking, 2000) });
        else if (block.type === "tool_use") emit({ type: "tool_use", id: block.id, name: block.name, summary: summarize(block.name, block.input) });
      }
    } else if (m.type === "user") {
      const content = m.message && m.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type !== "tool_result") continue;
          let out = block.content;
          if (Array.isArray(out)) out = out.map((c) => (c && c.text) || "").join("\n");
          emit({ type: "tool_result", id: block.tool_use_id, ok: !block.is_error, output: cut(out, 2000) });
        }
      }
    } else if (m.type === "result") {
      const u = m.usage || {};
      emit({
        type: "usage",
        input_tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
        output_tokens: u.output_tokens || 0,
      });
      if (m.is_error || (m.subtype && m.subtype !== "success")) {
        emit({ type: "error", code: String(m.subtype || "agent_error"), message: cut(m.result || "Claude Code stopped with an error.", 500) });
      }
    }
  }
}

try {
  await main();
} catch (err) {
  if (!stopped) {
    emit({ type: "error", code: "runner_failed", message: cut(err && err.message ? err.message : err, 500) });
  }
} finally {
  clearInterval(stopTimer);
  clearTimeout(deadlineTimer);
  try {
    const result = collectChanges();
    if (result.tooLarge) emit({ type: "error", code: "changes_too_large", message: "The changes are larger than 5 MB and were not sent." });
    else if (result.changes.length > 0) emit({ type: "changes", changes: result.changes });
  } catch (err) {
    emit({ type: "error", code: "changes_failed", message: cut(err && err.message ? err.message : err, 300) });
  }
  emit({ type: "done" });
  process.exit(0);
}
`;
