// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/PageShell", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(() => Promise.resolve({ turnstileSiteKey: "" })),
}));
vi.mock("@/lib/attribution", () => ({ getAttribution: vi.fn(() => ({})) }));
vi.mock("@/lib/tracking", () => ({ trackCompleteRegistration: vi.fn() }));

import EarlyInterest from "./EarlyInterest";

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

describe("EarlyInterest non-binding acknowledgement", () => {
  it("uses the shared required native checkbox with an explicit label association", () => {
    const view = render(<EarlyInterest />);
    const label = view.querySelector<HTMLLabelElement>('[data-testid="label-nonbinding-ack"]')!;
    const checkbox = view.querySelector<HTMLInputElement>('[data-testid="checkbox-nonbinding-ack"]')!;

    expect(label.htmlFor).toBe("ei-nonbinding-ack");
    expect(label.className).toContain("flex min-h-11 min-w-11 items-center gap-3");
    expect(label.className).toContain("cursor-pointer text-ink-2");
    expect(checkbox.id).toBe("ei-nonbinding-ack");
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.required).toBe(true);
    expect(checkbox.checked).toBe(false);

    act(() => label.click());

    expect(checkbox.checked).toBe(true);
  });
});
