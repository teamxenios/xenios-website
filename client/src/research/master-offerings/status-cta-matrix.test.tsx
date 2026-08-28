// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  MASTER_OFFERING_DISPLAY_STATES,
  type MasterOfferingAction,
  type MasterOfferingDisplayState,
} from "@shared/research/master-offerings/contract";
import { baseStatusFromDisplayState } from "@shared/research/product-activation/contract";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingVariantAction } from "./MasterOfferingDetail";
import { founderQuantityCapabilityFor } from "./FullCatalogProductRoute";
import { ACTIONS, ADD_TO_CART, ON_REQUEST, card, detail, render, variant } from "./catalog-test-fixtures";

/**
 * THE STATUS-TO-CTA MATRIX, every row, positive and negative.
 *
 * The rows are the nine listing states the shared contract carries at HEAD,
 * grouped by the activation status each one projects
 * (`baseStatusFromDisplayState`, the server's own informative mapping):
 *
 *   live                 available_now
 *   request_only         available_this_week, request_access
 *   provider_required    care_pathway, approval_required
 *   held                 temporarily_unavailable
 *   unavailable          coming_soon, planned, unavailable   (and anything unknown)
 *
 * The columns are what the browser may show. The browser never resolves an
 * action; it renders the one the server sent, and it may only downgrade. So
 * the positive tests prove each state renders its permitted control, and the
 * negative tests prove no state renders a purchase the server's rule forbids,
 * even when the DTO is malformed enough to carry one.
 */

const ALL_STATES = MASTER_OFFERING_DISPLAY_STATES;
const NON_LIVE_STATES = ALL_STATES.filter((state) => state !== "available_now");

function cardFor(state: MasterOfferingDisplayState, action: MasterOfferingAction) {
  return card({
    displayState: state,
    variants: [variant({ displayState: state, action })],
  });
}

function textOf(host: HTMLElement, selector: string) {
  return host.querySelector(selector)?.textContent ?? null;
}

