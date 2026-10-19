import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { validateAddress, type AssistedOrderContactInput } from "../../../../shared/research/assisted-order/contract";
import {
  REQUEST_INTENT_NOTICE, REQUEST_INTENT_RECOVERY_NOTICE, validateRequestIntentInput,
  type RequestIntentCatalogItem, type RequestIntentCatalogPage, type RequestIntentInput, type RequestIntentReceipt,
} from "../../../../shared/research/assisted-order/request-intent";
import { catalogItemKey, clampQuantity, requiredAcknowledgmentEntries, agreementRequirementKey, money, type AssistedOrderWizardConfig } from "./wizard-state";
import { createRequestIntentApi, isKnownIntentPrewriteRefusal, intentRefusalGuidance, type RequestIntentApi } from "./request-intent-api";
import { clearConfirmedIntentAttempt, clearFirstRefusedIntentAttempt, postIntentAttempt, readIntentAttempt, type IntentAttempt } from "./request-intent-attempt";
import { readRequestSelectionCandidate, writeRequestSelectionCandidate, clearRequestSelectionCandidate,
  type RequestSelectionContext } from "./request-intent-selection-store";
import { validateRetainedRequestSelections } from "./request-intent-selection-restore";
import type { StorefrontIntent } from "../storefront/entry-intent";
import { matchesOrderEntryIntent, orderEntryQuantityAllowed } from "../early-access/orderEntryIntent";
import "./assisted-order.css";

const defaultApi = createRequestIntentApi();
type Selection = Readonly<{ item: RequestIntentCatalogItem; quantity: number }>;
function browserStorage(): Storage | null { try { return window.sessionStorage; } catch { return null; } }

