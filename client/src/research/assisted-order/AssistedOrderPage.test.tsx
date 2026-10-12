// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderReceipt,
  AssistedOrderStatusView,
  AssistedOrderSubmitInput,
} from "../../../../shared/research/assisted-order/contract";

const api = vi.hoisted(() => ({
  loadAssistedOrderCatalog: vi.fn(),
  loadAssistedOrderConfig: vi.fn(),
  loadAssistedOrderStatus: vi.fn(),
  submitAssistedOrder: vi.fn(),
}));
const statusSession = vi.hoisted(() => ({ memberToken: null as string | null, memberChecking: false }));
vi.mock("../core", () => ({ useResearch: () => statusSession }));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, ...api };
});

// The page side-effect-imports its stylesheet; the repo's PostCSS chain is not
// set up for vitest, and styles are irrelevant here.
vi.mock("./assisted-order.css", () => ({ default: {} }));

import { AssistedOrderApiError } from "./api";
import { AssistedOrderConfirmationPage } from "./AssistedOrderConfirmationPage";
import { AssistedOrderPage } from "./AssistedOrderPage";
import { AssistedOrderStatusPage } from "./AssistedOrderStatusPage";
import { ASSISTED_ORDER_DRAFT_KEY } from "./draft-store";
import { orderEntryIntentFromSearch } from "../early-access/orderEntryIntent";
import {
  assistedOrderReceiptKey,
  storeAssistedOrderReceipt,
} from "./storage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const directRuoItem: AssistedOrderCatalogItem = {
  productId: "prod-a",
  variantId: "var-a",
  productName: "Alpha Peptide",
  family: "research_peptides_materials",
  channel: "research",
  specification: "10 mg",
  format: "Vial",
  packBasis: "Per vial",
  minimumQuantity: 1,
  maximumQuantity: 100,
  quantityIncrement: 1,
  unitPriceCents: 2500,
  currency: "USD",
  workflowMode: "direct_order_request",
  actionLabel: "Add to order request",
  accessNotice: null,
  researchUseOnly: true,
  catalogVersion: "cat-1",
  priceVersion: "price-1",
};

const careItem: AssistedOrderCatalogItem = {
  ...directRuoItem,
  productId: "prod-b",
  variantId: "var-b",
  productName: "Care Formulation",
  family: "clinical_formulations_503a",
  workflowMode: "provider_request",
  actionLabel: "Continue through Care",
  researchUseOnly: false,
};

const pendingItem: AssistedOrderCatalogItem = {
  ...directRuoItem,
  productId: "prod-pending",
  variantId: "var-pending",
  productName: "Pending Peptide",
  workflowMode: "request_activation",
  actionLabel: "Request Order",
};

const pricePendingItem: AssistedOrderCatalogItem = {
  ...directRuoItem,
  productId: "prod-c",
  variantId: "var-c",
  productName: "Gamma Reagent",
  workflowMode: "request_pricing",
  actionLabel: "Request pricing",
  unitPriceCents: null,
  priceVersion: null,
  researchUseOnly: false,
};

const heldItem: AssistedOrderCatalogItem = {
  ...directRuoItem,
  productId: "prod-held",
  variantId: "var-held",
  productName: "Held Peptide",
  workflowMode: "availability_review",
  actionLabel: "Request availability",
};

function catalogPage(
  items: readonly AssistedOrderCatalogItem[],
): AssistedOrderCatalogPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 24,
    families: ["research_peptides_materials"],
    channels: ["research"],
    workflowModes: ["direct_order_request"],
  };
}

const wizardConfig = {
  legal: [{ kind: "research_use_policy", version: "2026-05", label: "I accept the Research Use Policy." }],
  form: [
    {
      id: "accuracy",
      scope: "always" as const,
      kind: "assisted_order_form_v1:accuracy",
      version: "aeb2ba5a069dd3f4",
      copy: "I confirm that the information I provided is accurate to the best of my knowledge.",
    },
    {
      id: "research_use_only",
      scope: "research_use_only" as const,
      kind: "assisted_order_form_v1:research_use_only",
      version: "d5150651ebd86b89",
      copy: "For items identified as Research Use Only, I understand that they are offered solely for legitimate nonclinical research purposes and are not for human or veterinary use.",
    },
  ],
};

const receipt: AssistedOrderReceipt = {
  requestId: "req-1",
  publicReference: "XRR-20260819-ABCDEF1234",
  statusToken: "secret-token",
  status: "submitted",
  createdAt: "2026-08-19T00:00:00.000Z",
  estimatedTotalCents: 5000,
  currency: "USD",
  lines: [],
  nextSteps: ["We will confirm availability and payment details before fulfillment."],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(props: ComponentProps<typeof AssistedOrderPage> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<AssistedOrderPage {...props} />));
  return host;
}

function unmount() {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
}

/** Waits past the catalog debounce and lets pending promises settle. */
async function settle(ms = 260) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function byTestId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.querySelector<T>(`[data-testid="${id}"]`);
}

function click(element: Element | null) {
  expect(element).not.toBeNull();
  act(() => {
    (element as HTMLElement).click();
  });
}

