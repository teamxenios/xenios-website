// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CatalogDiscoveryAccessPath,
  CatalogDiscoveryActionKind,
  CatalogDiscoveryStatus,
} from "@shared/research/master-offerings/presentation-contract";
import { CatalogDiscoveryPresentation } from "./CatalogDiscoveryPresentation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const noop = () => undefined;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

const actionByStatus: Partial<
  Record<
    CatalogDiscoveryStatus,
    [CatalogDiscoveryAccessPath, CatalogDiscoveryActionKind]
  >
> = {
  live: ["direct_order", "request_order"],
  request_only: ["request_availability", "request_availability"],
  provider_required: ["care", "continue_care"],
  documentation_pending: ["availability_list", "join_availability_list"],
};

function record(
  status: CatalogDiscoveryStatus = "live",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const action = actionByStatus[status];
  return {
    productId: `product-${status}`,
    variantId: `variant-${status}`,
    displayName: `Offering ${status}`,
    variantLabel: `Variant ${status}`,
    category: { key: "research", label: "Research" },
    strength: { key: "ten-mg", label: "10 mg" },
    form: { key: "vial", label: "Vial" },
    status,
    accessPath:
      action?.[0] ??
      (status === "held" || status === "unavailable" ? "none" : "unknown"),
    detailHref: `/research/member/catalog/${status}`,
    image: {
      href: `https://media.xeniostechnology.com/${status}.webp`,
      altText: `Offering ${status}`,
      width: 800,
      height: 600,
    },
    action: action
      ? {
          kind: action[1],
          href: "/research/member/product-requests/new",
        }
      : null,
    savedInterest: { availability: "unavailable" },
    ...overrides,
  };
}

function surface(
  overrides: Partial<
    React.ComponentProps<typeof CatalogDiscoveryPresentation>
  > = {},
) {
  return (
    <CatalogDiscoveryPresentation
      records={[record()]}
      state="ready"
      query={{}}
      onQueryChange={noop}
      onSearchChange={noop}
      {...overrides}
    />
  );
}

function mount(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

describe("catalog discovery presentation", () => {
  it("renders the seven explicit states and only their compatible commands", () => {
    const onAction = vi.fn();
    const records = [
      record("live"),
      record("request_only"),
      record("provider_required"),
      record("documentation_pending"),
      record("held"),
      record("unavailable"),
      record("unknown"),
    ];
    const view = mount(surface({ records, onAction }));
    for (const label of [
      "Live",
      "Request only",
      "Provider required",
      "Documentation pending",
      "Temporarily held",
      "Currently unavailable",
      "Status unknown",
    ]) {
      expect(view.textContent).toContain(label);
    }
    expect(view.textContent).not.toMatch(/Buy Now|Add to Cart/);
    const actionButtons = view.querySelectorAll<HTMLElement>(
      '[data-testid^="catalog-action-"]',
    );
    expect(actionButtons).toHaveLength(4);
    act(() => {
      for (const button of actionButtons) {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    expect(onAction.mock.calls.map(([command]) => command.kind)).toEqual([
      "request_order",
      "request_availability",
      "continue_care",
      "join_availability_list",
    ]);
  });

  it("does not render or execute a CTA from missing or malformed evidence", () => {
    const onAction = vi.fn();
    const lure = record("live", {
      productId: "lure-product",
      variantId: "lure-variant",
      status: undefined,
      accessPath: undefined,
      action: { kind: "buy_now", href: "https://evil.example/buy" },
      workbookPresent: true,
      demandCount: 1_000,
      supplierRelationship: "active",
      partnerRequest: "approved",
      pendingActivation: { state: "live" },
    });
    const view = mount(surface({ records: [lure], onAction }));
    expect(view.textContent).toContain("Status unknown");
    expect(view.textContent).toContain("No executable catalog action.");
    expect(view.querySelector('[data-testid="catalog-action-lure-variant"]')).toBeNull();
    expect(view.textContent).not.toContain("Buy");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps load failures retryable and distinct from authoritative empty data", () => {
    const onRetry = vi.fn();
    const errorView = mount(
      surface({
        state: "error",
        records: [],
        errorMessage: "Catalog request failed.",
        onRetry,
      }),
    );
    expect(errorView.textContent).toContain("Catalog request failed.");
    expect(errorView.textContent).not.toContain("No catalog records");
    const retry = Array.from(errorView.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    act(() => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onRetry).toHaveBeenCalledTimes(1);

    act(() => root!.unmount());
    root = null;
    errorView.remove();
    host = null;
    expect(
      renderToStaticMarkup(surface({ state: "ready", records: [] })),
    ).toContain("No catalog records are available.");
    expect(
      renderToStaticMarkup(surface({ state: "ready", records: [{ bad: true }] })),
    ).toContain("Catalog information unavailable.");
    expect(
      renderToStaticMarkup(
        surface({
          query: { status: "live" },
          records: [record("held")],
        }),
      ),
    ).toContain("No catalog entries match these filters.");
  });

  it("adds no nested landmark under the Research layout in success, loading, or error", () => {
    for (const state of ["ready", "loading", "error"] as const) {
      const html = renderToStaticMarkup(
        <main data-testid="research-layout-main">{surface({ state })}</main>,
      );
      expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    }
  });

  it("renders only explicitly dimensioned images with intrinsic size and async decoding", () => {
    const html = renderToStaticMarkup(surface());
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('loading="lazy"');

    const malformed = renderToStaticMarkup(
      surface({ records: [record("live", { image: { href: "/x", altText: "x" } })] }),
    );
    expect(malformed).not.toContain("<img");
    expect(malformed).toContain("Approved image unavailable.");
  });

  it("emits a revision-bound interest command without optimistic UI mutation", () => {
    const onSavedInterest = vi.fn();
    const view = mount(
      surface({
        records: [
          record("request_only", {
            savedInterest: {
              availability: "available",
              state: "not_saved",
              revision: 5,
            },
          }),
        ],
        onSavedInterest,
      }),
    );
    const button = view.querySelector<HTMLElement>(
      '[data-testid="catalog-interest-variant-request_only"]',
    );
    expect(button?.textContent).toBe("Save interest");
    act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSavedInterest).toHaveBeenCalledWith({
      kind: "save_interest",
      productId: "product-request_only",
      variantId: "variant-request_only",
      expectedRevision: 5,
    });
    expect(button?.textContent).toBe("Save interest");
  });
});
