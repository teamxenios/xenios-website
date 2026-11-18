// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_TOPICS } from "../../../../shared/research/assisted-order/catalog-guide";
import { EARLY_ACCESS_FAQ_GROUPS } from "../faq/early-access-faq";
import { CatalogStartingPointGuide } from "./CatalogStartingPointGuide";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALL_FAMILIES = ["clinical_formulations_503a", "research_peptides_materials", "supplements", "topicals_regenerative"];
let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text) ?? null;
const choose = async (label: string) => {
  const input = [...host.querySelectorAll("label")].find((l) => l.textContent === label)?.querySelector("input");
  if (!input) throw new Error("no option " + label);
  await act(async () => input.click());
};
async function render(families: readonly string[] = ALL_FAMILIES) {
  const onApplyView = vi.fn(), onBrowseAll = vi.fn();
  await act(async () => root.render(<CatalogStartingPointGuide availableFamilies={families} onApplyView={onApplyView} onBrowseAll={onBrowseAll} />));
  return { onApplyView, onBrowseAll };
}
async function startAndShow(...labels: string[]) {
  await act(async () => button("Start the guide")!.click());
  for (const label of labels) await choose(label);
  await act(async () => button("Show starting points")!.click());
}

describe("catalog starting-point guide", () => {
  it("starts closed and changes nothing until the customer acts", async () => {
    const { onApplyView, onBrowseAll } = await render();
    expect(host.textContent).toContain("Help me find a starting point");
    expect(host.querySelector("form")).toBeNull();
    expect(onApplyView).not.toHaveBeenCalled();
    expect(onBrowseAll).not.toHaveBeenCalled();
  });

  it("keeps Skip guide and Browse the full catalog on the questions and the results", async () => {
    await render();
    await act(async () => button("Start the guide")!.click());
    expect(button("Skip guide")).not.toBeNull();
    expect(button("Browse the full catalog")).not.toBeNull();
    await act(async () => button("Show starting points")!.click());
    expect(button("Skip guide")).not.toBeNull();
    expect(button("Browse the full catalog")).not.toBeNull();
    expect(button("Browse all products")).not.toBeNull();
  });

  it("skips without changing the view", async () => {
    const { onApplyView } = await render();
    await act(async () => button("Start the guide")!.click());
    await act(async () => button("Skip guide")!.click());
    expect(onApplyView).not.toHaveBeenCalled();
    expect(host.querySelector("form")).toBeNull();
  });

  it("browsing the full catalog clears any view", async () => {
    const { onApplyView, onBrowseAll } = await render();
    await act(async () => button("Start the guide")!.click());
    await act(async () => button("Browse the full catalog")!.click());
    expect(onApplyView).toHaveBeenCalledWith(null);
    expect(onBrowseAll).toHaveBeenCalledTimes(1);
  });

  it("explains each starting point and applies only the chosen view", async () => {
    const { onApplyView } = await render();
    await startAndShow("Supplements");
    expect(host.textContent).toContain("A useful place to start.");
    expect(host.textContent).toContain("You chose supplements.");
    await act(async () => button("View category")!.click());
    expect(onApplyView).toHaveBeenCalledTimes(1);
    expect(onApplyView).toHaveBeenCalledWith("supplements");
  });

  it("keeps answers when editing", async () => {
    await render();
    await startAndShow("Skincare and topicals");
    await act(async () => button("Edit answers")!.click());
    const input = [...host.querySelectorAll("label")].find((l) => l.textContent === "Skincare and topicals")!.querySelector("input")!;
    expect(input.checked).toBe(true);
  });

  it("falls back to the full catalog when nothing is chosen", async () => {
    await render();
    await startAndShow();
    expect(host.textContent).toContain("The full catalog is the best place to start. Browse the full catalog available to you.");
    expect(host.textContent).not.toContain("Every product is listed there");
    expect(button("View category")).toBeNull();
  });

  it("does not offer a category view whose family this viewer cannot see", async () => {
    await render(["supplements"]);
    await startAndShow("Clinical options");
    expect(button("View category")).toBeNull();
    expect(host.textContent).not.toContain("Clinical formulations");
  });

  it("names only FAQ sections that exist, and links to the FAQ page itself", async () => {
    const groups = new Map(EARLY_ACCESS_FAQ_GROUPS.map((group) => [group.id as string, group.label as string]));
    for (const topic of GUIDE_TOPICS) expect(groups.has(topic)).toBe(true);
    await render();
    await startAndShow("Clinical options", "Laboratory research");
    const faqLinks = [...host.querySelectorAll("a")].filter((a) => (a.getAttribute("href") ?? "").startsWith("/research/faq"));
    expect(faqLinks.length).toBeGreaterThan(0);
    for (const link of faqLinks) expect(link.getAttribute("href")).toBe("/research/faq");
    for (const label of ["Clinical care", "Laboratory research"]) expect([...groups.values()]).toContain(label);
  });

  it("offers a clear way back to all products after a view is applied", async () => {
    const { onApplyView, onBrowseAll } = await render();
    await startAndShow("Supplements");
    await act(async () => button("View category")!.click());
    expect(host.textContent).toContain("You opened Supplements from the guide.");
    await act(async () => button("Browse all products")!.click());
    expect(onApplyView).toHaveBeenLastCalledWith(null);
    expect(onBrowseAll).toHaveBeenCalledTimes(1);
    expect(button("Start the guide")).not.toBeNull();
  });

  it("lets the customer change answers after a view is applied, keeping them", async () => {
    await render();
    await startAndShow("Supplements");
    await act(async () => button("View category")!.click());
    await act(async () => button("Change answers")!.click());
    await act(async () => button("Show starting points")!.click());
    expect(host.textContent).toContain("You chose supplements.");
  });

  it("writes nothing to the address or browser storage", async () => {
    const before = window.location.href;
    await render();
    await startAndShow("For myself", "Laboratory research", "Quality and sourcing", "Exploring categories");
    expect(window.location.href).toBe(before);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});
