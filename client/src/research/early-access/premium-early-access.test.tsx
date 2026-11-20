// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessPremiumIntroduction } from "./EarlyAccessRoute";
import { EarlyAccessCatalogHelp } from "../assisted-order/OrderRequestEntry";
import { RequestIntentReceipt } from "../assisted-order/RequestIntentReceipt";
import { RequestIntentForm } from "../assisted-order/RequestIntentForm";
import { REQUEST_INTENT_ATTEMPT_KEY } from "../assisted-order/request-intent-attempt";
import type { RequestIntentApi } from "../assisted-order/request-intent-api";
import type { RequestIntentCatalogItem } from "@shared/research/assisted-order/request-intent";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "@shared/research/assisted-order/form";
import media from "../../../../server/research/master-offerings/data/reviewed-public-media.json";
import { EARLY_ACCESS_REQUEST_STEPS } from "./request-experience-copy";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => { history.replaceState(null, "", "/earlyaccess"); sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); history.replaceState(null, "", "/"); vi.restoreAllMocks(); });
const receipt = { kind: "unapproved_selection_request" as const, requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: "XRI-30000000000040008000000000000001", status: "pending_review" as const, createdAt: "2026-11-19T12:00:00.000Z" };
const listing: RequestIntentCatalogItem = {
  productId: "synthetic-bpc", variantId: "synthetic-bpc-variant", productName: "BPC-157", family: "research_peptides_materials",
  channel: "synthetic", specification: "10 mg", format: "vial", packBasis: null,
  minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1, unitPriceCents: null, currency: "USD",
  workflowMode: "request_pricing", actionLabel: "Add to quote cart", accessNotice: null, researchUseOnly: true,
  catalogVersion: "synthetic", priceVersion: null, sourceSelection: { family: "research_peptides_materials", slug: "synthetic-bpc", variantId: "synthetic-bpc-source" },
  selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false, sourceDisplayState: "request_access",
  sourceVariantDisplayState: "request_access", sourceRefusal: null,
};
function fixtureApi() {
  return {
    config: vi.fn(async () => ({ legal: [{ kind: "fixture-terms", version: "fixture-v1", label: "Synthetic requirement" }],
      form: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map(ack => ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack) })) })),
    catalog: vi.fn(async () => ({ items: [listing], total: 1, page: 1, pageSize: 24,
      families: ["research_peptides_materials"], channels: [], workflowModes: [] })),
    submit: vi.fn(async () => receipt), recover: vi.fn(async () => receipt), staff: vi.fn(),
    staffQueue: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}

describe("premium Early Access presentation", () => {
  it("sends Explore products to the guarded intake and preserves canonical hero media metadata and fallback", async () => {
    await act(async () => root.render(<EarlyAccessPremiumIntroduction />));
    expect(host.querySelector('a[href="#xenios-ea-request-start"]')?.textContent).toBe("Explore products");
    expect(host.querySelector("h2")?.textContent).toBe("Explore the Xenios peptide catalog.");
    expect(host.textContent).toContain("Complete the required intake before the catalog opens");
    const record = media.records.find(row => row.sourceVariantId === "mov_ca3e45ae9712aee91430")!;
    const art = host.querySelector("[data-artwork-sha256]")!;
    expect(art.getAttribute("data-offering-id")).toBe(record.offeringId);
    expect(art.getAttribute("data-source-variant-id")).toBe(record.sourceVariantId);
    expect(art.getAttribute("data-artwork-sha256")).toBe(record.primarySha256);
    const image = art.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(record.media.primary.href);
    expect(image.alt).toBe(record.media.primary.altText);
    expect(image.className).toContain("object-contain");
    expect(art.querySelector("figcaption")?.textContent).toContain("Packaging design shown");
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(art.querySelector("img")?.getAttribute("src")).toMatch(/^\/research\/product-media\/.+\.svg$/);
    expect(host.querySelectorAll('a[href^="mailto:"]')).toHaveLength(6);
  });

  it("offers ten FAQs and a real business enquiry without promising bloodwork, payment or shipping", async () => {
    await act(async () => root.render(<EarlyAccessCatalogHelp />));
    expect(host.querySelectorAll(".xenios-premium-faq details")).toHaveLength(10);
    expect(host.querySelector('a[href="/research/organizations"]')?.textContent).toContain("Request a business quote");
    expect(host.textContent).toContain("does not promise included bloodwork");
    expect(host.textContent).toContain("does not collect payment");
    expect(host.textContent).toContain("does not reserve inventory");
    expect(host.textContent).toContain("White label is limited to eligible products");
  });

  it("conditions clinical next steps on a confirmed pathway and keeps clinician decisions explicit", () => {
    const clinical = EARLY_ACCESS_REQUEST_STEPS.find(step => step.id === "clinical")!;
    expect(clinical.description).toMatch(/^For clinical products,/);
    expect(clinical.description).toContain("only through an appropriate confirmed pathway");
    expect(clinical.description).toContain("A licensed clinician makes clinical decisions");
    expect(clinical.description).toContain("nonclinical items follow their own product requirements");
  });

  it.each([{ reopened: false, recovered: false }, { reopened: true, recovered: false }, { reopened: false, recovered: true }])(
    "keeps every contact on a receipt, including earlier receipt flags %j", async flags => {
      await act(async () => root.render(<RequestIntentReceipt receipt={receipt} {...flags} />));
      expect(host.querySelector(".xenios-premium-contacts")?.querySelectorAll("a")).toHaveLength(12);
      expect(host.textContent).toContain(receipt.publicReference);
      if (flags.reopened || flags.recovered) expect(host.textContent).toContain("Nothing was sent again");
    });

  it("searches a named peptide without selecting or submitting and keeps the existing cart count", async () => {
    const api = fixtureApi();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded ownerKey="early-access-session" />));
    const add = [...host.querySelectorAll("button")].find(button => button.textContent === "Add to quote cart")!;
    await act(async () => add.click());
    expect(host.querySelector(".xenios-premium-catalog-header button")?.textContent).toBe("Quote cart (1)");
    const search = [...host.querySelectorAll<HTMLButtonElement>(".xenios-premium-product-searches button")].find(button => button.textContent === "MOTS-c")!;
    await act(async () => search.click());
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ search: "MOTS-c", page: 1 }));
    expect(host.querySelector(".xenios-premium-catalog-header button")?.textContent).toBe("Quote cart (1)");
    expect(api.submit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
  });

  it("keeps contacts on uncertain recovery and reaches the same receipt without a replacement submission", async () => {
    const api = fixtureApi();
    const key = "10000000-0000-4000-8000-000000000001";
    sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, JSON.stringify({ key, acceptedAt: "2026-11-19T12:00:00Z", state: "uncertain" }));
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} />));
    expect(host.textContent).toContain("Check your earlier request");
    expect(host.querySelector(".xenios-premium-contacts")?.querySelectorAll("a")).toHaveLength(12);
    const check = [...host.querySelectorAll("button")].find(button => button.textContent === "Check saved request")!;
    await act(async () => check.click());
    expect(api.recover).toHaveBeenCalledExactlyOnceWith(key);
    expect(api.submit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect(host.textContent).toContain(receipt.publicReference);
    expect(host.querySelector(".xenios-premium-contacts")?.querySelectorAll("a")).toHaveLength(12);
  });
});
