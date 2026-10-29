import { describe, expect, it } from "vitest";
import { preferredServer } from "../preview";

describe("preferredServer", () => {
  it("is null when no server runs", () => {
    expect(preferredServer([])).toBeNull();
  });
  it("shows the front end before the API, in any start order", () => {
    expect(preferredServer([{ port: 5173 }, { port: 3000 }])?.port).toBe(5173);
    expect(preferredServer([{ port: 3000 }, { port: 5173 }])?.port).toBe(5173);
  });
  it("takes the newest server when no front-end port runs", () => {
    expect(preferredServer([{ port: 3000 }, { port: 4000 }])?.port).toBe(4000);
  });
  it("returns the only server", () => {
    expect(preferredServer([{ port: 3000 }])?.port).toBe(3000);
  });
});
