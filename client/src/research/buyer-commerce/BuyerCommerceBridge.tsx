import { useMemo, useRef, useState, type FormEvent } from "react";

import type {
  BuyerCatalogVariant,
  BuyerOrderRequestInput,
  BuyerRequestReceipt,
} from "@shared/research/buyer-commerce";
import { parseBuyerBulkOrder } from "./bulk-parser";
import { buyerVariantKey, useBuyerDraft } from "./useBuyerDraft";

export const BUYER_CATALOG_PAGE_SIZE = 24;

function money(cents: number, currency: string): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

export function newBuyerIdempotencyKey(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) return `xbr_${randomUUID.replace(/-/g, "")}`;
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure browser randomness is unavailable.");
  }
  globalThis.crypto.getRandomValues(bytes);
  return `xbr_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export interface BuyerSubmissionAttempt {
  intent: string;
  idempotencyKey: string;
}

export function buyerSubmissionAttempt(
  current: BuyerSubmissionAttempt | null,
  intent: string,
  makeIdempotencyKey: () => string,
): BuyerSubmissionAttempt {
  return current?.intent === intent
    ? current
    : { intent, idempotencyKey: makeIdempotencyKey() };
}

export interface BuyerCommerceBridgeProps {
  variants: readonly BuyerCatalogVariant[];
  onSubmit(
    request: BuyerOrderRequestInput,
  ): Promise<BuyerRequestReceipt | void> | BuyerRequestReceipt | void;
  makeIdempotencyKey?: () => string;
}

/** Unmounted Pack 01 buyer experience. Integration owns its eventual route. */
export function BuyerCommerceBridge({
  variants,
  onSubmit,
  makeIdempotencyKey = newBuyerIdempotencyKey,
}: BuyerCommerceBridgeProps) {
  const draft = useBuyerDraft();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [bulk, setBulk] = useState("");
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const attempt = useRef<{ intent: string; idempotencyKey: string } | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(variants.map((variant) => variant.category))).sort((left, right) =>
      left.localeCompare(right),
    ),
    [variants],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return variants.filter((variant) => {
      if (category && variant.category !== category) return false;
      if (!needle) return true;
      return [variant.productName, variant.strengthLabel, variant.presentation, variant.category, variant.sku]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
    });
  }, [category, query, variants]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / BUYER_CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleVariants = useMemo(
    () => filtered.slice(
      currentPage * BUYER_CATALOG_PAGE_SIZE,
      (currentPage + 1) * BUYER_CATALOG_PAGE_SIZE,
    ),
    [currentPage, filtered],
  );

  function addVariant(variant: BuyerCatalogVariant, quantity: number) {
    draft.upsert({
      offeringId: variant.offeringId,
      variantId: variant.variantId,
      sku: variant.sku,
      label: [variant.productName, variant.strengthLabel, variant.presentation]
        .filter(Boolean)
        .join(" "),
      quantity,
      ...(variant.displayPriceCents === undefined
        ? {}
        : { priceCents: variant.displayPriceCents }),
    });
  }

  function applyBulk() {
    const parsed = parseBuyerBulkOrder(bulk);
    const errors = [...parsed.errors];
    const bySku = new Map<string, BuyerCatalogVariant[]>();
    variants.forEach((variant) => {
      const key = variant.sku.toLowerCase();
      bySku.set(key, [...(bySku.get(key) ?? []), variant]);
    });
    parsed.rows.forEach((row) => {
      const matches = bySku.get(row.sku.toLowerCase()) ?? [];
      if (matches.length === 0) {
        errors.push(`SKU ${row.sku} was not found in the current catalog.`);
      } else if (matches.length > 1) {
        errors.push(`SKU ${row.sku} is ambiguous and was not added.`);
      } else {
        addVariant(matches[0]!, row.quantity);
      }
    });
    setBulkErrors(errors);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.lines.length === 0) return;
    setBusy(true);
    setSubmitError("");
    setSubmitSuccess("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    try {
      const requestIntent = {
        identity: {
          firstName: value("firstName"),
          lastName: value("lastName"),
          email: value("email").toLowerCase(),
          ...(value("phone") ? { phone: value("phone") } : {}),
          ...(value("company") ? { company: value("company") } : {}),
        },
        shipping: {
          line1: value("line1"),
          ...(value("line2") ? { line2: value("line2") } : {}),
          city: value("city"),
          region: value("region"),
          postalCode: value("postalCode"),
          country: "US",
        },
        lines: draft.lines.map((line) => ({
          offeringId: line.offeringId,
          variantId: line.variantId,
          requestedQuantity: line.quantity,
        })),
        ...(value("notes") ? { notes: value("notes") } : {}),
        requestedInvoice: true,
        source: "buyer_quick_order" as const,
      };
      const intent = JSON.stringify(requestIntent);
      attempt.current = buyerSubmissionAttempt(attempt.current, intent, makeIdempotencyKey);
      const result = await onSubmit({
        ...requestIntent,
        idempotencyKey: attempt.current.idempotencyKey,
      });
      attempt.current = null;
      setSubmitSuccess(
        result
          ? `Buyer request ${result.requestRef} received. ${result.nextStep}`
          : "Buyer request received.",
      );
    } catch {
      setSubmitError(
        "The request could not be submitted. Try again or email research@xeniostechnology.com.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container-x py-10">
      <header className="mb-8">
        <p className="mono-cap text-ink-mute">No account required</p>
        <h1 className="display-s">Buyer quick order</h1>
        <p className="mt-3 max-w-3xl text-ink-mute">
          Request one vial, a small order, or bulk quantities across multiple exact variants.
          Normal order quantities are 1–50 units per exact variant. Quantity alone does not
          trigger review; server-authorized products continue through the existing cart.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-8">
        <section aria-labelledby="buyer-catalog-heading">
          <h2 id="buyer-catalog-heading" className="text-2xl font-semibold">Choose products</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]">
            <input
              aria-label="Search catalog"
              className="input w-full"
              placeholder="Search product, strength, presentation, category, or SKU"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <select
              aria-label="Filter catalog by category"
              className="input w-full"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All categories</option>
              {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </div>

          <div className="card mt-4 p-5">
            <label htmlFor="buyer-bulk-order" className="font-semibold">Paste a bulk list</label>
            <p className="mt-1 text-sm text-ink-mute">One exact SKU per line: SKU,quantity.</p>
            <textarea
              id="buyer-bulk-order"
              className="input mt-3 min-h-28 w-full"
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
            />
            <button type="button" className="btn btn-secondary mt-3" onClick={applyBulk}>
              Add bulk list
            </button>
            {bulkErrors.length > 0 && (
              <ul className="mt-3 text-sm text-red-700" aria-live="polite">
                {bulkErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-mute">
            <p aria-live="polite">
              {filtered.length === 0
                ? "No exact variants match this search."
                : `${filtered.length} exact variants · page ${currentPage + 1} of ${pageCount}`}
            </p>
            {pageCount > 1 && (
              <div className="flex gap-2" aria-label="Catalog pages">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={currentPage === 0}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous products
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                >
                  Next products
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleVariants.map((variant) => {
              const exactKey = buyerVariantKey(variant);
              const quantity = quantities[exactKey] ?? 1;
              return (
                <article key={exactKey} className="card p-5">
                  <p className="mono-cap text-ink-mute">{variant.category} · {variant.sku}</p>
                  <h3 className="mt-2 text-xl font-semibold">{variant.productName}</h3>
                  <p className="text-ink-mute">
                    {[variant.strengthLabel, variant.presentation].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-4">
                    {variant.displayPriceCents === undefined
                      ? "Price confirmed before ordering"
                      : money(variant.displayPriceCents, variant.currency)}
                  </p>
                  <p className="mt-1 text-sm text-ink-mute">{variant.displayState}</p>
                  <div className="mt-4 flex gap-2">
                    <input
                      aria-label={`Quantity for ${variant.productName} ${variant.sku}`}
                      className="input w-24"
                      type="number"
                      min={1}
                      max={50}
                      value={quantity}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [exactKey]: Number(event.target.value),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => addVariant(variant, quantity)}
                    >
                      Add to request
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-ink-mute">
                    {variant.carePathway
                      ? "This exact variant routes to the existing Care pathway."
                      : variant.directPurchaseAuthorized && variant.directQuantityLimit !== null
                        ? `Direct checkout currently covers up to ${variant.directQuantityLimit} for this exact variant; other orderable configurations use the existing order-request path.`
                        : "This exact variant uses the existing order-request path."}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card p-5" aria-labelledby="buyer-draft-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="buyer-draft-heading" className="text-2xl font-semibold">Your request</h2>
              <p className="text-sm text-ink-mute">
                {draft.lines.length} exact variants · {draft.requestedUnits} requested units
              </p>
            </div>
            {draft.lines.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={draft.clear}>Clear</button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {draft.lines.map((line) => (
              <div key={buyerVariantKey(line)} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div><strong>{line.label}</strong><p className="text-sm text-ink-mute">{line.sku}</p></div>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Selected quantity for ${line.sku}`}
                    className="input w-24"
                    type="number"
                    min={1}
                    max={50}
                    value={line.quantity}
                    onChange={(event) => draft.upsert({ ...line, quantity: Number(event.target.value) })}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => draft.remove(line)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5" aria-labelledby="buyer-details-heading">
          <h2 id="buyer-details-heading" className="text-2xl font-semibold">Buyer and delivery details</h2>
          <p className="mt-1 text-sm text-ink-mute">
            No account is required. Your request receives a durable customer reference you can claim later.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <input className="input" name="firstName" placeholder="First name" required />
            <input className="input" name="lastName" placeholder="Last name" required />
            <input className="input" name="email" type="email" placeholder="Email" required />
            <input className="input" name="phone" type="tel" placeholder="Phone (optional)" />
            <input className="input md:col-span-2" name="company" placeholder="Company (optional)" />
            <input className="input md:col-span-2" name="line1" placeholder="Shipping address" required />
            <input className="input md:col-span-2" name="line2" placeholder="Address line 2 (optional)" />
            <input className="input" name="city" placeholder="City" required />
            <input className="input" name="region" placeholder="State / region" required />
            <input className="input" name="postalCode" placeholder="Postal code" required />
            <input className="input" value="United States" aria-label="Country" readOnly />
            <textarea className="input min-h-28 md:col-span-2" name="notes" placeholder="Order notes (optional)" />
          </div>
        </section>

        {submitError && <p className="text-red-700" role="alert">{submitError}</p>}
        {submitSuccess && <p className="text-green-800" role="status">{submitSuccess}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || draft.lines.length === 0}>
          {busy ? "Submitting…" : "Submit buyer request"}
        </button>
        <p className="text-sm text-ink-mute">
          Need a manual fallback? Email research@xeniostechnology.com.
        </p>
      </form>
    </main>
  );
}
