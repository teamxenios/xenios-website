// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingDetail } from "./MasterOfferingDetail";
import { FullCatalogPage } from "./FullCatalogPage";
import { founderQuantityCapabilityFor } from "./FullCatalogProductRoute";
import { refineCardsByAccessPath } from "./catalog-access-path";
import { ACTIONS, ADD_TO_CART, card, click, detail, page, render, select, variant } from "./catalog-test-fixtures";

/**
 * Exact variant identity.
 *
 * The 426-row reconciliation found the workbook carrying one physical product
 * twice under two Group IDs and two prices, and it found four strengths that
 * exist in the book and not in the catalog. The rule that fell out of it is
 * the one these tests hold: the browser presents exactly the variants the
 * server sent, by the server's ids, and it never merges two rows because they
 * look alike, never invents a strength, and never lets one variant's action,
 * price, or quantity stand in for another's.
 */

describe("exact variant identity", () => {
  it("renders two same-looking variants as two rows keyed by server id, with their own state, price, and action", () => {
    const product = card({
      variants: [
        variant({ id: "mov_hexarelin_0402", label: "Hexarelin (5mg)", displayState: "approval_required", action: ACTIONS.explore_care, price: { state: "on_request" } }),
        variant({ id: "mov_hexarelin_0426", label: "HEXARELIN 5 mg", displayState: "request_access", action: ACTIONS.request_access }),
      ],
    });
    const { host, unmount } = render(<ul><MasterOfferingCard product={product} /></ul>);
    const rows = Array.from(host.querySelectorAll('[data-testid="mo-variant-row"]'));
    expect(rows.map((row) => row.getAttribute("data-variant-id"))).toEqual([
      "mov_hexarelin_0402",
      "mov_hexarelin_0426",
    ]);
    expect(rows.map((row) => row.getAttribute("data-display-state"))).toEqual([
      "approval_required",
      "request_access",
    ]);
    expect(rows.map((row) => row.getAttribute("data-access-path"))).toEqual(["CARE", "ASSISTED_ORDER"]);
    expect(rows[0]?.querySelector('[data-testid="mo-variant-price"]')?.textContent).toBe("Price on request");
    expect(rows[1]?.querySelector('[data-testid="mo-variant-price"]')?.textContent).toBe("$99.00");
    expect(host.textContent).toContain("2 variants");
    unmount();
  });

  it("never merges rows that differ only in label casing or spacing", () => {
    const product = card({
      variants: [
        variant({ id: "mov_1", label: "Oxytocin (10mg)" }),
        variant({ id: "mov_2", label: "OXYTOCIN 10 mg" }),
        variant({ id: "mov_3", label: "Oxytocin 10 mg" }),
      ],
    });
    const { host, unmount } = render(<ul><MasterOfferingCard product={product} /></ul>);
    expect(host.querySelectorAll('[data-testid="mo-variant-row"]').length).toBe(3);
    const labels = Array.from(host.querySelectorAll('[data-testid="mo-variant-row"] .font-700')).map((el) => el.textContent);
    expect(labels).toEqual(["Oxytocin (10mg)", "OXYTOCIN 10 mg", "Oxytocin 10 mg"]);
    unmount();
  });

  it("shows exactly the variants the server sent: no strength is invented and none is dropped", () => {
    const strengths = ["5 mg", "10 mg", "15 mg", "20 mg", "30 mg", "40 mg", "50 mg"];
    const product = card({
      displayName: "Retatrutide",
      variants: strengths.map((strength, index) =>
        variant({ id: `mov_${index}`, label: `RETATRUTIDE ${strength}`, displayState: "request_access", action: ACTIONS.request_access }),
      ),
      variantCount: strengths.length,
    });
    const { host, unmount } = render(<ul><MasterOfferingCard product={product} /></ul>);
    const labels = Array.from(host.querySelectorAll('[data-testid="mo-variant-row"] .font-700')).map((el) => el.textContent);
    expect(labels).toEqual(strengths.map((s) => `RETATRUTIDE ${s}`));
    expect(host.textContent).not.toContain("60 mg");
    expect(host.textContent).toContain("7 variants");
    unmount();
  });

  it("detail: the selector is keyed by id, and choosing a variant re-reads that variant's own action and price", () => {
    const product = detail({
      variants: [
        variant({ id: "mov_live", label: "5 mg vial", displayState: "available_now", action: ADD_TO_CART }),
        variant({ id: "mov_care", label: "5 mg vial", displayState: "care_pathway", action: ACTIONS.explore_care, price: { state: "on_request" } }),
      ],
    });
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetail product={product} capabilityFor={founderQuantityCapabilityFor} onAddToCart={onAddToCart} />,
    );
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((r) => r.value)).toEqual(["mov_live", "mov_care"]);
    expect(radios.map((r) => r.id)).toEqual(["mo-variant-mov_live", "mo-variant-mov_care"]);
    expect(host.querySelector('[data-testid="mo-selected-price"]')?.textContent).toBe("$99.00");
    expect(host.querySelector<HTMLButtonElement>('button[data-testid="mo-cta"]')?.disabled).toBe(false);

    click(radios[1]);
    expect(host.querySelector('[data-testid="mo-selected-price"]')?.textContent).toBe("Price on request");
    const cta = host.querySelector<HTMLAnchorElement>('a[data-testid="mo-cta"]');
    expect(cta?.textContent).toBe("Explore Care");
    expect(host.querySelector("button[data-testid='mo-cta']")).toBeNull();
    expect(host.querySelector('[data-testid="mo-quantity"]')).toBeNull();
    unmount();
  });

  it("detail: the cart handoff receives the server's own product, variant, and SKU identity, untouched", () => {
    const product = detail({ variants: [variant({ id: "mov_live", action: ADD_TO_CART })] });
    const onAddToCart = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetail product={product} capabilityFor={founderQuantityCapabilityFor} onAddToCart={onAddToCart} />,
    );
    click(host.querySelector('button[data-testid="mo-cta"]'));
    expect(onAddToCart).toHaveBeenCalledTimes(1);
    const [action, quantity] = onAddToCart.mock.calls[0] ?? [];
    expect(action).toBe(ADD_TO_CART);
    expect(action).toMatchObject({ productId: "prod_1", variantId: "var_1", sku: "GEN-GRP-0001" });
    expect(quantity).toBe(1);
    unmount();
  });

  it("detail: a capability for a different exact variant disables the purchase rather than borrowing it", () => {
    const live = variant({ id: "mov_live", action: ADD_TO_CART });
    const other = variant({ id: "mov_other", action: { ...ADD_TO_CART, variantId: "var_2", sku: "GEN-GRP-0002" } });
    const product = detail({ variants: [live] });
    const { host, unmount } = render(
      <MasterOfferingDetail
        product={product}
        capabilityFor={() => founderQuantityCapabilityFor(other)}
        onAddToCart={vi.fn()}
      />,
    );
    expect(host.querySelector<HTMLButtonElement>('button[data-testid="mo-cta"]')?.disabled).toBe(true);
    expect(host.querySelector('[data-testid="mo-capability-refusal"]')).not.toBeNull();
    unmount();
  });

  it("detail: a continuation naming a variant that is not in the fresh DTO is ignored, not guessed", () => {
    const product = detail({
      variants: [variant({ id: "mov_a", label: "5 mg" }), variant({ id: "mov_b", label: "10 mg" })],
    });
    const { host, unmount } = render(
      <MasterOfferingDetail product={product} initialVariantId="mov_5mg_alias" initialQuantity={3} />,
    );
    const checked = host.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked?.value).toBe("mov_a");
    expect(host.querySelector<HTMLInputElement>('[data-testid="mo-quantity"]')).toBeNull();
    unmount();
  });

  it("page refinement filters cards by exact variant identity and leaves every card's variants intact", () => {
    const shared = card({
      id: "mo_shared",
      slug: "shared",
      variants: [
        variant({ id: "mov_1", action: ADD_TO_CART }),
        variant({ id: "mov_2", label: "10 mg vial", displayState: "temporarily_unavailable", action: ACTIONS.notify_me }),
      ],
    });
    const other = card({ id: "mo_other", slug: "other", displayState: "care_pathway", variants: [variant({ id: "mov_3", displayState: "care_pathway", action: ACTIONS.explore_care })] });
    expect(refineCardsByAccessPath([shared, other], "TEMPORARILY_HELD")).toEqual([shared]);
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page({ products: [shared, other] })} onQueryChange={vi.fn()} />,
    );
    select(host.querySelector("#mo-catalog-access-path"), "TEMPORARILY_HELD");
    const rows = Array.from(host.querySelectorAll('[data-testid="mo-variant-row"]')).map((row) => row.getAttribute("data-variant-id"));
    expect(rows).toEqual(["mov_1", "mov_2"]);
    unmount();
  });
});
