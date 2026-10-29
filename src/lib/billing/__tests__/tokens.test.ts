import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessagesTokens } from "../tokens";

describe("estimateTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("counts Latin text at about 4 characters per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("counts Devanagari at 1 token per character", () => {
    expect(estimateTokens("नमस्ते")).toBe(6);
  });

  it("counts Tamil, Bengali and CJK at 1 token per character", () => {
    expect(estimateTokens("தமிழ்")).toBe(5);
    expect(estimateTokens("বাংলা")).toBe(5);
    expect(estimateTokens("你好世界")).toBe(4);
  });

  it("mixes both rules in one string", () => {
    // 4 Latin chars = 1 token, 2 Devanagari chars = 2 tokens
    expect(estimateTokens("abcdनम")).toBe(3);
  });

  it("estimates Indic text higher than the old chars/4 rule", () => {
    const text = "यह एक परीक्षण है".repeat(10);
    expect(estimateTokens(text)).toBeGreaterThan(Math.ceil(text.length / 4) * 2);
  });
});

describe("estimateMessagesTokens", () => {
  it("adds a small overhead for each message", () => {
    expect(estimateMessagesTokens([])).toBe(0);
    expect(estimateMessagesTokens([{ content: "abcd" }, { content: "abcd" }])).toBe(2 * (1 + 4));
  });
});
