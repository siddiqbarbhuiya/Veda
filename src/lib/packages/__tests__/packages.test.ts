import { describe, expect, it, vi } from "vitest";
import { formatDownloads, npmSearchUrl, parseNpmSearch, searchNpm } from "../npm-search";
import { lookupPypi, matchBuiltIn, parsePyodideLock } from "../pip-search";
import { isNpmInstalled, listNpmDeps, npmNameOf } from "../installed";
import { addRequirement, removeRequirement } from "@/lib/templates/pip";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("parseNpmSearch", () => {
  it("reads name, version, description and weekly downloads", () => {
    const list = parseNpmSearch({
      objects: [
        { package: { name: "lodash", version: "4.17.21", description: "Lodash modular utilities." }, downloads: { weekly: 50_000_000, monthly: 1 } },
        { package: { name: "lodash.get", version: "4.4.2" } },
      ],
    });
    expect(list).toEqual([
      { name: "lodash", version: "4.17.21", description: "Lodash modular utilities.", weekly: 50_000_000 },
      { name: "lodash.get", version: "4.4.2", description: "", weekly: null },
    ]);
  });
  it("skips bad entries and survives bad input", () => {
    expect(parseNpmSearch({ objects: [null, {}, { package: { name: 1 } }, { package: { name: "ok", version: "1.0.0" } }] }).map((p) => p.name)).toEqual(["ok"]);
    expect(parseNpmSearch(null)).toEqual([]);
    expect(parseNpmSearch({ objects: "no" })).toEqual([]);
  });
});

describe("searchNpm", () => {
  it("encodes the text in the address", () => {
    expect(npmSearchUrl(" react dom ", 5)).toBe("https://registry.npmjs.org/-/v1/search?text=react%20dom&size=5");
  });
  it("does not call the network for a very short text", async () => {
    const fetchImpl = vi.fn();
    expect(await searchNpm("a", { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("returns parsed results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ objects: [{ package: { name: "axios", version: "1.7.0" } }] }));
    const list = await searchNpm("axios", { fetchImpl });
    expect(list[0].name).toBe("axios");
    expect(fetchImpl.mock.calls[0][0]).toContain("text=axios");
  });
  it("throws a clear error for a bad status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(searchNpm("react", { fetchImpl })).rejects.toThrow("status 429");
  });
});

describe("formatDownloads", () => {
  it("gives short counts", () => {
    expect(formatDownloads(null)).toBe("");
    expect(formatDownloads(950)).toBe("950/week");
    expect(formatDownloads(1500)).toBe("1.5K/week");
    expect(formatDownloads(25_000)).toBe("25K/week");
    expect(formatDownloads(12_300_000)).toBe("12M/week");
    expect(formatDownloads(5_000_000)).toBe("5M/week");
    expect(formatDownloads(3_200_000_000)).toBe("3.2B/week");
  });
});

describe("Pyodide built-in packages", () => {
  const lock = {
    packages: {
      numpy: { package_type: "package" },
      "numpy-tests": { package_type: "package" },
      pandas: { package_type: "package" },
      pydantic: {},
      "pydantic-core": {},
      micropip: {},
      sqlite3: { package_type: "cpython_module" },
    },
  };
  it("lists package names without test and stdlib modules", () => {
    expect(parsePyodideLock(lock)).toEqual(["micropip", "numpy", "pandas", "pydantic", "pydantic-core"]);
    expect(parsePyodideLock(null)).toEqual([]);
  });
  it("ranks exact, then prefix, then contains", () => {
    const names = ["scipy", "numpy", "numpydoc", "pynum", "pandas"];
    expect(matchBuiltIn(names, "numpy")).toEqual(["numpy", "numpydoc"]);
    expect(matchBuiltIn(names, "num")).toEqual(["numpy", "numpydoc", "pynum"]);
    expect(matchBuiltIn(names, "NUM", 2)).toEqual(["numpy", "numpydoc"]);
    expect(matchBuiltIn(names, "")).toEqual([]);
    expect(matchBuiltIn(names, "zzz")).toEqual([]);
  });
});

describe("lookupPypi", () => {
  it("returns the version and summary of a package", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ info: { name: "requests", version: "2.34.2", summary: "Python HTTP for Humans." } }));
    expect(await lookupPypi("requests", { fetchImpl })).toEqual({ name: "requests", source: "pypi", version: "2.34.2", summary: "Python HTTP for Humans." });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://pypi.org/pypi/requests/json");
  });
  it("returns null for a package that does not exist", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await lookupPypi("zz-no-such-package", { fetchImpl })).toBeNull();
  });
  it("does not call the network for a name with bad characters", async () => {
    const fetchImpl = vi.fn();
    expect(await lookupPypi("../etc/passwd", { fetchImpl })).toBeNull();
    expect(await lookupPypi("a b", { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("throws for a server error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(lookupPypi("requests", { fetchImpl })).rejects.toThrow("status 500");
  });
});

describe("installed npm packages", () => {
  const text = JSON.stringify({ dependencies: { react: "^18.3.1", axios: "1.0.0" }, devDependencies: { vite: "^5", bad: 5 } });
  it("lists dependencies and dev dependencies, sorted", () => {
    expect(listNpmDeps(text)).toEqual([
      { name: "axios", version: "1.0.0", dev: false },
      { name: "react", version: "^18.3.1", dev: false },
      { name: "vite", version: "^5", dev: true },
    ]);
  });
  it("gives an empty list for bad or missing JSON", () => {
    expect(listNpmDeps("{ nope")).toEqual([]);
    expect(listNpmDeps(undefined)).toEqual([]);
    expect(listNpmDeps("{}")).toEqual([]);
  });
  it("finds the name of a spec", () => {
    expect(npmNameOf("lodash")).toBe("lodash");
    expect(npmNameOf("lodash@4.17.21")).toBe("lodash");
    expect(npmNameOf("@types/node")).toBe("@types/node");
    expect(npmNameOf("@types/node@22")).toBe("@types/node");
  });
  it("tells whether a spec is installed", () => {
    const installed = listNpmDeps(text);
    expect(isNpmInstalled(installed, "react@17")).toBe(true);
    expect(isNpmInstalled(installed, "lodash")).toBe(false);
  });
});

describe("removeRequirement", () => {
  it("removes one package and keeps comments, options and the others", () => {
    const text = "# tools\n-r base.txt\nrequests==2.31\nNumPy\nrich>=13\n";
    expect(removeRequirement(text, "numpy")).toBe("# tools\n-r base.txt\nrequests==2.31\nrich>=13\n");
  });
  it("matches names like pip does", () => {
    expect(removeRequirement("Scikit_Learn==1.0\nrich\n", "scikit-learn")).toBe("rich\n");
  });
  it("gives an empty text when the last package goes", () => {
    expect(removeRequirement("rich\n", "rich")).toBe("");
    expect(removeRequirement(undefined, "rich")).toBe("");
  });
  it("leaves the text alone when the package is not listed, and pairs with addRequirement", () => {
    expect(removeRequirement("rich\n", "numpy")).toBe("rich\n");
    expect(removeRequirement(addRequirement("rich\n", "numpy"), "numpy")).toBe("rich\n");
  });
});
