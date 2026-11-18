// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Faq from "./Faq";
import { EARLY_ACCESS_FAQ_GROUPS, EARLY_ACCESS_FAQ_ITEMS, filterEarlyAccessFaq } from "../faq/early-access-faq";
import { COMPANY_QUALITY_CONFIRMATION, COMPANY_QUALITY_STATEMENT } from "../quality/company-quality";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const initialHead = document.head.innerHTML;
const initialBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove(); root = null; host = null;
  document.head.innerHTML = initialHead;
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (initialBeacon) Object.defineProperty(navigator, "sendBeacon", initialBeacon);
  else Reflect.deleteProperty(navigator, "sendBeacon");
});

async function mount() {
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Faq />));
  return host;
}
const questions = (view: HTMLElement) => [...view.querySelectorAll<HTMLButtonElement>('[data-testid^="button-faq-"]')];
async function search(view: HTMLElement, value: string) {
  const input = view.querySelector<HTMLInputElement>("#faq-search")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(view: HTMLElement, value: string) {
  const select = view.querySelector<HTMLSelectElement>("#faq-category")!;
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("Early Access FAQ content boundaries", () => {
  it("covers all fifteen requested groups with thirty uniquely identified operational answers", () => {
    expect(EARLY_ACCESS_FAQ_GROUPS.map((group) => group.id)).toEqual([
      "getting-started", "requests", "intake-privacy", "clinical-care", "research", "product-basics", "quality", "credentials",
      "availability", "images", "handling", "quotes-payment", "delivery-refunds", "support", "product-concerns",
    ]);
    expect(EARLY_ACCESS_FAQ_ITEMS).toHaveLength(30);
    expect(new Set(EARLY_ACCESS_FAQ_ITEMS.map((item) => item.id)).size).toBe(30);
    for (const group of EARLY_ACCESS_FAQ_GROUPS) expect(EARLY_ACCESS_FAQ_ITEMS.some((item) => item.group === group.id)).toBe(true);
    for (const item of EARLY_ACCESS_FAQ_ITEMS) {
      expect(item.id).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.audience).toMatch(/^(visitor|customer|research-buyer)$/);
      expect(item.productScope).toMatch(/^(all|clinical|research|listed-products)$/);
      expect(item.sourceCheckedAt).toBe("2026-11-18");
      // A technical source check must not silently become a clinical sign-off.
      if (item.publishingState === "public_operational") {
        expect(item.reviewer).toBeNull(); expect(item.reviewedAt).toBeNull();
      }
    }
  });

  it("searches categories, questions and detail using all terms, without treating punctuation as a pattern", () => {
    expect(filterEarlyAccessFaq("  LABORATORY research  ", "research").map((item) => item.id)).toEqual([
      "research-intended-buyer", "research-treatment-separation",
    ]);
    expect(filterEarlyAccessFaq("expired closing", "requests")).toEqual([]);
    expect(filterEarlyAccessFaq("expiry closing", "requests").map((item) => item.id)).toEqual(["track-correct-withdraw"]);
    expect(filterEarlyAccessFaq("<script>.*")).toEqual([]);
    expect(filterEarlyAccessFaq("", "images").map((item) => item.id)).toEqual(["image-types"]);
  });

  it("uses only existing public destinations and never fabricates a request-specific receipt link", () => {
    const destinations = new Set([
      "/earlyaccess", "/care/schedule", "/research/access-hub", "/research/support", "/research/privacy",
      "/research/policies", "/research/terms", "/research/reset-password", "/research/documents", "/research/testing", "/research/quality",
      "https://www.nist.gov/nvlap/accreditation-vs-certification",
    ]);
    for (const item of EARLY_ACCESS_FAQ_ITEMS) {
      expect(destinations.has(item.cta.href)).toBe(true);
      for (const source of item.sources) expect(destinations.has(source.href)).toBe(true);
    }
    const copy = JSON.stringify(EARLY_ACCESS_FAQ_ITEMS);
    expect(copy).not.toMatch(/XRI-[0-9A-F]{32}|confirmation\/|\?family=|\?category=|localhost|127\.0\.0\.1/);
  });

  it("keeps the approved company statement attributed without inventing independent accreditation review", () => {
    expect(COMPANY_QUALITY_STATEMENT).toBe("U.S.-manufactured. Independently tested by accredited U.S. laboratories.");
    expect(COMPANY_QUALITY_CONFIRMATION.provenance).toBe("company_confirmed");
    expect(COMPANY_QUALITY_CONFIRMATION.independentDocumentReview).toEqual({ state: "not_recorded", reviewer: null, reviewedAt: null });
    const sourcing = EARLY_ACCESS_FAQ_ITEMS.find((item) => item.id === "company-sourcing")!;
    expect(sourcing.publishingState).toBe("company_confirmed");
    expect(sourcing.answer).toBe(COMPANY_QUALITY_STATEMENT);
    expect(sourcing.detail).toContain("distinct from independent review");
    expect(sourcing.detail).toContain("not a statement about research supplies or shipping services");
    expect(sourcing.reviewer).toBe("Samuel Boadu — company confirmation");
    expect(sourcing.reviewedAt).toBe("2026-11-18");
  });

  it("states the limits of unavailable follow-up, online withdrawal, payment and delivery", () => {
    const text = (id: string) => EARLY_ACCESS_FAQ_ITEMS.find((item) => item.id === id)!.detail;
    expect(text("track-correct-withdraw")).toContain("does not itself record a withdrawal");
    expect(text("track-correct-withdraw")).toContain("contact support before sending a replacement");
    expect(text("quote-expiry-payment")).toContain("does not promise that online quote acceptance or payment is enabled");
    expect(text("shipping-cancellation-refunds")).toContain("does not promise a delivery date");
    expect(text("information-retention")).toContain("does not set a retention period");
    expect(text("after-submission")).toContain("missing email does not mean a saved request was lost");
    expect(text("account-access")).toContain("does not grant membership, staff permissions");
  });

  it("keeps clinical proposals and supplier source documents outside the imported public modules", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const modules = ["Faq.tsx", "../faq/early-access-faq.ts", "../quality/company-quality.ts", "../quality/EvidenceProvenance.tsx"];
    const source = modules.map((path) => readFileSync(resolve(here, path), "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'][^"']*(?:docs\/|EA_FAQ_EVIDENCE_REVIEW|Downloads)/);
    expect(source).not.toMatch(/dangerouslySetInnerHTML|localStorage|sessionStorage|fetch\s*\(|sendBeacon\s*\(/);
    expect(source).not.toMatch(/ISO.?17025.accredited|99\.\d+%|FDA.approved products|injection instructions|recommended dose|weekly dose/i);
    expect(source).not.toContain("First-Month Foundations Plan");
  });
});

describe("searchable Early Access FAQ", () => {
  it("renders labeled controls, all fifteen topics, one h1 and honest source-check metadata", async () => {
    const view = await mount();
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelector('label[for="faq-search"]')?.textContent).toBe("Search FAQs");
    expect(view.querySelector('label[for="faq-category"]')?.textContent).toBe("Topic");
    expect(view.querySelectorAll("#faq-category option")).toHaveLength(16);
    expect(view.querySelectorAll('[id^="faq-group-"]')).toHaveLength(15);
    expect(questions(view)).toHaveLength(30);
    expect(view.querySelector('[role="status"]')?.textContent).toContain("30 answers found");
    expect(view.textContent).toContain("Operational guidance · Source checked Nov 18, 2026");
    expect(view.textContent).not.toContain("Clinically reviewed");
    expect(view.querySelector<HTMLInputElement>("#faq-search")?.maxLength).toBe(160);
  });

  it("filters by topic and intersects a case-insensitive search, then resets both", async () => {
    const view = await mount();
    await choose(view, "support");
    expect(questions(view)).toHaveLength(3);
    await search(view, "PASSWORD");
    expect(questions(view).map((button) => button.textContent)).toEqual(["How do I regain account access?"]);
    expect(view.querySelector('[role="status"]')?.textContent).toContain("1 answer found");
    await act(async () => [...view.querySelectorAll("button")].find((button) => button.textContent === "Clear search and topic")!.click());
    expect(view.querySelector<HTMLInputElement>("#faq-search")!.value).toBe("");
    expect(view.querySelector<HTMLSelectElement>("#faq-category")!.value).toBe("all");
    expect(questions(view)).toHaveLength(30);
  });

  it("shows a recoverable empty state, escapes typed content and keeps support available", async () => {
    const view = await mount();
    await search(view, '<img src=x onerror="alert(1)">');
    expect(questions(view)).toHaveLength(0);
    expect(view.textContent).toContain("No answers match");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("0 answers found");
    expect(view.querySelector("img")).toBeNull();
    expect(view.querySelector('a[href="/research/support"]')).not.toBeNull();
  });

  it("retains resolvable stable panel relationships and native button semantics across filtering", async () => {
    const view = await mount();
    for (const button of questions(view)) {
      expect(button.type).toBe("button"); expect(button.tabIndex).toBe(0);
      const panel = view.querySelector<HTMLElement>(`#${button.getAttribute("aria-controls")}`)!;
      expect(panel).not.toBeNull(); expect(panel.getAttribute("role")).toBe("region");
      expect(panel.getAttribute("aria-labelledby")).toBe(button.id);
    }
    const second = questions(view)[1]; const panelId = second.getAttribute("aria-controls")!;
    await act(async () => second.click());
    expect(questions(view)[0].getAttribute("aria-expanded")).toBe("false");
    expect(view.querySelector<HTMLElement>(`#${panelId}`)!.hidden).toBe(false);
    await choose(view, "getting-started");
    expect(questions(view)[1].getAttribute("aria-controls")).toBe(panelId);
    await act(async () => questions(view)[1].click());
    expect(view.querySelector<HTMLElement>(`#${panelId}`)!.hidden).toBe(true);
  });

  it("does not send a request, contact message, data read or analytics event while searching", async () => {
    const fetcher = vi.fn(); const beacon = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    // The runtime uses no analytics/transport port; observe network directly.
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
    const view = await mount();
    await search(view, "quote"); await choose(view, "quotes-payment");
    await act(async () => questions(view)[0].click());
    expect(fetcher).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
    expect(view.querySelector("form")).toBeNull();
    expect(window.location.search).toBe("");
  });
});
