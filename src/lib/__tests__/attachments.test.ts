import { describe, it, expect } from "vitest";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_CHARS,
  MAX_ATTACHMENT_TOTAL_CHARS,
  addAttachments,
  readAttachment,
  withAttachments,
} from "../attachments";

const file = (name: string, text: string, size = text.length) => ({ name, size, text: async () => text });

describe("readAttachment", () => {
  it("reads a text file", async () => {
    expect(await readAttachment(file("a.js", "let a = 1;"))).toEqual({ ok: true, attachment: { name: "a.js", text: "let a = 1;" } });
  });
  it("keeps Hindi text", async () => {
    const r = await readAttachment(file("n.txt", "नमस्ते दुनिया"));
    expect(r.ok).toBe(true);
  });
  it("refuses a binary file (NUL byte) and a broken decode", async () => {
    expect((await readAttachment(file("x.png", "PNG\u0000data"))).ok).toBe(false);
    expect((await readAttachment(file("y.bin", "bad�bytes"))).ok).toBe(false);
  });
  it("refuses a file that is too large, before and after reading", async () => {
    const huge = await readAttachment({ name: "h.txt", size: MAX_ATTACHMENT_CHARS * 5, text: async () => "never read" });
    expect(huge).toMatchObject({ ok: false });
    const long = await readAttachment(file("l.txt", "x".repeat(MAX_ATTACHMENT_CHARS + 1)));
    expect(long).toMatchObject({ ok: false });
  });
  it("reports a read failure", async () => {
    const r = await readAttachment({ name: "f.txt", size: 1, text: async () => Promise.reject(new Error("x")) });
    expect(r).toEqual({ ok: false, error: "Could not read f.txt." });
  });
});

describe("addAttachments", () => {
  it("adds good files and reports the first problem for the others", async () => {
    const { list, error } = await addAttachments([], [file("a.js", "1"), file("b.png", "x\u0000"), file("c.js", "3")]);
    expect(list.map((a) => a.name)).toEqual(["a.js", "c.js"]);
    expect(error).toMatch(/b\.png is not a text file/);
  });
  it("does not add the same name twice", async () => {
    const first = await addAttachments([], [file("a.js", "1")]);
    const again = await addAttachments(first.list, [file("a.js", "2")]);
    expect(again.list).toHaveLength(1);
    expect(again.error).toMatch(/already attached/);
  });
  it(`stops at ${MAX_ATTACHMENTS} files`, async () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, i) => file(`f${i}.txt`, "x"));
    const { list, error } = await addAttachments([], files);
    expect(list).toHaveLength(MAX_ATTACHMENTS);
    expect(error).toMatch(/up to 5 files/);
  });
  it("refuses a file that pushes the total over the limit", async () => {
    const part = "x".repeat(MAX_ATTACHMENT_CHARS);
    const files = [file("1.txt", part), file("2.txt", part), file("3.txt", part)];
    const { list, error } = await addAttachments([], files);
    expect(list.length * MAX_ATTACHMENT_CHARS).toBeLessThanOrEqual(MAX_ATTACHMENT_TOTAL_CHARS);
    expect(error).toMatch(/too large together/);
  });
});

describe("withAttachments", () => {
  it("returns the text unchanged with no files", () => {
    expect(withAttachments("hi", [])).toBe("hi");
  });
  it("adds each file in a fenced block with its name", () => {
    const out = withAttachments("explain", [{ name: "a.js", text: "let a;" }]);
    expect(out).toBe('explain\n\nAttached file "a.js":\n```\nlet a;\n```');
  });
  it("uses a longer fence when the file itself has a fence", () => {
    const out = withAttachments("x", [{ name: "r.md", text: "```js\nx\n```" }]);
    expect(out).toContain("````\n```js\nx\n```\n````");
  });
});
