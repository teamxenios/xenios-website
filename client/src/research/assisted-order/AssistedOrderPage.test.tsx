// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderReceipt,
} from "../../../../shared/research/assisted-order/contract";

const api = vi.hoisted(() => ({
  loadAssistedOrderCatalog: vi.fn(),
  loadAssistedOrderConfig: vi.fn(),
  submitAssistedOrder: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, ...api };
});

// The page side-effect-imports its stylesheet; the repo's PostCSS chain is not
// set up for vitest, and styles are irrelevant here.
vi.mock("./assisted-order.css", () => ({ default: {} }));

import { AssistedOrderApiError } from "./api";
import { AssistedOrderPage } from "./AssistedOrderPage";
import { ASSISTED_ORDER_DRAFT_KEY } from "./draft-store";

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

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<AssistedOrderPage />));
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
  sessionStorage.clear();
  window.history.replaceState({}, "", "/research/early-access/order-request");
  api.loadAssistedOrderCatalog.mockReset();
  api.loadAssistedOrderConfig.mockReset();
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
});
