import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate, templateEntries, uniqueFolder } from "../templates";
import { validateName } from "@/lib/files/validate-name";

describe("TEMPLATES", () => {
  it("has the templates that the owner chose, React + FastAPI and React + TypeScript + Express", () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(["express", "node-script", "python", "react-fastapi", "react-ts-express", "vite-react"]);
  });
  it("has a valid entry file in every template", () => {
    for (const t of TEMPLATES) expect(Object.keys(t.files)).toContain(t.entry);
  });
  it("uses valid names for every path segment", () => {
    for (const t of TEMPLATES) {
      for (const path of Object.keys(t.files)) {
        for (const seg of path.split("/")) expect(validateName(seg).ok, `${t.id}: ${seg}`).toBe(true);
      }
    }
  });
  it("has valid JSON in every package.json and a start path for servers", () => {
    for (const t of TEMPLATES) {
      const pkg = t.files["package.json"];
      if (pkg) expect(() => JSON.parse(pkg)).not.toThrow();
      if (t.serves) expect(t.run.length).toBeGreaterThan(0);
    }
  });
  it("finds a template by id", () => {
    expect(getTemplate("python")?.runtime).toBe("python");
    expect(getTemplate("nope")).toBeUndefined();
  });
});

describe("uniqueFolder", () => {
  it("keeps a free name", () => {
    expect(uniqueFolder("vite-react", ["index.js"])).toBe("vite-react");
  });
  it("adds a number when the name is taken, without case", () => {
    expect(uniqueFolder("vite-react", ["Vite-React"])).toBe("vite-react-2");
    expect(uniqueFolder("app", ["app", "app-2"])).toBe("app-3");
  });
});

describe("templateEntries", () => {
  it("lists folders before the files that they hold", () => {
    const t = getTemplate("vite-react")!;
    const entries = templateEntries(t, "my-app");
    const keys = entries.map(([k]) => k);
    expect(keys[0]).toBe("my-app/");
    expect(keys).toContain("my-app/src/");
    expect(keys.indexOf("my-app/src/")).toBeLessThan(keys.indexOf("my-app/src/App.jsx"));
    expect(keys).toContain("my-app/package.json");
  });
  it("gives a folder key an empty value and a file its content", () => {
    const t = getTemplate("node-script")!;
    const map = new Map(templateEntries(t, "s"));
    expect(map.get("s/")).toBe("");
    expect(map.get("s/index.js")).toContain("console.log");
  });
});