function typeInto(input: HTMLInputElement | null, value: string) {
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  act(() => {
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function selectValue(select: HTMLSelectElement | null, value: string) {
  expect(select).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  act(() => {
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fillContact() {
  typeInto(byTestId<HTMLInputElement>("order-contact-name"), "Ada Researcher");
  typeInto(byTestId<HTMLInputElement>("order-contact-email"), "ada@example.org");
  typeInto(byTestId<HTMLInputElement>("order-contact-phone"), "+1 555 010 2000");
  typeInto(byTestId<HTMLInputElement>("order-contact-line1"), "1 Research Way");
  typeInto(byTestId<HTMLInputElement>("order-contact-city"), "Boston");
  typeInto(byTestId<HTMLInputElement>("order-contact-region"), "MA");
  typeInto(byTestId<HTMLInputElement>("order-contact-postal"), "02110");
  typeInto(byTestId<HTMLInputElement>("order-contact-country"), "US");
  click(byTestId("order-age-confirm"));
}

function checkAllAcknowledgments() {
  for (const box of Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-testid^="order-ack-"]'),
  )) {
    if (!box.checked) click(box);
  }
}

beforeEach(() => {
  statusSession.memberToken = null;
  statusSession.memberChecking = false;
  sessionStorage.clear();
  window.history.replaceState({}, "", "/research/early-access/order-request");
  api.loadAssistedOrderCatalog.mockReset();
  api.loadAssistedOrderConfig.mockReset();
  api.loadAssistedOrderStatus.mockReset();
  api.submitAssistedOrder.mockReset();
  api.loadAssistedOrderCatalog.mockResolvedValue(
    catalogPage([directRuoItem, careItem, pricePendingItem, pendingItem, heldItem]),
  );
  api.loadAssistedOrderConfig.mockResolvedValue(wizardConfig);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("AssistedOrderPage", () => {
  it("keeps Care products out of the research request path", async () => {
    render();
    await settle();
    expect(byTestId(`order-card-${careItem.variantId}`)).not.toBeNull();
    expect(byTestId(`order-card-care-${careItem.variantId}`)).not.toBeNull();
    expect(byTestId(`order-card-add-${careItem.variantId}`)).toBeNull();
    const careCta = byTestId<HTMLAnchorElement>(
      `order-card-care-cta-${careItem.variantId}`,
    );
    expect(careCta?.textContent).toBe("Continue through Care");
    expect(careCta?.getAttribute("href")).toBe("/care");
  });

  it("keeps held products out of both Research ordering and the Care route", async () => {
    render();
    await settle();
    expect(byTestId(`order-card-unavailable-${heldItem.variantId}`)).not.toBeNull();
    expect(byTestId(`order-card-add-${heldItem.variantId}`)).toBeNull();
    expect(byTestId(`order-card-care-cta-${heldItem.variantId}`)).toBeNull();
  });

  it("offers four structured Action groups and composes them with search and Family", async () => {
    render();
    await settle();

    const action = byTestId<HTMLSelectElement>("order-filter-action")!;
    expect(
      Array.from(action.options).map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["", "All actions"],
      ["direct_order", "Direct Order"],
      ["request_order", "Request Order"],
      ["care", "Care"],
      ["temporarily_unavailable_held", "Temporarily Unavailable / Held"],
    ]);
    expect(document.body.textContent).not.toContain("Channel");

    typeInto(byTestId<HTMLInputElement>("order-filter-search"), "Alpha");
    selectValue(
      byTestId<HTMLSelectElement>("order-filter-family"),
      "research_peptides_materials",
    );
    selectValue(action, "request_order");
    await settle();

    expect(api.loadAssistedOrderCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "Alpha",
        family: "research_peptides_materials",
        actionGroup: "request_order",
      }),
      expect.anything(),
    );

    selectValue(byTestId<HTMLSelectElement>("order-filter-family"), "");
    await settle();
    expect(api.loadAssistedOrderCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "Alpha",
        family: undefined,
        actionGroup: "request_order",
      }),
      expect.anything(),
    );

    click(byTestId("order-clear-filters"));
    await settle();
    expect(byTestId<HTMLInputElement>("order-filter-search")?.value).toBe("");
    expect(byTestId<HTMLSelectElement>("order-filter-family")?.value).toBe("");
    expect(byTestId<HTMLSelectElement>("order-filter-action")?.value).toBe("");
    expect(api.loadAssistedOrderCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: undefined,
        family: undefined,
        actionGroup: undefined,
        page: 1,
      }),
      expect.anything(),
    );
  });

  it("hides stale cards while a new filter loads and aborts the obsolete request", async () => {
    const pending = deferred<AssistedOrderCatalogPage>();
    api.loadAssistedOrderCatalog
      .mockResolvedValueOnce(catalogPage([directRuoItem]))
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(catalogPage([pendingItem]));
    render();
    await settle();
    expect(byTestId(`order-card-${directRuoItem.variantId}`)).not.toBeNull();

    typeInto(byTestId<HTMLInputElement>("order-filter-search"), "Pending");
    await settle(230);
    expect(byTestId("order-catalog-skeletons")).not.toBeNull();
    expect(byTestId(`order-card-${directRuoItem.variantId}`)).toBeNull();
    const obsoleteSignal = api.loadAssistedOrderCatalog.mock.calls.at(-1)?.[1] as AbortSignal;
    expect(obsoleteSignal.aborted).toBe(false);

    typeInto(byTestId<HTMLInputElement>("order-filter-search"), "Pending Peptide");
    expect(obsoleteSignal.aborted).toBe(true);
    pending.resolve(catalogPage([directRuoItem]));
    await settle();
    expect(byTestId(`order-card-${pendingItem.variantId}`)).not.toBeNull();
    expect(byTestId(`order-card-${directRuoItem.variantId}`)).toBeNull();
  });

  it("shows a customer-safe retry state without leaking a raw catalog error", async () => {
    api.loadAssistedOrderCatalog
      .mockResolvedValueOnce(catalogPage([directRuoItem]))
      .mockRejectedValueOnce(new Error("postgres password=do-not-expose"));
    render();
    await settle();

    typeInto(byTestId<HTMLInputElement>("order-filter-search"), "anything");
    await settle();
    const error = byTestId("order-catalog-error");
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain("couldn't load the catalog");
    expect(error?.textContent).not.toContain("postgres");
    expect(error?.textContent).not.toContain("do-not-expose");
    expect(byTestId(`order-card-${directRuoItem.variantId}`)).toBeNull();
  });

  it("explains an authorization-gated catalog without claiming a connection failure", async () => {
    api.loadAssistedOrderCatalog.mockRejectedValueOnce(
      new AssistedOrderApiError(403, "not_authorized", "raw authorization detail"),
    );
    render({ embedded: true, continuationEnabled: false });
    await settle();

    const error = byTestId("order-catalog-error");
    expect(error?.textContent).toContain(
      "unavailable until the required agreement and account checks are complete",
    );
    expect(error?.textContent).not.toContain("connection");
    expect(error?.textContent).not.toContain("raw authorization detail");
  });

  it("announces a filter-specific empty state and provides an accessible clear action", async () => {
    api.loadAssistedOrderCatalog
      .mockResolvedValueOnce(catalogPage([directRuoItem]))
      .mockResolvedValueOnce(catalogPage([]));
    render();
    await settle();

    selectValue(byTestId<HTMLSelectElement>("order-filter-action"), "care");
    await settle();
    expect(byTestId("order-catalog-empty")?.textContent).toContain(
      "No products match the selected Action.",
    );
    expect(byTestId("order-catalog-status")?.textContent).toContain(
      "Selected filters applied.",
    );
    click(byTestId("order-catalog-empty")?.querySelector("button") ?? null);
    expect(byTestId<HTMLSelectElement>("order-filter-action")?.value).toBe("");
  });

  it("labels pending products Request Order without changing their request-only mode", async () => {
    render();
    await settle();
    const pendingCta = byTestId<HTMLButtonElement>(
      `order-card-add-${pendingItem.variantId}`,
    );
    expect(pendingCta?.textContent).toBe("Request Order");
    expect(pendingItem.workflowMode).toBe("request_activation");
    click(pendingCta);
    expect(
      byTestId(`order-card-${pendingItem.variantId}`)?.querySelector(
        'input[type="number"]',
      ),
    ).not.toBeNull();
  });

  it("honors a product-specific lower limit and increment in the quantity control", async () => {
    const bulkItem = {
      ...directRuoItem,
      productId: "prod-bulk",
      variantId: "var-bulk",
      productName: "Bulk Peptide",
      minimumQuantity: 10,
      quantityIncrement: 10,
    };
    api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([bulkItem]));
    render();
    await settle();

    click(byTestId(`order-card-add-${bulkItem.variantId}`));
    const card = byTestId(`order-card-${bulkItem.variantId}`)!;
    const quantity = card.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(quantity.value).toBe("10");
    expect(quantity.min).toBe("10");
    expect(quantity.max).toBe("100");
    expect(quantity.step).toBe("10");
    click(card.querySelector('button[aria-label="Increase quantity"]'));
    expect(quantity.value).toBe("20");
  });

  it("prefills exact server-mapped intent only after the customer chooses Add", async () => {
    const entryIntent = orderEntryIntentFromSearch("?family=research_peptides_materials&slug=alpha&variant=mo-alpha&qty=100&intent=assisted_order")!;
    const mapped = { ...directRuoItem, sourceSelection: { family: entryIntent.family, slug: entryIntent.slug, variantId: entryIntent.variantId } };
    api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([mapped]));
    render({ embedded: true, entryIntent, entryResolution: { kind: "matched", item: mapped, quantity: 100 } });
    await settle();
    expect(byTestId<HTMLInputElement>("order-filter-search")?.value).toBe(mapped.productName);
    expect(byTestId(`order-card-requested-${mapped.variantId}`)?.textContent).toContain("Requested quantity: 100");
    expect(byTestId(`order-card-${mapped.variantId}`)?.querySelector('input[type="number"]')).toBeNull();
    expect(api.submitAssistedOrder).not.toHaveBeenCalled();
    click(byTestId(`order-card-add-${mapped.variantId}`));
    expect(byTestId(`order-card-${mapped.variantId}`)?.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("100");
    expect(api.submitAssistedOrder).not.toHaveBeenCalled();
  });

  it.each(["missing_mapping", "changed_variant", "lower_limit", "wrong_increment", "family_mismatch", "stale_quantity"] as const)("never prefills a %s current option from an earlier match", async (reason) => {
    const entryIntent = orderEntryIntentFromSearch("?family=research_peptides_materials&slug=alpha&variant=mo-alpha&qty=7&intent=buy_now")!;
    const mapped = { ...directRuoItem, sourceSelection: { family: entryIntent.family, slug: entryIntent.slug, variantId: entryIntent.variantId } };
    const current = reason === "missing_mapping" ? { ...mapped, sourceSelection: undefined }
      : reason === "changed_variant" ? { ...mapped, variantId: "different-pc-variant" }
        : reason === "lower_limit" ? { ...mapped, maximumQuantity: 5 }
          : reason === "wrong_increment" ? { ...mapped, quantityIncrement: 4 }
            : reason === "family_mismatch" ? { ...mapped, family: "clinical_formulations_503a" } : mapped;
    api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([current]));
    render({ embedded: true, entryIntent, entryResolution: { kind: "matched", item: mapped, quantity: reason === "stale_quantity" ? 2 : 7 } });
    await settle();
    expect(byTestId(`order-card-requested-${current.variantId}`)).toBeNull();
    click(byTestId(`order-card-add-${current.variantId}`));
    expect(byTestId(`order-card-${current.variantId}`)?.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("1");
  });

  it("resolves standalone retained intent before narrowing the catalog, without auto-adding", async () => {
    window.history.replaceState({}, "", "/research/early-access/order-request?family=research_peptides_materials&slug=alpha&variant=mo-alpha&qty=7&intent=request_quote");
    const mapped = { ...pricePendingItem, family: "research_peptides_materials", sourceSelection: { family: "research_peptides_materials", slug: "alpha", variantId: "mo-alpha" } };
    api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([mapped]));
    render();
    await settle();
    await settle();
    expect(byTestId("order-entry-intent-notice")?.textContent).toContain(mapped.productName);
    expect(byTestId(`order-card-requested-${mapped.variantId}`)?.textContent).toContain("Requested quantity: 7");
    expect(byTestId(`order-card-${mapped.variantId}`)?.querySelector('input[type="number"]')).toBeNull();
    expect(api.submitAssistedOrder).not.toHaveBeenCalled();
  });

  it("marks the current wizard step and disables unavailable future steps", async () => {
    render();
    await settle();

    expect(byTestId("order-step-products")?.getAttribute("aria-current")).toBe("step");
    expect(byTestId<HTMLButtonElement>("order-step-contact")?.disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("order-step-review")?.disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("order-step-confirmation")?.disabled).toBe(true);
    expect(document.querySelectorAll(".xenios-order-steps button")).toHaveLength(4);
    expect(document.querySelector(".xenios-order-steps")?.textContent).toContain(
      "Choose products",
    );
    expect(document.querySelector(".xenios-order-steps")?.textContent).toContain(
      "Contact and delivery",
    );
    expect(document.querySelector(".xenios-order-steps")?.textContent).toContain(
      "Review and payment",
    );
    expect(document.querySelector(".xenios-order-steps")?.textContent).toContain(
      "Confirmation and tracking",
    );

    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    expect(byTestId("order-step-products")?.getAttribute("aria-current")).toBeNull();
    expect(byTestId("order-step-contact")?.getAttribute("aria-current")).toBe("step");
    expect(byTestId<HTMLButtonElement>("order-step-products")?.disabled).toBe(false);
    expect(byTestId<HTMLButtonElement>("order-step-review")?.disabled).toBe(true);
  });

  it("allows embedded browsing but withholds Contact until the outer gate is complete", async () => {
    render({ embedded: true, continuationEnabled: false });
    await settle();

    const continueButton = byTestId<HTMLButtonElement>("order-continue-contact")!;
    expect(continueButton.disabled).toBe(true);
    expect(continueButton.getAttribute("aria-describedby")).toBe("order-continuation-gate");
    expect(document.getElementById("order-continuation-gate")?.textContent).toContain(
      "Complete the required agreement and account checks",
    );
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    expect(byTestId("order-contact-name")).toBeNull();
  });

  it("cannot restore a gated embedded draft into Contact or Review", async () => {
    sessionStorage.setItem(
      ASSISTED_ORDER_DRAFT_KEY,
      JSON.stringify({
        idempotencyKey: "draft-gate-test",
        step: "review",
        selections: [{ item: directRuoItem, quantity: 1, notes: "" }],
        generalNotes: "",
        savedAt: "2026-08-25T00:00:00.000Z",
      }),
    );

    render({ embedded: true, continuationEnabled: false });
    await settle();

    expect(byTestId("order-step-products")).toBeNull();
    expect(document.querySelector('nav[aria-label="Order request progress"]')).toBeNull();
    expect(byTestId("order-contact-name")).toBeNull();
    expect(byTestId("order-submit")).toBeNull();
    expect(api.submitAssistedOrder).not.toHaveBeenCalled();
  });

  it("removes a selected row if a fresh catalog response makes it held", async () => {
    api.loadAssistedOrderCatalog
      .mockResolvedValueOnce(catalogPage([directRuoItem]))
      .mockResolvedValueOnce(catalogPage([{ ...directRuoItem, workflowMode: "availability_review" }]));
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));

    typeInto(byTestId<HTMLInputElement>("order-filter-search"), "Alpha");
    await settle();

    expect(byTestId("order-notice")?.textContent).toContain(
      "No longer available and removed from your request: Alpha Peptide",
    );
    expect(document.body.textContent).toContain("No products selected yet.");
    expect(byTestId("order-estimate")?.textContent).toBe("Price on request");
    expect(byTestId(`order-card-add-${directRuoItem.variantId}`)).toBeNull();
  });

  it("does not expose a raw acknowledgment configuration failure", async () => {
    api.loadAssistedOrderConfig.mockRejectedValue(
      new Error("DATABASE_URL=postgres://secret-internal-host"),
    );
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);

    expect(document.body.textContent).toContain(
      "The required acknowledgments could not be loaded.",
    );
    expect(document.body.textContent).not.toContain("DATABASE_URL");
    expect(document.body.textContent).not.toContain("secret-internal-host");
    const retry = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Retry loading acknowledgments"),
    );
    expect(retry?.classList.contains("xenios-order-retry")).toBe(true);
  });

  it("does not expose a raw submission failure", async () => {
    api.submitAssistedOrder.mockRejectedValue(
      new Error("SUPABASE_SERVICE_ROLE_KEY=do-not-expose"),
    );
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    checkAllAcknowledgments();
    click(byTestId("order-submit"));
    await settle(20);

    // A thrown non-API error is an UNCERTAIN outcome: the request may already
    // be saved, so the copy must not claim that nothing was ordered.
    expect(byTestId("order-error")?.textContent).toContain(
      "Request not confirmed. Retry; do not start a new request.",
    );
    expect(document.body.textContent).not.toContain("Nothing was ordered or charged");
    expect(document.body.textContent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(document.body.textContent).not.toContain("do-not-expose");
  });

  it("maps missing durable agreement standing to fixed customer-safe copy", async () => {
    api.submitAssistedOrder.mockRejectedValue(
      new AssistedOrderApiError(
        403,
        "agreement_required",
        "durable agreement lookup leaked secret-row-id",
      ),
    );
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    checkAllAcknowledgments();
    click(byTestId("order-submit"));
    await settle(20);

    expect(byTestId("order-error")?.textContent).toContain(
      "Review and accept the current Research Use Policy before submitting.",
    );
    expect(document.body.textContent).not.toContain("secret-row-id");
  });

  it("submits the full request with server-published acknowledgments and a durable idempotency key", async () => {
    api.submitAssistedOrder.mockResolvedValue(receipt);
    render();
    await settle();

    // Products: two lines, one with a bumped quantity, one price-pending.
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    const card = byTestId(`order-card-${directRuoItem.variantId}`)!;
    click(card.querySelector('button[aria-label="Increase quantity"]'));
    click(byTestId(`order-card-add-${pricePendingItem.variantId}`));
    // A price-pending line never renders as zero in the estimate.
    expect(byTestId("order-estimate")!.textContent).toBe("$50.00");
    click(byTestId("order-continue-contact"));

    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);

    // The RUO confirmation is required because the basket carries an RUO line.
    expect(
      byTestId("order-ack-assisted_order_form_v1:research_use_only"),
    ).not.toBeNull();

    // Fail closed: nothing acknowledged, submission refused.
    const submitButton = byTestId<HTMLButtonElement>("order-submit")!;
    expect(submitButton.disabled).toBe(true);
    checkAllAcknowledgments();
    expect(submitButton.disabled).toBe(false);
    click(submitButton);
    await settle(20);

    expect(api.submitAssistedOrder).toHaveBeenCalledTimes(1);
    const input = api.submitAssistedOrder.mock.calls[0][0];
    // The union of legal pairs and applicable form facts, exact versions.
    expect(
      input.agreements.map((a: { kind: string; version: string }) => `${a.kind}@${a.version}`).sort(),
    ).toEqual([
      "assisted_order_form_v1:accuracy@aeb2ba5a069dd3f4",
      "assisted_order_form_v1:research_use_only@d5150651ebd86b89",
      "research_use_policy@2026-05",
    ]);
    // Lines carry identity, quantity and advisory pins only.
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({
      productId: "prod-a",
      variantId: "var-a",
      quantity: 2,
      expectedUnitPriceCents: 2500,
    });
    expect(input.lines[1]).toMatchObject({
      productId: "prod-c",
      quantity: 1,
    });
    expect(input.lines[1].expectedUnitPriceCents).toBeUndefined();
    expect(typeof input.idempotencyKey).toBe("string");

    // Success: receipt stored with the token under its own key only, the
    // draft cleared, and navigation to the confirmation route's PATH form.
    expect(window.location.pathname).toBe(
      `/research/early-access/order-request/confirmation/${receipt.publicReference}`,
    );
    expect(sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBeNull();
    expect(
      sessionStorage.getItem(`xenios.assisted-order.${receipt.publicReference}.token`),
    ).toBe("secret-token");
    const storedReceipt = sessionStorage.getItem(
      `xenios.assisted-order.${receipt.publicReference}.receipt`,
    )!;
    expect(storedReceipt).not.toContain("secret-token");
  });

  it("does not report a server-accepted request as failed when receipt storage is unavailable", async () => {
    api.submitAssistedOrder.mockResolvedValue(receipt);
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (String(key).endsWith(`.${receipt.publicReference}.receipt`)) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      return nativeSetItem.call(this, key, value);
    });
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    checkAllAcknowledgments();
    click(byTestId("order-submit"));
    await settle(20);

    expect(api.submitAssistedOrder).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(
      `/research/early-access/order-request/confirmation/${receipt.publicReference}`,
    );
    expect(byTestId("order-error")).toBeNull();
    expect(sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBeNull();
    expect(
      sessionStorage.getItem(`xenios.assisted-order.${receipt.publicReference}.token`),
    ).toBeNull();
    expect(
      sessionStorage.getItem(`xenios.assisted-order.${receipt.publicReference}.receipt`),
    ).toBeNull();
  });

  it("omits the RUO confirmation when no RUO line is selected", async () => {
    render();
    await settle();
    click(byTestId(`order-card-add-${pricePendingItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    expect(byTestId("order-ack-assisted_order_form_v1:accuracy")).not.toBeNull();
    expect(
      byTestId("order-ack-assisted_order_form_v1:research_use_only"),
    ).toBeNull();
  });

  it("replays a retry after failure with the SAME idempotency key", async () => {
    api.submitAssistedOrder
      .mockRejectedValueOnce(
        new AssistedOrderApiError(500, "assisted_order_unavailable", "Try again."),
      )
      .mockResolvedValueOnce(receipt);
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    checkAllAcknowledgments();
    click(byTestId("order-submit"));
    await settle(20);
    click(byTestId("order-submit"));
    await settle(20);
    expect(api.submitAssistedOrder).toHaveBeenCalledTimes(2);
    expect(api.submitAssistedOrder.mock.calls[1][0].idempotencyKey).toBe(
      api.submitAssistedOrder.mock.calls[0][0].idempotencyKey,
    );
  });

  it("restores the basket and idempotency key from the draft after a session bounce", async () => {
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    const card = byTestId(`order-card-${directRuoItem.variantId}`)!;
    click(card.querySelector('button[aria-label="Increase quantity"]'));
    await settle(20);
    const storedDraft = sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY);
    expect(storedDraft).not.toBeNull();
    const draftKey = (JSON.parse(storedDraft!) as { idempotencyKey: string })
      .idempotencyKey;

    // The bounce: unmount (session expiry + re-unlock), then a fresh mount.
    unmount();
    render();
    await settle();

    const restoredCard = byTestId(`order-card-${directRuoItem.variantId}`)!;
    expect(
      restoredCard.querySelector<HTMLInputElement>('input[type="number"]')?.value,
    ).toBe("2");
    const draftAfter = JSON.parse(
      sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)!,
    ) as { idempotencyKey: string };
    expect(draftAfter.idempotencyKey).toBe(draftKey);
  });

  it("re-resolves current server values when the submission hits price drift", async () => {
    const repriced = { ...directRuoItem, unitPriceCents: 2700, priceVersion: "price-2" };
    api.submitAssistedOrder.mockRejectedValue(
      new AssistedOrderApiError(409, "price_changed", "The price changed."),
    );
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    checkAllAcknowledgments();
    // The refresh performed after the 409 serves the repriced projection.
    api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([repriced]));
    click(byTestId("order-submit"));
    await settle(20);

    expect(byTestId("order-notice")!.textContent).toContain("Pricing or availability changed");
    // Still on review, now showing the CURRENT server price.
    expect(document.body.textContent).toContain("$27.00");
    expect(window.location.pathname).toBe("/research/early-access/order-request");
  });

  // Doc96 QL-11. The wizard used to claim "Nothing was ordered or charged"
  // after outcomes it could not know, restamped acceptedAt on every submit (so
  // a retry under the persisted key fingerprinted as a different request) and
  // rotated the key on idempotency_conflict. These cases pin the corrected
  // behaviour. They exercise the CLIENT keeping its attempt identity only: the
  // server still checks price and catalog drift before it looks for a replay,
  // and nothing here claims otherwise.
  describe("uncertain outcomes and the frozen attempt identity (Doc96 QL-11)", () => {
    const UNCERTAIN_COPY = "Request not confirmed. Retry; do not start a new request.";
    const CONFLICT_COPY =
      "Your earlier request with these details may already have been received. Do not start a new request.";
    const RESTORED_COPY = "An earlier attempt to send this request may already have been saved.";
    const DRIFT_AFTER_UNCERTAIN_COPY =
      "Pricing or availability changed. An earlier attempt to send this request may already have been saved";
    const CONFIRMATION_PATH =
      "/research/early-access/order-request/confirmation/" + receipt.publicReference;

    type StoredDraft = {
      idempotencyKey: string;
      acceptedAt: string | null;
      attemptState: string;
      step: string;
    };

    function readDraft(): StoredDraft {
      const raw = sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY);
      expect(raw).not.toBeNull();
      return JSON.parse(raw!) as StoredDraft;
    }

    function submitCall(index: number) {
      return api.submitAssistedOrder.mock.calls[index][0];
    }

    /** Every pair in one submission carries the one frozen stamp. */
    function acceptedAtOf(call: { agreements: readonly { acceptedAt: string }[] }): string {
      const stamps = new Set(call.agreements.map((agreement) => agreement.acceptedAt));
      expect(stamps.size).toBe(1);
      return Array.from(stamps)[0];
    }

    const unavailable = () =>
      new AssistedOrderApiError(500, "assisted_order_unavailable", "Try again.");
    const forbidden = () =>
      new AssistedOrderApiError(403, "forbidden", "This request is not authorized.");
    const conflict = () =>
      new AssistedOrderApiError(
        409,
        "idempotency_conflict",
        "This submission key was already used for a different request.",
      );

    /** Products -> contact -> review with every acknowledgment ticked. */
    async function reachReview() {
      click(byTestId("order-card-add-" + directRuoItem.variantId));
      click(byTestId("order-continue-contact"));
      fillContact();
      click(byTestId("order-continue-review"));
      await settle(20);
      checkAllAcknowledgments();
    }

    /** A restored draft lands on contact: contact data is never persisted. */
    async function reviewFromRestoredContact() {
      fillContact();
      click(byTestId("order-continue-review"));
      await settle(20);
      checkAllAcknowledgments();
    }

    it("retries a lost response under the same key and frozen acceptedAt, then clears the draft on the replayed receipt", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(unavailable())
        .mockResolvedValueOnce(receipt);
      render();
      await settle();
      await reachReview();
      click(byTestId("order-submit"));
      await settle(20);

      expect(byTestId("order-error")?.textContent).toContain(UNCERTAIN_COPY);
      expect(document.body.textContent).not.toContain("Nothing was ordered or charged");
      const first = submitCall(0);
      const stamp = acceptedAtOf(first);
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: stamp,
        attemptState: "uncertain",
      });

      click(byTestId("order-submit"));
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(2);
      const second = submitCall(1);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      expect(second.agreements).toEqual(first.agreements);
      expect(window.location.pathname).toBe(CONFIRMATION_PATH);
      expect(sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBeNull();
    });

    it("treats a non-JSON answer and a network failure as uncertain, never as nothing saved", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(
          new AssistedOrderApiError(413, "request_failed", "<html>Request Entity Too Large</html>"),
        )
        .mockRejectedValueOnce(new TypeError("Failed to fetch"));
      render();
      await settle();
      await reachReview();

      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toContain(UNCERTAIN_COPY);
      expect(document.body.textContent).not.toContain("Request Entity Too Large");
      expect(readDraft().attemptState).toBe("uncertain");
      const key = submitCall(0).idempotencyKey;
      const stamp = acceptedAtOf(submitCall(0));

      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toContain(UNCERTAIN_COPY);
      expect(document.body.textContent).not.toContain("Failed to fetch");
      expect(document.body.textContent).not.toContain("Nothing was ordered or charged");
      expect(submitCall(1).idempotencyKey).toBe(key);
      expect(acceptedAtOf(submitCall(1))).toBe(stamp);
      expect(readDraft()).toMatchObject({
        idempotencyKey: key,
        acceptedAt: stamp,
        attemptState: "uncertain",
      });
    });

    it("restores an uncertain attempt after a refresh with the same key and acceptedAt, and says so", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(unavailable())
        .mockResolvedValueOnce(receipt);
      render();
      await settle();
      await reachReview();
      click(byTestId("order-submit"));
      await settle(20);
      const first = submitCall(0);
      const before = readDraft();
      expect(before.attemptState).toBe("uncertain");

      // The refresh: unmount (session expiry + re-unlock), then a fresh mount.
      unmount();
      render();
      await settle();

      expect(byTestId("order-notice")?.textContent).toContain(RESTORED_COPY);
      expect(document.body.textContent).not.toMatch(/reload/i);
      expect(readDraft()).toMatchObject({
        idempotencyKey: before.idempotencyKey,
        acceptedAt: before.acceptedAt,
        attemptState: "uncertain",
      });

      // Contact details were never persisted; the same ones are re-entered.
      await reviewFromRestoredContact();
      click(byTestId("order-submit"));
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(2);
      const second = submitCall(1);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      expect(second.agreements).toEqual(first.agreements);
      expect(second.contact.email).toBe(first.contact.email);
      expect(window.location.pathname).toBe(CONFIRMATION_PATH);
      expect(sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBeNull();
    });

    it("ignores a duplicate click while a submission is in flight", async () => {
      const inFlight = deferred<AssistedOrderReceipt>();
      api.submitAssistedOrder.mockReturnValue(inFlight.promise);
      render();
      await settle();
      await reachReview();

      click(byTestId("order-submit"));
      click(byTestId("order-submit"));
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(1);
      expect(byTestId<HTMLButtonElement>("order-submit")?.disabled).toBe(true);

      inFlight.resolve(receipt);
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe(CONFIRMATION_PATH);
    });

    it("records a submission lost mid-flight as uncertain, restores it with the same key and acceptedAt, and never releases the stamp afterwards", async () => {
      const lost = deferred<AssistedOrderReceipt>();
      api.submitAssistedOrder
        .mockReturnValueOnce(lost.promise)
        .mockRejectedValueOnce(
          new AssistedOrderApiError(400, "validation_error", "Enter a valid email address.", "contact.email"),
        )
        .mockResolvedValueOnce(receipt);
      render();
      await settle();
      await reachReview();

      click(byTestId("order-submit"));
      await settle(20);
      // The attempt has left the browser; the draft already says so.
      const first = submitCall(0);
      const stamp = acceptedAtOf(first);
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: stamp,
        attemptState: "in_flight",
      });

      // The page is lost while the POST is still outstanding. The promise is
      // deliberately never settled: no answer ever reached this page.
      unmount();
      render();
      await settle();

      expect(byTestId("order-notice")?.textContent).toContain(RESTORED_COPY);
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: stamp,
        attemptState: "uncertain",
      });

      // A definitive refusal now cannot release the stamp: the lost POST may
      // have committed, and this page has no uninterrupted knowledge of it.
      await reviewFromRestoredContact();
      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toBe(
        "Review the highlighted information and try again. (contact.email)",
      );
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: stamp,
        attemptState: "uncertain",
      });
      expect(submitCall(1).idempotencyKey).toBe(first.idempotencyKey);
      expect(acceptedAtOf(submitCall(1))).toBe(stamp);

      click(byTestId("order-submit"));
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(3);
      expect(submitCall(2).idempotencyKey).toBe(first.idempotencyKey);
      expect(acceptedAtOf(submitCall(2))).toBe(stamp);
      expect(window.location.pathname).toBe(CONFIRMATION_PATH);
      expect(sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBeNull();
    });

    it("keeps the key on idempotency_conflict and never invites a new request", async () => {
      api.submitAssistedOrder.mockRejectedValue(conflict());
      render();
      await settle();
      await reachReview();
      click(byTestId("order-submit"));
      await settle(20);

      expect(byTestId("order-notice")?.textContent).toContain(CONFLICT_COPY);
      expect(document.body.textContent).not.toContain("Press Submit again");
      expect(document.body.textContent).not.toContain("as a new request");
      expect(document.body.textContent).not.toMatch(/reload/i);
      expect(document.body.textContent).not.toContain("start again");
      const key = submitCall(0).idempotencyKey;
      expect(readDraft().idempotencyKey).toBe(key);
      // What the conflict proved is persisted: something already exists under
      // this key, so the attempt is uncertain from now on (Doc99 QL2-6).
      expect(readDraft()).toMatchObject({
        acceptedAt: acceptedAtOf(submitCall(0)),
        attemptState: "uncertain",
      });

      click(byTestId("order-submit"));
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(2);
      expect(submitCall(1).idempotencyKey).toBe(key);
      expect(submitCall(1).agreements).toEqual(submitCall(0).agreements);

      // A refresh after the conflict restores the learned uncertainty.
      unmount();
      render();
      await settle();
      expect(byTestId("order-notice")?.textContent).toContain(RESTORED_COPY);
      expect(readDraft()).toMatchObject({ idempotencyKey: key, attemptState: "uncertain" });
    });

    it("keeps the frozen attempt after an uncertain outcome even when a later refusal is definitive", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(unavailable())
        .mockRejectedValueOnce(
          new AssistedOrderApiError(
            400,
            "validation_error",
            "Enter a valid mobile phone.",
            "contact.mobilePhone",
          ),
        );
      render();
      await settle();
      await reachReview();
      click(byTestId("order-submit"));
      await settle(20);
      const frozen = readDraft();
      expect(frozen.attemptState).toBe("uncertain");
      expect(frozen.acceptedAt).not.toBeNull();

      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toBe(
        "Review the highlighted information and try again. (contact.mobilePhone)",
      );
      expect(document.body.textContent).not.toContain("Enter a valid mobile phone.");
      expect(readDraft()).toMatchObject({
        idempotencyKey: frozen.idempotencyKey,
        acceptedAt: frozen.acceptedAt,
        attemptState: "uncertain",
      });
      expect(submitCall(1).idempotencyKey).toBe(submitCall(0).idempotencyKey);
      expect(submitCall(1).agreements).toEqual(submitCall(0).agreements);
    });

    it("releases only the acceptance time after a definitive first-attempt refusal and keeps the key", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(
          new AssistedOrderApiError(
            400,
            "validation_error",
            "Enter a valid email address.",
            "contact.email",
          ),
        )
        .mockResolvedValueOnce(receipt);
      render();
      await settle();
      await reachReview();
      click(byTestId("order-submit"));
      await settle(20);
      const first = submitCall(0);
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: null,
        attemptState: "none",
      });

      // Enough wall-clock time for a fresh stamp to differ.
      await settle(10);
      click(byTestId("order-submit"));
      await settle(20);
      const second = submitCall(1);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      const firstStamp = acceptedAtOf(first);
      const secondStamp = acceptedAtOf(second);
      expect(secondStamp).not.toBe(firstStamp);
      expect(Date.parse(secondStamp)).toBeGreaterThan(Date.parse(firstStamp));
      expect(window.location.pathname).toBe(CONFIRMATION_PATH);
    });

    it("keeps the attempt key when drift is refused after an uncertain attempt and does not claim nothing was submitted", async () => {
      const repriced = { ...directRuoItem, unitPriceCents: 2700, priceVersion: "price-2" };
      api.submitAssistedOrder
        .mockRejectedValueOnce(unavailable())
        .mockRejectedValueOnce(new AssistedOrderApiError(409, "price_changed", "The price changed."))
        .mockRejectedValueOnce(conflict());
      render();
      await settle();
      await reachReview();
      click(byTestId("order-submit"));
      await settle(20);
      const first = submitCall(0);
      const frozen = readDraft();
      expect(frozen.attemptState).toBe("uncertain");

      // The server checks price and catalog drift BEFORE it looks for a
      // replay, so a saved earlier attempt comes back as a 409 here. The
      // client keeps the attempt identity; it does not change, and cannot
      // repair, that server ordering.
      api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([repriced]));
      click(byTestId("order-submit"));
      await settle(20);
      const notice = byTestId("order-notice")?.textContent ?? "";
      expect(notice).toContain(DRIFT_AFTER_UNCERTAIN_COPY);
      expect(notice).not.toContain("nothing was submitted");
      expect(document.body.textContent).toContain("$27.00");
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: frozen.acceptedAt,
        attemptState: "uncertain",
      });

      // A further submit rides the SAME key: the saved request can replay or
      // conflict, never be duplicated under an automatically minted key.
      click(byTestId("order-submit"));
      await settle(20);
      expect(api.submitAssistedOrder).toHaveBeenCalledTimes(3);
      const third = submitCall(2);
      expect(third.idempotencyKey).toBe(first.idempotencyKey);
      expect(third.agreements).toEqual(first.agreements);
      expect(third.lines[0].expectedUnitPriceCents).toBe(2700);
      expect(byTestId("order-notice")?.textContent).toContain(CONFLICT_COPY);
    });

    it("releases the acceptance time on a first-attempt drift refusal, where nothing was persisted, and keeps the key", async () => {
      const repriced = { ...directRuoItem, unitPriceCents: 2700, priceVersion: "price-2" };
      api.submitAssistedOrder
        .mockRejectedValueOnce(new AssistedOrderApiError(409, "price_changed", "The price changed."))
        .mockResolvedValueOnce(receipt);
      render();
      await settle();
      await reachReview();
      api.loadAssistedOrderCatalog.mockResolvedValue(catalogPage([repriced]));
      click(byTestId("order-submit"));
      await settle(20);
      const first = submitCall(0);
      expect(byTestId("order-notice")?.textContent).toContain(
        "Pricing or availability changed while you were reviewing, so nothing was submitted.",
      );
      expect(readDraft()).toMatchObject({
        idempotencyKey: first.idempotencyKey,
        acceptedAt: null,
        attemptState: "none",
      });

      await settle(10);
      click(byTestId("order-submit"));
      await settle(20);
      const second = submitCall(1);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
      expect(Date.parse(acceptedAtOf(second))).toBeGreaterThan(Date.parse(acceptedAtOf(first)));
      expect(second.lines[0].expectedUnitPriceCents).toBe(2700);
      expect(window.location.pathname).toBe(CONFIRMATION_PATH);
    });

    it("cannot restore an uncertain draft past the continuation gate, and keeps its identity intact", async () => {
      sessionStorage.setItem(
        ASSISTED_ORDER_DRAFT_KEY,
        JSON.stringify({
          idempotencyKey: "draft-uncertain-gate",
          acceptedAt: "2026-10-12T12:00:00.000Z",
          attemptState: "uncertain",
          step: "review",
          selections: [{ item: directRuoItem, quantity: 1, notes: "" }],
          generalNotes: "",
          savedAt: "2026-10-12T12:00:00.000Z",
        }),
      );

      render({ embedded: true, continuationEnabled: false });
      await settle();

      expect(byTestId("order-notice")?.textContent).toContain(RESTORED_COPY);
      expect(byTestId("order-contact-name")).toBeNull();
      expect(byTestId("order-submit")).toBeNull();
      expect(api.submitAssistedOrder).not.toHaveBeenCalled();
      expect(readDraft()).toMatchObject({
        idempotencyKey: "draft-uncertain-gate",
        acceptedAt: "2026-10-12T12:00:00.000Z",
        attemptState: "uncertain",
      });
    });

    it("maps an ended session to enter-again copy first, and to status-or-support copy after an uncertain attempt", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(forbidden())
        .mockRejectedValueOnce(unavailable())
        .mockRejectedValueOnce(forbidden());
      render();
      await settle();
      await reachReview();

      // Thrown before persistence, and re-unlocking sweeps the draft: the
      // request has to be entered again, and the copy says exactly that.
      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toBe(
        "Your Early Access session ended and nothing was saved. Unlock Early Access again and enter your request again.",
      );
      expect(readDraft()).toMatchObject({ acceptedAt: null, attemptState: "none" });

      click(byTestId("order-submit"));
      await settle(20);
      expect(readDraft().attemptState).toBe("uncertain");

      // After an uncertain attempt the same sweep makes "retry the same
      // request after unlocking" impossible to honour, so the copy never
      // promises it: status or support, with the time of the attempt.
      click(byTestId("order-submit"));
      await settle(20);
      const copy = byTestId("order-error")?.textContent ?? "";
      expect(copy).toBe(
        "Your Early Access session ended. An earlier attempt to send this request may already have been saved. Do not resubmit it: check your request status or contact support with the time of your attempt.",
      );
      expect(copy).not.toMatch(/retry/i);
      expect(copy).not.toMatch(/unlock/i);
      expect(document.body.textContent).not.toContain("start again");
      const key = submitCall(0).idempotencyKey;
      for (const call of api.submitAssistedOrder.mock.calls) {
        expect(call[0].idempotencyKey).toBe(key);
      }
      expect(readDraft()).toMatchObject({ idempotencyKey: key, attemptState: "uncertain" });
    });

    it("classifies unfamiliar refusals by what the server can be known to have done", async () => {
      api.submitAssistedOrder
        .mockRejectedValueOnce(new AssistedOrderApiError(429, "rate_limited", "Slow down."))
        .mockRejectedValueOnce(new AssistedOrderApiError(409, "serialization_failure", "Retry."));
      render();
      await settle();
      await reachReview();

      // A JSON 4xx from this service is thrown before persistence.
      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toBe(
        "The order request was not accepted and was not saved. Please review your details and try again.",
      );
      expect(document.body.textContent).not.toContain("Slow down.");
      expect(readDraft()).toMatchObject({ acceptedAt: null, attemptState: "none" });

      // An unfamiliar 409 may have landed after persistence: uncertain.
      click(byTestId("order-submit"));
      await settle(20);
      expect(byTestId("order-error")?.textContent).toContain(UNCERTAIN_COPY);
      expect(readDraft().attemptState).toBe("uncertain");
      expect(submitCall(1).idempotencyKey).toBe(submitCall(0).idempotencyKey);
    });
  });
});

describe("AssistedOrderConfirmationPage landmarks", () => {
  it("renders no main element of its own — MinimalChrome supplies the page main (P2-4)", () => {
    window.history.replaceState(
      {},
      "",
      "/research/early-access/order-request/confirmation/XRR-20260819-ABCDEF1234",
    );
    storeAssistedOrderReceipt(receipt);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<AssistedOrderConfirmationPage />));

    expect(host.querySelector("main")).toBeNull();
    expect(host.querySelector("section.xenios-order-page")).not.toBeNull();
    expect(byTestId("order-confirmation-reference")!.textContent).toContain(
      "XRR-20260819-ABCDEF1234",
    );
    const progress = byTestId("assisted-order-customer-progress");
    expect(progress?.querySelectorAll("li")).toHaveLength(4);
    expect(
      progress
        ?.querySelector('[data-testid="assisted-order-customer-progress-step-3"]')
        ?.getAttribute("aria-current"),
    ).toBe("step");
    expect(progress?.textContent).toContain("Confirmation and tracking");
  });

  it("does not report a server-accepted request as failed when the sessionStorage getter is denied", async () => {
    api.submitAssistedOrder.mockResolvedValue(receipt);
    render();
    await settle();
    click(byTestId(`order-card-add-${directRuoItem.variantId}`));
    click(byTestId("order-continue-contact"));
    fillContact();
    click(byTestId("order-continue-review"));
    await settle(20);
    checkAllAcknowledgments();
    vi.spyOn(window, "sessionStorage", "get").mockImplementation((): Storage => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    click(byTestId("order-submit"));
    await settle(20);

    expect(api.submitAssistedOrder).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(
      `/research/early-access/order-request/confirmation/${receipt.publicReference}`,
    );
    expect(byTestId("order-error")).toBeNull();
  });

  it("never claims received or submitted from an arbitrary URL alone", () => {
    window.history.replaceState(
      {},
      "",
      "/research/early-access/order-request/confirmation/XRR-20260819-ABCDEF1234",
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<AssistedOrderConfirmationPage />));

    expect(byTestId("order-confirmation-unavailable")).not.toBeNull();
    expect(byTestId("assisted-order-customer-progress")).toBeNull();
    expect(host.textContent).toContain("Confirmation unavailable");
    expect(host.textContent).not.toMatch(/request received|status:\s*submitted/i);
    expect(host.querySelectorAll("h1")).toHaveLength(1);
  });

  it("stays neutral when the browser denies the sessionStorage getter", () => {
    window.history.replaceState(
      {},
      "",
      "/research/early-access/order-request/confirmation/XRR-20260819-ABCDEF1234",
    );
    vi.spyOn(window, "sessionStorage", "get").mockImplementation((): Storage => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    expect(() => act(() => root!.render(<AssistedOrderConfirmationPage />))).not.toThrow();
    expect(byTestId("order-confirmation-unavailable")).not.toBeNull();
    expect(host.textContent).not.toMatch(/request received|status:\s*submitted/i);
  });

  it("rejects a malformed path and a receipt whose embedded reference does not match", () => {
    window.history.replaceState(
      {},
      "",
      "/research/early-access/order-request/confirmation/XRR-20260819-ABCDEF1234",
    );
    sessionStorage.setItem(
      assistedOrderReceiptKey(receipt.publicReference),
      JSON.stringify({
        ...receipt,
        statusToken: undefined,
        publicReference: "XRR-20260819-0000000000",
      }),
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<AssistedOrderConfirmationPage />));
    expect(byTestId("order-confirmation-unavailable")).not.toBeNull();
    unmount();

    window.history.replaceState(
      {},
      "",
      "/research/early-access/order-request/confirmation/%E0%A4%A",
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    expect(() => act(() => root!.render(<AssistedOrderConfirmationPage />))).not.toThrow();
    expect(byTestId("order-confirmation-unavailable")).not.toBeNull();
  });
});

const statusView: AssistedOrderStatusView = {
  requestId: "req-1",
  publicReference: receipt.publicReference,
  status: "submitted",
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  estimatedTotalCents: 5000,
  currency: "USD",
  lines: [],
  timeline: [
    {
      status: "submitted",
      occurredAt: "2026-08-19T00:00:00.000Z",
      customerMessage: "Request received for review.",
    },
  ],
  documents: [],
  actionRequired: null,
};

describe("AssistedOrderStatusPage verified identity", () => {
  function renderStatus() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<AssistedOrderStatusPage />));
  }

  it("reads owner-linked requests with the current bearer and renders nullable estimates and opaque tracking", async () => {
    statusSession.memberToken = "synthetic-member-a";
    storeAssistedOrderReceipt(receipt);
    api.loadAssistedOrderStatus.mockResolvedValue({ ...statusView, estimatedTotalCents: null, trackingReference: "OPAQUE-TRACKING-REF" });
    window.history.replaceState({}, "", `/research/early-access/order-request/${receipt.publicReference}`);
    renderStatus(); await settle(20);
    expect(api.loadAssistedOrderStatus).toHaveBeenCalledWith(receipt.publicReference, undefined, "synthetic-member-a");
    expect(byTestId("assisted-request-status-estimate")?.textContent).toBe("Estimate: Price on request");
    expect(byTestId("assisted-request-status-tracking")?.textContent).toContain("OPAQUE-TRACKING-REF");
    expect(host!.querySelector('a[href*="OPAQUE-TRACKING"]')).toBeNull();
    expect(host!.textContent).not.toContain("$0.00");
  });

  it("removes A's request during a B identity read and rejects A's late refresh", async () => {
    statusSession.memberToken = "synthetic-member-a";
    const a = deferred<AssistedOrderStatusView>();
    api.loadAssistedOrderStatus.mockReturnValueOnce(a.promise);
    window.history.replaceState({}, "", `/research/early-access/order-request/${receipt.publicReference}`);
    renderStatus();
    statusSession.memberToken = "synthetic-member-b";
    api.loadAssistedOrderStatus.mockRejectedValueOnce(new AssistedOrderApiError(404, "not_found", "PRIVATE"));
    act(() => root!.render(<AssistedOrderStatusPage />)); await settle(20);
    a.resolve(statusView); await settle(20);
    expect(host!.textContent).not.toContain(receipt.publicReference);
    expect(host!.textContent).not.toContain("Request received for review.");
    expect(host!.textContent).toContain("not valid or has expired");
    expect(api.loadAssistedOrderStatus).toHaveBeenLastCalledWith(receipt.publicReference, undefined, "synthetic-member-b");
  });

  it("hides ready request details during member verification without making a new read", async () => {
    statusSession.memberToken = "synthetic-member-a";
    api.loadAssistedOrderStatus.mockResolvedValue(statusView);
    window.history.replaceState({}, "", `/research/early-access/order-request/${receipt.publicReference}`);
    renderStatus(); await settle(20); expect(host!.textContent).toContain(receipt.publicReference);
    statusSession.memberChecking = true;
    act(() => root!.render(<AssistedOrderStatusPage />));
    expect(host!.textContent).not.toContain(receipt.publicReference);
    expect(api.loadAssistedOrderStatus).toHaveBeenCalledTimes(1);
    expect(host!.textContent).toContain("Checking request");
  });

  it("does not echo an arbitrary reference before the server verifies it", async () => {
    const pending = deferred<AssistedOrderStatusView>();
    api.loadAssistedOrderStatus.mockReturnValue(pending.promise);
    window.history.replaceState({}, "", `/research/early-access/order-request/${receipt.publicReference}`);
    renderStatus();

    expect(byTestId("order-status-heading")?.textContent).toBe("Request status");
    expect(byTestId("assisted-order-customer-progress")).toBeNull();
    expect(host!.textContent).not.toContain(receipt.publicReference);
    pending.resolve(statusView);
    await settle(20);
    expect(byTestId("order-status-heading")?.textContent).toBe(receipt.publicReference);
    const progress = byTestId("assisted-order-customer-progress");
    expect(progress?.querySelectorAll("li")).toHaveLength(4);
    expect(
      progress
        ?.querySelector('[data-testid="assisted-order-customer-progress-step-3"]')
        ?.getAttribute("aria-current"),
    ).toBe("step");
    expect(host!.textContent).toContain("Request received for review.");
    expect(
      host!.querySelector('a.xenios-order-return-link[href="/research/early-access"]')
        ?.textContent,
    ).toContain("Return to Early Access");
  });

  it("keeps a refused or missing request neutral", async () => {
    api.loadAssistedOrderStatus.mockRejectedValue(
      new AssistedOrderApiError(404, "not_found", "upstream text must not render"),
    );
    window.history.replaceState({}, "", `/research/early-access/order-request/${receipt.publicReference}`);
    renderStatus();
    await settle(20);

    expect(byTestId("order-status-heading")?.textContent).toBe("Request status");
    expect(host!.textContent).not.toContain(receipt.publicReference);
    expect(host!.textContent).toContain("not valid or has expired");
    expect(host!.textContent).not.toContain("upstream text");
    expect(
      host!.querySelector('a.xenios-order-return-link[href="/research/early-access"]'),
    ).not.toBeNull();
  });

  it("rejects a malformed reference without calling the API", async () => {
    window.history.replaceState({}, "", "/research/early-access/order-request/not-a-reference");
    renderStatus();
    await settle(5);

    expect(api.loadAssistedOrderStatus).not.toHaveBeenCalled();
    expect(byTestId("order-status-heading")?.textContent).toBe("Request status");
    expect(host!.textContent).toContain("not valid or has expired");
  });
});

// Doc99 release item 2. Every other test above mocks "./api", so the real
// request() path that turns a non-JSON or 5xx answer into the error the
// wizard's classifier depends on was never exercised. These cases import the
// actual module and stub only the global fetch; api.ts itself is unchanged.
describe("the real api request path against a stubbed fetch (Doc99 release item 2)", () => {
  type ActualApi = typeof import("./api");
  type CapturedInit = { method?: string; credentials?: string; body?: unknown };

  const submitInput: AssistedOrderSubmitInput = {
    idempotencyKey: "key-real-request",
    contact: {
      fullLegalName: "Ada Researcher",
      email: "ada@example.org",
      mobilePhone: "+1 555 010 2000",
      ageConfirmed: true,
      shippingAddress: {
        line1: "1 Research Way",
        city: "Boston",
        region: "MA",
        postalCode: "02110",
        countryCode: "US",
      },
      billingSameAsShipping: true,
    },
    agreements: [
      { kind: "research_use_policy", version: "2026-05", acceptedAt: "2026-10-12T12:00:00.000Z" },
    ],
    lines: [{ productId: directRuoItem.productId, variantId: directRuoItem.variantId, quantity: 1 }],
  };

  /** The minimal surface request() reads from a fetch Response. */
  function answer(status: number, body: string) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(body) as unknown,
    };
  }

  async function actualApi(): Promise<ActualApi> {
    return vi.importActual<ActualApi>("./api");
  }

  async function failureOf(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
      () => null,
      (reason: unknown) => reason,
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns a non-JSON 502 into request_failed, which the wizard treats as uncertain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(502, "<html>Bad Gateway</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const { submitAssistedOrder } = await actualApi();

    const outcome = await failureOf(submitAssistedOrder(submitInput));
    expect(outcome).toBeInstanceOf(AssistedOrderApiError);
    expect(outcome).toMatchObject({ status: 502, code: "request_failed" });
    expect((outcome as Error).message).not.toContain("Bad Gateway");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, CapturedInit];
    expect(url).toBe("/api/research/early-access/assisted-orders");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({ idempotencyKey: "key-real-request" });
  });

  it("turns an HTML 413 into request_failed as well", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(413, "<html>Request Entity Too Large</html>")));
    const { submitAssistedOrder } = await actualApi();
    await expect(submitAssistedOrder(submitInput)).rejects.toMatchObject({
      status: 413,
      code: "request_failed",
      message: "The request could not be completed.",
    });
  });

  it("keeps the server's own code and message on a JSON 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        answer(
          500,
          JSON.stringify({
            error: "assisted_order_unavailable",
            message: "The assisted order service is temporarily unavailable.",
          }),
        ),
      ),
    );
    const { submitAssistedOrder } = await actualApi();
    await expect(submitAssistedOrder(submitInput)).rejects.toMatchObject({
      status: 500,
      code: "assisted_order_unavailable",
      message: "The assisted order service is temporarily unavailable.",
    });
  });

  it("lets a network failure surface as a plain error, never as a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { submitAssistedOrder } = await actualApi();
    const outcome = await failureOf(submitAssistedOrder(submitInput));
    expect(outcome).toBeInstanceOf(TypeError);
    expect(outcome).not.toBeInstanceOf(AssistedOrderApiError);
  });

  it("returns the receipt on a JSON 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(200, JSON.stringify(receipt))));
    const { submitAssistedOrder } = await actualApi();
    await expect(submitAssistedOrder(submitInput)).resolves.toEqual(receipt);
  });
});
