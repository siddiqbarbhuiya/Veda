import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT,
  formatUpdated,
  MAX_PROJECT_NAME,
  mergeProjects,
  projectFromSearch,
  projectHref,
  validateProjectName,
} from "../projects";

describe("validateProjectName", () => {
  it("accepts normal names and trims them", () => {
    expect(validateProjectName("  My App ", [])).toEqual({ ok: true, value: "My App" });
    expect(validateProjectName("todo-api_v2.1", [])).toEqual({ ok: true, value: "todo-api_v2.1" });
  });
  it("accepts names in Indic scripts", () => {
    expect(validateProjectName("मेरा प्रोजेक्ट", []).ok).toBe(true);
    expect(validateProjectName("প্রকল্প১", []).ok).toBe(true);
    expect(validateProjectName("திட்டம்", []).ok).toBe(true);
  });
  it("joins repeated spaces", () => {
    expect(validateProjectName("a   b", [])).toEqual({ ok: true, value: "a b" });
  });
  it("refuses an empty name", () => {
    expect(validateProjectName("   ", []).ok).toBe(false);
  });
  it("refuses a name that is too long", () => {
    expect(validateProjectName("a".repeat(MAX_PROJECT_NAME + 1), []).ok).toBe(false);
    expect(validateProjectName("a".repeat(MAX_PROJECT_NAME), []).ok).toBe(true);
  });
  it("refuses characters that break storage keys, paths and addresses", () => {
    for (const bad of ["a#meta", "a:b", "a/b", "a\\b", "a?b", "a&b", "a%b", "<x>", "-start", ".start", "_start", "end.", "emoji😀"]) {
      expect(validateProjectName(bad, []).ok, bad).toBe(false);
    }
  });
  it("refuses a name that exists, without case", () => {
    expect(validateProjectName("Todo", ["todo"]).ok).toBe(false);
    expect(validateProjectName("todo 2", ["todo"]).ok).toBe(true);
  });
});

describe("mergeProjects", () => {
  it("marks where each project exists and sorts the newest first", () => {
    const merged = mergeProjects(
      [{ name: "a", updatedAt: 10 }, { name: "b", updatedAt: 30 }],
      [{ name: "b", updatedAt: 20 }, { name: "c", updatedAt: 40 }]
    );
    expect(merged).toEqual([
      { name: "c", updatedAt: 40, source: "local" },
      { name: "b", updatedAt: 30, source: "both" },
      { name: "a", updatedAt: 10, source: "cloud" },
    ]);
  });
  it("takes the later time for a project in both lists", () => {
    expect(mergeProjects([{ name: "a", updatedAt: 5 }], [{ name: "a", updatedAt: 9 }])[0].updatedAt).toBe(9);
  });
  it("sorts equal times by name", () => {
    const merged = mergeProjects([{ name: "b", updatedAt: 1 }, { name: "a", updatedAt: 1 }], []);
    expect(merged.map((p) => p.name)).toEqual(["a", "b"]);
  });
  it("is empty for empty lists", () => {
    expect(mergeProjects([], [])).toEqual([]);
  });
});

describe("projectFromSearch", () => {
  it("reads a valid project name", () => {
    expect(projectFromSearch("?project=My%20App")).toBe("My App");
    expect(projectFromSearch("?project=%E0%A4%AE%E0%A5%87%E0%A4%B0%E0%A4%BE")).toBe("मेरा");
  });
  it("gives the default project for a missing, empty or bad value", () => {
    for (const s of ["", "?", "?project=", "?project=a%23meta", "?project=..%2Fx", `?project=${"a".repeat(80)}`, "?other=1"]) {
      expect(projectFromSearch(s), s).toBe(DEFAULT_PROJECT);
    }
  });
});

describe("projectHref", () => {
  it("keeps /ide for the default project", () => {
    expect(projectHref(DEFAULT_PROJECT)).toBe("/ide");
  });
  it("encodes the name", () => {
    expect(projectHref("My App")).toBe("/ide?project=My%20App");
  });
  it("round-trips through projectFromSearch", () => {
    for (const name of ["My App", "todo-api_v2.1", "मेरा प्रोजेक्ट"]) {
      const search = projectHref(name).replace("/ide", "");
      expect(projectFromSearch(search)).toBe(name);
    }
  });
});

describe("formatUpdated", () => {
  const now = Date.UTC(2026, 9, 29, 12, 0, 0);
  it("says when a project is not saved yet", () => {
    expect(formatUpdated(0, now)).toBe("Not saved yet");
  });
  it("gives short times", () => {
    expect(formatUpdated(now - 10_000, now)).toBe("Just now");
    expect(formatUpdated(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatUpdated(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(formatUpdated(now - 24 * 3_600_000, now)).toBe("1 day ago");
    expect(formatUpdated(now - 3 * 86_400_000, now)).toBe("3 days ago");
  });
  it("gives a date after 30 days", () => {
    expect(formatUpdated(now - 90 * 86_400_000, now)).toMatch(/2026|Jul/);
  });
  it("does not go negative for a time in the future", () => {
    expect(formatUpdated(now + 60_000, now)).toBe("Just now");
  });
});
