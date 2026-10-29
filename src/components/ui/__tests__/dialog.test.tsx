import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "../dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

function setup(props: { dismissible?: boolean } = {}) {
  const onClose = vi.fn();
  const view = render(
    <Dialog open onClose={onClose} title="Top up" description="Pick a pack" {...props}>
      <input aria-label="x" />
    </Dialog>,
  );
  const dialog = view.container.querySelector("dialog")!;
  return { onClose, dialog, view };
}

describe("Dialog", () => {
  it("names itself by title and description", () => {
    const { dialog } = setup();
    expect(dialog.getAttribute("aria-label")).toBeNull();
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Top up");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Pick a pack");
  });

  it("Escape calls onClose once and keeps the dialog open", () => {
    const { dialog, onClose } = setup();
    const event = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("does not close on Escape or backdrop when dismissible is false", () => {
    const { dialog, onClose } = setup({ dismissible: false });
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on backdrop only when pointerdown and click both hit it", () => {
    const { dialog, onClose } = setup();
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByLabelText("x"));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the Close button", () => {
    const { onClose } = setup({ dismissible: false });
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the parent closes it", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open onClose={onClose} title="T">
        x
      </Dialog>,
    );
    rerender(
      <Dialog open={false} onClose={onClose} title="T">
        x
      </Dialog>,
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
