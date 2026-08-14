// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KrisCatalogDetailView } from "@shared/research/kris-launch-a/contract";
import { KrisLegacyBuyNow } from "./KrisLegacyBuyNow";
import {
  KrisPathwayRequest,
  pathwayForRequest,
  requestBodyText,
} from "./KrisPathwayRequest";
import { krisFixtureDetail, krisFixtureItems } from "./__fixtures__/krisFixtureServer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: "member-token" }),
}));

/**
 * Real rows only, per this directory's convention: the fixture serves the
 * committed generated artifact, so every persona below is a genuine catalog
 * row, including the exact provider row QA used for the upgrade attack.
 */
function realDetail(predicate: (row: ReturnType<typeof krisFixtureItems>[number]) => boolean): KrisCatalogDetailView {
  const item = krisFixtureItems().find(predicate);
  if (!item) throw new Error("expected real fixture row missing");
  const detail = krisFixtureDetail(item.family, item.slug);
  if (!detail) throw new Error("expected real fixture detail missing");
  return detail;
}

const providerRow = () => realDetail((row) => row.id === "kli_38cfd981f7851984829a");
const pricePendingRow = () =>
  realDetail((row) => row.purchaseMode === "price_pending" && row.displayName === "BAM15");
const classificationRow = () => realDetail((row) => row.purchaseMode === "classification_pending");

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("the pathway request body", () => {
  it("carries the server-composed subject and the exact catalog identity", () => {
    const item = pricePendingRow();
    const body = requestBodyText(item, "  need this priced for a partner order  ");
    expect(body).toContain(pathwayForRequest(item).request.subject);
    expect(body).toContain(`Item: ${item.displayName} | ${item.specification}`);
    expect(body).toContain(`Catalog id: ${item.id}`);
    expect(body).toContain(`Slug: ${item.slug}`);
    expect(body).toContain(`Channel: ${item.channelLabel}`);
    expect(body).toContain("Note: need this priced for a partner order");
  });

  it("composes a working fallback when the pin stripped the pathway", () => {
    // The decode pin downgrades a drifted envelope and such an item may carry
    // pathway null. The request must still work from the row's own fields.
    const item: KrisCatalogDetailView = { ...providerRow(), pathway: null };
    const pathway = pathwayForRequest(item);
    expect(pathway.kind).toBe("provider_workflow");
    expect(pathway.request.label).toBe("Request provider pathway");
    expect(pathway.request.subject).toContain(item.displayName);
  });
});

describe("KrisPathwayRequest submits into the member Questions door", () => {
  it("posts the product-scoped request with the member token and confirms", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(201, { ok: true });
    });
    const item = pricePendingRow();
    const view = render(<KrisPathwayRequest item={item} />);
    const submit = view.host.querySelector<HTMLButtonElement>(
      '[data-testid="kris-pathway-submit"]',
    );
    expect(submit?.textContent).toBe("Request price");
    act(() => submit?.click());
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/research/questions");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer member-token");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.category).toBe("product");
    expect(sent.bodyText).toContain(`Catalog id: ${item.id}`);
    expect(view.host.querySelector('[data-testid="kris-pathway-sent"]')).not.toBeNull();
    expect(
      view.host.querySelector('[data-testid="kris-pathway-sent"] a')?.getAttribute("href"),
    ).toBe("/research/member/questions");
    view.unmount();
  });

  it("renders the recorded-elsewhere copy on the door's rate limit", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse(429, { ok: false, code: "rate_limited", message: "Too many questions at once." }),
    );
    const view = render(<KrisPathwayRequest item={classificationRow()} />);
    act(() =>
      view.host.querySelector<HTMLButtonElement>('[data-testid="kris-pathway-submit"]')?.click(),
    );
    await settle();
    expect(view.host.querySelector('[data-testid="kris-pathway-limited"]')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="kris-pathway-sent"]')).toBeNull();
    view.unmount();
  });
});

describe("every non-direct mode carries a working request and never Buy Now", () => {
  it("price pending: request action present, no Buy Now", () => {
    const view = render(<KrisLegacyBuyNow item={pricePendingRow()} />);
    expect(view.host.querySelector('[data-testid="kris-purchase-price-pending"]')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="kris-pathway-submit"]')?.textContent).toBe(
      "Request price",
    );
    expect(view.host.querySelector('[data-testid="kris-buy-now"]')).toBeNull();
    view.unmount();
  });

  it("classification pending: register interest present, no Buy Now", () => {
    const view = render(<KrisLegacyBuyNow item={classificationRow()} />);
    expect(view.host.querySelector('[data-testid="kris-purchase-pending"]')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="kris-pathway-submit"]')?.textContent).toBe(
      "Register interest",
    );
    expect(view.host.querySelector('[data-testid="kris-buy-now"]')).toBeNull();
    view.unmount();
  });

  it("provider: the request carries the product; the care link becomes secondary", () => {
    const view = render(<KrisLegacyBuyNow item={providerRow()} />);
    expect(view.host.querySelector('[data-testid="kris-purchase-provider"]')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="kris-pathway-submit"]')?.textContent).toBe(
      "Request provider pathway",
    );
    const secondary = view.host.querySelector('a[href="/research/member/metabolic-care"]');
    expect(secondary?.classList.contains("btn")).toBe(false);
    expect(view.host.querySelector('[data-testid="kris-buy-now"]')).toBeNull();
    view.unmount();
  });

  it("QA's drifted provider envelope, after the pin, still gets a working request", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse(201, { ok: true }));
    const drifted: KrisCatalogDetailView = {
      ...providerRow(),
      purchaseMode: "provider_workflow",
      legacyOrder: null,
      canBuyNow: false,
      pathway: null,
    };
    const view = render(<KrisLegacyBuyNow item={drifted} />);
    expect(view.host.querySelector('[data-testid="kris-buy-now"]')).toBeNull();
    const submit = view.host.querySelector<HTMLButtonElement>(
      '[data-testid="kris-pathway-submit"]',
    );
    expect(submit?.textContent).toBe("Request provider pathway");
    act(() => submit?.click());
    await settle();
    expect(view.host.querySelector('[data-testid="kris-pathway-sent"]')).not.toBeNull();
    view.unmount();
  });
});
