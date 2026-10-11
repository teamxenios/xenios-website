import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import PublicShell from "@/clarity/PublicShell";
import { AFFILIATION_OPTIONS, SOURCE_OPTIONS, US_REGIONS, WORKFLOW_LABELS, formSubmission, itemKey, money,
  parseCatalog, parseConfig, parseReceipt, serverFieldErrors, validateForm, type CatalogPage, type Config, type FieldErrors,
  type Receipt, type SelectedItem, type Submission } from "./contracts";
import "./quick-order.css";

export type QuickOrderTransport = (url: string, init: RequestInit) => Promise<Response>;
const sameOriginTransport: QuickOrderTransport = (url, init) => fetch(url, init);
const API = "/api/health/quick-order";
export interface QuickOrderProps {
  /** Stable, non-secret account + auth-boundary identity. Rotate on logout/account change,
   * not access-token refresh. Null renders no collection form. Never use email as auth. */
  sessionKey: string | null;
  /** Deliberately false by default. A mount must bind actual qualified readiness.
   * Disabling closes new intake but preserves a held same-session recovery. */
  intakeEnabled?: boolean;
  /** The mounted host must bind its existing authenticated transport. */
  transport?: QuickOrderTransport;
  /** A declared ref code only; the caller must not resolve a partner role from it. */
  declaredReferralCode?: string;
}
export default function QuickOrderPage(props: QuickOrderProps) {
  const declaredReferralCode = props.declaredReferralCode ?? (typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("ref") ?? undefined);
  return <PublicShell><QuickOrderForm {...props} declaredReferralCode={declaredReferralCode} /></PublicShell>;
}
/** Exported without the shell for composition tests, never as a second route. */
export function QuickOrderForm({ sessionKey, intakeEnabled = false, transport = sameOriginTransport, declaredReferralCode }: QuickOrderProps) {
  if (!sessionKey) return <IntakeUnavailable />;
  return <SessionForm key={sessionKey} intakeEnabled={intakeEnabled} transport={transport} declaredReferralCode={declaredReferralCode} />;
}
function IntakeUnavailable() {
  return <section className="qo-root"><h1>Quick Order</h1><p role="status">Quick Order is not available for customer requests. No information is collected here.</p></section>;
}
function SessionForm({ transport, declaredReferralCode, intakeEnabled }: Pick<QuickOrderProps, "declaredReferralCode"> & { transport: QuickOrderTransport; intakeEnabled: boolean }) {
  const prefix = useId(), id = (name: string) => `${prefix}-${name}`;
  const [config, setConfig] = useState<Config | null>(null), [configError, setConfigError] = useState(false);
  const [catalog, setCatalog] = useState<CatalogPage | null>(null), [catalogError, setCatalogError] = useState(false);
  const [loading, setLoading] = useState(false), [page, setPage] = useState(1), [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState(""), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<SelectedItem[]>([]), [billingChoice, setBillingChoice] = useState("");
  const [sourceKind, setSourceKind] = useState(""), [affiliationKind, setAffiliationKind] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({}), [notice, setNotice] = useState("");
  const [review, setReview] = useState<Submission | null>(null), [attempt, setAttempt] = useState<Submission | null>(null);
  const [pending, setPending] = useState(false), [unknown, setUnknown] = useState(false), [receipt, setReceipt] = useState<Receipt | null>(null);
  const form = useRef<HTMLFormElement>(null), errorSummary = useRef<HTMLDivElement>(null), reviewHeading = useRef<HTMLHeadingElement>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null), alive = useRef(true), submitting = useRef(false), controller = useRef<AbortController | null>(null);
  const heldAttempt = useRef<Submission | null>(null);
  const intakeAllowed = useRef(intakeEnabled);
  intakeAllowed.current = intakeEnabled;
  const locked = pending || unknown;
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (Object.keys(errors).length || notice) errorSummary.current?.focus(); }, [errors, notice]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useEffect(() => { if (receipt) receiptHeading.current?.focus(); }, [receipt]);
  useEffect(() => {
    if (!intakeEnabled && !heldAttempt.current) {
      setConfig(null); setConfigError(false); setReview(null); setSelected([]); setErrors({}); setNotice("");
      setBillingChoice(""); setSourceKind(""); setAffiliationKind("");
    }
  }, [intakeEnabled]);
  useEffect(() => {
    if (!intakeEnabled) return;
    const abort = new AbortController(); let current = true;
    setConfigError(false);
    void transport(`${API}/config`, { credentials: "same-origin", cache: "no-store", signal: abort.signal, headers: { Accept: "application/json" } })
      .then(async response => { if (!response.ok) throw new Error(); const result = parseConfig(await response.json()); if (!result) throw new Error(); return result; })
      // A transport identity change can follow bearer refresh for this same
      // account. Background availability must not discard a held request's
      // form/recovery controls. Each retry obtains fresh CSRF independently.
      .then(result => { if (current && !heldAttempt.current) setConfig(result); })
      .catch(() => { if (current && !heldAttempt.current) { setConfig(null); setConfigError(true); } });
    return () => { current = false; abort.abort(); };
  }, [transport, reload, intakeEnabled]);
  useEffect(() => {
    if (!intakeEnabled || !config?.enabled || heldAttempt.current) return;
    const abort = new AbortController(); let current = true;
    setLoading(true); setCatalog(null); setCatalogError(false);
    void transport(`${API}/catalog?page=${page}&search=${encodeURIComponent(search)}`, { credentials: "same-origin", cache: "no-store",
      signal: abort.signal, headers: { Accept: "application/json" } })
      .then(async response => { if (!response.ok) throw new Error(); const result = parseCatalog(await response.json(), page); if (!result) throw new Error(); return result; })
      .then(result => { if (current) setCatalog(result); })
      .catch(() => { if (current) setCatalogError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; abort.abort(); };
  }, [config, transport, page, search, intakeEnabled]);
  const invalidate = () => { if (!submitting.current && !unknown) { setReview(null); setErrors({}); setNotice(""); } };
  const changeSelection = (next: SelectedItem[]) => { if (locked || submitting.current) return; setSelected(next); invalidate(); };
  const errorProps = (name: string) => ({ id: id(name), name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? id(`${name}-error`) : undefined });
  const error = (name: string) => errors[name] ? <span className="qo-field-error" id={id(`${name}-error`)}>{errors[name]}</span> : null;
  const field = (name: string, label: string, options: { type?: string; autoComplete?: string; maxLength: number; required?: boolean; defaultValue?: string }) =>
    <label className="qo-field" htmlFor={id(name)} key={name}><span>{label}{options.required ? " *" : ""}</span>
      <input {...errorProps(name)} {...options} />{error(name)}</label>;
  const checkbox = (name: string, label: ReactNode) => <label className="qo-check" htmlFor={id(name)} key={name}>
    <input {...errorProps(name)} type="checkbox" required /><span>{label}<span className="qo-required"> (required)</span>{error(name)}</span></label>;
  const addressFields = (which: "shipping" | "billing") => <div className="qo-fields">
    {field(`${which}.line1`, "Address line 1", { autoComplete: `${which} address-line1`, maxLength: 200, required: true })}
    {field(`${which}.line2`, "Address line 2 (optional)", { autoComplete: `${which} address-line2`, maxLength: 120 })}
    {field(`${which}.city`, "City", { autoComplete: `${which} address-level2`, maxLength: 100, required: true })}
    <label className="qo-field" htmlFor={id(`${which}.region`)}>State or DC *<select {...errorProps(`${which}.region`)} autoComplete={`${which} address-level1`} required defaultValue="">
      <option value="">Select state</option>{US_REGIONS.map(region => <option key={region}>{region}</option>)}</select>{error(`${which}.region`)}</label>
    {field(`${which}.postalCode`, "ZIP code", { autoComplete: `${which} postal-code`, maxLength: 10, required: true })}
    <p className="qo-muted">United States</p>
  </div>;
  function prepareReview() {
    if (!intakeAllowed.current || !config?.enabled || !form.current || submitting.current || locked) return;
    let key: string; try { key = crypto.randomUUID(); } catch { setNotice("A secure request could not be prepared. Please try again later."); return; }
    const input = formSubmission(form.current, selected, config, key), found = validateForm(input, config, selected, billingChoice);
    setErrors(found); setNotice(""); setReview(Object.keys(found).length ? null : input);
  }
  async function submit(snapshot: Submission) {
    if ((!unknown && (!intakeAllowed.current || !config?.enabled)) || submitting.current || !alive.current || receipt || (!unknown && snapshot !== review)
      || (unknown && snapshot !== heldAttempt.current)) return;
    // Immediate ref guard precedes React rendering and protects double clicks.
    submitting.current = true; heldAttempt.current = snapshot; setPending(true); setAttempt(snapshot); setNotice("");
    const abort = new AbortController(); controller.current = abort;
    let posted = false;
    try {
      // Bearer refresh may rotate session-bound CSRF while the actor stays the
      // same. Refresh only transport authority; never alter the frozen payload,
      // agreements or key. Disabled current intake must not hide stored recovery.
      const configResponse = await transport(`${API}/config`, { credentials: "same-origin", cache: "no-store", signal: abort.signal, headers: { Accept: "application/json" } });
      if (!configResponse.ok) throw new Error();
      const currentConfig = parseConfig(await configResponse.json());
      if (!currentConfig) throw new Error();
      if (!alive.current || abort.signal.aborted) return;
      if (!unknown && (!intakeAllowed.current || !currentConfig.enabled)) {
        heldAttempt.current = null; setAttempt(null); setReview(null);
        setNotice("Quick Order is currently unavailable. This attempt was not sent. Your details remain in this open page.");
        return;
      }
      posted = true;
      const response = await transport(`${API}/requests`, { method: "POST", credentials: "same-origin", cache: "no-store", signal: abort.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": currentConfig.csrfToken }, body: JSON.stringify(snapshot) });
      let body: unknown; try { body = await response.json(); } catch { throw new Error(); }
      if (!alive.current || abort.signal.aborted) return;
      if (!response.ok) {
        const code = body && typeof body === "object" && "code" in body ? body.code : null;
        // Only explicit pre-write validation refusals unlock a fresh review. A
        // conflict/auth/network/5xx response may follow an earlier stored attempt.
        if (!unknown && ((response.status === 422 && code === "invalid_input") || (response.status === 409 && ["catalog_changed", "terms_changed"].includes(String(code))))) {
          heldAttempt.current = null; setAttempt(null); setReview(null); setUnknown(false);
          if (code === "invalid_input") {
            const mapped = serverFieldErrors(body, config?.agreements ?? []);
            // Conditional controls may be absent. Keep the summary link useful
            // by directing those errors to the corresponding visible choice.
            if (mapped.sourceDetail && !form.current?.elements.namedItem("sourceDetail")) { mapped.sourceKind = mapped.sourceDetail; delete mapped.sourceDetail; }
            if (mapped.affiliationDetail && !form.current?.elements.namedItem("affiliationDetail")) { mapped.affiliationKind = mapped.affiliationDetail; delete mapped.affiliationDetail; }
            for (const name of Object.keys(mapped)) if (name.startsWith("billing.") && !form.current?.elements.namedItem(name)) { mapped.billingChoice = "Check your billing-address choice."; delete mapped[name]; }
            setErrors(mapped);
          }
          if (code === "catalog_changed" || code === "terms_changed") { setSelected([]); setReload(value => value + 1); }
          setNotice(code === "invalid_input" ? "The request was not accepted. Check your details and review again."
            : "The catalog or terms changed. Choose current items and review the current agreements again. This attempt was not accepted.");
          return;
        }
        throw new Error();
      }
      const confirmed = parseReceipt(body);
      if (!confirmed || ![200, 201].includes(response.status)) throw new Error();
      heldAttempt.current = null; setReceipt(confirmed); setUnknown(false); setAttempt(null); setReview(null); setSelected([]);
      form.current?.reset();
    } catch {
      if (alive.current && !abort.signal.aborted) {
        if (unknown || posted) {
          setUnknown(true);
          setNotice("We could not confirm whether your request was saved. Keep this page open. Retry confirmation sends the exact same request and key; your details stay locked until the outcome is known.");
        } else {
          heldAttempt.current = null; setAttempt(null);
          setNotice("Current request access could not be confirmed. This attempt was not sent. Your details remain in this open page; try submitting again after access is restored.");
        }
      }
    } finally { if (alive.current && !abort.signal.aborted) { submitting.current = false; setPending(false); } }
  }
  const knownSubtotal = selected.reduce((sum, item) => sum + (item.unitPriceCents ?? 0) * item.quantity, 0);
  const pendingPrice = selected.some(item => item.unitPriceCents === null);
  // New collection remains closed. A same-session pending/unknown attempt and
  // its confirmed receipt survive a feature disable; account identity owns the
  // component key and therefore still clears everything on logout/switch.
  if (!intakeEnabled && !heldAttempt.current && !receipt) return <IntakeUnavailable />;
  return <section className="qo-root" aria-labelledby={id("title")}>
    <div className="qo-hero"><p className="qo-eyebrow">Quick Order</p><h1 id={id("title")}>Your next step, in one request.</h1>
      <p>Choose items, provide your details and tell us how you heard about us. The team will review your request and coordinate the next steps.</p>
      <p className="qo-muted">No payment is collected here. Clinical requests require the separate provider pathway.</p></div>
    {!receipt && !config && !configError && <p role="status">Checking request availability...</p>}
    {!receipt && configError && <div className="qo-message" role="alert"><p>Request availability could not be confirmed. No information can be submitted.</p>
      <button type="button" onClick={() => setReload(value => value + 1)}>Retry availability</button></div>}
    {!receipt && config && !config.enabled && <p className="qo-message" role="status">Quick Order is not available for customer requests. Please check back later.</p>}
    {config?.enabled && !receipt && <>
      <ol className="qo-steps" aria-label="Request steps"><li>Choose items</li><li>Your details</li><li>Review and submit</li></ol>
      <p className="qo-memory">Your details stay in this open page only. Refreshing, closing it or changing accounts discards them. If confirmation is interrupted, use your authorized account request history or contact support before starting another request.</p>
      {(Object.keys(errors).length > 0 || notice) && <div className="qo-message" ref={errorSummary} tabIndex={-1} role="alert">
        {notice && <p>{notice}</p>}{Object.keys(errors).length > 0 && <><h2>Check your request</h2><ul>{Object.entries(errors).map(([name, message]) =>
          <li key={name}><a href={`#${id(name)}`} onClick={event => { event.preventDefault(); document.getElementById(id(name))?.focus(); }}>{message}</a></li>)}</ul></>}
      </div>}
      <div className="qo-layout"><div className="qo-content">
        <section className="qo-panel" aria-labelledby={id("catalog-title")}><h2 id={id("catalog-title")}>Choose items</h2>
          <p className="qo-muted">The catalog shows items available to your account. Each item has its own quantity limits and next step.</p>
          <form className="qo-search" onSubmit={event => { event.preventDefault(); if (!locked) { setPage(1); setSearch(searchInput.trim()); } }}>
            <label htmlFor={id("search")}>Search catalog<input id={id("search")} type="search" maxLength={120} value={searchInput} disabled={locked}
              onChange={event => setSearchInput(event.target.value)} /></label><button type="submit" disabled={locked}>Search</button>
          </form>
          <div aria-live="polite" aria-busy={loading}>
            {loading && <p>Loading items...</p>}
            {catalogError && <p role="alert">The current catalog could not be loaded. <button type="button" disabled={locked} onClick={() => setReload(value => value + 1)}>Try again</button></p>}
            {catalog && <><p className="qo-muted">{catalog.total} matching variants</p>
              {!catalog.items.length && <p>No matching items. Try another search.</p>}
              {catalog.items.map(item => {
                const added = selected.some(candidate => itemKey(candidate) === itemKey(item));
                return <article className="qo-card" key={itemKey(item)}><p className="qo-eyebrow">{item.researchUseOnly ? "Separate Research pathway" : WORKFLOW_LABELS[item.workflowMode]}</p>
                  <h3>{item.productName}</h3>{item.specification && <p>{item.specification}</p>}{item.accessNotice && <p className="qo-muted">{item.accessNotice}</p>}
                  <p>{item.unitPriceCents === null ? "Price confirmed separately" : `${money(item.unitPriceCents)} per unit`}</p>
                  {item.workflowMode === "provider_request" && !item.researchUseOnly && <p><a className="qo-care-link" href="/care">Explore Xenios Care</a></p>}
                  {item.requestable && <p className="qo-muted">Quantity {item.minimumQuantity} to {item.maximumQuantity}, increments of {item.quantityIncrement}.</p>}
                  <button type="button" disabled={locked || !item.requestable || added || selected.length >= 100}
                    onClick={() => changeSelection([...selected, { ...item, quantity: item.minimumQuantity }])}>{!item.requestable ? "Not requestable here" : added ? "Added to request" : "Add to request"}</button>
                </article>;
              })}
              <nav className="qo-pager" aria-label="Catalog pages"><button type="button" disabled={locked || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
                <span>Page {page} of {Math.max(1, Math.ceil(catalog.total / 24))}</span><button type="button" disabled={locked || page * 24 >= catalog.total} onClick={() => setPage(value => value + 1)}>Next</button></nav>
            </>}
          </div>
        </section>
        <form ref={form} noValidate onChange={invalidate} onSubmit={event => { event.preventDefault(); prepareReview(); }}>
          <fieldset disabled={locked} className="qo-form-lock"><legend className="qo-sr-only">Request details</legend>
            <section className="qo-panel"><h2>Your details</h2><p className="qo-muted">Fields marked * are required. Do not include medical notes, card details or government ID information.</p>
              <div className="qo-fields">
                {field("fullLegalName", "Full legal name", { autoComplete: "name", maxLength: 150, required: true })}
                {field("email", "Email", { type: "email", autoComplete: "email", maxLength: 254, required: true })}
                {field("mobilePhone", "US phone", { type: "tel", autoComplete: "tel", maxLength: 32, required: true })}
                {field("organizationName", "Business name (optional)", { autoComplete: "organization", maxLength: 160 })}
              </div>
              <fieldset><legend>Shipping / contact address</legend>{addressFields("shipping")}</fieldset>
              <label className="qo-field" htmlFor={id("billingChoice")}>Billing address *<select {...errorProps("billingChoice")} required value={billingChoice} onChange={event => setBillingChoice(event.target.value)}>
                <option value="">Choose an option</option><option value="same">Same as shipping / contact address</option><option value="different">Use a different billing address</option></select>{error("billingChoice")}</label>
              {billingChoice === "different" && <fieldset><legend>Billing address</legend>{addressFields("billing")}</fieldset>}
              {checkbox("ageConfirmed", "I confirm that I am 18 or older. This is a declaration, not identity verification.")}
            </section>
            <section className="qo-panel"><h2>Referral and affiliation</h2><p className="qo-muted">Choose Direct / no referrer and No affiliation when accurate. These answers do not give anyone access to your request or authorize a commission.</p>
              <label className="qo-field" htmlFor={id("sourceKind")}>How did you hear about us? *<select {...errorProps("sourceKind")} required value={sourceKind} onChange={event => setSourceKind(event.target.value)}>
                <option value="">Select one</option>{SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error("sourceKind")}</label>
              {sourceKind && sourceKind !== "direct" && field("sourceDetail", "Referrer or source name", { maxLength: 180, required: true })}
              {field("declaredCode", "Referral code (optional)", { maxLength: 64, defaultValue: declaredReferralCode && /^[a-zA-Z0-9_-]{1,64}$/.test(declaredReferralCode) ? declaredReferralCode : "" })}
              <p className="qo-muted">Confirm or correct a code supplied by a referral link. It is recorded as your declaration.</p>
              <label className="qo-field" htmlFor={id("affiliationKind")}>Your affiliation *<select {...errorProps("affiliationKind")} required value={affiliationKind} onChange={event => setAffiliationKind(event.target.value)}>
                <option value="">Select one</option>{AFFILIATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{error("affiliationKind")}</label>
              {affiliationKind && affiliationKind !== "none" && field("affiliationDetail", "Affiliation name", { maxLength: 180, required: true })}
              {checkbox("referralConfirmed", "I confirm that my referral and affiliation information is accurate.")}
            </section>
            <section className="qo-panel"><h2>Agreements and acknowledgements</h2>
              <div key={JSON.stringify(config.agreements)}>{config.agreements.map((agreement, index) => checkbox(`agreement-${index}`,
                agreement.type === "form_acknowledgment" ? agreement.label : <>I have reviewed and accept <a href={agreement.url!} target="_blank" rel="noopener noreferrer">{agreement.label}</a> ({agreement.version}).</>))}</div>
              {checkbox("requestAcknowledged", "I understand that this is a request for review. It is not payment, a prescription, treatment approval or a guarantee of availability.")}
              <button className="qo-primary qo-submit" type="submit">Review my request</button>
            </section>
          </fieldset>
        </form>
        {review && <section className="qo-panel qo-review"><h2 ref={reviewHeading} tabIndex={-1}>Confirm your request</h2>
          <p>{review.contact.fullLegalName}<br />{review.contact.email}<br />{review.contact.mobilePhone}</p>
          {review.contact.organizationName && <p>Business: {review.contact.organizationName}</p>}
          <h3>Shipping / contact address</h3><AddressSummary address={review.contact.shippingAddress} />
          <h3>Billing address</h3>{review.contact.billingSameAsShipping ? <p>Same as shipping / contact address.</p> : <AddressSummary address={review.contact.billingAddress!} />}
          <p>Referral: {SOURCE_OPTIONS.find(([kind]) => kind === review.referral.kind)?.[1]}{review.referral.detail ? ` / ${review.referral.detail}` : ""}</p>
          {review.referral.declaredCode && <p>Declared code: {review.referral.declaredCode}</p>}
          <p>Affiliation: {AFFILIATION_OPTIONS.find(([kind]) => kind === review.affiliation.kind)?.[1]}{review.affiliation.detail ? ` / ${review.affiliation.detail}` : ""}</p>
          <ul>{selected.map(item => <li key={itemKey(item)}>{item.quantity} × {item.productName}{item.specification ? `, ${item.specification}` : ""}. {WORKFLOW_LABELS[item.workflowMode]}.</li>)}</ul>
          <p>Any payable amount is confirmed separately. No payment or treatment approval occurs here.</p>
          <button className="qo-primary qo-submit" type="button" disabled={locked} onClick={() => void submit(review)}>{pending ? "Confirming request..." : "Submit request for review"}</button>
        </section>}
        {unknown && attempt && <section className="qo-panel"><h2>Confirmation is unresolved</h2><p>Do not start a second request. This retry checks the same attempt. Recovery after a refresh or on another device is not guaranteed by this page.</p>
          <button className="qo-primary" type="button" disabled={pending} onClick={() => void submit(attempt)}>{pending ? "Checking confirmation..." : "Retry confirmation"}</button></section>}
      </div><aside className="qo-summary" aria-labelledby={id("selection")}><h2 id={id("selection")} tabIndex={-1}>Your selection</h2>
        {!selected.length && <p>Your selection is empty. Add an available item to start.</p>}
        {selected.map(item => <div className="qo-selection-item" key={itemKey(item)}><h3>{item.productName}</h3>{item.specification && <p>{item.specification}</p>}
          <p className="qo-muted">{WORKFLOW_LABELS[item.workflowMode]}</p><label className="qo-field">Quantity for {item.productName}
            <input type="number" value={Number.isNaN(item.quantity) ? "" : item.quantity} min={item.minimumQuantity} max={item.maximumQuantity} step={item.quantityIncrement} disabled={locked}
              onChange={event => changeSelection(selected.map(candidate => itemKey(candidate) === itemKey(item) ? { ...candidate, quantity: event.target.value === "" ? NaN : Number(event.target.value) } : candidate))} /></label>
          <p className="qo-muted">{item.minimumQuantity} to {item.maximumQuantity}, increments of {item.quantityIncrement}.</p>
          <button type="button" disabled={locked} onClick={() => changeSelection(selected.filter(candidate => itemKey(candidate) !== itemKey(item)))}>Remove {item.productName}</button></div>)}
        {error("selection")}
        <p className="qo-estimate">{Number.isSafeInteger(knownSubtotal) && knownSubtotal >= 0 ? `${pendingPrice ? "Known estimate" : "Item estimate"}: ${money(knownSubtotal)}${pendingPrice ? " + items awaiting pricing" : ""}` : "Review quantities to see an estimate."}</p>
        <p className="qo-muted">Estimates exclude shipping, tax and unconfirmed clinical, pharmacy or partner charges. They are not accepted quotes.</p>
      </aside></div>
    </>}
    {receipt && <section className="qo-panel qo-receipt" aria-labelledby={id("receipt-title")}><h2 id={id("receipt-title")} ref={receiptHeading} tabIndex={-1}>Request received</h2>
      <p className="qo-reference">{receipt.publicReference}</p><p>The team will review your request and confirm the next step. Keep this reference for support.</p>
      <p>No payment was collected. This receipt is not a prescription, approval for treatment or a guarantee of fulfillment.</p>
      <p>{receipt.estimate.estimateComplete ? "Item estimate" : "Known estimate"}: {money(receipt.estimate.knownSubtotalCents)}{receipt.estimate.estimateComplete ? "" : " + items awaiting pricing"}</p>
      <p className="qo-muted">Referral information was recorded for review. No commission was authorized.</p></section>}
  </section>;
}
function AddressSummary({ address }: { address: Submission["contact"]["shippingAddress"] }) {
  return <p>{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.city}, {address.region} {address.postalCode}<br />United States</p>;
}
