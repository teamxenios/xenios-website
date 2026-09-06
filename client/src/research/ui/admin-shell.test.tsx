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
    // 2026-09-03: +1 "Care" group carrying the Care requests queue (incident CARE-2A99C6F7).
    expect(nav?.querySelectorAll("details")).toHaveLength(7);
    // Referral V1 adds one mounted destination in Content & partners.
    // 2026-09-06: +1 "Resource Hub" in Content & partners (Resource Hub V1 slice 1).
    expect(nav?.querySelectorAll("a")).toHaveLength(30);
    expect(
      Array.from(nav?.querySelectorAll("a") ?? []).filter((link) =>
        link.getAttribute("href") === "/admin/research/command-center",
      ).map((link) => link.textContent?.trim()),
    ).toEqual(["Command center"]);
    expect(
      Array.from(nav?.querySelectorAll("a") ?? []).filter((link) =>
        link.getAttribute("href") === "/admin/research/referral-lifecycle",
      ).map((link) => link.textContent?.trim()),
    ).toEqual(["Referral lifecycle"]);
    expect(
      Array.from(nav?.querySelectorAll("a") ?? []).filter((link) =>
        link.getAttribute("href") === "/admin/research/resource-hub",
      ).map((link) => link.textContent?.trim()),
    ).toEqual(["Resource Hub"]);
    expect(
      Array.from(nav?.querySelectorAll("summary") ?? []).map((summary) =>
        summary.textContent?.trim(),
      ),
    ).toEqual([
      "Founder",
      "Care",
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

  it("opens the Founder group on the command center route", () => {
    const view = renderAt("/admin/research/command-center");
    const nav = view.host.querySelector('nav[aria-label="Research operations areas"]')!;
    const founder = Array.from(nav.querySelectorAll("details")).find((detail) =>
      detail.querySelector("summary")?.textContent?.includes("Founder"),
    );
    const current = nav.querySelectorAll('[aria-current="page"]');

    expect(founder?.open).toBe(true);
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("Command center");
    expect(
      Array.from(nav.querySelectorAll("details"))
        .filter((detail) => detail !== founder)
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
    const links = commerce.querySelector(".ra-admin-nav-links") as HTMLDivElement;

    expect(commerce.open).toBe(true);
    expect(links.hidden).toBe(false);
    currentLink.focus();
    expect(document.activeElement).toBe(currentLink);

    act(() => {
      currentLink.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(commerce.open).toBe(false);
    expect(links.hidden).toBe(true);
    expect(document.activeElement).toBe(summary);
    view.unmount();
  });
});
