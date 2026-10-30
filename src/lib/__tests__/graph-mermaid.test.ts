// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Mod = {
  START: string;
  END: string;
  groupOf: (f: unknown) => string | null;
  buildMermaid: (g: unknown, o?: { maxEdges?: number }) => string;
  replaceBlock: (readme: string, m: string) => string;
};
const load = async (): Promise<Mod> =>
  import(/* @vite-ignore */ pathToFileURL(path.resolve(__dirname, "../../../scripts/graph-mermaid.mjs")).href);

const node = (id: string, file: string | undefined) => ({ id, source_file: file });
const link = (source: string, target: string, relation = "imports") => ({ source, target, relation });

describe("groupOf", () => {
  it("groups by folder, two folders deep", async () => {
    const { groupOf } = await load();
    expect(groupOf("src/lib/agent/token.ts")).toBe("lib/agent");
    expect(groupOf("src/lib/agent/sub/x.ts")).toBe("lib/agent");
    expect(groupOf("src/components/ide/composer.tsx")).toBe("components/ide");
    expect(groupOf("src/app/api/agent/run/route.ts")).toBe("app/api");
    expect(groupOf("src/app/page.tsx")).toBe("app");
    expect(groupOf("src/hooks/use-agent.ts")).toBe("hooks");
    expect(groupOf("src/middleware.ts")).toBe("src");
  });
  it("leaves out tests, files outside src, and missing values", async () => {
    const { groupOf } = await load();
    for (const f of ["src/lib/__tests__/a.ts", "src/lib/a.test.ts", ".claude/skills/x.cjs", "scripts/a.mjs", undefined, null, 5]) {
      expect(groupOf(f), String(f)).toBeNull();
    }
  });
});

describe("buildMermaid", () => {
  const graph = {
    nodes: [node("a", "src/hooks/use-agent.ts"), node("b", "src/hooks/use-ai-chat.ts"), node("c", "src/lib/agent/token.ts"), node("d", "src/components/ide/composer.tsx"), node("t", "src/lib/__tests__/x.ts"), node("s", ".claude/skills/x.cjs")],
    links: [link("a", "c"), link("b", "c"), link("d", "a"), link("a", "b"), link("a", "t"), link("a", "s"), link("c", "a", "contains")],
  };
  it("makes one box for each folder with its symbol count, and arrows with counts", async () => {
    const { buildMermaid } = await load();
    const m = buildMermaid(graph);
    expect(m.startsWith("flowchart LR")).toBe(true);
    expect(m).toContain('hooks<br/>2 symbols');
    expect(m).toContain('subgraph L_hooks["hooks"]'); // each folder sits in the block of its layer
    expect(m).toContain('lib/agent<br/>1 symbols');
    expect(m).toMatch(/-->\|2\|/); // hooks -> lib/agent has two links
  });
  it("ignores links inside one folder, other link kinds, tests and files outside src", async () => {
    const { buildMermaid } = await load();
    const m = buildMermaid(graph);
    expect(m).not.toContain("__tests__");
    expect(m).not.toContain("skills");
    // a->b is inside hooks, c->a is "contains": neither is an arrow
    expect(m.match(/-->/g)?.length).toBe(2);
  });
  it("keeps only the strongest edges, and is the same every time", async () => {
    const { buildMermaid } = await load();
    expect(buildMermaid(graph, { maxEdges: 1 }).match(/-->/g)?.length).toBe(1);
    expect(buildMermaid(graph)).toBe(buildMermaid(graph));
  });
  it("accepts links whose ends are objects, and an empty graph", async () => {
    const { buildMermaid } = await load();
    const objectEnds = { nodes: graph.nodes, links: [{ source: { id: "d" }, target: { id: "c" }, relation: "calls" }] };
    expect(buildMermaid(objectEnds)).toContain("-->");
    expect(buildMermaid({ nodes: [], links: [] })).toBe(buildMermaid({}));
  });
});

describe("replaceBlock", () => {
  it("replaces what is between the markers and keeps the rest", async () => {
    const { START, END, replaceBlock } = await load();
    const readme = `# T\n\n${START}\nold\n${END}\n\nafter\n`;
    const out = replaceBlock(readme, "flowchart LR\n  a --> b");
    expect(out).toBe(`# T\n\n${START}\n\`\`\`mermaid\nflowchart LR\n  a --> b\n\`\`\`\n${END}\n\nafter\n`);
    expect(replaceBlock(out, "flowchart LR\n  a --> b")).toBe(out); // same text again: no change
  });
  it("keeps Windows line endings", async () => {
    const { START, END, replaceBlock } = await load();
    const out = replaceBlock(`x\r\n${START}\r\n${END}\r\n`, "flowchart LR");
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });
  it("throws when the markers are missing or in the wrong order", async () => {
    const { START, END, replaceBlock } = await load();
    expect(() => replaceBlock("no markers", "m")).toThrow(/needs/);
    expect(() => replaceBlock(`${END}\n${START}`, "m")).toThrow();
  });
});
