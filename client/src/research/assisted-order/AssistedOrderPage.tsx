import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
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
  clampQuantity,
  money,
  removeSelection,
  requiredAcknowledgmentEntries,
  selectableInResearchRequest,
  selectionEstimateCents,
  selectionsIncludeResearchUseOnly,
  selectionsToLines,
  submissionBlocked,
  type AssistedOrderSelectionMap,
  type AssistedOrderWizardConfig,
} from "./wizard-state";
import {
  clearAssistedOrderDraft,
  draftSelectionMap,
  readAssistedOrderDraft,
  storeAssistedOrderDraft,
  type AssistedOrderWizardStep,
} from "./draft-store";
import { refreshSelectionSnapshots } from "./selection-refresh";
import { storeAssistedOrderReceipt } from "./storage";
import "./assisted-order.css";

// The full acknowledgment surface, published by the server. The wizard never
// falls back to a built-in list: until this is "ready", submission is refused.
type ConfigState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; config: AssistedOrderWizardConfig }>;

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

// Contact details deliberately live only in memory: the draft store persists
// selections and the idempotency key across a session bounce, never PII.
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
  provider_request: "Care pathway",
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

function ProductCard(props: {
  item: AssistedOrderCatalogItem;
  selection: { quantity: number } | undefined;
  onAdd: (item: AssistedOrderCatalogItem) => void;
  onQuantity: (item: AssistedOrderCatalogItem, quantity: number) => void;
  onRemove: (item: AssistedOrderCatalogItem) => void;
}) {
  const { item, selection, onAdd, onQuantity, onRemove } = props;
  const selectable = selectableInResearchRequest(item);
  return (
    <article className="xenios-order-card" data-testid={`order-card-${item.variantId}`}>
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
        {item.minimumQuantity > 1 ? (
          <div><dt>Minimum</dt><dd>{item.minimumQuantity}</dd></div>
        ) : null}
        <div><dt>Price</dt><dd>{money(item.unitPriceCents)}</dd></div>
      </dl>
      {item.researchUseOnly ? (
        <p className="xenios-order-notice"><strong>Research Use Only.</strong> Not for human or veterinary use.</p>
      ) : null}
      {item.accessNotice ? <p className="xenios-order-notice">{item.accessNotice}</p> : null}
      {!selectable ? (
        <p className="xenios-order-notice" data-testid={`order-card-care-${item.variantId}`}>
          This product requires provider review through Xenios Care and cannot
          be added to a research order request.
        </p>
      ) : selection ? (
        <div className="xenios-order-quantity" aria-label={`Quantity for ${item.productName}`}>
          <button type="button" onClick={() => onQuantity(item, selection.quantity - item.quantityIncrement)} aria-label="Decrease quantity">−</button>
          <input
            type="number"
            inputMode="numeric"
            min={item.minimumQuantity}
            max={item.maximumQuantity ?? undefined}
            step={item.quantityIncrement}
            value={selection.quantity}
            aria-label={`Quantity for ${item.productName}`}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) onQuantity(item, value);
            }}
            style={{ width: 72, textAlign: "center" }}
          />
          <button type="button" onClick={() => onQuantity(item, selection.quantity + item.quantityIncrement)} aria-label="Increase quantity">+</button>
          <button className="xenios-order-link" type="button" onClick={() => onRemove(item)}>Remove</button>
        </div>
      ) : (
        <button
          className="xenios-order-button"
          type="button"
          data-testid={`order-card-add-${item.variantId}`}
          onClick={() => onAdd(item)}
        >
          {item.actionLabel}
        </button>
      )}
    </article>
  );
}

