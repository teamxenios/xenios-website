// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import HomeNext from "./HomeNext";
import { HOME_COPY, HOME_COPY_OVERRIDES, RAW_HOME_COPY, type HomeCopySlot } from "./content";
import { HOME_DESTINATIONS } from "./destinations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderHome() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeNext />));
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("homepage copy and destinations", () => {
  it("preserves the original slots and renders the approved copy updates", async () => {
    expect(Object.keys(RAW_HOME_COPY)).toHaveLength(48);
    expect(createHash("sha256").update(JSON.stringify(RAW_HOME_COPY)).digest("hex"))
      .toBe("f8718bb42d8e31a9b19cc8c8b979996bc189198154a31b633edb8c7e9cf15d75");
    expect(Object.keys(HOME_COPY_OVERRIDES).sort()).toEqual(["health.step1", "hero.headline", "infinity.cta"]);
    const view = await renderHome();
    const rendered = [...view.querySelectorAll<HTMLElement>("[data-copy]")];
    expect(rendered).toHaveLength(48);
    expect(new Set(rendered.map((node) => node.dataset.copy)).size).toBe(48);
    for (const node of rendered) {
      const key = node.dataset.copy as HomeCopySlot;
      expect(node.textContent?.replace(/\s+/gu, " ").trim(), key).toBe(HOME_COPY[key]);
    }
    expect(view.textContent).not.toContain("—");
    expect(HOME_COPY["health.step1"]).toBe("Review and accept the Early Access policy");
    expect(view.textContent).not.toContain("access password");
  });

  it("exposes only declared destinations and uses the existing founding-group fallback", async () => {
    const view = await renderHome();
    const hrefs = new Set(Object.values(HOME_DESTINATIONS).map(({ href }) => href));
    for (const link of view.querySelectorAll("a")) {
      const href = link.getAttribute("href")!;
      expect(hrefs.has(href) || href === "#xh-main", href).toBe(true);
      expect(href).not.toBe("#");
      expect(href).not.toMatch(/^javascript:|\?/u);
    }
    expect(view.querySelector('[data-destination="foundingGroup"]')?.textContent)
      .toBe("Join the founding-group waitlist");
    expect(Object.values(HOME_DESTINATIONS).every(({ readiness }) => readiness === "VERIFIED")).toBe(true);
    expect(view.querySelector('a[href="/tensa"],a[href="/infinity"],a[href="/care/request-intents"]')).toBeNull();
    expect(view.querySelector("form,input,button,select,textarea")).toBeNull();
  });

  it("keeps the skip link, one headline and the partner entries in main", async () => {
    const view = await renderHome();
    expect(view.querySelector(".xenios-home-next")?.firstElementChild?.getAttribute("href")).toBe("#xh-main");
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelector("main")?.getAttribute("tabindex")).toBe("-1");
    expect(view.querySelector("main [data-copy='partners.body']")).not.toBeNull();
    expect(view.querySelector("main [data-copy='member.body']")).not.toBeNull();
    expect(view.querySelector("footer")?.previousElementSibling?.tagName).toBe("MAIN");
    for (const nav of view.querySelectorAll("nav")) expect(nav.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("homepage native menu", () => {
  it("closes on Escape and returns focus to its summary", async () => {
    const view = await renderHome();
    const menu = view.querySelector("details")!;
    const summary = menu.querySelector("summary")!;
    menu.open = true;
    menu.querySelector("a")!.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("closes after selecting a link and on a click outside the menu", async () => {
    const view = await renderHome();
    const menu = view.querySelector("details")!;
    menu.open = true;
    await act(async () => menu.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(menu.open).toBe(false);
    menu.open = true;
    await act(async () => view.querySelector("h1")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(menu.open).toBe(false);
  });
});
