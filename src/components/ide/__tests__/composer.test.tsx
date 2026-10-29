import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Composer, type SlashCommand } from "../composer";
import { ModeMenu } from "../mode-menu";
import { ContextRing } from "../context-ring";

function setup(over: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const props: React.ComponentProps<typeof Composer> = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    placeholder: "Ask…",
    ariaLabel: "Message",
    running: false,
    onStop: vi.fn(),
    canSend: true,
    attachments: [],
    onAttach: vi.fn(),
    onRemoveAttachment: vi.fn(),
    commands: [],
    context: { used: 1000, limit: 10000 },
    time: null,
    model: <span>model pill</span>,
    ...over,
  };
  render(<Composer {...props} />);
  return props;
}

describe("Composer", () => {
  it("has icon-only buttons with names: attach, commands and send", () => {
    setup();
    for (const name of ["Attach files", "Commands", "Send"]) {
      const b = screen.getByRole("button", { name });
      expect(b.textContent).toBe(""); // no visible words: the icon is the label
    }
  });

  it("sends on Enter, keeps Shift+Enter for a new line, and ignores Enter during IME composition", () => {
    const p = setup({ value: "hello" });
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(p.onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 });
    expect(p.onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(p.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables Send when it cannot send", () => {
    setup({ canSend: false });
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Stop instead of Send while a reply runs", () => {
    const p = setup({ running: true });
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(p.onStop).toHaveBeenCalled();
  });

  it("runs a typed slash command instead of sending it, and ignores a disabled one", () => {
    const run = vi.fn();
    const cmds: SlashCommand[] = [
      { id: "compact", label: "Compact", run },
      { id: "clear", label: "Clear", disabled: true, run: vi.fn() },
    ];
    const p = setup({ value: "/compact", commands: cmds });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(p.onChange).toHaveBeenCalledWith("");
    expect(p.onSubmit).not.toHaveBeenCalled();
  });

  it("sends an unknown slash text as a normal message", () => {
    const p = setup({ value: "/review please", commands: [{ id: "compact", label: "C", run: vi.fn() }] });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
    expect(p.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("opens the command menu, runs a command by click, and closes", () => {
    const run = vi.fn();
    setup({ commands: [{ id: "compact", label: "Compact conversation", run }] });
    fireEvent.click(screen.getByRole("button", { name: "Commands" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Compact conversation/ }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not run a disabled command from the menu", () => {
    const run = vi.fn();
    setup({ commands: [{ id: "compact", label: "Compact conversation", disabled: true, run }] });
    fireEvent.click(screen.getByRole("button", { name: "Commands" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Compact conversation/ }));
    expect(run).not.toHaveBeenCalled();
  });

  it("closes the menu with Escape", () => {
    setup({ commands: [{ id: "a", label: "A", run: vi.fn() }] });
    fireEvent.click(screen.getByRole("button", { name: "Commands" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("passes picked files to onAttach", () => {
    const p = setup();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["let a;"], "a.js", { type: "text/javascript" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(p.onAttach).toHaveBeenCalledWith([file]);
  });

  it("passes dropped files to onAttach", () => {
    const p = setup();
    const file = new File(["x"], "d.txt");
    const zone = screen.getByRole("textbox", { name: "Message" }).parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(p.onAttach).toHaveBeenCalledWith([file]);
  });

  it("lists attached files and removes one", () => {
    const p = setup({ attachments: [{ name: "a.js", text: "1" }, { name: "b.md", text: "2" }] });
    const list = screen.getByRole("list", { name: "Attached files" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove b.md" }));
    expect(p.onRemoveAttachment).toHaveBeenCalledWith(1);
  });

  it("shows an attach problem as an alert", () => {
    setup({ attachError: "b.png is not a text file." });
    expect(screen.getByRole("alert").textContent).toContain("b.png is not a text file.");
  });

  it("shows the timer when there is one, and the model and mode slots", () => {
    setup({ time: "0:12", mode: <span>mode slot</span> });
    expect(screen.getByText("0:12")).toBeTruthy();
    expect(screen.getByText("model pill")).toBeTruthy();
    expect(screen.getByText("mode slot")).toBeTruthy();
  });

  it("shows the context ring with a text label", () => {
    setup({ context: { used: 5000, limit: 10000 } });
    expect(screen.getByRole("img", { name: /about 50% used/ })).toBeTruthy();
  });
});

describe("ContextRing", () => {
  it("clamps above 100 percent and handles a zero limit", () => {
    const { rerender } = render(<ContextRing used={30000} limit={10000} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("100%");
    rerender(<ContextRing used={5} limit={0} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("0%");
  });
});

describe("ModeMenu", () => {
  it("shows the short name of the mode and the four choices", () => {
    render(<ModeMenu value="auto" onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: /Permission mode: Auto/ });
    expect(trigger.textContent).toContain("Auto");
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.querySelector(".min-w-0 > span")?.textContent)).toEqual([
      "Ask before edits",
      "Edit automatically",
      "Plan mode",
      "Auto",
    ]);
    expect(items[3].getAttribute("aria-checked")).toBe("true");
    expect(items[0].getAttribute("aria-checked")).toBe("false");
  });

  it("chooses a mode by click and by keyboard", () => {
    const onChange = vi.fn();
    render(<ModeMenu value="edits" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Permission mode/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Plan mode/ }));
    expect(onChange).toHaveBeenLastCalledWith("plan");

    fireEvent.click(screen.getByRole("button", { name: /Permission mode/ }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowUp" }); // from Edits to Ask before edits
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("manual");
  });
});
