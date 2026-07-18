import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Minus, Plus, Trash2 } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import type { CommerceLane } from "@shared/research/types";
import { formatMoney, submitOrder, useResearch } from "../core";
import { PageIntro } from "../components";

const EMPTY_CUSTOMER = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "United States",
};

export default function CartPage() {
  const cart = useResearch();
  const [lane, setLane] = useState<CommerceLane>("research");
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [notes, setNotes] = useState("");
  const [researchAttestation, setResearchAttestation] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string; orderId?: string }>({ type: "idle" });

  const items = cart.laneItems(lane);
  const total = useMemo(() => items.reduce((sum, item) => sum + (item.product.priceCents || 0) * item.quantity, 0), [items]);
  const laneEnabled = lane === "research" ? cart.commerce.research : cart.commerce.consumer;

  function updateCustomer(field: keyof typeof EMPTY_CUSTOMER, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status.type === "loading") return;
    setStatus({ type: "loading" });
    const result = await submitOrder({
      lane,
      items: items.map((item) => ({ slug: item.slug, quantity: item.quantity })),
      customer,
      notes,
      researchAttestation: lane === "research" ? researchAttestation : undefined,
    });
    if (result.ok) {
      setStatus({ type: "success", message: result.message, orderId: result.orderId });
      cart.clearLane(lane);
    } else {
      setStatus({ type: "error", message: result.message || "Something went wrong." });
    }
  }

  if (status.type === "success") {
    return (
      <>
        <SeoHead title="Order request received, xenios research" description="Your order request is in review." path="/research/cart" />
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <p className="mono-cap text-pulse mb-5">Request received</p>
          <h1 className="display-s max-w-[20ch]">Your {lane} order request is in review.</h1>
          {status.orderId && (
            <p className="mt-6 body-l text-ink-2">
              Reference: <strong className="tabular">{status.orderId}</strong>
            </p>
          )}
          <Link href="/research/shop" className="btn btn-secondary mt-8">Continue exploring</Link>
        </section>
      </>
    );
  }

  const inputCls = "input-field";
  const labelCls = "form-label";

  return (
    <>
      <SeoHead title="Cart, xenios research" description="Research and consumer items check out separately, with separate review and separate rules." path="/research/cart" />
      <PageIntro eyebrow="Cart" title="Two lanes. Two carts. No mixing." />

      <section className="container-x pb-16">
        <div className="flex gap-3 mb-6" role="tablist" aria-label="Cart lane">
          {(["research", "consumer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={lane === value}
              onClick={() => setLane(value)}
              className={`chip ${lane === value ? "bg-ink text-paper" : "text-ink-2"}`}
              data-testid={`tab-lane-${value}`}
            >
              {value === "research" ? `Research cart (${cart.laneItems("research").length})` : `Consumer bag (${cart.laneItems("consumer").length})`}
            </button>
          ))}
        </div>

        <div className="card bg-paper-2 mb-8">
          <p className="body-s text-ink-2">
            {lane === "research"
              ? "Research products check out separately and require account, intended-use, destination, product, and order review."
              : "Programs and supplements are consumer offerings. They do not include research products or medical care."}
          </p>
        </div>

        {!laneEnabled && (
          <div className="card mb-8" style={{ borderColor: "var(--ink)" }}>
            <p className="mono-cap text-ink-mute mb-2">Ordering is not open</p>
            <p className="body-s text-ink-2">
              Commerce for this catalog is disabled while processor, supplier, quality, legal, and state review are completed. You can review products and request access, but no order can be placed.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-10 items-start">
          <div>
            {!items.length ? (
              <div className="card">
                <h2 className="h3 mb-2">This {lane === "research" ? "research cart" : "consumer bag"} is empty.</h2>
                <p className="body-s text-ink-mute mb-6">Explore the catalog to add products.</p>
                <Link href="/research/shop" className="btn btn-primary">Browse the catalog</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map(({ product, quantity }) => (
                  <div key={product.slug} className="card flex flex-wrap items-center justify-between gap-4" data-testid={`row-cart-${product.slug}`}>
                    <div>
                      <Link href={`/research/products/${product.slug}`} className="body-m font-700 hover:text-pulse transition-colors">
                        {product.name}
                      </Link>
                      <p className="body-s text-ink-mute mt-1 tabular">{formatMoney(product.priceCents)}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button type="button" aria-label="Decrease quantity" className="btn btn-secondary" style={{ height: 36, padding: "0 10px", minWidth: 0 }} onClick={() => cart.setQuantity(product.slug, quantity - 1)}>
                          <Minus size={14} aria-hidden="true" />
                        </button>
                        <span className="tabular body-m" style={{ minWidth: 24, textAlign: "center" }}>{quantity}</span>
                        <button type="button" aria-label="Increase quantity" className="btn btn-secondary" style={{ height: 36, padding: "0 10px", minWidth: 0 }} onClick={() => cart.setQuantity(product.slug, quantity + 1)}>
                          <Plus size={14} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Remove item" className="btn btn-ghost" style={{ height: 36, padding: "0 8px" }} onClick={() => cart.removeItem(product.slug)}>
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <p className="body-m font-700 tabular">{formatMoney((product.priceCents || 0) * quantity)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="card">
            <p className="mono-cap text-ink-mute mb-2">{lane === "research" ? "Research order request" : "Consumer checkout request"}</p>
            <h2 className="h3 mb-4">Order summary</h2>
            <div className="rule-top pt-4 flex items-center justify-between gap-4">
              <span className="body-s text-ink-mute">Estimated product total</span>
              <strong className="tabular">{formatMoney(total)}</strong>
            </div>
            <p className="body-s text-ink-mute mt-3">
              Taxes, shipping, review, final pricing, and payment are handled by the configured commerce provider or manual order workflow. Totals are recomputed by the server.
            </p>

            {items.length > 0 && laneEnabled && (
              <form onSubmit={onSubmit} className="mt-6 space-y-4" data-testid="form-order-request">
                <div>
                  <label htmlFor="or-name" className={labelCls}>Full name</label>
                  <input id="or-name" className={inputCls} value={customer.name} onChange={(e) => updateCustomer("name", e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="or-email" className={labelCls}>Email</label>
                  <input id="or-email" type="email" className={inputCls} value={customer.email} onChange={(e) => updateCustomer("email", e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="or-phone" className={labelCls}>Phone (optional)</label>
                  <input id="or-phone" className={inputCls} value={customer.phone} onChange={(e) => updateCustomer("phone", e.target.value)} />
                </div>
                {lane === "research" && (
                  <div>
                    <label htmlFor="or-org" className={labelCls}>Organization or independent research role</label>
                    <input id="or-org" className={inputCls} value={customer.organization} onChange={(e) => updateCustomer("organization", e.target.value)} />
                  </div>
                )}
                <div>
                  <label htmlFor="or-address1" className={labelCls}>Address</label>
                  <input id="or-address1" className={inputCls} value={customer.address1} onChange={(e) => updateCustomer("address1", e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="or-address2" className={labelCls}>Address line 2 (optional)</label>
                  <input id="or-address2" className={inputCls} value={customer.address2} onChange={(e) => updateCustomer("address2", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="or-city" className={labelCls}>City</label>
                    <input id="or-city" className={inputCls} value={customer.city} onChange={(e) => updateCustomer("city", e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="or-state" className={labelCls}>State</label>
                    <input id="or-state" className={inputCls} value={customer.state} onChange={(e) => updateCustomer("state", e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="or-postal" className={labelCls}>Postal code</label>
                    <input id="or-postal" className={inputCls} value={customer.postalCode} onChange={(e) => updateCustomer("postalCode", e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="or-country" className={labelCls}>Country</label>
                    <input id="or-country" className={inputCls} value={customer.country} onChange={(e) => updateCustomer("country", e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label htmlFor="or-notes" className={labelCls}>Notes</label>
                  <textarea
                    id="or-notes"
                    className={`${inputCls} textarea-field`}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lane === "research" ? "Describe the legitimate nonclinical research or purchasing context. Do not provide a personal health goal." : "Optional order notes"}
                  />
                </div>
                {lane === "research" && (
                  <label className="flex items-start gap-3 cursor-pointer text-ink-2">
                    <input
                      type="checkbox"
                      checked={researchAttestation}
                      onChange={(e) => setResearchAttestation(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-[var(--pulse)]"
                      required
                      data-testid="checkbox-research-attestation"
                    />
                    <span className="body-s">
                      I certify this order is solely for legitimate nonclinical research and will not be used, administered, or distributed for human or veterinary use.
                    </span>
                  </label>
                )}
                {status.type === "error" && (
                  <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-order-error">
                    {status.message}
                  </p>
                )}
                <button type="submit" disabled={status.type === "loading"} className="btn btn-primary w-full" data-testid="button-submit-order">
                  {status.type === "loading" ? "Submitting" : "Submit order request"}
                </button>
              </form>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
