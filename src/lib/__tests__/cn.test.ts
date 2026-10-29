import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("joins and skips falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("later height wins", () => {
    expect(cn("h-9 px-4", "h-12")).toBe("px-4 h-12");
  });
  it("keeps different variants", () => {
    expect(cn("h-11", "sm:h-9")).toBe("h-11 sm:h-9");
    expect(cn("h-11 sm:h-9", "sm:h-7")).toBe("h-11 sm:h-7");
  });
  it("later display wins", () => {
    expect(cn("inline-flex", "hidden")).toBe("hidden");
  });
  it("p overrides earlier px but not later px", () => {
    expect(cn("px-2 py-1", "p-4")).toBe("p-4");
    expect(cn("p-4", "px-2")).toBe("p-4 px-2");
  });
  it("size overrides h and w", () => {
    expect(cn("h-9 w-9", "size-11")).toBe("size-11");
  });
  it("text size groups, not colors", () => {
    expect(cn("text-sm text-fg", "text-base")).toBe("text-fg text-base");
    expect(cn("text-[11px]", "text-caption")).toBe("text-caption");
  });
  it("handles arbitrary values with colons", () => {
    expect(cn("w-[calc(100%-1rem)]", "w-[min(34rem,calc(100vw-2rem))]")).toBe("w-[min(34rem,calc(100vw-2rem))]");
    expect(cn("[&:hover]:h-2", "h-3")).toBe("[&:hover]:h-2 h-3");
  });
  it("treats important separately", () => {
    expect(cn("h-9", "h-12!")).toBe("h-9 h-12!");
  });
});
