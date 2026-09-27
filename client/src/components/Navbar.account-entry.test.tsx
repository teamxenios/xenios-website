// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Navbar from "./Navbar";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { if (root) act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

async function renderNavbar() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Navbar />));
  return host;
}

describe("global account entry", () => {
  it("renders persistent Sign In, Start Care, and Menu controls outside the closed menu overlay", async () => {
    const host = await renderNavbar();
    const header = host.querySelector("header")!;
    expect(header.querySelector('a[href="/sign-in"]')?.textContent).toContain("Sign In");
    expect(header.querySelector('a[href="/care/schedule"]')?.textContent).toContain("Start Care");
    expect(header.querySelector('button[aria-label="Open site menu"]')?.textContent).toContain("Menu");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(header.textContent).not.toContain("Get access");
  });

  it.each([
    ["/individuals", "For Individuals links", ["/individuals", "/care/schedule", "/products", "/research", "/status"]],
    ["/practices", "For Practices links", ["/practices", "/practices/referrals", "/practices/workspace", "/practices/care", "/practices#inquiry"]],
  ] as const)("opens and closes the %s audience panel with every approved destination", async (menu, label, destinations) => {
    const view = await renderNavbar();
    const trigger = view.querySelector<HTMLButtonElement>(`button[data-audience-menu="${menu}"]`)!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = view.querySelector<HTMLElement>(`nav[aria-label="${label}"]`)!;
    expect(panel).not.toBeNull();
    expect(Array.from(panel.querySelectorAll<HTMLAnchorElement>("a[href]"), (link) => link.getAttribute("href"))).toEqual(destinations);

    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(view.querySelector(`nav[aria-label="${label}"]`)).toBeNull();
  });

  it("closes an audience panel on Escape and returns focus to its trigger", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const view = await renderNavbar();
    const trigger = view.querySelector<HTMLButtonElement>('button[data-audience-menu="/practices"]')!;
    await act(async () => trigger.click());
    expect(view.querySelector('nav[aria-label="For Practices links"]')).not.toBeNull();

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(view.querySelector('nav[aria-label="For Practices links"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
