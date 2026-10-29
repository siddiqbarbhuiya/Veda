import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelPicker, filterItems } from "../model-picker";
import type { ModelItem } from "@/hooks/use-model-catalog";

const item = (over: Partial<ModelItem>): ModelItem => ({
  key: "openrouter|x",
  provider: "openrouter",
  model: "x",
  label: "X",
  group: "OpenRouter",
  free: false,
  keyed: true,
  rate: null,
  ...over,
});

const items: ModelItem[] = [
  item({ key: "openai|gpt-4o", provider: "openai", model: "gpt-4o", label: "gpt-4o", group: "OpenAI", keyed: false }),
  item({ key: "openrouter|meta/llama:free", model: "meta/llama:free", label: "Llama Free", free: true }),
  item({ key: "openrouter|anthropic/claude", model: "anthropic/claude", label: "Claude" }),
];

describe("filterItems", () => {
  it("matches every word on label, model id and group", () => {
    expect(filterItems(items, "openrouter llama", false).map((i) => i.label)).toEqual(["Llama Free"]);
  });
  it("hides paid models when free only is on", () => {
    expect(filterItems(items, "", true).map((i) => i.label)).toEqual(["Llama Free"]);
  });
});

describe("ModelPicker", () => {
  it("marks a provider without a key", () => {
    render(<ModelPicker items={items} value="openai|gpt-4o" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Model: gpt-4o/ }).textContent).toContain("no key");
  });

  it("opens, filters with Free only and selects with a click", () => {
    const onChange = vi.fn();
    render(<ModelPicker items={items} value="openai|gpt-4o" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Model:/ }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.click(screen.getByLabelText("Free only"));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.click(screen.getByRole("option", { name: /Llama Free/ }));
    expect(onChange).toHaveBeenCalledWith("openrouter|meta/llama:free");
  });

  it("selects the highlighted row with Enter and closes with Escape", () => {
    const onChange = vi.fn();
    render(<ModelPicker items={items} value="openai|gpt-4o" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Model:/ }));
    const search = screen.getByRole("combobox", { name: "Search models" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("openrouter|meta/llama:free");
    fireEvent.click(screen.getByRole("button", { name: /Model:/ }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search models" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not choose on Enter while an IME composition is active", () => {
    const onChange = vi.fn();
    render(<ModelPicker items={items} value="openai|gpt-4o" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Model:/ }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search models" }), { key: "Enter", keyCode: 229 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a note when more than 80 models match", () => {
    const many = Array.from({ length: 100 }, (_, i) => item({ key: `openrouter|m${i}`, model: `m${i}`, label: `M${i}` }));
    render(<ModelPicker items={many} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Model:/ }));
    expect(screen.getAllByRole("option")).toHaveLength(80);
    expect(screen.getByText(/Showing 80 of 100/)).toBeTruthy();
  });
});
