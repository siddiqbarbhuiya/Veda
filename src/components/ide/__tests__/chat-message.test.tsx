import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown, parseBlocks } from "../chat-message";

describe("Markdown", () => {
  it("keeps ordered list numbers and start value", () => {
    const { container } = render(<Markdown text={"3. three\n4. four"} />);
    const ol = container.querySelector("ol");
    expect(ol).not.toBeNull();
    expect(ol?.getAttribute("start")).toBe("3");
    expect(ol?.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders nested lists", () => {
    const { container } = render(<Markdown text={"- a\n  - b\n  - c\n- d"} />);
    expect(container.querySelectorAll("ul ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ul > li")).toHaveLength(4);
  });

  it("renders headings as h3, h4 and h5", () => {
    const { container } = render(<Markdown text={"# One\n## Two\n### Three\n#### Four"} />);
    expect(container.querySelectorAll("h3")).toHaveLength(1);
    expect(container.querySelectorAll("h4")).toHaveLength(1);
    expect(container.querySelectorAll("h5")).toHaveLength(2);
  });

  it("allows only http and https links, with safe rel and target", () => {
    render(<Markdown text={"[ok](https://example.com) and [bad](javascript:alert(1))"} />);
    const link = screen.getByRole("link", { name: "ok" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
  });

  it("renders italics, blockquote, rule and table", () => {
    const { container } = render(
      <Markdown text={"*em* and _it_\n\n> quoted\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |"} />,
    );
    expect(container.querySelectorAll("em")).toHaveLength(2);
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelectorAll("table th")).toHaveLength(2);
    expect(container.querySelectorAll("table td")).toHaveLength(2);
  });

  it("accepts a fence info string with extras", () => {
    const blocks = parseBlocks('```js title="a.js"\nlet x = 1;\n```');
    expect(blocks).toEqual([{ kind: "code", lang: "js", code: "let x = 1;" }]);
  });

  it("keeps a longer outer fence that contains a short fence", () => {
    const blocks = parseBlocks("````md\n```js\nx\n```\n````");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "code", lang: "md", code: "```js\nx\n```" });
  });
});
