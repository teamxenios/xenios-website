import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import type { ProductDetailDto } from "@shared/research/commerce-api";
import type { SubscriptionFrequencyDays } from "@shared/research/commerce";
import { useResearch } from "../../core";
import { addCartLine, createSubscription, getProduct } from "../../adapters/commerce";
import {
  getProductPlatform,
  requestCertificateAccess,
  type ProductPlatformProduct,
  type ProductPlatformResponse,
  type ProductTruthState,
} from "../../adapters/products-diagnostics";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import { ResearchDenialNotice } from "../../ui/kit";
import {
  GUIDE_STATE_LABELS,
  priceLabel,
} from "./commerce-presentation";
import {
  ProductDetailExperience,
  type ProductCardView,
  type ProductDetailView,
  type Website3SurfaceState,
} from "../../products-diagnostics";

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
  | {
      phase: "ok";
      product: ProductDetailDto;
      platform: ProductPlatformResponse;
      platformProduct: ProductPlatformProduct;
    }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

type AddState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "added" }
  | { phase: "subscribed"; subscriptionId: string }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message: string };

/**
 * The price version this page presented, recorded on a direct subscription
 * create so the server knows exactly what the member saw. The catalog DTO
 * carries the confirmed price in cents (or null while unconfirmed); the
 * version string states that fact rather than inventing a price identifier.
 */
export function presentedPriceVersion(priceCents: number | null): string {
  return priceCents === null ? "price-unconfirmed" : `cents-${priceCents}`;
}

