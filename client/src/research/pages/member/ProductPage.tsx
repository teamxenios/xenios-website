import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import type { Product, ProductStatus } from "@shared/research/types";
import { canAddToCart, formatMoney, productActionLabel, useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchRouteBoundary,
  ResearchCapabilityBoundary,
  capabilityStatusOrPending,
  ResearchEmptyState,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { apiPost } from "../../lib/api";
import { MEMBER_ROUTES } from "../../lib/routes";

// Member product detail (Supreme build). Every fact on this page comes from
// the gated catalog product record; anything the server has not supplied
// renders as an honest pending line, never an invented value. Quantum items
// always present as coming soon.

function effectiveStatus(product: Product): ProductStatus {
  return product.category === "quantum" ? "coming-soon" : product.status;
}

const STATUS_BADGE: Record<ProductStatus, { label: string; tone: BadgeTone }> = {
  live: { label: "Available", tone: "success" },
  hold: { label: "Documentation review", tone: "pending" },
  "professional-only": { label: "Professional access", tone: "info" },
  "request-access": { label: "Request access", tone: "neutral" },
  "coming-soon": { label: "Coming soon", tone: "pending" },
};

// Case-insensitive lookup into the product's specification record.
function specValue(product: Product, ...needles: string[]): string | null {
  const specs = product.specifications;
  if (!specs) return null;
  for (const [key, value] of Object.entries(specs)) {
    const k = key.toLowerCase();
    if (needles.some((n) => k.includes(n))) return value;
  }
  return null;
}

// Subscription frequencies are rendered ONLY when the server supplies them on
// the product record; the shared type does not require the field, so the read
// is defensive and anything malformed collapses to "none supplied".
function subscriptionFrequencies(product: Product): string[] {
  const raw = (product as Product & { subscriptionFrequencies?: unknown }).subscriptionFrequencies;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === "string" && f.length > 0);
}