export function AssistedOrderPage() {
  // A draft persisted before a session bounce restores the basket and the
  // idempotency key, so the resumed submission replays as the SAME request.
  // Contact details are never persisted, so a restored wizard can resume at
  // products or contact, never directly at review.
  const [draft] = useState(() => readAssistedOrderDraft());
  const [step, setStep] = useState<AssistedOrderWizardStep>(() => {
    if (!draft || draft.selections.length === 0) return "products";
    return draft.step === "products" ? "products" : "contact";
  });
  const [selections, setSelections] = useState<AssistedOrderSelectionMap>(() =>
    draft ? draftSelectionMap(draft) : new Map(),
  );
  const [generalNotes, setGeneralNotes] = useState(() => draft?.generalNotes ?? "");
  // The OPTIONAL affiliate code, typed by the customer. Seeded from ?ref= as a
  // convenience only: the verified referral cookie remains the authority, this
  // is a claim, and the two are stored as separate facts. Whatever lands here
  // grants nothing — it cannot change a price, a pathway, a payment or a
  // permission — so accepting it from the browser is safe by construction.
  const [affiliateCode, setAffiliateCode] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return new URLSearchParams(window.location.search).get("ref")?.slice(0, 40) ?? "";
    } catch {
      return "";
    }
  });
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => draft?.idempotencyKey ?? newIdempotencyKey(),
  );
  const [contact, setContact] = useState<ContactState>(initialContact);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [channel, setChannel] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"" | AssistedOrderWorkflowMode>("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<AssistedOrderCatalogPage | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [config, setConfig] = useState<ConfigState>({ kind: "loading" });
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshedDraft = useRef(false);
  const [, navigate] = useLocation();

  const loadConfig = useCallback(() => {
    setConfig({ kind: "loading" });
    loadAssistedOrderConfig()
      .then((value) => setConfig({ kind: "ready", config: value }))
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

  // Every meaningful wizard change is written through to the draft store, so
  // a session expiry or re-unlock costs the customer nothing but their
  // contact fields.
  useEffect(() => {
    storeAssistedOrderDraft({ idempotencyKey, step, selections, generalNotes });
  }, [idempotencyKey, step, selections, generalNotes]);

  // A restored draft carries yesterday's snapshots. Re-resolve them once
  // against the live catalog so the customer reviews CURRENT server values;
  // anything that no longer resolves is removed and said out loud.
  useEffect(() => {
    if (refreshedDraft.current || !draft || draft.selections.length === 0) return;
    refreshedDraft.current = true;
    refreshSelectionSnapshots(draftSelectionMap(draft))
      .then((result) => {
        setSelections(result.selections);
        if (result.missing.length > 0) {
          setNotice(
            `No longer available and removed from your request: ${result.missing.join(", ")}.`,
          );
        }
      })
      .catch(() => {
        // The stored snapshot still renders; the server re-prices at submit.
      });
  }, [draft]);

  useEffect(() => {
    if (step !== "products") return;
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
        .then((result) => {
          if (abort.signal.aborted) return;
          setCatalog(result);
          // Any selection visible on this fresh page adopts the fresh
          // snapshot, so displayed prices heal while the customer browses.
          setSelections((current) => {
            let next = current;
            for (const item of result.items) {
              const existing = current.get(catalogItemKey(item));
              if (existing) {
                next = addOrUpdateSelection(
                  next,
                  item,
                  clampQuantity(item, existing.quantity),
                  existing.notes,
                );
              }
            }
            return next;
          });
        })
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
  const includesRuo = useMemo(
    () => selectionsIncludeResearchUseOnly(selections),
    [selections],
  );
  // The exact set THIS request must carry: every legal pair, plus each form
  // fact whose scope applies (the RUO confirmation only when an RUO line is
  // actually in the basket — mirroring what the server will verify).
  const requirements = useMemo(
    () =>
      config.kind === "ready"
        ? requiredAcknowledgmentEntries(config.config, includesRuo)
        : null,
    [config, includesRuo],
  );
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
    if (!selectableInResearchRequest(item)) return;
    setSelections((current) => addOrUpdateSelection(current, item, item.minimumQuantity));
  };

  const setQuantity = (item: AssistedOrderCatalogItem, quantity: number) => {
    setSelections((current) => {
      const existing = current.get(catalogItemKey(item));
      return addOrUpdateSelection(
        current,
        item,
        clampQuantity(item, quantity),
        existing?.notes ?? "",
      );
    });
  };

  const setLineNotes = (item: AssistedOrderCatalogItem, notes: string) => {
    setSelections((current) => {
      const existing = current.get(catalogItemKey(item));
      if (!existing) return current;
      return addOrUpdateSelection(current, existing.item, existing.quantity, notes);
    });
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

  const continueFromProducts = () => {
    setError(null);
    if (selections.size === 0) {
      setError("Select at least one product.");
      return;
    }
    setStep("contact");
    window.scrollTo({ top: 0 });
  };

  const continueFromContact = () => {
    setError(null);
    if (validateContact()) {
      setStep("review");
      window.scrollTo({ top: 0 });
    }
  };

  // Pricing or availability moved between review and submission. Re-resolve
  // every selection against the live catalog and keep the customer on review:
  // the request now carries current server values and they decide again.
  const recoverFromDrift = async (message: string) => {
    try {
      const result = await refreshSelectionSnapshots(selections);
      setSelections(result.selections);
      const removed =
        result.missing.length > 0
          ? ` No longer available and removed: ${result.missing.join(", ")}.`
          : "";
      setNotice(`${message}${removed} Please review the updated request and submit again.`);
    } catch {
      setNotice(`${message} Please go back to products, review current values, and submit again.`);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    setNotice(null);
    // Fail closed: no server-supplied acknowledgment set, no submission.
    if (config.kind !== "ready" || requirements === null) {
      setError(
        config.kind === "error"
          ? config.message
          : "The required acknowledgments are still loading. Please wait a moment.",
      );
      return;
    }
    if (submissionBlocked(requirements, acknowledged)) {
      setError("Complete the required acknowledgments before submitting.");
      return;
    }
    if (selections.size === 0) {
      setError("Select at least one product.");
      return;
    }
    const agreements = acceptedAgreements(requirements, new Date().toISOString());
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
      declaredAffiliateCode: affiliateCode.trim() || undefined,
    };
    setSubmitting(true);
    try {
      const receipt = await submitAssistedOrder(input);
      // The status token is stored only under its own key; the receipt JSON
      // is stripped of it before storage.
      storeAssistedOrderReceipt(receipt);
      clearAssistedOrderDraft();
      navigate(
        `/research/early-access/order-request/confirmation/${encodeURIComponent(
          receipt.publicReference,
        )}`,
      );
    } catch (reason) {
      if (reason instanceof AssistedOrderApiError) {
        if (reason.code === "price_changed" || reason.code === "catalog_changed") {
          await recoverFromDrift(
            "Pricing or availability changed while you were reviewing, so nothing was submitted.",
          );
        } else if (reason.code === "idempotency_conflict") {
          // The key was already used for a DIFFERENT request. This edited
          // submission is genuinely new, so it gets a fresh key; nothing
          // was created by this attempt.
          setIdempotencyKey(newIdempotencyKey());
          setNotice(
            "Your earlier request with these details was already received in a different form. Press Submit again to send this version as a new request.",
          );
        } else {
          setError(reason.message);
          setFieldError(reason.field ?? null);
        }
      } else {
        setError(reason instanceof Error ? reason.message : "The request could not be submitted.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex: Record<AssistedOrderWizardStep, number> = {
    products: 0,
    contact: 1,
    review: 2,
  };

  return (
    <div className="xenios-order-page">
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Private Early Access</p>
        <h1>Request an order</h1>
        <p>
          Choose products and quantities. Xenios confirms availability and
          payment details before fulfillment.
        </p>
      </header>

      <nav className="xenios-order-steps" aria-label="Order request progress">
        {(["products", "contact", "review"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={step === value ? "is-active" : ""}
            data-testid={`order-step-${value}`}
            onClick={() => {
              if (value === "products") setStep(value);
              if (value === "contact" && selections.size > 0) setStep(value);
              if (value === "review" && selections.size > 0 && validateContact()) setStep(value);
            }}
          >
            <span>{stepIndex[value] + 1}</span>
            {value === "products" ? "Products" : value === "contact" ? "Contact and shipping" : "Review and submit"}
          </button>
        ))}
      </nav>

      {error ? <div className="xenios-order-error" role="alert" data-testid="order-error">{error}{fieldError ? ` (${fieldError})` : ""}</div> : null}
      {notice ? <div className="xenios-order-notice" role="status" data-testid="order-notice">{notice}</div> : null}

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
            <div className="xenios-order-total"><span>Estimated priced total</span><strong data-testid="order-estimate">{money(estimate)}</strong></div>
            <p className="xenios-order-small">Estimates only. Xenios confirms availability and payment details before fulfillment.</p>
            <div className="xenios-order-actions"><button className="xenios-order-button" type="button" data-testid="order-continue-contact" onClick={continueFromProducts}>Continue</button></div>
          </aside>
        </section>
      ) : null}

      {step === "contact" ? (
        <section className="xenios-order-panel">
          <h2>Contact and shipping</h2>
          <div className="xenios-order-grid">
            <label>Full legal name<input data-testid="order-contact-name" value={contact.fullLegalName} onChange={(e) => setContactField("fullLegalName", e.target.value)} autoComplete="name" required /></label>
            <label>Email<input data-testid="order-contact-email" type="email" value={contact.email} onChange={(e) => setContactField("email", e.target.value)} autoComplete="email" required /></label>
            <label>Mobile phone<input data-testid="order-contact-phone" type="tel" value={contact.mobilePhone} onChange={(e) => setContactField("mobilePhone", e.target.value)} autoComplete="tel" required /></label>
            <label>Organization, optional<input value={contact.organizationName} onChange={(e) => setContactField("organizationName", e.target.value)} autoComplete="organization" /></label>
          </div>
          <h3>Shipping address</h3>
          <div className="xenios-order-grid">
            <label className="is-wide">Address line 1<input data-testid="order-contact-line1" value={contact.line1} onChange={(e) => setContactField("line1", e.target.value)} autoComplete="shipping address-line1" required /></label>
            <label className="is-wide">Address line 2, optional<input value={contact.line2} onChange={(e) => setContactField("line2", e.target.value)} autoComplete="shipping address-line2" /></label>
            <label>City<input data-testid="order-contact-city" value={contact.city} onChange={(e) => setContactField("city", e.target.value)} autoComplete="shipping address-level2" required /></label>
            <label>State or region<input data-testid="order-contact-region" value={contact.region} onChange={(e) => setContactField("region", e.target.value)} autoComplete="shipping address-level1" required /></label>
            <label>Postal code<input data-testid="order-contact-postal" value={contact.postalCode} onChange={(e) => setContactField("postalCode", e.target.value)} autoComplete="shipping postal-code" required /></label>
            <label>Country code<input data-testid="order-contact-country" maxLength={2} value={contact.countryCode} onChange={(e) => setContactField("countryCode", e.target.value.toUpperCase())} autoComplete="shipping country" required /></label>
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
          <label className="is-wide">
            Affiliate code, optional
            <input
              data-testid="order-affiliate-code"
              value={affiliateCode}
              onChange={(e) => setAffiliateCode(e.target.value)}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              placeholder="If someone referred you"
            />
          </label>
          <label className="xenios-order-check"><input type="checkbox" checked={contact.ageConfirmed} onChange={(e) => setContactField("ageConfirmed", e.target.checked)} data-testid="order-age-confirm" /> I confirm that I am at least 18 years old.</label>
          <div className="xenios-order-actions">
            <button type="button" onClick={() => setStep("products")}>Back</button>
            <button className="xenios-order-button" type="button" data-testid="order-continue-review" onClick={continueFromContact}>Continue</button>
          </div>
        </section>
      ) : null}

      {step === "review" ? (
        <form className="xenios-order-panel" onSubmit={submit}>
          <h2>Review and submit</h2>
          <div className="xenios-order-review-contact"><div><strong>{contact.fullLegalName}</strong><span>{contact.email}</span><span>{contact.mobilePhone}</span></div><div><span>{contact.line1}</span><span>{contact.city}, {contact.region} {contact.postalCode}</span><span>{contact.countryCode}</span></div></div>
          <div className="xenios-order-review-lines">
            {selectionList.map((selection) => (
              <article key={catalogItemKey(selection.item)}>
                <div>
                  <strong>{selection.item.productName}</strong>
                  <span>{selection.item.specification}</span>
                  <span>{workflowLabels[selection.item.workflowMode]}</span>
                  <label>
                    Note for this line, optional
                    <input
                      maxLength={500}
                      value={selection.notes}
                      placeholder="e.g. preferred variant details"
                      onChange={(e) => setLineNotes(selection.item, e.target.value)}
                    />
                  </label>
                </div>
                <div><span>Qty {selection.quantity}</span><strong>{selection.item.unitPriceCents === null ? "Price pending" : money(selection.item.unitPriceCents * selection.quantity)}</strong></div>
              </article>
            ))}
          </div>
          <div className="xenios-order-total"><span>Estimated priced total</span><strong>{money(estimate)}</strong></div>
          <label>Additional notes, optional<textarea maxLength={2000} value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={3} /></label>
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
            {config.kind === "ready" && requirements
              ? requirements.map((requirement) => {
                  const key = agreementRequirementKey(requirement);
                  const isLegal = config.config.legal.some(
                    (entry) => entry.kind === requirement.kind && entry.version === requirement.version,
                  );
                  return (
                    <label className="xenios-order-check" key={key}>
                      <input
                        type="checkbox"
                        checked={acknowledged.has(key)}
                        data-testid={`order-ack-${requirement.kind}`}
                        onChange={(e) => toggleAcknowledgment(key, e.target.checked)}
                      />{" "}
                      {requirement.label}{" "}
                      {isLegal ? (
                        <small className="xenios-order-small">Version {requirement.version}</small>
                      ) : null}
                    </label>
                  );
                })
              : null}
          </fieldset>
          <div className="xenios-order-actions">
            <button type="button" onClick={() => setStep("products")}>Back to products</button>
            <button className="xenios-order-button" type="submit" data-testid="order-submit" disabled={submitting || config.kind !== "ready" || acknowledgmentsIncomplete}>{submitting ? "Submitting…" : "Submit order request"}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
