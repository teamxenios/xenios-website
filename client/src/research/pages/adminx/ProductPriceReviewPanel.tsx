import { useId, type ReactNode } from "react";
import type { AdminProductDetail, AdminProductPrice } from "@shared/research/product-admin";
import { readCanonicalPriceTiers } from "@shared/research/price-quantity-tiers";

/** Draft-form validation only. Server price policy remains authoritative. */
export function readDraftAmountCents(value: string): number | null {
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function readDraftEffectiveAt(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso.slice(0, 10) === value ? iso : null;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="body-s text-ink-mute">{label}</dt>
      <dd className="body-s mt-1 whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{children}</dd>
    </div>
  );
}

function recordedTime(value: string | null, absent: string): ReactNode {
  if (value === null) return absent;
  if (typeof value !== "string" || readDraftEffectiveAt(value.slice(0, 10)) === null ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return "Unavailable — invalid recorded timestamp";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable — invalid recorded timestamp";
  return <time dateTime={value}>{date.toISOString()} (UTC)</time>;
}

function exactAmount(cents: number, currency: string): string {
  // String formatting preserves the last cent even at Number.MAX_SAFE_INTEGER.
  const digits = String(cents).padStart(3, "0");
  return `${currency} ${digits.slice(0, -2)}.${digits.slice(-2)} (${cents} cents)`;
}

function PriceRecord({ product, price, headingId }: {
  product: AdminProductDetail;
  price: AdminProductPrice;
  headingId: string;
}) {
  const variants = product.variants.filter((variant) => variant.id === price.variantId);
  const variant = price.productId === product.id && variants.length === 1 &&
    variants[0].productId === product.id ? variants[0] : null;
  const tiers = readCanonicalPriceTiers(price.amountCents, price.quantityTiers);
  const currencyValid = typeof price.currency === "string" && /^[A-Z]{3}$/.test(price.currency);
  const scalar = price.quantityTiers === undefined ||
    (Array.isArray(price.quantityTiers) && price.quantityTiers.length === 0);
  const effective = Date.parse(price.effectiveAt);
  const expiry = price.expiresAt === null ? null : Date.parse(price.expiresAt);
  const reversedWindow = expiry !== null && Number.isFinite(effective) && Number.isFinite(expiry) && expiry <= effective;
  return (
    <article aria-labelledby={headingId} className="card min-w-0">
      <h3 id={headingId} className="body-m font-700" style={{ overflowWrap: "anywhere" }}>
        {variant ? `${variant.sku} — ${variant.label}` : "Variant identity unavailable"}
      </h3>
      <dl className="grid min-w-0 gap-4 mt-4 sm:grid-cols-2">
        <Fact label="Price ID">{price.id}</Fact>
        <Fact label="Price version">{Number.isSafeInteger(price.version) && price.version > 0 ? price.version : "Unavailable — invalid version"}</Fact>
        <Fact label="Recorded product ID">{price.productId}</Fact>
        <Fact label="Recorded variant ID">{price.variantId}</Fact>
        <Fact label="Exact SKU">{variant?.sku ?? "Unavailable — no unique variant on this product"}</Fact>
        <Fact label="Audience">{price.audience}</Fact>
        <Fact label="Stored status">{price.status}</Fact>
        <Fact label="Currency">{currencyValid ? price.currency : "Unavailable — invalid currency code"}</Fact>
        <Fact label="Base amount (integer cents)">{Number.isSafeInteger(price.amountCents) && price.amountCents > 0 ? price.amountCents : "Unavailable — invalid amount"}</Fact>
        <Fact label="Approval note">{price.approvalNote?.trim() ? price.approvalNote : "Not recorded"}</Fact>
        <Fact label="Effective from">{recordedTime(price.effectiveAt, "Unavailable — effective time missing")}</Fact>
        <Fact label="Expires at">{recordedTime(price.expiresAt, "No expiry recorded")}</Fact>
      </dl>
      {reversedWindow ? <p className="body-s mt-4" role="status">Price window unavailable — expiry does not follow the effective time.</p> : null}
      <h4 className="body-s font-700 mt-5">Canonical quantity tiers</h4>
      {!variant ? (
        <p className="body-s mt-2">Quantity-tier review unavailable until the exact product and variant identity can be resolved.</p>
      ) : tiers === null || !currencyValid ? (
        <p className="body-s mt-2">Quantity-tier review unavailable — malformed canonical price data. No scalar fallback or tier repair has been applied.</p>
      ) : (
        <>
          <p className="body-s text-ink-mute mt-2">
            {scalar ? "Scalar price; no quantity breaks recorded." : "All recorded thresholds, in canonical order. Amounts are per unit, not order totals."}
          </p>
          <ol aria-label="Canonical quantity tiers" className="grid min-w-0 gap-3 mt-3">
            {tiers.map((tier) => (
              <li key={tier.minimumQuantity} className="min-w-0 border rounded-md p-3 body-s" style={{ overflowWrap: "anywhere" }}>
                <span className="block font-700">Minimum quantity: {tier.minimumQuantity}</span>
                <span className="block mt-1">Unit amount: {exactAmount(tier.amountCents, price.currency)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}

/** Pure admin read presentation. Does not fetch, mutate, or resolve purchase eligibility. */
export function ProductPriceReviewPanel({ product }: { product: AdminProductDetail }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h2 id={headingId} className="body-l font-700">Pricing and history</h2>
      <p className="body-s text-ink-2 mt-2">
        Stored prices and statuses are records, not purchase authority. Audience eligibility, time windows,
        product release and checkout policy remain server-controlled. This review does not approve, activate or publish prices.
      </p>
      <dl className="grid min-w-0 gap-4 my-4 sm:grid-cols-2">
        <Fact label="Product">{product.displayName}</Fact>
        <Fact label="Canonical product name">{product.canonicalName}</Fact>
        <Fact label="Product ID">{product.id}</Fact>
        <Fact label="Product code">{product.productCode}</Fact>
      </dl>
      {product.prices.length === 0 ? (
        <p className="body-s">No prices entered. No approved price or purchase availability is inferred.</p>
      ) : (
        <div className="grid min-w-0 gap-4">
          {product.prices.map((price, index) => (
            <PriceRecord key={`${price.id}:${index}`} product={product} price={price} headingId={`${headingId}-${index}`} />
          ))}
        </div>
      )}
    </section>
  );
}
