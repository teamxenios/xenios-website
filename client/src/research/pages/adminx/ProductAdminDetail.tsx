import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import type {
  AdminProductDetail,
  CreateAdminPriceInput,
  CreateAdminVariantInput,
  PriceAudience,
  UpdateAdminProductInput,
} from "@shared/research/product-admin";
import {
  approveAdminPrice,
  createAdminPrice,
  createAdminVariant,
  duplicateAdminProduct,
  getAdminProduct,
  newMutationKey,
  transitionAdminProduct,
  updateAdminVariant,
  updateAdminProduct,
  updateAdminMedia,
  uploadAdminMedia,
} from "../../adapters/productAdmin";
import { listRequiredInputs } from "../../adapters/adminOps";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { ProductPriceReviewPanel, readDraftAmountCents, readDraftEffectiveAt } from "./ProductPriceReviewPanel";
import {
  Website3RequiredInputNotice,
  Website3RequiredInputValue,
} from "../../products-diagnostics/RequiredInputState";

function resultError(result: {
  kind: string;
  message?: string;
}): string {
  return result.message ?? "The product update could not be saved.";
}

export default function ProductAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Product control"
      lead="Identity, content, variants, price history, media, and release state for one canonical product."
      actions={
        <Link href={ADMIN_ROUTES.products} className="btn btn-secondary">
          Back to products
        </Link>
      }
    >
      {(token) => <ProductDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function ProductDetailBody({ token, id }: { token: string; id: string }) {
  const loadProduct = useCallback(
    (currentToken: string) => getAdminProduct(currentToken, id),
    [id],
  );
  const resource = useAdminResource(token, loadProduct);
  const requiredInputs = useAdminResource(token, listRequiredInputs);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const product = resource.data?.product ?? null;

  async function lifecycle(
    action: "archive" | "restore" | "publish" | "unpublish",
  ) {
    if (!product || busy) return;
    const needsReason = action === "archive" || action === "unpublish";
    const reason = needsReason
      ? window.prompt(`Reason to ${action} this product:`)?.trim() ?? ""
      : "";
    if (needsReason && !reason) return;
    setBusy(true);
    setError(null);
    const result = await transitionAdminProduct(
      token,
      product.id,
      action,
      reason,
      newMutationKey(`product-${action}`),
    );
    setBusy(false);
    if (result.kind === "ok") {
      setMessage(`Product ${action} completed.`);
      resource.reload();
    } else {
      setError(resultError(result));
    }
  }

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Product control is not connected."
      unavailableBody="Website 2 must register the production admin routes and apply the reviewed migration before this record can be edited."
    >
      {product ? (
        <div className="grid gap-6">
          <section className="card" aria-label="Product release state">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mono-label text-ink-mute">
                  {product.productCode}
                </p>
                <h2 className="body-l font-700 mt-1">
                  {product.displayName}
                </h2>
                <p className="body-s text-ink-2 mt-2">
                  Canonical name: {product.canonicalName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ResearchStatusBadge
                  label={product.status.replace(/_/g, " ")}
                  tone={product.status === "published" ? "success" : "neutral"}
                />
                <ResearchStatusBadge
                  label={product.visibility.replace(/_/g, " ")}
                  tone={product.visibility === "public" ? "info" : "neutral"}
                />
                {product.missingInputCount ? (
                  <ResearchStatusBadge
                    label={`${product.missingInputCount} inputs missing`}
                    tone="warning"
                  />
                ) : (
                  <ResearchStatusBadge
                    label="Inputs complete"
                    tone="success"
                  />
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {product.status !== "published" &&
              product.status !== "archived" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void lifecycle("publish")}
                >
                  Publish
                </button>
              ) : null}
              {product.status === "published" ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void lifecycle("unpublish")}
                >
                  Unpublish
                </button>
              ) : null}
              {product.status === "archived" ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void lifecycle("restore")}
                >
                  Restore to draft
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void lifecycle("archive")}
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={async () => {
                  const productCode =
                    window.prompt("New unique product code:")?.trim() ?? "";
                  const slug = window.prompt("New URL slug:")?.trim() ?? "";
                  const displayName =
                    window.prompt("New product name:", `${product.displayName} copy`)?.trim() ??
                    "";
                  if (!productCode || !slug || !displayName) return;
                  setBusy(true);
                  setError(null);
                  const result = await duplicateAdminProduct(
                    token,
                    product.id,
                    { productCode, slug, displayName },
                    newMutationKey("duplicate-product"),
                  );
                  setBusy(false);
                  if (result.kind === "ok") {
                    setMessage(
                      `Draft ${result.data.product.productCode} created. Variants, prices, and media were not copied.`,
                    );
                  } else setError(resultError(result));
                }}
              >
                Duplicate as draft
              </button>
            </div>
            {message ? (
              <p role="status" className="body-s mt-4">
                {message}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="body-s mt-4" style={{ color: "var(--error)" }}>
                {error}
              </p>
            ) : null}
          </section>

          <ProductEditForm
            token={token}
            product={product}
            onSaved={() => {
              setMessage("Product details saved.");
              resource.reload();
            }}
          />

          <RequiredInputPanel
            product={product}
            items={requiredInputs.data?.items ?? []}
          />

          <VariantPanel
            token={token}
            product={product}
            onSaved={resource.reload}
          />

          <PricePanel
            token={token}
            product={product}
            onSaved={resource.reload}
          />

          <MediaPanel
            token={token}
            product={product}
            onSaved={resource.reload}
          />

          <section aria-labelledby="product-history-heading">
            <h2 id="product-history-heading" className="body-l font-700 mb-4">
              Audit history
            </h2>
            {product.history.length ? (
              <ol className="ra-timeline">
                {product.history.map((event, index) => (
                  <li
                    className="ra-timeline-item"
                    key={`${event.at}-${event.action}-${index}`}
                  >
                    <p className="mono-label text-ink-mute">
                      {fmtDateTime(event.at)}
                    </p>
                    <p className="body-m mt-1">
                      {event.action.replace(/_/g, " ")}
                    </p>
                    <p className="body-s text-ink-2 mt-1">
                      {event.actor}
                      {event.detail ? ` — ${event.detail}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <ResearchEmptyState title="No product changes recorded yet." />
            )}
          </section>

          <ResearchSecureNotice>
            Publishing controls catalog visibility only. Purchasability remains
            fail-closed until canonical commerce, price, inventory, exact-lot
            COA, shipping, returns, payment, and administrator release gates all
            pass.
          </ResearchSecureNotice>
        </div>
      ) : null}
    </AdminBoundary>
  );
}

function ProductEditForm({
  token,
  product,
  onSaved,
}: {
  token: string;
  product: AdminProductDetail;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    displayName: product.displayName,
    canonicalName: product.canonicalName,
    aliases: product.aliases.join(", "),
    category: product.category,
    classification: product.classification,
    availability: product.availability,
    shortDescription: product.content.shortDescription ?? "",
    longDescription: product.content.longDescription ?? "",
    researchInformation: product.content.researchInformation ?? "",
    storageInformation: product.content.storageInformation ?? "",
    handlingInformation: product.content.handlingInformation ?? "",
    shippingInformation: product.content.shippingInformation ?? "",
    returnInformation: product.content.returnInformation ?? "",
    disclaimers: product.content.disclaimers ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setForm({
      displayName: product.displayName,
      canonicalName: product.canonicalName,
      aliases: product.aliases.join(", "),
      category: product.category,
      classification: product.classification,
      availability: product.availability,
      shortDescription: product.content.shortDescription ?? "",
      longDescription: product.content.longDescription ?? "",
      researchInformation: product.content.researchInformation ?? "",
      storageInformation: product.content.storageInformation ?? "",
      handlingInformation: product.content.handlingInformation ?? "",
      shippingInformation: product.content.shippingInformation ?? "",
      returnInformation: product.content.returnInformation ?? "",
      disclaimers: product.content.disclaimers ?? "",
    });
  }, [product]);

  async function save() {
    setBusy(true);
    setError(null);
    const input: UpdateAdminProductInput = {
      displayName: form.displayName,
      canonicalName: form.canonicalName,
      aliases: form.aliases
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      category: form.category,
      classification: form.classification,
      availability: form.availability,
      content: {
        shortDescription: form.shortDescription || null,
        longDescription: form.longDescription || null,
        researchInformation: form.researchInformation || null,
        storageInformation: form.storageInformation || null,
        handlingInformation: form.handlingInformation || null,
        shippingInformation: form.shippingInformation || null,
        returnInformation: form.returnInformation || null,
        disclaimers: form.disclaimers || null,
      },
    };
    const result = await updateAdminProduct(
      token,
      product.id,
      input,
      newMutationKey("update-product"),
    );
    setBusy(false);
    if (result.kind === "ok") onSaved();
    else setError(resultError(result));
  }

  return (
    <section className="card" aria-labelledby="product-content-heading">
      <h2 id="product-content-heading" className="body-l font-700">
        Product identity and content
      </h2>
      <div className="grid gap-4 mt-5 sm:grid-cols-2">
        {(
          [
            ["displayName", "Product name"],
            ["canonicalName", "Canonical name"],
            ["aliases", "Search aliases"],
            ["category", "Category"],
            ["classification", "Classification"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`product-edit-${key}`} className="form-label">
              {label}
            </label>
            <input
              id={`product-edit-${key}`}
              className="input-field"
              value={form[key]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </div>
        ))}
        <div>
          <label htmlFor="product-edit-availability" className="form-label">
            Catalog availability
          </label>
          <select
            id="product-edit-availability"
            className="input-field"
            value={form.availability}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                availability: event.target
                  .value as AdminProductDetail["availability"],
              }))
            }
          >
            <option value="documentation_review">Documentation review</option>
            <option value="commerce_review">Commerce review</option>
            <option value="coming_soon">Coming soon</option>
            <option value="waitlist">Waitlist</option>
            <option value="temporarily_unavailable">Temporarily unavailable</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="low_stock">Low stock</option>
            <option value="in_stock">In stock</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 mt-4">
        {(
          [
            ["shortDescription", "Short description", 2],
            ["longDescription", "Long description", 5],
            ["researchInformation", "Research information", 5],
            ["storageInformation", "Storage information", 3],
            ["handlingInformation", "Handling information", 3],
            ["shippingInformation", "Shipping information", 3],
            ["returnInformation", "Return information", 3],
            ["disclaimers", "Disclaimers", 3],
          ] as const
        ).map(([key, label, rows]) => (
          <div key={key}>
            <label htmlFor={`product-edit-${key}`} className="form-label">
              {label}
            </label>
            <textarea
              id={`product-edit-${key}`}
              className="input-field"
              rows={rows}
              value={form[key]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="body-s mt-4" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary mt-5"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "Saving..." : "Save product"}
      </button>
    </section>
  );
}

function RequiredInputPanel({
  product,
  items,
}: {
  product: AdminProductDetail;
  items: Parameters<typeof Website3RequiredInputNotice>[0]["items"];
}) {
  return (
    <section aria-labelledby="product-readiness-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="mono-label text-ink-mute">Release readiness</p>
          <h2 id="product-readiness-heading" className="body-l font-700 mt-1">
            Required product inputs
          </h2>
        </div>
        <Link href="/admin/research/required-inputs" className="btn btn-secondary">
          Open Required Inputs
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            "productSku",
            "retailPrice",
            "approvedProductImage",
            "availableInventory",
            "activeLot",
            "coaFile",
            "exactLotMatch",
            "commerceRelease",
          ] as const
        ).map((slot) => (
          <Website3RequiredInputNotice
            key={slot}
            slot={slot}
            items={items}
            recordId={product.id}
          />
        ))}
      </div>
    </section>
  );
}

function VariantPanel({
  token,
  product,
  onSaved,
}: {
  token: string;
  product: AdminProductDetail;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CreateAdminVariantInput>({
    sku: "",
    label: "",
    catalogNumber: null,
    strength: null,
    size: null,
    format: null,
    presentation: null,
    shippingClass: null,
    memberEligible: false,
    sortOrder: product.variants.length,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    setError(null);
    const result = await createAdminVariant(
      token,
      product.id,
      form,
      newMutationKey("create-variant"),
    );
    setBusy(false);
    if (result.kind === "ok") {
      setForm((current) => ({ ...current, sku: "", label: "" }));
      onSaved();
    } else setError(resultError(result));
  }
  async function transitionVariant(
    variantId: string,
    status: "in_review" | "approved" | "archived",
    active: boolean,
  ) {
    setBusy(true);
    setError(null);
    const result = await updateAdminVariant(
      token,
      product.id,
      variantId,
      { status, active },
      newMutationKey("update-variant"),
    );
    setBusy(false);
    if (result.kind === "ok") onSaved();
    else setError(resultError(result));
  }
  return (
    <section aria-labelledby="product-variants-heading">
      <h2 id="product-variants-heading" className="body-l font-700 mb-4">
        Variants and SKUs
      </h2>
      <ResearchDataTable
        caption="Product variants"
        rows={product.variants}
        rowKey={(variant) => variant.id}
        empty="No variants yet. Add the first SKU below."
        columns={[
          {
            key: "sku",
            header: "SKU",
            render: (variant) => <span className="font-700">{variant.sku}</span>,
          },
          { key: "label", header: "Variant", render: (variant) => variant.label },
          {
            key: "spec",
            header: "Specification",
            render: (variant) =>
              [variant.strength, variant.size, variant.format]
                .filter(Boolean)
                .join(" · ") || "Not entered",
          },
          {
            key: "shipping",
            header: "Shipping class",
            render: (variant) =>
              variant.shippingClass ?? "SHIPPING CLASS REQUIRED",
          },
          {
            key: "status",
            header: "Status",
            render: (variant) => (
              <div className="flex flex-wrap items-center gap-2">
                <ResearchStatusBadge
                  label={variant.status.replace(/_/g, " ")}
                  tone={variant.status === "approved" ? "success" : "neutral"}
                />
                {variant.status === "draft" ? (
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void transitionVariant(variant.id, "in_review", false)}>
                    Submit
                  </button>
                ) : null}
                {variant.status === "in_review" ? (
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void transitionVariant(variant.id, "approved", true)}>
                    Approve
                  </button>
                ) : null}
                {variant.status !== "archived" ? (
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void transitionVariant(variant.id, "archived", false)}>
                    Archive
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      <details className="card mt-4">
        <summary className="body-m font-700" style={{ cursor: "pointer" }}>
          Add variant
        </summary>
        <div className="grid gap-4 mt-4 sm:grid-cols-2">
          {(
            [
              ["sku", "SKU"],
              ["label", "Variant label"],
              ["catalogNumber", "Catalog number"],
              ["strength", "Strength"],
              ["size", "Size"],
              ["format", "Format"],
              ["presentation", "Presentation"],
              ["shippingClass", "Shipping class"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="form-label" htmlFor={`variant-create-${key}`}>
                {label}
              </label>
              <input
                id={`variant-create-${key}`}
                className="input-field"
                value={form[key] ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value || null,
                  }))
                }
              />
            </div>
          ))}
          <label className="body-s flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.memberEligible}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  memberEligible: event.target.checked,
                }))
              }
            />
            Eligible for members after approval
          </label>
        </div>
        {error ? (
          <p role="alert" className="body-s mt-4" style={{ color: "var(--error)" }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-primary mt-4"
          disabled={busy || !form.sku.trim() || !form.label.trim()}
          onClick={() => void create()}
        >
          {busy ? "Adding..." : "Add draft variant"}
        </button>
      </details>
    </section>
  );
}

export function PricePanel({
  token,
  product,
  onSaved,
}: {
  token: string;
  product: AdminProductDetail;
  onSaved: () => void;
}) {
  const firstVariant = product.variants[0]?.id ?? "";
  const [variantId, setVariantId] = useState(firstVariant);
  const [audience, setAudience] = useState<PriceAudience>("retail");
  const [amount, setAmount] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!variantId && firstVariant) setVariantId(firstVariant);
  }, [firstVariant, variantId]);
  const amountCents = readDraftAmountCents(amount);
  const effectiveTimestamp = readDraftEffectiveAt(effectiveAt);
  const exactVariants = product.variants.filter((variant) => variant.id === variantId);
  const validVariant = exactVariants.length === 1 && exactVariants[0].productId === product.id;
  const validDraft = validVariant && amountCents !== null && effectiveTimestamp !== null;
  async function create() {
    if (busy || !validVariant || amountCents === null || effectiveTimestamp === null) return;
    setBusy(true);
    setError(null);
    const input: CreateAdminPriceInput = {
      variantId,
      audience,
      amountCents,
      currency: "USD",
      effectiveAt: effectiveTimestamp,
    };
    const result = await createAdminPrice(
      token,
      product.id,
      input,
      newMutationKey("create-price"),
    );
    setBusy(false);
    if (result.kind === "ok") {
      setAmount("");
      onSaved();
    } else setError(resultError(result));
  }
  async function approve(priceId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await approveAdminPrice(
      token,
      product.id,
      priceId,
      newMutationKey("approve-price"),
    );
    setBusy(false);
    if (result.kind === "ok") onSaved();
    else setError(resultError(result));
  }
  return (
    <div className="min-w-0">
      <ProductPriceReviewPanel product={product} />
      {product.prices.some((price) => price.status === "draft") ? (
        <section aria-label="Existing draft price approvals" className="card min-w-0 mt-4">
          <h3 className="body-m font-700">Draft price approvals</h3>
          <p className="body-s text-ink-mute mt-2">Explicit approval uses the existing admin policy. It does not grant purchase eligibility.</p>
          <ul className="grid gap-4 mt-4">
            {product.prices.filter((price) => price.status === "draft").map((price, index) => (
              <li key={`${price.id}:${index}`} className="min-w-0">
                <p className="body-s mb-2" style={{ overflowWrap: "anywhere" }}>Price {price.id} · variant {price.variantId} · version {price.version}</p>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void approve(price.id)} aria-label={`Approve draft price ${price.id}`}>
                  Approve
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <details className="card min-w-0 mt-4">
        <summary className="body-m font-700" style={{ cursor: "pointer" }}>
          Add price
        </summary>
        {product.variants.length ? (
          <div className="grid gap-4 mt-4 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="price-variant">
                Variant
              </label>
              <select
                id="price-variant"
                className="input-field"
                value={variantId}
                onChange={(event) => setVariantId(event.target.value)}
              >
                {product.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.sku} — {variant.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="price-audience">
                Audience
              </label>
              <select
                id="price-audience"
                className="input-field"
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as PriceAudience)
                }
              >
                <option value="retail">Retail</option>
                <option value="member">Member</option>
                <option value="professional">Professional</option>
                <option value="wholesale">Wholesale</option>
                <option value="compare_at">Compare-at</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="price-amount">
                Amount (USD)
              </label>
              <input
                id="price-amount"
                className="input-field"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                aria-describedby="price-amount-help"
                aria-invalid={amount.length > 0 && amountCents === null}
              />
              <p id="price-amount-help" className="body-s text-ink-mute mt-2">Enter a positive USD amount with at most two decimal places.</p>
            </div>
            <div>
              <label className="form-label" htmlFor="price-effective">
                Effective date
              </label>
              <input
                id="price-effective"
                className="input-field"
                type="date"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                aria-describedby="price-effective-help"
                aria-invalid={effectiveTimestamp === null}
              />
              <p id="price-effective-help" className="body-s text-ink-mute mt-2">A valid date is required; it is stored at 00:00 UTC.</p>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !validDraft}
                onClick={() => void create()}
              >
                {busy ? "Saving..." : "Save draft price"}
              </button>
            </div>
          </div>
        ) : (
          <ResearchEmptyState
            title="Create a variant first."
            body="Every price belongs to one exact SKU."
          />
        )}
      </details>
      {error ? (
        <p role="alert" className="body-s mt-4" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MediaPanel({
  token,
  product,
  onSaved,
}: {
  token: string;
  product: AdminProductDetail;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"primary_image" | "gallery_image">("primary_image");
  const [altText, setAltText] = useState("");
  async function update(
    mediaId: string,
    state: "in_review" | "approved" | "rejected" | "archived",
    altText: string,
    sortOrder: number,
  ) {
    const reason =
      state === "rejected"
        ? window.prompt("Reason for rejection:")?.trim() ?? ""
        : null;
    if (state === "rejected" && !reason) return;
    setBusy(true);
    setError(null);
    const result = await updateAdminMedia(
      token,
      product.id,
      mediaId,
      { state, altText, sortOrder, reason },
      newMutationKey("update-media"),
    );
    setBusy(false);
    if (result.kind === "ok") onSaved();
    else setError(resultError(result));
  }
  async function upload() {
    if (!file || !altText.trim()) return;
    setBusy(true);
    setError(null);
    const result = await uploadAdminMedia(token, product.id, file, {
      kind,
      altText: altText.trim(),
      sortOrder: product.media.length,
    });
    setBusy(false);
    if (result.kind === "ok") {
      setFile(null);
      setAltText("");
      onSaved();
    } else setError(resultError(result));
  }
  return (
    <section aria-labelledby="product-media-heading">
      <h2 id="product-media-heading" className="body-l font-700 mb-4">
        Product media
      </h2>
      {product.media.length ? (
        <ResearchDataTable
          caption="Product media"
          rows={product.media}
          rowKey={(media) => media.id}
          columns={[
            { key: "file", header: "File", render: (media) => media.filename },
            { key: "kind", header: "Use", render: (media) => media.kind.replace(/_/g, " ") },
            { key: "alt", header: "Alt text", render: (media) => media.altText },
            {
              key: "status",
              header: "Status",
              render: (media) => (
                <div className="flex flex-wrap items-center gap-2">
                  <ResearchStatusBadge
                    label={media.state.replace(/_/g, " ")}
                    tone={media.state === "approved" ? "success" : "neutral"}
                  />
                  {media.state === "in_review" || media.state === "approved" ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        const nextAlt = window.prompt("Alt text:", media.altText)?.trim();
                        const nextOrder = Number(window.prompt("Display order:", String(media.sortOrder)));
                        if (!nextAlt || !Number.isSafeInteger(nextOrder) || nextOrder < 0) return;
                        void update(
                          media.id,
                          media.state === "approved" ? "approved" : "in_review",
                          nextAlt,
                          nextOrder,
                        );
                      }}
                    >
                      Edit metadata
                    </button>
                  ) : null}
                  {media.state === "uploaded" ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        void update(
                          media.id,
                          "in_review",
                          media.altText,
                          media.sortOrder,
                        )
                      }
                    >
                      Submit
                    </button>
                  ) : null}
                  {media.state === "in_review" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          void update(
                            media.id,
                            "approved",
                            media.altText,
                            media.sortOrder,
                          )
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          void update(
                            media.id,
                            "rejected",
                            media.altText,
                            media.sortOrder,
                          )
                        }
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <ResearchEmptyState
          title="APPROVED PRODUCT IMAGE REQUIRED"
          body="Upload and approve a primary product image before this product can be released."
        />
      )}
      <details className="card mt-4">
        <summary className="body-m font-700" style={{ cursor: "pointer" }}>
          Upload product image
        </summary>
        <div className="grid gap-4 mt-4 sm:grid-cols-2">
          <div>
            <label className="form-label" htmlFor="product-media-file">Image file</label>
            <input
              id="product-media-file"
              className="input-field"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="product-media-kind">Image use</label>
            <select
              id="product-media-kind"
              className="input-field"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="primary_image">Primary image</option>
              <option value="gallery_image">Gallery image</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="form-label" htmlFor="product-media-alt">Alt text</label>
            <input
              id="product-media-alt"
              className="input-field"
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Describe the product image"
            />
          </div>
        </div>
        <p className="body-s text-ink-2 mt-4">
          Files stay private until object verification and administrator approval complete.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4"
          disabled={busy || !file || !altText.trim()}
          onClick={() => void upload()}
        >
          {busy ? "Uploading..." : "Upload privately"}
        </button>
      </details>
      {error ? (
        <p role="alert" className="body-s mt-4" style={{ color: "var(--error)" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