/** Reusable inside the existing customer shell. No new global Auth, cart, catalog or legal authority. */
export function RequestIntentForm({
  api = defaultApi, storage = browserStorage(), embedded = false, continuationEnabled = true, onStepChange, entryIntent,
  selectionContext, confirmSelectionContext,
}: Readonly<{ api?: RequestIntentApi; storage?: Storage | null; embedded?: boolean;
  continuationEnabled?: boolean; onStepChange?: (step: "products" | "contact" | "review") => void;
  entryIntent?: StorefrontIntent | null; selectionContext?: RequestSelectionContext | null;
  confirmSelectionContext?: () => Promise<RequestSelectionContext | null> }>) {
  const [step, setStep] = useState<"products" | "contact" | "review">("products");
  const [config, setConfig] = useState<AssistedOrderWizardConfig | null>(null);
  const [catalog, setCatalog] = useState<RequestIntentCatalogPage | null>(null);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlyMap<string, Selection>>(new Map());
  const [editingSelection, setEditingSelection] = useState<string | null>(null);
  const [contact, setContact] = useState<AssistedOrderContactInput | null>(null);
  const [billingSame, setBillingSame] = useState(true);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [receipt, setReceipt] = useState<RequestIntentReceipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored] = useState(() => storage ? readIntentAttempt(storage) : null);
  const frozen = useRef<{ readonly attempt: IntentAttempt; readonly input: RequestIntentInput; postsStarted: number } | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const catalogHeading = useRef<HTMLHeadingElement>(null);
  const actionReasonId = useId();
  const returningToCatalog = useRef(false);
  const scope = selectionContext?.kind === "early_access_session" && /^[0-9a-f]{64}$/.test(selectionContext.selectionScope)
    ? selectionContext.selectionScope : null;
  const currentScope = useRef(scope);
  const mountScope = useRef(scope);
  currentScope.current = scope;
  const retentionPhase = useRef<"pending" | "ready" | "off">("pending");
  const [retention, setRetention] = useState<"checking" | "ready" | "held" | "off">(
    scope && confirmSelectionContext ? "checking" : "off");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [hintItem, setHintItem] = useState<RequestIntentCatalogItem | null>(null);
  const [hintChecked, setHintChecked] = useState(false);
  const hintKey = entryIntent ? JSON.stringify(entryIntent) : "";
  useEffect(() => { onStepChange?.(step); }, [step, onStepChange]);
  useEffect(() => {
    let current = true;
    setHintItem(null); setHintChecked(false);
    if (!entryIntent) return;
    // Navigation is only a hint. Re-resolve the full family from the neutral
    // audience-scoped catalog; CARE never takes the old Research redirect.
    void (async () => {
      const matches: RequestIntentCatalogItem[] = [];
      let total: number | null = null, scanned = 0;
      const seen = new Set<string>();
      for (let page = 1; page <= 500; page += 1) {
        const result = await api.catalog({ family: entryIntent.family, page, pageSize: 100 });
        if (!current) return;
        if (result.page !== page || result.pageSize !== 100
          || (total !== null && total !== result.total)
          || result.items.length !== Math.min(100, Math.max(0, result.total - (page - 1) * 100))) throw new Error("Incomplete hint.");
        total = result.total;
        for (const item of result.items) {
          const key = catalogItemKey(item);
          if (seen.has(key)) throw new Error("Ambiguous hint.");
          seen.add(key);
          if (matchesOrderEntryIntent(item, entryIntent)) matches.push(item);
        }
        scanned += result.items.length;
        if (scanned === total) {
          const match = matches.length === 1 ? matches[0] : null;
          if (match?.selectableForReview && orderEntryQuantityAllowed(match, entryIntent.quantity)) setHintItem(match);
          setHintChecked(true); return;
        }
      }
      throw new Error("Incomplete hint.");
    })().catch(() => { if (current) setHintChecked(true); });
    return () => { current = false; };
  }, [api, hintKey]);
  const selections = [...selected.values()];
  const selectedUnits = selections.reduce((total, selection) => total + selection.quantity, 0);
  const selectedProducts = new Set(selections.map(({ item }) => item.productId)).size;
  const requirements = config ? requiredAcknowledgmentEntries(config, selections.some(({ item }) => item.researchUseOnly)) : [];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (step === "products" && returningToCatalog.current) {
      returningToCatalog.current = false;
      catalogHeading.current?.focus();
      catalogHeading.current?.scrollIntoView?.({ block: "nearest" });
    } else heading.current?.focus();
  }, [step, receipt]);
  useEffect(() => {
    let active = true;
    const context = scope ? { kind: "early_access_session" as const, selectionScope: scope } : null;
    const current = () => active && mounted.current && currentScope.current === scope && mountScope.current === scope;
    retentionPhase.current = "pending";
    if (scope !== mountScope.current) { setRetention("held"); return () => { active = false; }; }
    if (!context || !confirmSelectionContext) {
      retentionPhase.current = "off"; setRetention("off");
      return () => { active = false; };
    }
    setRetention("checking");
    if (!storage || restored) { setRetention("held"); return () => { active = false; }; }
    const candidate = readRequestSelectionCandidate(storage, context, current);
    if (candidate.kind === "none" || candidate.kind === "scope_mismatch") {
      retentionPhase.current = "ready"; setRetention("ready");
      if (candidate.kind === "scope_mismatch") setSelectionNotice("Earlier selections belonged to another access session and were not restored.");
      return () => { active = false; };
    }
    if (candidate.kind !== "candidate") {
      setRetention("held"); return () => { active = false; };
    }
    void (async () => {
      const items: RequestIntentCatalogItem[] = [];
      const seen = new Set<string>();
      let total: number | null = null, complete = candidate.lines.length === 0;
      // Only retained candidates require this unfiltered scan. The existing
      // API has no AbortSignal: cancellation prevents consumption/next pages,
      // not completion of the in-flight HTTP request. This is not atomic.
      for (let page = 1; !complete && page <= 500; page += 1) {
        if (!current()) return;
        const result = await api.catalog({ page, pageSize: 100 });
        if (!current()) return;
        if (result.page !== page || result.pageSize !== 100 || !Number.isSafeInteger(result.total)
          || result.total < 0 || result.total > 50_000 || (total !== null && total !== result.total)
          || !Array.isArray(result.items)
          || result.items.length !== Math.min(100, Math.max(0, result.total - (page - 1) * 100))) throw new Error("Incomplete catalog");
        total = result.total;
        for (const item of result.items) {
          const key = catalogItemKey(item);
          if (seen.has(key)) throw new Error("Ambiguous catalog");
          seen.add(key); items.push(item);
        }
        if (items.length === total) { complete = true; break; }
      }
      if (!complete || !current()) throw new Error("Incomplete catalog");
      const confirmed = await confirmSelectionContext();
      if (!current()) return;
      if (confirmed?.kind !== "early_access_session" || confirmed.selectionScope !== scope) throw new Error("Context changed");
      const latest = readRequestSelectionCandidate(storage, context, current);
      if (latest.kind !== "candidate" || JSON.stringify(latest.lines) !== JSON.stringify(candidate.lines)) throw new Error("Attempt or selections changed");
      const validated = validateRetainedRequestSelections(candidate.lines, items);
      if (validated.kind !== "valid" || !current()) throw new Error("Selection unavailable");
      setSelected(new Map(validated.selections.map((selection) => [catalogItemKey(selection.item), selection])));
      retentionPhase.current = "ready"; setRetention("ready");
      setSelectionNotice("Your selections were checked against the current catalog. Contact details were not stored.");
    })().catch(() => { if (current()) setRetention("held"); });
    return () => { active = false; };
  }, [api, storage, scope, confirmSelectionContext, restored]);
  useEffect(() => {
    if (retention !== "ready" || retentionPhase.current !== "ready" || !scope || scope !== mountScope.current || !storage || restored || receipt || frozen.current) return;
    const context = { kind: "early_access_session" as const, selectionScope: scope };
    const current = () => mounted.current && currentScope.current === scope && retentionPhase.current === "ready";
    if (!writeRequestSelectionCandidate(storage, context,
      [...selected.values()].map(({ item, quantity }) => ({ productId: item.productId, variantId: item.variantId, quantity })), current)) {
      retentionPhase.current = "pending"; setRetention("held");
    }
  }, [selected, retention, scope, storage, restored, receipt]);
  function clearSavedSelections() {
    if (!scope || !storage) return;
    const cleared = clearRequestSelectionCandidate(storage, { kind: "early_access_session", selectionScope: scope },
      () => mounted.current && currentScope.current === scope);
    if (!cleared) setSelectionNotice("The request was saved, but browser selections could not be cleared. Do not submit a replacement; contact support if needed.");
  }
  function backToCatalog() { returningToCatalog.current = true; setStep("products"); }
  useEffect(() => {
    let current = true;
    void api.config().then((value) => { if (current) setConfig(value); })
      .catch(() => { if (current) setError("Current request requirements are unavailable. Submission remains closed."); });
    return () => { current = false; };
  }, [api]);
  useEffect(() => {
    let current = true;
    setCatalog(null);
    void api.catalog({ search, family: family || undefined, page, pageSize: 24 })
      .then((value) => { if (current) setCatalog(value); })
      .catch(() => { if (current) setError("The current catalog could not be confirmed. Please retry later."); });
    return () => { current = false; };
  }, [api, search, family, page]);

  async function recover() {
    if (!restored || !storage || locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const saved = await api.recover(restored.key);
      if (!mounted.current) return;
      if (!saved) { setError("The saved result is not yet confirmed. Keep this attempt and check again, or contact support before any replacement."); return; }
      if (!clearConfirmedIntentAttempt(storage, restored)) throw new Error("Session changed.");
      clearSavedSelections();
      setReceipt(saved); setError("");
    } catch { if (mounted.current) setError(REQUEST_INTENT_RECOVERY_NOTICE); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function captureContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const address = (prefix: string) => validateAddress(prefix, {
      line1: text(prefix + "Line1"), line2: text(prefix + "Line2") || undefined, city: text(prefix + "City"),
      region: text(prefix + "Region"), postalCode: text(prefix + "PostalCode"), countryCode: text(prefix + "CountryCode"),
    });
    try {
      const shippingAddress = address("shipping");
      if (data.get("age") !== "on") throw new Error("Age confirmation is required.");
      setContact({ fullLegalName: text("name"), email: text("email"), mobilePhone: text("phone"),
        ageConfirmed: true, shippingAddress, billingSameAsShipping: billingSame,
        billingAddress: billingSame ? shippingAddress : address("billing") });
      setStep("review"); setError("");
    } catch { setError("Complete the required contact and address fields."); }
  }
  async function submit() {
    if (locked.current || !storage || !config || !contact || !continuationEnabled || retention === "checking" || retention === "held") return;
    locked.current = true; setBusy(true);
    let firstPost = false;
    let sentSnapshot: typeof frozen.current = null;
    try {
      if (!frozen.current) {
        if (!requirements.length || requirements.some((entry) => !acknowledged.has(agreementRequirementKey(entry)))) {
          throw new Error("Confirm the displayed acknowledgments.");
        }
        const acceptedAt = new Date().toISOString();
        const attempt: IntentAttempt = { key: crypto.randomUUID(), acceptedAt, state: "in_flight" };
        const input = validateRequestIntentInput({
          idempotencyKey: attempt.key, contact,
          lines: selections.map(({ item, quantity }) => ({ productId: item.productId, variantId: item.variantId, quantity })),
          agreements: requirements.map(({ kind, version }) => ({ kind, version, accepted: true, acceptedAt })),
        });
        frozen.current = { attempt, input, postsStarted: 0 };
      }
      const snapshot = frozen.current;
      sentSnapshot = snapshot;
      const saved = await postIntentAttempt(storage, snapshot.attempt, () => {
        // The marker has already been preserved. Count the ACTUAL call before
        // awaiting it, so a later refusal can never erase an earlier lost reply.
        firstPost = snapshot.postsStarted === 0;
        snapshot.postsStarted += 1;
        return api.submit(snapshot.input);
      }, () => mounted.current);
      // postIntentAttempt already proved the receipt and cleared this mount's
      // owned attempt marker. Only then may selection-cache cleanup occur.
      if (mounted.current) { clearSavedSelections(); setReceipt(saved); setError(""); }
    } catch (error) {
      if (sentSnapshot && frozen.current === sentSnapshot && isKnownIntentPrewriteRefusal(error)
        && clearFirstRefusedIntentAttempt(storage, sentSnapshot.attempt,
          { firstPost, stillCurrent: mounted.current, error })) {
        frozen.current = null;
        setAcknowledged(new Set());
        setError(intentRefusalGuidance(error));
      } else if (mounted.current) {
        setError(REQUEST_INTENT_RECOVERY_NOTICE);
      }
    }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const nextReason = !selected.size ? "Select at least one available item to continue."
    : !config ? "Current request requirements are still unavailable."
    : !storage ? "Browser session storage is unavailable; safe request recovery is required."
    : !continuationEnabled ? "Complete the displayed access and agreement requirements to continue."
    : "Next: enter contact details, then review and submit your request.";
  const addressFields = (prefix: string, label: string) => <fieldset className="xenios-order-grid">
    <legend>{label}</legend>
    {[["Line1", "Street address"], ["Line2", "Apartment or suite (optional)"], ["City", "City"], ["Region", "State or region"],
      ["PostalCode", "Postal code"], ["CountryCode", "Country code"]].map(([suffix, text]) =>
      <label key={suffix}>{text}<input name={prefix + suffix} required={suffix !== "Line2"}
        maxLength={suffix === "CountryCode" ? 2 : 200} defaultValue={suffix === "CountryCode" ? "US" : ""}
        autoComplete={prefix + " " + ({ Line1: "address-line1", Line2: "address-line2", City: "address-level2",
          Region: "address-level1", PostalCode: "postal-code", CountryCode: "country" } as Record<string, string>)[suffix]} /></label>)}
  </fieldset>;

  if (receipt) return <section className="xenios-order-page"><h1 ref={heading} tabIndex={-1}>Request saved for review</h1>
    <p role="status">Your saved request reference is <strong>{receipt.publicReference}</strong>.</p>
    <p>{REQUEST_INTENT_NOTICE}</p><p>Each item is pending review. Final availability, quantities, pricing and delivery must be confirmed separately.</p>
    {selectionNotice && <p role="status">{selectionNotice}</p>}
    <a href="/support">Contact support</a></section>;

  if (restored) return <section className="xenios-order-page"><h1 ref={heading} tabIndex={-1}>Check your earlier request</h1>
    <p>An attempt marker was retained. Any selection cache is withheld during recovery; contact information was not saved in this browser.</p>
    <p>{REQUEST_INTENT_RECOVERY_NOTICE}</p>{error && <p role="alert">{error}</p>}
    <button className="xenios-order-button" disabled={busy} onClick={() => void recover()}>Check saved request</button>
    <a href="/support">Contact support before a replacement</a></section>;

  if (retention === "checking" || retention === "held") return <section className="xenios-order-page" role="status">
    <h1>Check your selections</h1><p>{retention === "checking"
      ? "Checking retained selections against your current access and the complete current catalog..."
      : "Selections or an earlier attempt could not be safely confirmed. No new request was sent. Reload the request page or contact support before continuing; do not create a replacement for an uncertain request."}</p>
    <a href="/support">Contact support</a></section>;
  return <section className={embedded ? "xenios-order-page xenios-order-page--embedded" : "xenios-order-page"}>
    <header className="xenios-order-hero"><h1 ref={heading} tabIndex={-1}>Request products for review</h1>
      <p>{REQUEST_INTENT_NOTICE}</p><p>Clinical and nonclinical selections can be reviewed in one request. Do not enter medical history, upload documents or send payment here.</p></header>
    {!continuationEnabled && <p role="status">Complete the existing access and agreement requirements before continuing. No request has been submitted.</p>}
    {!embedded && <p><a href="/research/early-access">Review access and agreement requirements</a></p>}
    {!storage && <p role="alert">This browser cannot preserve a safe retry marker. Submission is unavailable. Contact support.</p>}
    {error && <p className="xenios-order-error" role="alert">{error}</p>}
    {step === "products" && <>
      {entryIntent && <section aria-label="Selection from your link" className="xenios-order-panel">
        <h2>Selection from your link</h2>
        <p>{!hintChecked ? "Checking the exact product and quantity..." : !hintItem
          ? "The current catalog did not confirm one requestable match. Review the catalog below; no item was added."
          : hintItem.productName + " | Requested quantity: " + entryIntent.quantity}</p>
        {hintItem && <button type="button" disabled={selected.has(catalogItemKey(hintItem)) || selected.size >= 200}
          onClick={() => setSelected((prior) => new Map(prior).set(catalogItemKey(hintItem),
            { item: hintItem, quantity: entryIntent.quantity }))}>Add linked selection for review</button>}
        <p>A link never approves a clinical item or places an order.</p>
      </section>}
      <div className="xenios-order-grid">
        <h2 className="xenios-order-catalog-heading" ref={catalogHeading} tabIndex={-1}>Browse the catalog</h2>
        {selectionNotice && <p role="status">{selectionNotice}</p>}
        <label>Search catalog<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <label>Product family<select value={family} onChange={(event) => { setFamily(event.target.value); setPage(1); }}>
          <option value="">All families</option>{catalog?.families.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select></label>
      </div>
      <p role="status">{catalog ? catalog.total + " visible catalog entries. " + selected.size + " selected." : "Loading catalog..."}</p>
      <div className="xenios-order-catalog-layout"><div><div className="xenios-order-cards">{catalog?.items.map((item) => {
        const key = catalogItemKey(item), selection = selected.get(key);
        return <article className="xenios-order-card" key={key}><h2>{item.productName}</h2>
          <p>{item.specification || "Form not stated"}</p>
          <p>{item.clinicalReviewRequired ? "Clinical review required. Not a prescription." : item.researchUseOnly ? "Research Use Only. Nonclinical use only." : "Internal review required."}</p>
          {item.sourceRefusal && <p>Current restriction: {item.sourceRefusal.replaceAll("_", " ")}. Adding a request does not remove this restriction.</p>}
          <p>{item.clinicalReviewRequired ? "Final price follows applicable review." : money(item.unitPriceCents) + " (catalog display, not a final quote)"}</p>
          {!item.selectableForReview ? <p>{item.intentExclusion === "coming_soon" ? "Coming soon" : "Shipping or service entry, not a product request"}</p> : selection
            ? <div className="xenios-order-quantity">
              <button type="button" aria-label={"Decrease requested quantity for " + item.productName}
                disabled={clampQuantity(item, selection.quantity - item.quantityIncrement) === selection.quantity}
                onClick={() => setSelected((prior) => {
                  const current = prior.get(key); if (!current) return prior;
                  return new Map(prior).set(key, { item, quantity: clampQuantity(item, current.quantity - item.quantityIncrement) });
                })}>−</button>
              <label>Requested quantity for {item.productName}<input type="number" min={item.minimumQuantity}
                max={item.maximumQuantity ?? undefined} step={item.quantityIncrement} value={selection.quantity}
                onChange={(event) => setSelected((prior) => new Map(prior).set(key, { item, quantity: clampQuantity(item, Number(event.target.value)) }))} /></label>
              <button type="button" aria-label={"Increase requested quantity for " + item.productName}
                disabled={clampQuantity(item, selection.quantity + item.quantityIncrement) === selection.quantity}
                onClick={() => setSelected((prior) => {
                  const current = prior.get(key); if (!current) return prior;
                  return new Map(prior).set(key, { item, quantity: clampQuantity(item, current.quantity + item.quantityIncrement) });
                })}>+</button>
              <button type="button" className="xenios-order-link" onClick={() => setSelected((prior) => { const next = new Map(prior); next.delete(key); return next; })}>Remove {item.productName}</button></div>
            : <button type="button" className="xenios-order-button" disabled={selected.size >= 200}
                onClick={() => setSelected((prior) => new Map(prior).set(key, { item, quantity: item.minimumQuantity }))}>Add {item.productName} to request</button>}
        </article>;
      })}</div>
      <nav className="xenios-order-pagination" aria-label="Catalog pages">
        <button disabled={page <= 1 || !catalog} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span>
        <button disabled={!catalog || page * catalog.pageSize >= catalog.total} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
      <p>Up to 200 exact variants per request. Unavailable and coming-soon entries remain visible with their restrictions.</p>
      </div><aside className="xenios-order-summary" aria-label="Selected request items">
        <h2>Your request</h2>
        <div className="xenios-order-next-action">
          <button className="xenios-order-button" aria-describedby={actionReasonId}
            disabled={!selected.size || !config || !storage || !continuationEnabled}
            onClick={() => { setStep("contact"); setError(""); }}>Continue to contact</button>
          <p id={actionReasonId} className="xenios-order-small">{nextReason}</p>
        </div>
        <p role="status">{selectedProducts} products | {selections.length} exact variants | {selectedUnits} requested units</p>
        {!selections.length ? <p>No products selected yet. Add an eligible item from the catalog.</p> : <ul>
          {selections.map(({ item, quantity }) => <li key={catalogItemKey(item)}>
            <strong>{item.productName}</strong><span>{item.specification || item.variantId}</span>
            <span>Requested quantity: {quantity}</span>
            {editingSelection === catalogItemKey(item) ? <>
              <label>Requested quantity for selected {item.productName} {item.specification || item.variantId}
                <input type="number" min={item.minimumQuantity} max={item.maximumQuantity ?? undefined}
                  step={item.quantityIncrement} value={quantity} autoFocus
                  onChange={(event) => setSelected((prior) => new Map(prior).set(catalogItemKey(item),
                    { item, quantity: clampQuantity(item, Number(event.target.value)) }))} />
              </label>
              <button type="button" className="xenios-order-link" onClick={() => setEditingSelection(null)}>Done editing quantity</button>
            </> : <button type="button" className="xenios-order-link"
              aria-label={"Edit selected quantity for " + item.productName + " " + (item.specification || item.variantId)}
              onClick={() => setEditingSelection(catalogItemKey(item))}>Edit quantity</button>}
            <button type="button" className="xenios-order-link" aria-label={"Remove selected " + item.productName + " " + (item.specification || item.variantId)}
              onClick={() => setSelected((prior) => { const next = new Map(prior); next.delete(catalogItemKey(item)); return next; })}>Remove</button>
          </li>)}
        </ul>}
        <p className="xenios-order-small">A request is not an approved order. Final quantities, prices and availability require review.</p>
      </aside></div>
    </>}
    {step === "contact" && <form onSubmit={captureContact}>
      <div className="xenios-order-grid"><label>Full legal name<input name="name" required autoComplete="name" maxLength={200} /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" maxLength={320} /></label>
        <label>Phone<input name="phone" type="tel" required autoComplete="tel" maxLength={50} /></label></div>
      {addressFields("shipping", "Delivery address")}
      <label className="xenios-order-check"><input type="checkbox" checked={billingSame} onChange={(event) => setBillingSame(event.target.checked)} />Billing address is the same</label>
      {!billingSame && addressFields("billing", "Billing address")}
      <label className="xenios-order-check"><input name="age" type="checkbox" required />I confirm I am at least 18 years old.</label>
      <div className="xenios-order-actions"><button type="button" onClick={backToCatalog}>Back to catalog / Continue browsing</button><button className="xenios-order-button" type="submit">Review request</button></div>
    </form>}
    {step === "review" && <section className="xenios-order-panel"><h2>Review your request</h2>
      <p>{contact?.fullLegalName} | {contact?.email}</p>
      <ul>{selections.map(({ item, quantity }) => <li key={catalogItemKey(item)}>{item.productName} | {item.specification || item.variantId} | Requested quantity: {quantity} | Pending {item.clinicalReviewRequired ? "clinical" : "internal"} review</li>)}</ul>
      <fieldset disabled={busy || frozen.current !== null} className="xenios-order-acknowledgments"><legend>Confirm the current requirements</legend>
        {requirements.map((entry) => { const key = agreementRequirementKey(entry); return <label className="xenios-order-check" key={key}>
          <input type="checkbox" checked={acknowledged.has(key)} onChange={(event) => setAcknowledged((prior) => {
            const next = new Set(prior); if (event.target.checked) next.add(key); else next.delete(key); return next;
          })} />{entry.label}</label>; })}</fieldset>
      <p>{REQUEST_INTENT_NOTICE}</p><p>Delivery dates are not guaranteed by this request. The team must confirm any proposed arrival date after review.</p>
      <div className="xenios-order-actions">
        <button disabled={busy || frozen.current !== null} onClick={() => { setAcknowledged(new Set()); backToCatalog(); }}>Edit selection</button>
        <button className="xenios-order-button" disabled={busy || !continuationEnabled || !requirements.length || requirements.some((entry) => !acknowledged.has(agreementRequirementKey(entry)))}
          onClick={() => void submit()}>{frozen.current ? "Retry same request" : "Submit for review"}</button>
      </div><a href="/support">Contact support</a>
    </section>}
  </section>;
}