// The purchase panel: rendered only when the server says purchasable.
function PurchasePanel({ product, token }: { product: ProductDetailDto; token: string | null }) {
  const [quantity, setQuantity] = useState("1");
  const [mode, setMode] = useState<"one_time" | "subscription">("one_time");
  const [frequency, setFrequency] = useState<SubscriptionFrequencyDays>(30);
  const [add, setAdd] = useState<AddState>({ phase: "idle" });

  const validQuantity = (): number | null => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) {
      setAdd({ phase: "error", message: "Enter a whole quantity of at least 1." });
      return null;
    }
    return q;
  };

  const submit = async () => {
    const q = validQuantity();
    if (q === null) return;
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

  // The direct create path (POST /api/research/subscriptions): the server
  // shape exactly, including the price version this page presented. The
  // subscription starts pending and never charges out of creation alone.
  const subscribeNow = async () => {
    const q = validQuantity();
    if (q === null) return;
    setAdd({ phase: "busy" });
    const result = await createSubscription(token, {
      sku: product.sku,
      quantity: q,
      frequencyDays: frequency,
      priceVersion: presentedPriceVersion(product.priceCents),
    });
    switch (result.kind) {
      case "ok":
        setAdd({ phase: "subscribed", subscriptionId: result.data.subscription.subscriptionId });
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
          {add.phase === "busy" ? "Working..." : "Add to cart"}
        </button>
        {mode === "subscription" && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={add.phase === "busy"}
            onClick={() => void subscribeNow()}
            data-testid="ra-subscribe-now"
          >
            {add.phase === "busy" ? "Working..." : "Start subscription"}
          </button>
        )}
      </div>
      {mode === "subscription" && (
        <p className="body-s text-ink-mute mt-2 max-w-[56ch]">
          "Start subscription" creates the subscription directly. It begins pending and nothing is charged until it
          is confirmed; you can manage it from your subscriptions page.
        </p>
      )}
      <div className="mt-4" aria-live="polite">
        {add.phase === "added" && (
          <p className="body-s text-ink-2" role="status" data-testid="ra-add-success">
            Added to your cart. <Link href={MEMBER_ROUTES.cart}>Review your cart</Link>.
          </p>
        )}
        {add.phase === "subscribed" && (
          <p className="body-s text-ink-2" role="status" data-testid="ra-subscribe-success">
            Subscription created. It is pending and nothing has been charged.{" "}
            <Link href={MEMBER_ROUTES.subscriptions}>Manage your subscriptions</Link>.
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

const STATUS_LABELS: Record<
  ProductTruthState,
  ProductCardView["statusLabel"]
> = {
  available: "Available",
  request_access: "Request access",
  coming_soon: "Coming soon",
  documentation_pending: "Documentation pending",
  out_of_stock: "Out of stock",
  under_review: "Under review",
  clinician_pathway_pending: "Clinician pathway pending",
  not_currently_offered: "Not currently offered",
};

const EMPTY_PRODUCT_DETAIL: ProductDetailView = {
  slug: "",
  requiredInputRecordId: null,
  displayName: "Product",
  family: "research_vials",
  familyLabel: "Product",
  statusLabel: "Under review",
  summary: "The current product record is being loaded.",
  priceLabel: null,
  templateClass: "research_material",
  specifications: [],
  researchInformation: [],
  storageAndHandling: null,
  shippingAndReturns: null,
  documentation: [],
  relatedProducts: [],
};

function currentPrice(cents: number | null): string | null {
  return cents === null ? null : priceLabel(cents);
}

function familyLabel(
  platform: ProductPlatformResponse,
  product: ProductPlatformProduct,
): string {
  return (
    platform.families.find((family) => family.family === product.family)?.label ??
    product.family.replaceAll("_", " ")
  );
}

function relatedCard(
  platform: ProductPlatformResponse,
  product: ProductPlatformProduct,
): ProductCardView {
  const statusLabel = STATUS_LABELS[product.truthState];
  return {
    slug: product.slug,
    requiredInputRecordId: product.productId,
    displayName: product.displayName,
    family: product.family,
    familyLabel: familyLabel(platform, product),
    statusLabel,
    summary: `${statusLabel} catalog record.`,
    priceLabel: currentPrice(product.priceCents),
    aliases: product.searchAliases,
  };
}

function detailView(state: Extract<PageState, { phase: "ok" }>): ProductDetailView {
  const { product, platform, platformProduct } = state;
  const statusLabel = STATUS_LABELS[platformProduct.truthState];
  const specifications = FACT_ORDER.flatMap((key) => {
    const value = product.confirmedFacts[key];
    return typeof value === "string" && value.length > 0
      ? [{ label: FACT_LABELS[key], value }]
      : [];
  });
  return {
    slug: product.slug,
    requiredInputRecordId: platformProduct.productId,
    displayName: product.displayName,
    family: platformProduct.family,
    familyLabel: familyLabel(platform, platformProduct),
    statusLabel,
    summary:
      product.unavailableReason ??
      `${statusLabel} catalog record. Only confirmed facts and current server-authoritative availability are shown.`,
    priceLabel: currentPrice(product.priceCents),
    aliases: platformProduct.searchAliases,
    templateClass: platformProduct.templateClass,
    specifications,
    researchInformation: product.faq.map(
      (item) => `${item.question}: ${item.answer}`,
    ),
    storageAndHandling: null,
    shippingAndReturns: null,
    documentation: [
      {
        label: "Related research guide",
        state: GUIDE_STATE_LABELS[product.guideState],
      },
    ],
    relatedProducts: platform.products
      .filter(
        (candidate) =>
          candidate.family === platformProduct.family &&
          candidate.slug !== platformProduct.slug,
      )
      .slice(0, 3)
      .map((candidate) => relatedCard(platform, candidate)),
  };
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
    const [result, platformResult] = await Promise.all([
      getProduct(memberToken, slug),
      getProductPlatform(memberToken),
    ]);
    switch (result.kind) {
      case "ok": {
        if (platformResult.kind !== "ok") {
          if (platformResult.kind === "error") {
            setState({ phase: "error", message: platformResult.message });
          } else {
            setState({ phase: "unavailable" });
          }
          return;
        }
        const platformProduct = platformResult.data.products.find(
          (candidate) => candidate.slug === result.data.product.slug,
        );
        if (!platformProduct) {
          setState({ phase: "unavailable" });
          return;
        }
        setState({
          phase: "ok",
          product: result.data.product,
          platform: platformResult.data,
          platformProduct,
        });
        return;
      }
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

  if (state.phase === "denied") {
    return (
      <ResearchMemberShell eyebrow="Member catalog" title="Product">
        <div className="grid gap-4" data-testid="ra-product-denied">
          <ResearchDenialNotice code={state.code} message={state.message} />
          <div>
            <Link href={MEMBER_ROUTES.products} className="btn btn-primary">
              Browse the catalog
            </Link>
          </div>
        </div>
      </ResearchMemberShell>
    );
  }

  const surfaceState: Website3SurfaceState =
    memberChecking || state.phase === "loading"
      ? "loading"
      : !member ||
          state.phase === "unauthorized" ||
          state.phase === "unavailable"
        ? "unavailable"
        : state.phase === "error"
          ? "error"
          : "ok";
  const product = state.phase === "ok" ? state.product : null;
  const view = state.phase === "ok" ? detailView(state) : EMPTY_PRODUCT_DETAIL;
  const ordering =
    product && product.purchasable ? (
      <PurchasePanel product={product} token={memberToken} />
    ) : product ? (
      <div className="card" role="status" data-testid="ra-unavailable-reason">
        <p className="mono-label text-ink-mute">Not orderable right now</p>
        <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
          {product.unavailableReason ??
            "This product cannot be ordered right now. It stays listed while its checks complete."}
        </p>
      </div>
    ) : undefined;

  const requestCertificate = product
    && state.phase === "ok"
    && state.platform.capabilities.certificateAccess
    ? async (lotCode: string) => {
        const result = await requestCertificateAccess(
          memberToken,
          product.sku,
          lotCode,
        );
        if (result.kind !== "ok") throw new Error("certificate_not_available");
        return result.data.signedUrl;
      }
    : undefined;

  return (
    <ProductDetailExperience
      product={view}
      ordering={ordering}
      onCertificateRequest={requestCertificate}
      state={surfaceState}
      errorMessage={state.phase === "error" ? state.message : undefined}
      onRetry={() => void load()}
    />
  );
}