type WaitlistState = "idle" | "busy" | "joined" | "unavailable" | "error";

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const { member, memberChecking, memberToken, bySlug, commerce, email, addItem } = useResearch();

  const [caps, setCaps] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistState>("idle");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!memberToken) return;
    let alive = true;
    void fetchCapabilities(memberToken).then((m) => {
      if (alive) setCaps(m);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  const product = bySlug.get(slug) ?? null;
  const commerceStatus = capabilityStatusOrPending(caps, "product_commerce");

  const frequencies = useMemo(() => (product ? subscriptionFrequencies(product) : []), [product]);

  const joinWaitlist = async () => {
    setWaitlist("busy");
    const result = await apiPost<{ ok: boolean }>("/api/research/member/waitlist", { slug }, memberToken);
    if (result.kind === "ok") setWaitlist("joined");
    else if (result.kind === "unavailable") setWaitlist("unavailable");
    else setWaitlist("error");
  };

  const boundaryState: "loading" | "unauthorized" | "ok" = memberChecking ? "loading" : !member ? "unauthorized" : "ok";

  const concernMailto = product
    ? `mailto:${email}?subject=${encodeURIComponent(`Product concern: ${product.name}`)}`
    : `mailto:${email}`;

  const status = product ? effectiveStatus(product) : null;
  const badge = status ? STATUS_BADGE[status] : null;
  const format = product ? product.size ?? specValue(product, "format") : null;
  const sku = product ? specValue(product, "sku") : null;
  const storage = product ? specValue(product, "storage") : null;
  const shipping = product ? specValue(product, "shipping", "ship") : null;
  const purchasable = product && status ? status !== "coming-soon" && canAddToCart(product, commerce) : false;

  return (
    <ResearchMemberShell
      eyebrow="Member catalog"
      title={product ? product.name : "Product"}
      lead={product?.summary}
      actions={
        <Link href={MEMBER_ROUTES.products} className="btn btn-ghost">
          Back to products
        </Link>
      }
    >
      <ResearchRouteBoundary state={boundaryState}>
        {!product ? (
          <ResearchEmptyState
            title="This product is not in your catalog."
            body="The link may be out of date, or the product may not be published to your membership yet."
            action={
              <Link href={MEMBER_ROUTES.products} className="btn btn-primary">
                Browse the catalog
              </Link>
            }
          />
        ) : (
          <div className="grid gap-6">
            {/* Facts: only server-supplied fields, pending lines otherwise. */}
            <section className="card" aria-label="Product facts">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mono-label text-ink-mute">{product.eyebrow}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {badge && <ResearchStatusBadge label={badge.label} tone={badge.tone} />}
                    <span className="chip text-ink-2">{product.category}</span>
                    {format && <span className="chip text-ink-2">{format}</span>}
                    {sku && <span className="mono-label text-ink-mute">SKU {sku}</span>}
                  </div>
                </div>
                <p className="display-s tabular">{formatMoney(product.priceCents)}</p>
              </div>
              {product.description.length > 0 && (
                <div className="mt-4 grid gap-3">
                  {product.description.map((paragraph, i) => (
                    <p key={i} className="body-s text-ink-2 max-w-[68ch]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
              {product.highlights.length > 0 && (
                <ul className="mt-4 grid gap-2" style={{ paddingLeft: 18 }}>
                  {product.highlights.map((highlight, i) => (
                    <li key={i} className="body-s text-ink-2">
                      {highlight}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Ordering: a hard capability boundary. While commerce is not
                enabled there is no cart, no buy button, nothing to click. */}
            <section aria-label="Ordering">
              <h2 className="mono-cap text-ink-mute">Ordering</h2>
              <div className="mt-3 grid gap-4">
                <ResearchCapabilityBoundary status={commerceStatus}>
                  <div className="card">
                    <p className="mono-label text-ink-mute">One-time purchase</p>
                    <p className="body-s text-ink-2 mt-2">{formatMoney(product.priceCents)}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {purchasable ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              addItem(product);
                              setAdded(true);
                            }}
                          >
                            {productActionLabel(product, commerce)}
                          </button>
                          {added && (
                            <span role="status" aria-live="polite" className="body-s text-ink-2">
                              Added. <Link href={MEMBER_ROUTES.orders}>Review your order</Link>.
                            </span>
                          )}
                        </>
                      ) : (
                        <p className="body-s text-ink-2">
                          {status === "coming-soon"
                            ? "This product is coming soon and cannot be ordered yet."
                            : "This product is not cleared for checkout right now. Availability is controlled product by product."}
                        </p>
                      )}
                    </div>
                  </div>
                </ResearchCapabilityBoundary>

                {frequencies.length > 0 ? (
                  <div className="card">
                    <p className="mono-label text-ink-mute">Subscription</p>
                    <p className="body-s text-ink-2 mt-2">This product supports the following delivery frequencies:</p>
                    <ul className="mt-2 grid gap-1" style={{ paddingLeft: 18 }}>
                      {frequencies.map((f) => (
                        <li key={f} className="body-s text-ink-2">
                          {f}
                        </li>
                      ))}
                    </ul>
                    <ResearchCapabilityBoundary status={commerceStatus}>
                      <p className="body-s text-ink-2 mt-3">Subscription checkout opens from your order review.</p>
                    </ResearchCapabilityBoundary>
                  </div>
                ) : (
                  <div className="card" role="status">
                    <p className="mono-label text-ink-mute">Subscription</p>
                    <p className="body-s text-ink-2 mt-2">
                      Subscription options for this product have not been published yet.
                    </p>
                  </div>
                )}

                {status === "coming-soon" && (
                  <div className="card">
                    <p className="mono-label text-ink-mute">Waitlist</p>
                    {waitlist === "joined" ? (
                      <p role="status" className="body-s text-ink-2 mt-2">
                        You are on the waitlist. We will let you know when this opens.
                      </p>
                    ) : waitlist === "unavailable" ? (
                      <p role="status" className="body-s text-ink-mute mt-2">
                        The waitlist is not open yet. Check back soon.
                      </p>
                    ) : (
                      <div className="mt-3">
                        <button type="button" className="btn btn-secondary" disabled={waitlist === "busy"} onClick={() => void joinWaitlist()}>
                          {waitlist === "busy" ? "Joining..." : waitlist === "error" ? "Retry joining the waitlist" : "Join the waitlist"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <p className="body-s text-ink-mute">
                  Fulfillment disclosure: orders are prepared and shipped only after documentation review, and shipping
                  details are confirmed before any order is finalized.
                </p>
              </div>
            </section>

            {/* Documentation status: server fields or honest pending lines. */}
            <section className="card" aria-label="Documentation">
              <h2 className="mono-cap text-ink-mute">Documentation</h2>
              <dl className="mt-3 grid gap-3">
                <div>
                  <dt className="mono-label text-ink-mute">Guide</dt>
                  <dd className="body-s text-ink-2 mt-1">
                    {product.researchContext && product.researchContext.length > 0 ? "Guide available" : "documentation pending"}
                  </dd>
                </div>
                <div>
                  <dt className="mono-label text-ink-mute">Quality documents</dt>
                  <dd className="body-s text-ink-2 mt-1">
                    {product.qualityNotes && product.qualityNotes.length > 0 ? "Quality documents on file" : "documentation pending"}
                  </dd>
                </div>
                <div>
                  <dt className="mono-label text-ink-mute">Storage</dt>
                  <dd className="body-s text-ink-2 mt-1">{storage ?? "documentation pending"}</dd>
                </div>
                <div>
                  <dt className="mono-label text-ink-mute">Shipping</dt>
                  <dd className="body-s text-ink-2 mt-1">{shipping ?? "documentation pending"}</dd>
                </div>
              </dl>
            </section>

            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <section className="card" aria-label="Specifications">
                <h2 className="mono-cap text-ink-mute">Specifications</h2>
                <dl className="mt-3 grid gap-3">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key}>
                      <dt className="mono-label text-ink-mute">{key}</dt>
                      <dd className="body-s text-ink-2 mt-1">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {product.researchContext && product.researchContext.length > 0 && (
              <section className="card" aria-label="Research context and limitations">
                <h2 className="mono-cap text-ink-mute">Research context and limitations</h2>
                <div className="mt-3 grid gap-3">
                  {product.researchContext.map((paragraph, i) => (
                    <p key={i} className="body-s text-ink-2 max-w-[68ch]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            )}

            {product.qualityNotes && product.qualityNotes.length > 0 && (
              <section className="card" aria-label="Quality">
                <h2 className="mono-cap text-ink-mute">Quality</h2>
                <ul className="mt-3 grid gap-2" style={{ paddingLeft: 18 }}>
                  {product.qualityNotes.map((note, i) => (
                    <li key={i} className="body-s text-ink-2">
                      {note}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Goal mappings and related areas. */}
            <section className="card" aria-label="Goals and related areas">
              <h2 className="mono-cap text-ink-mute">Goals this maps to</h2>
              {product.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <span key={tag} className="chip text-ink-2">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="body-s text-ink-mute mt-3">No goal mappings have been published for this product yet.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={MEMBER_ROUTES.goals} className="btn btn-ghost">
                  Browse goals
                </Link>
                <Link href={MEMBER_ROUTES.guides} className="btn btn-ghost">
                  Related guides
                </Link>
                <Link href="/research/systems" className="btn btn-ghost">
                  Build a system
                </Link>
              </div>
            </section>

            <section className="card" aria-label="Support">
              <h2 className="mono-cap text-ink-mute">Questions or concerns</h2>
              <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
                If anything about this product looks off, or you have a question the documentation does not answer,
                reach a person directly.
              </p>
              <div className="mt-4">
                <a href={concernMailto} className="btn btn-secondary">
                  Report a product concern
                </a>
              </div>
            </section>
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