describe("status to CTA matrix, card", () => {
  it("projects every listing state onto the activation vocabulary the server records", () => {
    // HEAD's vocabulary, pinned so a silent drift in either enum is visible here.
    expect(baseStatusFromDisplayState("available_now")).toBe("live");
    expect(baseStatusFromDisplayState("available_this_week")).toBe("request_only");
    expect(baseStatusFromDisplayState("request_access")).toBe("request_only");
    expect(baseStatusFromDisplayState("care_pathway")).toBe("provider_required");
    expect(baseStatusFromDisplayState("approval_required")).toBe("provider_required");
    expect(baseStatusFromDisplayState("temporarily_unavailable")).toBe("held");
    expect(baseStatusFromDisplayState("coming_soon")).toBe("unavailable");
    expect(baseStatusFromDisplayState("planned")).toBe("unavailable");
    expect(baseStatusFromDisplayState("unavailable")).toBe("unavailable");
    // The mandate's "unknown" state: anything outside the closed set fails to
    // unavailable, never to a permissive status.
    expect(baseStatusFromDisplayState("not_a_state")).toBe("unavailable");
    expect(baseStatusFromDisplayState("")).toBe("unavailable");
  });

  it("live: renders Buy Now only for a server add_to_cart on available_now, as a link to the detail page", () => {
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={cardFor("available_now", ADD_TO_CART)} /></ul>,
    );
    const buy = host.querySelector<HTMLAnchorElement>('[data-testid="mo-card-buy-now"]');
    expect(buy?.textContent).toBe("Buy Now");
    expect(buy?.getAttribute("href")).toBe("/research/member/catalog/research_vials/research-vials-bpc-157");
    expect(buy?.getAttribute("data-customer-action")).toBe("BUY_NOW");
    // Buy Now is a navigation, never a card-level add: no button, no form.
    expect(host.querySelector("button[data-testid='mo-card-buy-now']")).toBeNull();
    expect(host.querySelector('[data-testid="mo-card-contradiction"]')).toBeNull();
    unmount();
  });

  it("live with an on-request price: downgrades to Price on request rather than Buy Now", () => {
    const { host, unmount } = render(
      <ul>
        <MasterOfferingCard
          product={card({
            variants: [variant({ action: ADD_TO_CART, price: ON_REQUEST })],
          })}
        />
      </ul>,
    );
    expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
    expect(textOf(host, '[data-testid="mo-card-action"]')).toBe("Price on request");
    expect(host.textContent).not.toContain("Buy Now");
    unmount();
  });

  it("request_only: renders the request action the server named and no purchase", () => {
    for (const state of ["available_this_week", "request_access"] as const) {
      for (const action of [ACTIONS.request_access, ACTIONS.request_early_access_purchase]) {
        const { host, unmount } = render(
          <ul><MasterOfferingCard product={cardFor(state, action)} /></ul>,
        );
        const control = host.querySelector<HTMLAnchorElement>('[data-testid="mo-card-action"]');
        expect(control?.textContent).toBe(action.label);
        expect(control?.getAttribute("href")).toBe("href" in action ? action.href : null);
        expect(control?.getAttribute("data-customer-action")).toBe("ASSISTED_ORDER");
        expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
        expect(host.textContent).not.toContain("Buy Now");
        expect(host.textContent).not.toContain("Add to Cart");
        unmount();
      }
    }
  });

  it("provider_required: renders Explore Care as the only path, never a purchase or a plain request upgrade", () => {
    for (const state of ["care_pathway", "approval_required"] as const) {
      const { host, unmount } = render(
        <ul><MasterOfferingCard product={cardFor(state, ACTIONS.explore_care)} /></ul>,
      );
      const control = host.querySelector<HTMLAnchorElement>('[data-testid="mo-card-action"]');
      expect(control?.textContent).toBe("Explore Care");
      expect(control?.getAttribute("href")).toBe("/research/care");
      expect(control?.getAttribute("data-customer-action")).toBe("CARE");
      expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
      expect(host.textContent).not.toContain("Buy Now");
      unmount();
    }
  });

  it("held: renders the state in words and a notification path at most, never an order action", () => {
    for (const action of [ACTIONS.notify_me, ACTIONS.join_waitlist]) {
      const { host, unmount } = render(
        <ul><MasterOfferingCard product={cardFor("temporarily_unavailable", action)} /></ul>,
      );
      expect(host.textContent).toContain("Temporarily Unavailable");
      const control = host.querySelector('[data-testid="mo-card-action"]');
      expect(control?.textContent).toBe(action.label);
      expect(control?.getAttribute("data-customer-action")).toBe("TEMPORARILY_HELD");
      expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
      expect(host.textContent).not.toContain("Buy Now");
      expect(host.textContent).not.toContain("Add to Cart");
      unmount();
    }
    // Held with nothing to do at all: the state in words, no control.
    const { host, unmount } = render(
      <ul><MasterOfferingCard product={cardFor("temporarily_unavailable", ACTIONS.none)} /></ul>,
    );
    expect(host.textContent).toContain("Temporarily Unavailable");
    expect(textOf(host, '[data-testid="mo-card-no-action"]')).toBe("Not available");
    expect(host.querySelector('[data-testid="mo-card-action"]')).toBeNull();
    unmount();
  });

  it("unavailable and planned: Not available or Get Updates, no order action", () => {
    for (const state of ["unavailable", "planned", "coming_soon"] as const) {
      const { host: none, unmount: unmountNone } = render(
        <ul><MasterOfferingCard product={cardFor(state, ACTIONS.none)} /></ul>,
      );
      expect(textOf(none, '[data-testid="mo-card-no-action"]')).toBe("Not available");
      expect(none.querySelector('a[data-testid="mo-card-action"]')).toBeNull();
      expect(none.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
      unmountNone();

      const { host: updates, unmount: unmountUpdates } = render(
        <ul><MasterOfferingCard product={cardFor(state, ACTIONS.get_updates)} /></ul>,
      );
      const control = updates.querySelector('[data-testid="mo-card-action"]');
      expect(control?.textContent).toBe("Get Updates");
      // Updates are not a purchase and not a request: the vocabulary says so.
      expect(control?.getAttribute("data-customer-action")).toBe("NOT_AVAILABLE");
      expect(updates.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
      unmountUpdates();
    }
  });

  it("NEGATIVE: a purchase action on any non-live state renders no purchase affordance at all", () => {
    for (const state of NON_LIVE_STATES) {
      const { host, unmount } = render(
        <ul><MasterOfferingCard product={cardFor(state, ADD_TO_CART)} /></ul>,
      );
      expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
      expect(host.querySelector('[data-testid="mo-card-action"]')).toBeNull();
      const contradiction = host.querySelector('[data-testid="mo-card-contradiction"]');
      expect(contradiction?.textContent).toBe("Not available");
      expect(contradiction?.getAttribute("data-customer-action")).toBe("NOT_AVAILABLE");
      expect(host.textContent).not.toContain("Buy Now");
      expect(host.textContent).not.toContain("Add to Cart");
      // The listing state is still said in words, so the member sees the truth.
      expect(host.querySelector('[data-testid="mo-variant-row"]')?.getAttribute("data-display-state")).toBe(state);
      unmount();
    }
  });

  it("NEGATIVE: no listing state renders Buy Now from a non-purchase action", () => {
    const nonPurchase = (Object.keys(ACTIONS) as MasterOfferingAction["kind"][]).filter(
      (kind) => kind !== "add_to_cart",
    );
    for (const state of ALL_STATES) {
      for (const kind of nonPurchase) {
        const { host, unmount } = render(
          <ul><MasterOfferingCard product={cardFor(state, ACTIONS[kind])} /></ul>,
        );
        expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
        expect(host.textContent).not.toContain("Buy Now");
        expect(host.textContent).not.toContain("Add to Cart");
        expect(host.textContent).not.toContain("$0.00");
        unmount();
      }
    }
  });
});

describe("status to CTA matrix, detail", () => {
  it("live: an enabled Add to Cart needs the server action, a matching capability, and an injected cart", () => {
    const live = variant({ displayState: "available_now", action: ADD_TO_CART });
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingVariantAction
        productName="BPC-157"
        variant={live}
        capability={founderQuantityCapabilityFor(live)}
        onAddToCart={onAddToCart}
      />,
    );
    const cta = host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]');
    expect(cta?.textContent).toBe("Add to Cart");
    expect(cta?.disabled).toBe(false);
    expect(host.querySelector('[data-testid="mo-quantity"]')).not.toBeNull();
    unmount();
  });

  it("NEGATIVE: live without a cart or without a capability stays disabled with a stated reason", () => {
    const live = variant({ displayState: "available_now", action: ADD_TO_CART });
    const noCart = render(
      <MasterOfferingVariantAction
        productName="BPC-157"
        variant={live}
        capability={founderQuantityCapabilityFor(live)}
      />,
    );
    expect(noCart.host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]')?.disabled).toBe(true);
    expect(noCart.host.querySelector('[data-testid="mo-cart-refusal"]')).not.toBeNull();
    noCart.unmount();

    const noCapability = render(
      <MasterOfferingVariantAction
        productName="BPC-157"
        variant={live}
        capability={null}
        onAddToCart={vi.fn()}
      />,
    );
    expect(noCapability.host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]')?.disabled).toBe(true);
    expect(noCapability.host.querySelector('[data-testid="mo-capability-refusal"]')).not.toBeNull();
    expect(noCapability.host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
    noCapability.unmount();
  });

  it("NEGATIVE: a purchase action on every non-live state is disabled and names the listing state, even with a cart and a capability", () => {
    for (const state of NON_LIVE_STATES) {
      const contradictory = variant({ displayState: state, action: ADD_TO_CART });
      const onAddToCart = vi.fn();
      const { host, unmount } = render(
        <MasterOfferingVariantAction
          productName="BPC-157"
          variant={contradictory}
          capability={founderQuantityCapabilityFor(contradictory)}
          onAddToCart={onAddToCart}
        />,
      );
      const cta = host.querySelector<HTMLButtonElement>('[data-testid="mo-cta"]');
      expect(cta?.disabled).toBe(true);
      const refusal = host.querySelector('[data-testid="mo-state-refusal"]');
      expect(refusal?.textContent).toContain(contradictory.displayLabel);
      expect(cta?.getAttribute("aria-describedby")).toBe(refusal?.id);
      expect(host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
      cta?.click();
      expect(onAddToCart).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("request_only, provider_required, held: renders the server link and nothing that could reach a cart", () => {
    const rows: Array<[MasterOfferingDisplayState, MasterOfferingAction]> = [
      ["request_access", ACTIONS.request_access],
      ["available_this_week", ACTIONS.request_early_access_purchase],
      ["care_pathway", ACTIONS.explore_care],
      ["approval_required", ACTIONS.explore_care],
      ["temporarily_unavailable", ACTIONS.notify_me],
      ["coming_soon", ACTIONS.join_waitlist],
      ["planned", ACTIONS.get_updates],
    ];
    for (const [state, action] of rows) {
      const onAddToCart = vi.fn();
      const { host, unmount } = render(
        <MasterOfferingVariantAction
          productName="BPC-157"
          variant={variant({ displayState: state, action })}
          onAddToCart={onAddToCart}
        />,
      );
      const cta = host.querySelector<HTMLAnchorElement>('a[data-testid="mo-cta"]');
      expect(cta?.textContent).toBe(action.label);
      expect(cta?.getAttribute("href")).toBe("href" in action ? action.href : null);
      expect(host.querySelector("button")).toBeNull();
      expect(host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
      expect(host.textContent).not.toContain("Add to Cart");
      unmount();
    }
  });

  it("unavailable with no action: says so plainly and offers nothing", () => {
    for (const state of ["unavailable", "planned", "temporarily_unavailable"] as const) {
      const { host, unmount } = render(
        <MasterOfferingVariantAction
          productName="BPC-157"
          variant={variant({ displayState: state, action: ACTIONS.none })}
          onAddToCart={vi.fn()}
        />,
      );
      expect(host.querySelector('[data-testid="mo-no-action"]')?.textContent).toContain(
        "nothing to request",
      );
      expect(host.querySelector("a, button, input")).toBeNull();
      unmount();
    }
  });

  it("never renders a CTA the detail DTO did not carry", () => {
    const { host, unmount } = render(
      <ul>
        <MasterOfferingCard
          product={detail({
            displayState: "unavailable",
            variants: [variant({ displayState: "unavailable", action: ACTIONS.none })],
          })}
        />
      </ul>,
    );
    expect(host.querySelectorAll("a").length).toBe(1); // the title link only
    expect(host.querySelector("button")).toBeNull();
    unmount();
  });
});
