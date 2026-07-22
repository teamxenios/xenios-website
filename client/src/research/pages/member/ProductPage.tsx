import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import type { ProductDetailDto } from "@shared/research/commerce-api";
import type { SubscriptionFrequencyDays } from "@shared/research/commerce";
import { useResearch } from "../../core";
import { addCartLine, getProduct } from "../../adapters/commerce";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchRouteBoundary,
  ResearchStatusBadge,
} from "../../ui/kit";
import {
  AVAILABILITY_META,
  GUIDE_STATE_LABELS,
  LANE_LABELS,
  goalLabel,
  priceLabel,
} from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member product detail (/research/member/products/:slug), rendered straight
// from the frozen ProductDetailDto (GET /api/research/products/:slug).
//
// The rules baked in here, from the frozen contract:
// - confirmedFacts is a PARTIAL map. Only present keys render. A missing key
//   gets no row, no placeholder, and no request-this-info affordance.
// - purchasable false renders the member-safe unavailableReason string, never
//   a raw reason code and never a buy control.
// - purchasable true renders the full quantity + one-time/subscription
//   selection and adds to the real cart via POST /api/research/cart/lines,
//   routing on the machine code. Success links to the cart.
// ---------------------------------------------------------------------------

const FACT_ORDER = ["composition", "strength", "format"] as const;
const FACT_LABELS: Record<(typeof FACT_ORDER)[number], string> = {
  composition: "Composition",
  strength: "Strength",
  format: "Format",
};

const FREQUENCIES: SubscriptionFrequencyDays[] = [30, 60, 90];

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; product: ProductDetailDto }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

type AddState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "added" }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message: string };

function guideHref(slug: string): string {
  return MEMBER_ROUTES.guide.replace(":slug", slug);
}

