import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AssistedOrderAddressInput,
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderSubmitInput,
  AssistedOrderWorkflowMode,
} from "../../../../shared/research/assisted-order/contract";
import {
  AssistedOrderApiError,
  loadAssistedOrderCatalog,
  loadAssistedOrderConfig,
  submitAssistedOrder,
} from "./api";
import {
  acceptedAgreements,
  addOrUpdateSelection,
  agreementRequirementKey,
  catalogItemKey,
  money,
  removeSelection,
  selectionEstimateCents,
  selectionsToLines,
  submissionBlocked,
  type AssistedOrderAgreementRequirement,
  type AssistedOrderSelectionMap,
} from "./wizard-state";
import { storeAssistedOrderReceipt } from "./storage";
import "./assisted-order.css";

type Step = "contact" | "products" | "review";

// The required-acknowledgment set, published by the server. The wizard never
// falls back to a built-in list: until this is "ready", submission is refused.
type ConfigState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      kind: "ready";
      requirements: readonly AssistedOrderAgreementRequirement[];
    }>;

type ContactState = Readonly<{
  fullLegalName: string;
  email: string;
  mobilePhone: string;
  organizationName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  billingSameAsShipping: boolean;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingRegion: string;
  billingPostalCode: string;
  billingCountryCode: string;
  ageConfirmed: boolean;
}>;

const initialContact: ContactState = Object.freeze({
  fullLegalName: "",
  email: "",
  mobilePhone: "",
  organizationName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "US",
  billingSameAsShipping: true,
  billingLine1: "",
  billingLine2: "",
  billingCity: "",
  billingRegion: "",
  billingPostalCode: "",
  billingCountryCode: "US",
  ageConfirmed: false,
});

const workflowLabels: Readonly<Record<AssistedOrderWorkflowMode, string>> = {
  direct_order_request: "Order request",
  provider_request: "Provider workflow",
  request_pricing: "Request pricing",
  request_activation: "Request activation",
  availability_review: "Availability review",
};

function addressFromContact(contact: ContactState): AssistedOrderAddressInput {
  return {
    line1: contact.line1,
    line2: contact.line2 || undefined,
    city: contact.city,
    region: contact.region,
    postalCode: contact.postalCode,
    countryCode: contact.countryCode,
  };
}

function billingFromContact(contact: ContactState): AssistedOrderAddressInput {
  if (contact.billingSameAsShipping) {
    return addressFromContact(contact);
  }
  return {
    line1: contact.billingLine1,
    line2: contact.billingLine2 || undefined,
    city: contact.billingCity,
    region: contact.billingRegion,
    postalCode: contact.billingPostalCode,
    countryCode: contact.billingCountryCode,
  };
}

