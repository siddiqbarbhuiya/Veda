// Turns graphify-out/graph.json into a small Mermaid diagram of the code folders, and writes it into README.md
// between <!-- graph:start --> and <!-- graph:end -->. GitHub draws Mermaid in a README, so there is no image file.
//
// Usage: node scripts/graph-mermaid.mjs [graph.json] [README.md]
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const START = "<!-- graph:start -->";
export const END = "<!-- graph:end -->";

const LINK_KINDS = new Set(["imports", "imports_from", "calls"]);
const MAX_EDGES = 28;
const COLORS = { app: "#4f46e5", components: "#0891b2", hooks: "#059669", lib: "#d97706", types: "#7c3aed", other: "#64748b" };

/** The folder of a source file, as a short name. Tests and files outside `src/` are left out. */
export function groupOf(file) {
  if (typeof file !== "string" || !file.startsWith("src/") || /__tests__|\.test\.|\.spec\./.test(file)) return null;
  const parts = file.slice(4).split("/");
  parts.pop(); // the file name
  if (parts.length === 0) return "src";
  // app/api, components/ide, lib/agent, hooks: at most two folders deep
  return parts.slice(0, 2).join("/");
}

/** Mermaid text: one box for each folder (with its symbol count) and arrows for the strongest dependencies. */
export function buildMermaid(graph, { maxEdges = MAX_EDGES } = {}) {
  const nodes = graph.nodes ?? [];
  const links = graph.links ?? graph.edges ?? [];
  const groupById = new Map();
  const size = new Map();
  for (const n of nodes) {
    const g = groupOf(n.source_file);
    if (!g) continue;
    groupById.set(n.id, g);
    size.set(g, (size.get(g) ?? 0) + 1);
  }
  const weight = new Map();
  for (const l of links) {
    if (!LINK_KINDS.has(l.relation)) continue;
    const a = groupById.get(typeof l.source === "object" ? l.source.id : l.source);
    const b = groupById.get(typeof l.target === "object" ? l.target.id : l.target);
    if (!a || !b || a === b) continue;
    const k = `${a}\u0000${b}`;
    weight.set(k, (weight.get(k) ?? 0) + 1);
  }
  const edges = [...weight.entries()]
    .map(([k, w]) => ({ from: k.split("\u0000")[0], to: k.split("\u0000")[1], w }))
    .sort((x, y) => y.w - x.w || x.from.localeCompare(y.from) || x.to.localeCompare(y.to))
    .slice(0, maxEdges);
  const shown = new Set(edges.flatMap((e) => [e.from, e.to]));
  const names = [...size.keys()].filter((g) => shown.has(g)).sort();
  const id = new Map(names.map((g, i) => [g, `n${i}`]));
  const top = (g) => (g.split("/")[0] in COLORS ? g.split("/")[0] : "other");

  // One block for each layer (app, components, hooks, lib), so the picture reads as layers.
  const lines = ["flowchart LR"];
  for (const layer of Object.keys(COLORS)) {
    const members = names.filter((g) => top(g) === layer);
    if (members.length === 0) continue;
    lines.push(`  subgraph L_${layer}["${layer}"]`);
    for (const g of members) lines.push(`    ${id.get(g)}["${g}<br/>${size.get(g)} symbols"]:::${layer}`);
    lines.push("  end");
  }
  for (const e of edges) lines.push(`  ${id.get(e.from)} -->|${e.w}| ${id.get(e.to)}`);
  for (const [k, c] of Object.entries(COLORS)) lines.push(`  classDef ${k} fill:${c},stroke:${c},color:#ffffff`);
  return lines.join("\n");
}

/** README text with the block between the markers replaced. Throws when the markers are missing. */
export function replaceBlock(readme, mermaid) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error(`README needs ${START} and ${END}`);
  const nl = readme.includes("\r\n") ? "\r\n" : "\n";
  const body = ["```mermaid", mermaid, "```"].join("\n").replace(/\n/g, nl);
  return readme.slice(0, a + START.length) + nl + body + nl + readme.slice(b);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [graphPath = "graphify-out/graph.json", readmePath = "README.md"] = process.argv.slice(2);
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const text = replaceBlock(fs.readFileSync(readmePath, "utf8"), buildMermaid(graph));
  fs.writeFileSync(readmePath, text);
  console.log(`README graph updated (${text.length} characters)`);
}
