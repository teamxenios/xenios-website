// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createRef, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import TouchCheckbox from "./TouchCheckbox";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(ui: ReactElement): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
  return host;
}

describe("TouchCheckbox", () => {
  it("renders a visible native checkbox and forwards its accessibility contract and ref", () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const view = render(
      <TouchCheckbox
        ref={ref}
        id="terms-ack"
        required
        checked
        onChange={onChange}
        aria-invalid="true"
        aria-describedby="terms-ack-error"
        disabled
        data-testid="checkbox-terms-ack"
        labelTestId="label-terms-ack"
        labelClassName="cursor-pointer text-paper"
      >
        <span data-testid="text-terms-ack">I agree.</span>
      </TouchCheckbox>,
    );

    const label = view.querySelector<HTMLLabelElement>('[data-testid="label-terms-ack"]')!;
    const input = view.querySelector<HTMLInputElement>('[data-testid="checkbox-terms-ack"]')!;

    expect(label.htmlFor).toBe("terms-ack");
    expect(label.className).toContain("flex min-h-11 min-w-11 items-center gap-3");
    expect(label.className).toContain("cursor-pointer text-paper");
    expect(input.type).toBe("checkbox");
    expect(input.className).toBe("h-4 w-4 shrink-0 accent-[var(--pulse)]");
    expect(input.required).toBe(true);
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("terms-ack-error");
    expect(ref.current).toBe(input);
    expect(view.querySelector('[data-testid="text-terms-ack"]')?.textContent).toBe("I agree.");
  });

  it("lets the label activate the controlled native input and forwards onChange", () => {
    const onChange = vi.fn();

    function ControlledCheckbox() {
      const [checked, setChecked] = useState(false);
      return (
        <TouchCheckbox
          id="controlled-ack"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
            setChecked(event.target.checked);
          }}
          data-testid="checkbox-controlled-ack"
          labelTestId="label-controlled-ack"
        >
          Confirm
        </TouchCheckbox>
      );
    }

    const view = render(<ControlledCheckbox />);
    const label = view.querySelector<HTMLLabelElement>('[data-testid="label-controlled-ack"]')!;
    const input = view.querySelector<HTMLInputElement>('[data-testid="checkbox-controlled-ack"]')!;

    act(() => label.click());

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(input.checked).toBe(true);
  });
});
