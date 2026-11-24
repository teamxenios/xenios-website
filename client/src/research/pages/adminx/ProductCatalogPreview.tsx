import { useEffect, useRef, useState } from "react";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { CatalogContentPreview } from "@shared/research/catalog-content-preview";
import { PRODUCT_MEDIA_REPRESENTATION_CAPTIONS, type ReviewedProductMedia } from "@shared/research/master-offerings/approved-content";
import { apiGet } from "../../lib/api";
import { ReviewedProductContent } from "../../master-offerings/ReviewedProductContent";

const messages: Record<CatalogContentPreview["state"], string> = {
  preview_available: "Reviewed catalog presentation for this exact variant. This does not publish it or approve availability.",
  select_variant: "Choose an exact variant to preview. Product-wide content is not inferred.",
  invalid_selection: "The selected identity is invalid. Choose a variant from this product.",
  variant_not_in_product: "This variant was not confirmed as part of this product.",
  binding_missing: "No reviewed exact catalog binding. Preview is unavailable; no other variant is substituted.",
  binding_ambiguous: "The exact catalog mapping is ambiguous. Preview is withheld.",
  catalog_unavailable: "The reviewed catalog could not be confirmed. Retry without changing the product.",
  catalog_identity_mismatch: "The exact catalog identity could not be confirmed. Preview is withheld.",
};

/** Mounted inside existing ProductAdminDetail/AdminScreen only, never a public route. */
export function ProductCatalogPreview({ token, product }: { token: string; product: AdminProductDetail }) {
  const [selection, setSelection] = useState<{ productId: string; variantId: string } | null>(null);
  const variantId = selection?.productId === product.id ? selection.variantId : "";
  const [result, setResult] = useState<{ view: CatalogContentPreview; token: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable" | "denied">("idle");
  const [retry, setRetry] = useState(0), generation = useRef(0);
  useEffect(() => { setSelection(null); setResult(null); setState("idle"); }, [product.id]);
  useEffect(() => {
    const request = ++generation.current;
    setResult(null);
    if (!variantId) { setState("idle"); return; }
    if (!product.variants.some(v => v.id === variantId && v.productId === product.id)) { setState("unavailable"); return; }
    setState("loading");
    void apiGet<{ ok: true; product: AdminProductDetail; catalogPreview?: CatalogContentPreview }>(
      `/api/admin/research/products/${encodeURIComponent(product.id)}?previewVariantId=${encodeURIComponent(variantId)}`, token,
    ).then(response => {
      if (generation.current !== request) return;
      if (response.kind !== "ok") { setState(response.kind === "unauthorized" || response.kind === "forbidden" || response.kind === "denied" ? "denied" : "unavailable"); return; }
      const view = response.data.catalogPreview;
      if (!view || view.productId !== product.id || view.variantId !== variantId || !Object.hasOwn(messages, view.state)) { setState("unavailable"); return; }
      setResult({ view, token }); setState("ready");
    });
    return () => { generation.current++; };
  }, [product.id, product.variants, token, variantId, retry]);
  const current = result?.token === token && result.view.productId === product.id && result.view.variantId === variantId ? result.view : null;
  const retryable = state === "unavailable" || (state === "ready" && current?.state === "catalog_unavailable");
  return <section className="card" aria-labelledby="product-catalog-preview-heading">
    <h2 id="product-catalog-preview-heading" className="body-l font-700">Exact variant catalog preview</h2>
    <p className="body-s text-ink-2">Read-only operator preview. Saved Product Control drafts and product-wide media are not approved public content.</p>
    <label className="form-label" htmlFor="preview-exact-variant">Exact variant</label>
    <select id="preview-exact-variant" className="input-field" value={variantId} onChange={e => setSelection({ productId: product.id, variantId: e.target.value })}>
      <option value="">Choose a variant — no automatic selection</option>
      {product.variants.filter(v => v.productId === product.id).map(v => <option key={v.id} value={v.id}>{v.label} · {v.id}</option>)}
    </select>
    <div role="status" aria-live="polite">
      {state === "idle" && <p>{messages.select_variant}</p>}
      {state === "loading" && <p>Checking the reviewed catalog for this exact identity…</p>}
      {state === "denied" && <p>Operator access was not confirmed. Sign in through the existing staff access flow.</p>}
      {state === "unavailable" && <p>Preview could not be confirmed. No saved product data was changed.</p>}
      {state === "ready" && current && <p>{messages[current.state]}</p>}
    </div>
    {retryable && <button type="button" className="btn btn-secondary" onClick={() => setRetry(n => n + 1)}>Retry preview</button>}
    {state === "ready" && current?.state === "preview_available" && <CatalogPreviewCard view={current} />}
  </section>;
}

export function CatalogPreviewCard({ view }: { view: CatalogContentPreview }) {
  if (view.state !== "preview_available" || !view.identity) return <p>{messages[view.state]}</p>;
  return <article>
    <h3 className="body-m font-700">{view.identity.displayName}</h3>
    <p>{view.identity.variantLabel}</p>
    <p className="body-s">Catalog state: {view.identity.offeringState} / {view.identity.variantState}. Preview does not change holds or eligibility.</p>
    {view.reviewMessage && <p>{view.reviewMessage}</p>}
    {view.media ? <PreviewImage key={view.media.primary.href} media={view.media} /> : <p>No reviewed image for this exact variant.</p>}
    {view.content ? <>
      {view.content.browseSummary && <p><strong>Catalog browse summary: </strong>{view.content.browseSummary}</p>}
      <ReviewedProductContent content={view.content} inDialog />
    </> : <p>No reviewed public description for this exact variant.</p>}
  </article>;
}

function PreviewImage({ media }: { media: ReviewedProductMedia }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p>The reviewed image could not be loaded. No replacement artwork is inferred.</p>;
  const caption = media.representation ? PRODUCT_MEDIA_REPRESENTATION_CAPTIONS[media.representation]
    : media.packagingDesign ? "Packaging design shown. Current packaging may differ."
      : media.labelPreview ? "Label design shown. This is not a photograph of the product." : null;
  return <figure className="m-0 grid w-full min-w-0 max-w-[26rem] gap-1">
    <img src={media.primary.href} alt={media.primary.altText} width={media.primary.width} height={media.primary.height}
      className="block h-auto max-w-full object-contain" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    {caption && <figcaption className="body-s text-ink-mute">{caption}</figcaption>}
    {media.labelPreview && <a href={media.labelPreview.href} target="_blank" rel="noreferrer">View front label artwork</a>}
  </figure>;
}