// The purchase panel: rendered only when the server says purchasable.
function PurchasePanel({ product, token }: { product: ProductDetailDto; token: string | null }) {
  const [quantity, setQuantity] = useState("1");
  const [mode, setMode] = useState<"one_time" | "subscription">("one_time");
  const [frequency, setFrequency] = useState<SubscriptionFrequencyDays>(30);
  const [add, setAdd] = useState<AddState>({ phase: "idle" });

  const submit = async () => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) {
      setAdd({ phase: "error", message: "Enter a whole quantity of at least 1." });
      return;
    }
    setAdd({ phase: "busy" });
    const result = await addCartLine(token, {
      sku: product.sku,
      quantity: q,
      purchaseMode: mode,
      ...(mode === "subscription" ? { subscriptionFrequencyDays: frequency } : {}),
    });
    switch (result.kind) {
      case "ok":
        setAdd({ phase: "added" });
        return;
      case "denied":
        setAdd({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setAdd({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setAdd({ phase: "unavailable" });
        return;
      case "error":
        setAdd({ phase: "error", message: result.message });
        return;
    }
  };

  return (
    <div className="card" data-testid="ra-purchase-panel">
      <p className="mono-label text-ink-mute">Order this product</p>
      <p className="body-s text-ink-2 mt-2">{priceLabel(product.priceCents)}</p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="form-label" htmlFor="ra-add-quantity">
            Quantity
          </label>
          <input
            id="ra-add-quantity"
            type="number"
            className="input-field"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ width: 96 }}
            data-testid="ra-add-quantity"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="ra-add-mode">
            Purchase
          </label>
          <select
            id="ra-add-mode"
            className="input-field"
            value={mode}
            onChange={(e) => setMode(e.target.value as "one_time" | "subscription")}
            data-testid="ra-add-mode"
          >
            <option value="one_time">One time</option>
            <option value="subscription">Subscription</option>
          </select>
        </div>
        {mode === "subscription" && (
          <div>
            <label className="form-label" htmlFor="ra-add-frequency">
              Delivery frequency
            </label>
            <select
              id="ra-add-frequency"
              className="input-field"
              value={String(frequency)}
              onChange={(e) => setFrequency(Number(e.target.value) as SubscriptionFrequencyDays)}
              data-testid="ra-add-frequency"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={String(f)}>
                  Every {f} days
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={add.phase === "busy"}
          onClick={() => void submit()}
          data-testid="ra-add-to-cart"
        >
          {add.phase === "busy" ? "Adding..." : "Add to cart"}
        </button>
      </div>
      <div className="mt-4" aria-live="polite">
        {add.phase === "added" && (
          <p className="body-s text-ink-2" role="status" data-testid="ra-add-success">
            Added to your cart. <Link href={MEMBER_ROUTES.cart}>Review your cart</Link>.
          </p>
        )}
        {add.phase === "denied" && <ResearchDenialNotice code={add.code} message={add.message} />}
        {add.phase === "unavailable" && (
          <p className="body-s text-ink-2" role="status">
            The cart is not available right now. Nothing was added, and nothing is wrong with your account.
          </p>
        )}
        {add.phase === "unauthorized" && (
          <p className="body-s text-ink-2" role="status">
            Your session has ended. Sign in again to add this to your cart.
          </p>
        )}
        {add.phase === "error" && (
          <p className="body-s font-700" role="alert">
            {add.message}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const { member, memberChecking, memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    if (!slug) {
      setState({ phase: "denied", code: "product_not_found" });
      return;
    }
    setState({ phase: "loading" });
    const result = await getProduct(memberToken, slug);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", product: result.data.product });
        return;
      case "denied":
        setState({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "unavailable" });
        return;
      case "error":
        setState({ phase: "error", message: result.message });
        return;
    }
  }, [slug, memberToken]);

  useEffect(() => {
    if (memberChecking) return;
    void load();
  }, [load, memberChecking]);

  const product = state.phase === "ok" ? state.product : null;

  // Only the confirmed fact keys that are actually present render. Absence is
  // absence: no row, no placeholder, nothing to request.
  const presentFacts = product
    ? FACT_ORDER.filter((key): key is (typeof FACT_ORDER)[number] => {
        const value = product.confirmedFacts[key];
        return typeof value === "string" && value.length > 0;
      })
    : [];

  const availability = product ? AVAILABILITY_META[product.availability] : null;

  const boundaryState: "loading" | "unauthorized" | "ok" | "error" | "unavailable" = memberChecking
    ? "loading"
    : !member
      ? "unauthorized"
      : state.phase === "loading"
        ? "loading"
        : state.phase === "unauthorized"
          ? "unauthorized"
          : state.phase === "error"
            ? "error"
            : state.phase === "unavailable"
              ? "unavailable"
              : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Member catalog"
      title={product ? product.displayName : "Product"}
      actions={
        <Link href={MEMBER_ROUTES.products} className="btn btn-ghost">
          Back to products
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="This product page is not available yet."
        unavailableBody="It is being prepared. Nothing is wrong with your account."
      >
        {state.phase === "denied" ? (
          <div className="grid gap-4" data-testid="ra-product-denied">
            <ResearchDenialNotice code={state.code} message={state.message} />
            <div>
              <Link href={MEMBER_ROUTES.products} className="btn btn-primary">
                Browse the catalog
              </Link>
            </div>
          </div>
        ) : (
          product && (
            <div className="grid gap-6">
              {/* Identity: lane, availability, price. */}
              <section className="card" aria-label="Product overview">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="mono-label text-ink-mute">{LANE_LABELS[product.lane]}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {availability && <ResearchStatusBadge label={availability.label} tone={availability.tone} />}
                      <span className="mono-label text-ink-mute">SKU {product.sku}</span>
                    </div>
                    {product.goalMappings.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2" aria-label="Goals this maps to">
                        {product.goalMappings.map((goal) => (
                          <span key={goal} className="chip text-ink-2">
                            {goalLabel(goal)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="display-s tabular" data-testid="ra-product-price">
                    {priceLabel(product.priceCents)}
                  </p>
                </div>
              </section>

              {/* Confirmed facts: a PARTIAL map. Only present keys render. */}
              {presentFacts.length > 0 && (
                <section className="card" aria-label="Confirmed facts">
                  <h2 className="mono-cap text-ink-mute">Confirmed facts</h2>
                  <p className="body-s text-ink-mute mt-1 max-w-[56ch]">
                    Only facts confirmed in writing appear here.
                  </p>
                  <dl className="mt-3 grid gap-3">
                    {presentFacts.map((key) => (
                      <div key={key} data-testid={`ra-fact-${key}`}>
                        <dt className="mono-label text-ink-mute">{FACT_LABELS[key]}</dt>
                        <dd className="body-s text-ink-2 mt-1">{product.confirmedFacts[key]}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {/* Ordering: the buy path exists only when the server says so. */}
              <section aria-label="Ordering">
                <h2 className="mono-cap text-ink-mute">Ordering</h2>
                <div className="mt-3 grid gap-4">
                  {product.purchasable ? (
                    <PurchasePanel product={product} token={memberToken} />
                  ) : (
                    <div className="card" role="status" data-testid="ra-unavailable-reason">
                      <p className="mono-label text-ink-mute">Not orderable right now</p>
                      <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
                        {product.unavailableReason ??
                          "This product cannot be ordered right now. It stays listed while its checks complete."}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* FAQ, straight from the record. */}
              {product.faq.length > 0 && (
                <section className="card" aria-label="Frequently asked questions">
                  <h2 className="mono-cap text-ink-mute">Questions and answers</h2>
                  <dl className="mt-3 grid gap-4">
                    {product.faq.map((item, i) => (
                      <div key={i}>
                        <dt className="body-s font-700">{item.question}</dt>
                        <dd className="body-s text-ink-2 mt-1 max-w-[64ch]">{item.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {/* Related guides. */}
              <section className="card" aria-label="Related guides">
                <h2 className="mono-cap text-ink-mute">Guides</h2>
                <p className="body-s text-ink-2 mt-2">{GUIDE_STATE_LABELS[product.guideState]}.</p>
                {product.relatedGuideSlugs.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {product.relatedGuideSlugs.map((guideSlug) => (
                      <li key={guideSlug}>
                        <Link href={guideHref(guideSlug)} className="btn btn-ghost" data-testid={`ra-related-guide-${guideSlug}`}>
                          {guideSlug.replace(/-/g, " ")}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3">
                    <Link href={MEMBER_ROUTES.guides} className="btn btn-ghost">
                      Browse the Guide library
                    </Link>
                  </div>
                )}
              </section>
            </div>
          )
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
