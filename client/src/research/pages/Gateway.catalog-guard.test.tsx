// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import Gateway from "./Gateway";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "Gateway.tsx");
const PRIVATE_OR_LEGACY_CATALOG = /\/research\/(?:catalog|products|member\/catalog|member\/products|supplements)(?:\/|$|\?)/iu;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function renderGateway(width = 1440): Promise<HTMLDivElement> {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<Gateway />));
  return host;
}

function assertReviewedActions(view: HTMLElement): void {
  const anchors = Array.from(view.querySelectorAll<HTMLAnchorElement>("a[href]"));
  expect(anchors.some((anchor) => anchor.getAttribute("href") === "/products")).toBe(true);
  expect(anchors.some((anchor) => anchor.getAttribute("href") === "/status")).toBe(true);
  expect(anchors.filter((anchor) => PRIVATE_OR_LEGACY_CATALOG.test(anchor.getAttribute("href") ?? ""))).toEqual([]);
  expect(view.textContent).not.toMatch(/Add to cart|Buy now|Choose dose|Start treatment/iu);
}

describe("Gateway approved public discovery boundary", () => {
  it.each([390, 768, 1440])("keeps the same reviewed actions at %ipx", async (width) => {
    assertReviewedActions(await renderGateway(width));
  });

  it("has one landmark, one heading, and real skip/order-step targets", async () => {
    const view = await renderGateway();
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelector('a[href="#research-main"]')).not.toBeNull();
    expect(view.querySelector("#research-main")?.getAttribute("tabindex")).toBe("-1");
    expect(view.querySelector('a[href="#order-steps"]')).not.toBeNull();
    expect(view.querySelector("#order-steps")).not.toBeNull();
  });

  it("contains no private or legacy catalog route even in non-rendered source", () => {
    const source = readFileSync(SOURCE, "utf8");
    expect(source.match(PRIVATE_OR_LEGACY_CATALOG)).toBeNull();
  });
});