function newIdempotencyKey(): string {
  const key = globalThis.crypto?.randomUUID?.();
  return key ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initialQuantity(item: AssistedOrderCatalogItem): number {
  return item.minimumQuantity;
}

function nextQuantity(item: AssistedOrderCatalogItem, current: number): number {
  const next = current + item.quantityIncrement;
  if (item.maximumQuantity !== null && next > item.maximumQuantity) {
    return current;
  }
  return next;
}

function previousQuantity(item: AssistedOrderCatalogItem, current: number): number {
  return Math.max(item.minimumQuantity, current - item.quantityIncrement);
}

function ProductCard(props: {
  item: AssistedOrderCatalogItem;
  selection: { quantity: number } | undefined;
  onAdd: (item: AssistedOrderCatalogItem) => void;
  onQuantity: (item: AssistedOrderCatalogItem, quantity: number) => void;
  onRemove: (item: AssistedOrderCatalogItem) => void;
}) {
  const { item, selection, onAdd, onQuantity, onRemove } = props;
  return (
    <article className="xenios-order-card">
      <div className="xenios-order-card__header">
        <div>
          <p className="xenios-order-eyebrow">{item.family}</p>
          <h3>{item.productName}</h3>
        </div>
        <span className={`xenios-order-mode xenios-order-mode--${item.workflowMode}`}>
          {workflowLabels[item.workflowMode]}
        </span>
      </div>
      <dl className="xenios-order-facts">
        {item.specification ? (
          <div><dt>Specification</dt><dd>{item.specification}</dd></div>
        ) : null}
        {item.format ? <div><dt>Format</dt><dd>{item.format}</dd></div> : null}
        {item.packBasis ? <div><dt>Basis</dt><dd>{item.packBasis}</dd></div> : null}
        <div><dt>Minimum</dt><dd>{item.minimumQuantity}</dd></div>
        <div><dt>Price</dt><dd>{money(item.unitPriceCents)}</dd></div>
      </dl>
      {item.researchUseOnly ? (
        <p className="xenios-order-notice"><strong>Research Use Only.</strong> Not for human or veterinary use.</p>
      ) : null}
      {item.accessNotice ? <p className="xenios-order-notice">{item.accessNotice}</p> : null}
      {selection ? (
        <div className="xenios-order-quantity" aria-label={`Quantity for ${item.productName}`}>
          <button type="button" onClick={() => onQuantity(item, previousQuantity(item, selection.quantity))} aria-label="Decrease quantity">−</button>
          <output aria-live="polite">{selection.quantity}</output>
          <button type="button" onClick={() => onQuantity(item, nextQuantity(item, selection.quantity))} aria-label="Increase quantity">+</button>
          <button className="xenios-order-link" type="button" onClick={() => onRemove(item)}>Remove</button>
        </div>
      ) : (
        <button className="xenios-order-button" type="button" onClick={() => onAdd(item)}>
          {item.actionLabel}
        </button>
      )}
    </article>
  );
}

export function AssistedOrderPage() {
  const [step, setStep] = useState<Step>("contact");
  const [contact, setContact] = useState<ContactState>(initialContact);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [channel, setChannel] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"" | AssistedOrderWorkflowMode>("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<AssistedOrderCatalogPage | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selections, setSelections] = useState<AssistedOrderSelectionMap>(new Map());
  const [generalNotes, setGeneralNotes] = useState("");
  const [config, setConfig] = useState<ConfigState>({ kind: "loading" });
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // The wizard fetches its configuration at start. Nothing is acknowledged by
  // default, and a set that fails to load leaves submission refused with a
  // readable retry state.
  const loadConfig = useCallback(() => {
    setConfig({ kind: "loading" });
    loadAssistedOrderConfig()
      .then((requirements) => setConfig({ kind: "ready", requirements }))
      .catch((reason) =>
        setConfig({
          kind: "error",
          message:
            reason instanceof Error
              ? reason.message
              : "The required acknowledgments could not be loaded. Please retry before submitting.",
        }),
      );
  }, []);

  useEffect(loadConfig, [loadConfig]);

  useEffect(() => {
    if (step === "contact") return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      setError(null);
      loadAssistedOrderCatalog({
        search: search || undefined,
        family: family || undefined,
        channel: channel || undefined,
        workflowMode: workflowMode || undefined,
        page,
        pageSize: 24,
      })
        .then((result) => setCatalog(result))
        .catch((reason) => {
          if (!abort.signal.aborted) {
            setError(reason instanceof Error ? reason.message : "The catalog could not be loaded.");
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setCatalogLoading(false);
        });
    }, 200);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [step, search, family, channel, workflowMode, page]);

  const selectionList = useMemo(() => Array.from(selections.values()), [selections]);
  const estimate = useMemo(() => selectionEstimateCents(selections), [selections]);
  const requirements = config.kind === "ready" ? config.requirements : null;
  const acknowledgmentsIncomplete = submissionBlocked(requirements, acknowledged);

  const toggleAcknowledgment = (key: string, checked: boolean) => {
    setAcknowledged((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const setContactField = <K extends keyof ContactState>(key: K, value: ContactState[K]) => {
    setContact((previous) => ({ ...previous, [key]: value }));
  };

  const addItem = (item: AssistedOrderCatalogItem) => {
    setSelections((current) => addOrUpdateSelection(current, item, initialQuantity(item)));
  };

  const setQuantity = (item: AssistedOrderCatalogItem, quantity: number) => {
    setSelections((current) => addOrUpdateSelection(current, item, quantity));
  };

  const removeItem = (item: AssistedOrderCatalogItem) => {
    setSelections((current) => removeSelection(current, item));
  };

  const validateContact = (): boolean => {
    const required = [
      contact.fullLegalName,
      contact.email,
      contact.mobilePhone,
      contact.line1,
      contact.city,
      contact.region,
      contact.postalCode,
      contact.countryCode,
    ];
    if (required.some((value) => value.trim().length === 0)) {
      setError("Complete all required contact and shipping fields.");
      return false;
    }
    if (!contact.email.includes("@")) {
      setError("Enter a valid email address.");
      return false;
    }
    if (!contact.ageConfirmed) {
      setError("Age confirmation is required.");
      return false;
    }
    if (!contact.billingSameAsShipping) {
      const billing = [
        contact.billingLine1,
        contact.billingCity,
        contact.billingRegion,
        contact.billingPostalCode,
        contact.billingCountryCode,
      ];
      if (billing.some((value) => value.trim().length === 0)) {
        setError("Complete the billing address or choose same as shipping.");
        return false;
      }
    }
    return true;
  };

  const continueFromContact = () => {
    setError(null);
    if (validateContact()) setStep("products");
  };

  const continueFromProducts = () => {
    setError(null);
    if (selections.size === 0) {
      setError("Select at least one product or request item.");
      return;
    }
    setStep("review");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    // Fail closed: no server-supplied agreement set, no submission. The set is
    // never substituted with a built-in list.
    if (config.kind !== "ready") {
      setError(
        config.kind === "error"
          ? config.message
          : "The required acknowledgments are still loading. Please wait a moment.",
      );
      return;
    }
    if (submissionBlocked(config.requirements, acknowledged)) {
      setError("Complete the required acknowledgments before submitting.");
      return;
    }
    const agreements = acceptedAgreements(
      config.requirements,
      new Date().toISOString(),
    );
    const input: AssistedOrderSubmitInput = {
      idempotencyKey,
      contact: {
        fullLegalName: contact.fullLegalName,
        email: contact.email,
        mobilePhone: contact.mobilePhone,
        organizationName: contact.organizationName || undefined,
        ageConfirmed: true,
        shippingAddress: addressFromContact(contact),
        billingSameAsShipping: contact.billingSameAsShipping,
        billingAddress: billingFromContact(contact),
      },
      agreements,
      lines: selectionsToLines(selections),
      generalNotes: generalNotes || undefined,
    };
    setSubmitting(true);
    try {
      const receipt = await submitAssistedOrder(input);
      // The status token is stored only under its own key; the receipt JSON
      // is stripped of it before storage.
      storeAssistedOrderReceipt(receipt);
      setIdempotencyKey(newIdempotencyKey());
      window.location.assign(
        `/research/early-access/order-request/confirmation?reference=${encodeURIComponent(
          receipt.publicReference,
        )}`,
      );
    } catch (reason) {
      if (reason instanceof AssistedOrderApiError) {
        setError(reason.message);
        setFieldError(reason.field ?? null);
      } else {
        setError(reason instanceof Error ? reason.message : "The request could not be submitted.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="xenios-order-page">
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Private Early Access</p>
        <h1>Place an Early Access order request</h1>
        <p>
          Select the products you are interested in. Xenios will review availability,
          pricing, documentation requirements, and the correct pathway before accepting
          an order.
        </p>
      </header>

      <nav className="xenios-order-steps" aria-label="Order request progress">
        {(["contact", "products", "review"] as const).map((value, index) => (
          <button
            key={value}
            type="button"
            className={step === value ? "is-active" : ""}
            onClick={() => {
              if (value === "contact") setStep(value);
              if (value === "products" && validateContact()) setStep(value);
              if (value === "review" && validateContact() && selections.size > 0) setStep(value);
            }}
          >
            <span>{index + 1}</span>
            {value === "contact" ? "Your information" : value === "products" ? "Products" : "Review"}
          </button>
        ))}
      </nav>

      {error ? <div className="xenios-order-error" role="alert">{error}{fieldError ? ` (${fieldError})` : ""}</div> : null}

      {step === "contact" ? (
        <section className="xenios-order-panel">
          <h2>Your information</h2>
          <div className="xenios-order-grid">
            <label>Full legal name<input value={contact.fullLegalName} onChange={(e) => setContactField("fullLegalName", e.target.value)} autoComplete="name" required /></label>
            <label>Email<input type="email" value={contact.email} onChange={(e) => setContactField("email", e.target.value)} autoComplete="email" required /></label>
            <label>Mobile phone<input type="tel" value={contact.mobilePhone} onChange={(e) => setContactField("mobilePhone", e.target.value)} autoComplete="tel" required /></label>
            <label>Organization, optional<input value={contact.organizationName} onChange={(e) => setContactField("organizationName", e.target.value)} autoComplete="organization" /></label>
          </div>
          <h3>Shipping address</h3>
          <div className="xenios-order-grid">
            <label className="is-wide">Address line 1<input value={contact.line1} onChange={(e) => setContactField("line1", e.target.value)} autoComplete="shipping address-line1" required /></label>
            <label className="is-wide">Address line 2, optional<input value={contact.line2} onChange={(e) => setContactField("line2", e.target.value)} autoComplete="shipping address-line2" /></label>
            <label>City<input value={contact.city} onChange={(e) => setContactField("city", e.target.value)} autoComplete="shipping address-level2" required /></label>
            <label>State or region<input value={contact.region} onChange={(e) => setContactField("region", e.target.value)} autoComplete="shipping address-level1" required /></label>
            <label>Postal code<input value={contact.postalCode} onChange={(e) => setContactField("postalCode", e.target.value)} autoComplete="shipping postal-code" required /></label>
            <label>Country code<input maxLength={2} value={contact.countryCode} onChange={(e) => setContactField("countryCode", e.target.value.toUpperCase())} autoComplete="shipping country" required /></label>
          </div>
          <label className="xenios-order-check"><input type="checkbox" checked={contact.billingSameAsShipping} onChange={(e) => setContactField("billingSameAsShipping", e.target.checked)} /> Billing address is the same as shipping</label>
          {!contact.billingSameAsShipping ? (
            <div className="xenios-order-grid">
              <label className="is-wide">Billing address line 1<input value={contact.billingLine1} onChange={(e) => setContactField("billingLine1", e.target.value)} /></label>
              <label className="is-wide">Billing address line 2<input value={contact.billingLine2} onChange={(e) => setContactField("billingLine2", e.target.value)} /></label>
              <label>Billing city<input value={contact.billingCity} onChange={(e) => setContactField("billingCity", e.target.value)} /></label>
              <label>Billing state<input value={contact.billingRegion} onChange={(e) => setContactField("billingRegion", e.target.value)} /></label>
              <label>Billing postal code<input value={contact.billingPostalCode} onChange={(e) => setContactField("billingPostalCode", e.target.value)} /></label>
              <label>Billing country code<input maxLength={2} value={contact.billingCountryCode} onChange={(e) => setContactField("billingCountryCode", e.target.value.toUpperCase())} /></label>
            </div>
          ) : null}
          <label className="xenios-order-check"><input type="checkbox" checked={contact.ageConfirmed} onChange={(e) => setContactField("ageConfirmed", e.target.checked)} /> I confirm that I am at least 18 years old.</label>
          <div className="xenios-order-actions"><button className="xenios-order-button" type="button" onClick={continueFromContact}>Continue to products</button></div>
        </section>
      ) : null}

      {step === "products" ? (
        <section className="xenios-order-catalog-layout">
          <div>
            <div className="xenios-order-panel xenios-order-filters">
              <label>Search<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Product or specification" /></label>
              <label>Family<select value={family} onChange={(e) => { setFamily(e.target.value); setPage(1); }}><option value="">All families</option>{catalog?.families.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Channel<select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}><option value="">All channels</option>{catalog?.channels.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Action<select value={workflowMode} onChange={(e) => { setWorkflowMode(e.target.value as "" | AssistedOrderWorkflowMode); setPage(1); }}><option value="">All actions</option>{Object.entries(workflowLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            {catalogLoading ? <p className="xenios-order-loading" aria-live="polite">Loading catalog…</p> : null}
            <div className="xenios-order-cards">
              {catalog?.items.map((item) => {
                const selection = selections.get(catalogItemKey(item));
                return <ProductCard key={catalogItemKey(item)} item={item} selection={selection} onAdd={addItem} onQuantity={setQuantity} onRemove={removeItem} />;
              })}
            </div>
            {catalog && catalog.total === 0 ? <p className="xenios-order-empty">No products match those filters.</p> : null}
            {catalog && catalog.total > catalog.pageSize ? (
              <div className="xenios-order-pagination">
                <button type="button" disabled={catalog.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                <span>Page {catalog.page} of {Math.ceil(catalog.total / catalog.pageSize)}</span>
                <button type="button" disabled={catalog.page >= Math.ceil(catalog.total / catalog.pageSize)} onClick={() => setPage((value) => value + 1)}>Next</button>
              </div>
            ) : null}
          </div>
          <aside className="xenios-order-summary">
            <h2>Your request</h2>
            {selectionList.length === 0 ? <p>No products selected yet.</p> : (
              <ul>{selectionList.map((selection) => <li key={catalogItemKey(selection.item)}><div><strong>{selection.item.productName}</strong><span>{selection.item.specification}</span></div><span>{selection.quantity} × {money(selection.item.unitPriceCents)}</span></li>)}</ul>
            )}
            <div className="xenios-order-total"><span>Estimated priced total</span><strong>{money(estimate)}</strong></div>
            <p className="xenios-order-small">Final availability, pricing, documentation, and pathway are confirmed by Xenios before fulfillment.</p>
            <div className="xenios-order-actions"><button type="button" onClick={() => setStep("contact")}>Back</button><button className="xenios-order-button" type="button" onClick={continueFromProducts}>Review request</button></div>
          </aside>
        </section>
      ) : null}

      {step === "review" ? (
        <form className="xenios-order-panel" onSubmit={submit}>
          <h2>Review your request</h2>
          <div className="xenios-order-review-contact"><div><strong>{contact.fullLegalName}</strong><span>{contact.email}</span><span>{contact.mobilePhone}</span></div><div><span>{contact.line1}</span><span>{contact.city}, {contact.region} {contact.postalCode}</span><span>{contact.countryCode}</span></div></div>
          <div className="xenios-order-review-lines">
            {selectionList.map((selection) => (
              <article key={catalogItemKey(selection.item)}>
                <div><strong>{selection.item.productName}</strong><span>{selection.item.specification}</span><span>{workflowLabels[selection.item.workflowMode]}</span></div>
                <div><span>Qty {selection.quantity}</span><strong>{selection.item.unitPriceCents === null ? "Price pending" : money(selection.item.unitPriceCents * selection.quantity)}</strong></div>
              </article>
            ))}
          </div>
          <div className="xenios-order-total"><span>Estimated priced total</span><strong>{money(estimate)}</strong></div>
          <label>Additional notes, optional<textarea maxLength={2000} value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={4} /></label>
          <fieldset className="xenios-order-acknowledgments">
            <legend>Required acknowledgments</legend>
            {config.kind === "loading" ? (
              <p className="xenios-order-loading" aria-live="polite">
                Loading the required acknowledgments…
              </p>
            ) : null}
            {config.kind === "error" ? (
              <div className="xenios-order-error" role="alert">
                <p>{config.message}</p>
                <button type="button" onClick={loadConfig}>
                  Retry loading acknowledgments
                </button>
              </div>
            ) : null}
            {config.kind === "ready"
              ? config.requirements.map((requirement) => {
                  const key = agreementRequirementKey(requirement);
                  return (
                    <label className="xenios-order-check" key={key}>
                      <input
                        type="checkbox"
                        checked={acknowledged.has(key)}
                        onChange={(e) => toggleAcknowledgment(key, e.target.checked)}
                      />{" "}
                      {requirement.label}{" "}
                      <small className="xenios-order-small">Version {requirement.version}</small>
                    </label>
                  );
                })
              : null}
          </fieldset>
          <div className="xenios-order-actions"><button type="button" onClick={() => setStep("products")}>Back to products</button><button className="xenios-order-button" type="submit" disabled={submitting || config.kind !== "ready" || acknowledgmentsIncomplete}>{submitting ? "Submitting…" : "Submit order request"}</button></div>
        </form>
      ) : null}
    </div>
  );
}
