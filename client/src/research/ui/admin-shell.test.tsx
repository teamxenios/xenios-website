// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchAdminShell } from "./shells";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <ResearchAdminShell title="Products">
        <p>Admin content</p>
      </ResearchAdminShell>,
    ),
  );
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.pushState({}, "", "/");
});

describe("ResearchAdminShell grouped navigation", () => {
  it("groups every existing admin destination instead of rendering a horizontal link strip", () => {
    const view = renderAt("/admin/research");
    const nav = view.host.querySelector('nav[aria-label="Research operations areas"]');

    expect(nav).not.toBeNull();
    expect(nav?.classList.contains("ra-admin-nav")).toBe(true);
    expect(nav?.classList.contains("ra-subnav")).toBe(false);
    expect(nav?.querySelectorAll("details")).toHaveLength(5);
    expect(nav?.querySelectorAll("a")).toHaveLength(26);
    expect(
      Array.from(nav?.querySelectorAll("summary") ?? []).map((summary) =>
        summary.textContent?.trim(),
      ),
    ).toEqual([
      "Members",
      "Commerce",
      "Activation",
      "Content & partners",
      "Governance",
    ]);
    view.unmount();
  });

  it("opens the current group and exposes exactly one current-page link", () => {
    const view = renderAt("/admin/research/products/product-1");
    const nav = view.host.querySelector('nav[aria-label="Research operations areas"]')!;
    const current = nav.querySelectorAll('[aria-current="page"]');
    const commerce = Array.from(nav.querySelectorAll("details")).find((detail) =>
      detail.querySelector("summary")?.textContent?.includes("Commerce"),
    );

    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("Products");
    expect(commerce?.open).toBe(true);
    expect(
      Array.from(nav.querySelectorAll("details"))
        .filter((detail) => detail !== commerce)
        .every((detail) => !detail.open),
    ).toBe(true);
    view.unmount();
  });

  it("keeps grouped summaries keyboard-operable and all destinations real links", () => {
    const view = renderAt("/admin/research");
    const nav = view.host.querySelector('nav[aria-label="Research operations areas"]')!;
    const summaries = Array.from(nav.querySelectorAll("summary"));

    expect(summaries.every((summary) => summary.tabIndex === 0)).toBe(true);
    expect(
      Array.from(nav.querySelectorAll("a")).every((link) =>
        link.getAttribute("href")?.startsWith("/admin/research"),
      ),
    ).toBe(true);
    view.unmount();
  });
  it("closes an expanded group on Escape and returns focus to its summary", () => {
    const view = renderAt("/admin/research/products");
    const nav = view.host.querySelector('nav[aria-label="Research operations areas"]')!;
    const commerce = Array.from(nav.querySelectorAll("details")).find((detail) =>
      detail.querySelector("summary")?.textContent?.includes("Commerce"),
    )!;
    const summary = commerce.querySelector("summary")!;
    const currentLink = commerce.querySelector('[aria-current="page"]') as HTMLElement;

    expect(commerce.open).toBe(true);
    currentLink.focus();
    expect(document.activeElement).toBe(currentLink);

    act(() => {
      currentLink.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(commerce.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    view.unmount();
  });
});
