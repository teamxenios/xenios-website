import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { validateAddress, type AssistedOrderContactInput } from "../../../../shared/research/assisted-order/contract";
import {
  REQUEST_INTENT_NOTICE, REQUEST_INTENT_RECOVERY_NOTICE, validateRequestIntentInput,
  type RequestIntentCatalogItem, type RequestIntentCatalogPage, type RequestIntentInput, type RequestIntentReceipt,
} from "../../../../shared/research/assisted-order/request-intent";
import type { DirectPurchaseRefusal } from "../../../../shared/research/master-offerings/pathway-authority";
import { catalogItemKey, catalogPriceLabel, clampQuantity, requiredAcknowledgmentEntries, agreementRequirementKey, money, type AssistedOrderWizardConfig } from "./wizard-state";
import { createRequestIntentApi, isKnownIntentPrewriteRefusal, intentRefusalGuidance, type RequestIntentApi } from "./request-intent-api";
import { clearConfirmedIntentAttempt, clearFirstRefusedIntentAttempt, postIntentAttempt, readIntentAttempt, type IntentAttempt } from "./request-intent-attempt";
import { forgetConfirmedReceipt, readConfirmedReceiptRecord, rememberConfirmedReceipt } from "./request-intent-continuation";
import type { StorefrontIntent } from "../storefront/entry-intent";
import { isResearchCartScope } from "../cart-session";
import { ProductMedia } from "../product-media/ProductMedia";
import { ReviewedProductContent } from "../master-offerings/ReviewedProductContent";
import { reviewedPackage } from "@shared/research/master-offerings/approved-content";
import { EARLY_ACCESS_ENTRY_PATH, normalizeResearchPath } from "@shared/research/paths";
import { EarlyAccessRequestGuide } from "../early-access/EarlyAccessRequestGuide";
import { RequestIntentReceipt as ReceiptView } from "./RequestIntentReceipt";
import { matchesOrderEntryIntent, orderEntryQuantityAllowed } from "../early-access/orderEntryIntent";
import { catalogPresentationLabel } from "../master-offerings/catalog-presentation-labels";
import "./assisted-order.css";
import { EARLY_ACCESS_REQUEST_CTA, finalRequestActionLabel } from "../early-access/request-experience-copy";
import { PersistentRequestBar } from "./PersistentRequestBar";

const defaultApi = createRequestIntentApi();
type Selection = Readonly<{ item: RequestIntentCatalogItem; quantity: number }>;
function browserStorage(): Storage | null { try { return window.sessionStorage; } catch { return null; } }

// Presentation of the server's reason only. Request eligibility remains the
// server's selectableForReview/intentExclusion decision, separate from purchase.
const RESTRICTION_COPY: Readonly<Record<DirectPurchaseRefusal, string>> = {
  provider_pathway_family: "Provider review is required before any purchase.",
  care_pathway_display_state: "Provider review is required before any purchase.",
  family_outside_launch_scope: "This item is not offered for direct purchase.",
  classification_pending: "Product classification must be confirmed before purchase.",
  formulation_hold: "This formulation is on hold pending review.",
  non_merchandise_family: "This shipping or service entry is not a product request.",
};
function restrictionCopy(code: string): string {
  return Object.prototype.hasOwnProperty.call(RESTRICTION_COPY, code)
    ? RESTRICTION_COPY[code as DirectPurchaseRefusal]
    : "A purchase restriction applies. Its details need to be confirmed.";
}

function CatalogDetails({ item, variantIds, showMedia }: {
  item: RequestIntentCatalogItem;
  variantIds: readonly string[];
  showMedia: boolean;
}) {
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="xenios-order-link"
        aria-label={"View details for " + item.productName + (item.specification ? ", " + item.specification : "")}>
        View details
      </button>
    </DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] min-w-0 overflow-y-auto rounded-xl bg-paper text-ink max-[701px]:grid-cols-[minmax(0,1fr)] max-[701px]:px-[16px]">
      <DialogTitle className="break-words pr-8 max-[701px]:pr-[max(40px,calc(2rem_+_8px))]">{item.productName}</DialogTitle>
      <DialogDescription className="text-ink-mute">
        {item.selectableForReview
          ? "Return to the catalog to add this selection for review. Final quantities, prices and availability are confirmed during review."
          : "Return to the catalog for this listing’s current availability and request options."}
      </DialogDescription>
      <DialogClose asChild>
        <button type="button" className="min-h-11 justify-self-start rounded-md px-2 text-sm font-semibold text-ink underline">
          Back to catalog
        </button>
      </DialogClose>
      {showMedia && <ProductMedia productName={item.productName} variantIds={variantIds} reviewedMedia={item.reviewedMedia} detail />}
      {item.reviewedContent && <ReviewedProductContent content={item.reviewedContent} inDialog />}
      {(item.specification || item.format || item.packBasis) && <dl className="grid min-w-0 gap-2 break-words text-sm">
        {item.specification && <div><dt className="font-semibold">Specification</dt><dd>{item.specification}</dd></div>}
        {item.format && <div><dt className="font-semibold">Format</dt><dd>{item.format}</dd></div>}
        {item.packBasis && <div><dt className="font-semibold">Pack basis</dt><dd>{item.packBasis}</dd></div>}
      </dl>}
    </DialogContent>
  </Dialog>;
}

/** The price line on a request-intent card. Quote-only items read "Request a quote". */
export function requestIntentPriceNote(item: Readonly<{ unitPriceCents: number | null; clinicalReviewRequired: boolean }>): string {
  if (item.clinicalReviewRequired) return "Final price follows applicable review.";
  return item.unitPriceCents === null
    ? catalogPriceLabel(null)
    : money(item.unitPriceCents) + " (catalog display, not a final quote)";
}

type RequestIntentFormProps = Readonly<{ api?: RequestIntentApi; storage?: Storage | null; embedded?: boolean;
  continuationEnabled?: boolean; onStepChange?: (step: "products" | "contact" | "review") => void;
  /** Called only after a proven first prewrite agreement refusal, never an uncertain retry. */
  onAgreementStandingRequired?: () => void;
  entryIntent?: StorefrontIntent | null; onConfirmedReceipt?: (receipt: RequestIntentReceipt, recovered?: boolean) => void;
  /** The opaque owner this mount is keyed by. A reference confirmed earlier in this tab reopens only for the same owner. */
  ownerKey?: string }>;

/** Reusable inside the existing customer shell. No new global Auth, cart, catalog or legal authority. */
export function RequestIntentForm(props: RequestIntentFormProps) {
  // "Start another request" remounts the session, so every selection, contact
  // draft, acknowledgment and frozen attempt of the confirmed request is gone.
  const [generation, setGeneration] = useState(0);
  return <RequestIntentFormSession key={generation} {...props} focusHeadingOnMount={generation > 0}
    onStartAnother={() => setGeneration((value) => value + 1)} />;
}

function RequestIntentFormSession({
  api = defaultApi, storage = browserStorage(), embedded = false, continuationEnabled = true, onStepChange, entryIntent, onConfirmedReceipt,
  ownerKey = "unscoped", onStartAnother, focusHeadingOnMount = false, onAgreementStandingRequired,
}: RequestIntentFormProps & Readonly<{ onStartAnother: () => void; focusHeadingOnMount?: boolean }>) {
  // Only the public guest mount has non-sticky chrome. Member shells retain their
  // current layout and own sticky-header behavior.
  const compactGuestCatalog = embedded && ownerKey === "early-access-session";
  const catalogStartRef = useRef<HTMLDivElement>(null);
  const pendingCatalogScroll = useRef(false);
  const requestSummaryId = useId();
  const contactFormId = useId();
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [restored] = useState(() => storage ? readIntentAttempt(storage) : null);
  // A reference confirmed in an earlier page load of this tab is shown again. An
  // uncertain attempt still takes precedence, because it may need recovery.
  const [reopened] = useState(() => storage && !restored ? readConfirmedReceiptRecord(storage, ownerKey) : null);
  // A reopened receipt reports the final step, as a live confirmation does, so a surrounding shell matches it.
  const [step, setStep] = useState<"products" | "contact" | "review">(reopened ? "review" : "products");
  const [config, setConfig] = useState<AssistedOrderWizardConfig | null>(null);
  const [requirementsNeedRefresh, setRequirementsNeedRefresh] = useState(false);
  const [catalog, setCatalog] = useState<RequestIntentCatalogPage | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlyMap<string, Selection>>(new Map());
  const [editingSelection, setEditingSelection] = useState<string | null>(null);
  const [contact, setContact] = useState<AssistedOrderContactInput | null>(null);
  // Unreviewed values belong only to this mounted form, never retry storage.
  const [contactDraft, setContactDraft] = useState<FormData | null>(null);
  const [billingSame, setBillingSame] = useState(true);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [receipt, setReceipt] = useState<RequestIntentReceipt | null>(reopened);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const frozen = useRef<{ readonly attempt: IntentAttempt; readonly input: RequestIntentInput; postsStarted: number } | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const contactHeading = useRef<HTMLHeadingElement>(null);
  const previousFocusState = useRef({ step, receipt });
  const [hintItem, setHintItem] = useState<RequestIntentCatalogItem | null>(null);
  const [hintChecked, setHintChecked] = useState(false);
  const hintKey = entryIntent ? JSON.stringify(entryIntent) : "";
  useEffect(() => { onStepChange?.(step); }, [step, onStepChange]);
  useEffect(() => {
    let current = true;
    setHintItem(null); setHintChecked(false);
    if (!entryIntent || restored || reopened) return;
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
  }, [api, hintKey, restored, reopened]);
  const selections = [...selected.values()];
  const selectedUnits = selections.reduce((total, selection) => total + selection.quantity, 0);
  const selectedProducts = new Set(selections.map(({ item }) => item.productId)).size;
  const requirements = config ? requiredAcknowledgmentEntries(config, selections.some(({ item }) => item.researchUseOnly)) : [];
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const changed = previousFocusState.current.step !== step || previousFocusState.current.receipt !== receipt;
    previousFocusState.current = { step, receipt };
    // Initial focus belongs to the surrounding access/agreement shell. Move it
    // only after a customer changes step or confirms an existing saved request.
    if (changed) heading.current?.focus();
  }, [step, receipt]);
  // A session started by the customer's own "Start another request" receives focus like any step change.
  useEffect(() => { if (focusHeadingOnMount) heading.current?.focus(); }, [focusHeadingOnMount]);
  useEffect(() => {
    if (restored || reopened) return;
    let current = true;
    void api.config().then((value) => { if (current) setConfig(value); })
      .catch(() => { if (current) setError("Current request requirements are unavailable. Submission remains closed."); });
    return () => { current = false; };
  }, [api, restored, reopened]);
  useEffect(() => {
    if (restored || reopened) return;
    let current = true;
    setCatalog(null);
    setCatalogFailed(false);
    void api.catalog({ search, family: family || undefined, page, pageSize: 24 })
      .then((value) => { if (current) setCatalog(value); })
      .catch(() => { if (current) setCatalogFailed(true); });
    return () => { current = false; };
  }, [api, search, family, page, restored, reopened, catalogRetry]);

  async function refreshRequirements() {
    if (locked.current || !requirementsNeedRefresh || frozen.current) return;
    locked.current = true; setBusy(true);
    try {
      const value = await api.config();
      if (!mounted.current) return;
      setConfig(value); setAcknowledged(new Set()); setRequirementsNeedRefresh(false); setError("");
    } catch {
      if (mounted.current) setError("The current requirements could not be refreshed. Your selections and contact details are still here. Try again or contact support.");
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }

  async function recover() {
    if (!restored || !storage || locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const saved = await api.recover(restored.key);
      if (!mounted.current) return;
      if (!saved) { setError("The saved result is not yet confirmed. Keep this attempt and check again, or contact support before any replacement."); return; }
      if (!clearConfirmedIntentAttempt(storage, restored)) throw new Error("Session changed.");
      setReceipt(saved); setError("");
      rememberConfirmedReceipt(storage, ownerKey, saved);
      onConfirmedReceipt?.(saved, true);
    } catch { if (mounted.current) setError(REQUEST_INTENT_RECOVERY_NOTICE); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function rememberContactDraft(form: HTMLFormElement) {
    const data = new FormData(form);
    // Hidden billing fields are absent; explicit empty values are still current.
    for (const suffix of ["Line1", "Line2", "City", "Region", "PostalCode", "CountryCode"]) {
      const name = "billing" + suffix, retained = contactDraft?.get(name) ?? null;
      if (!data.has(name) && retained !== null) data.set(name, retained);
    }
    setContactDraft(data);
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
      setContactDraft(null);
      setStep("review"); setError("");
    } catch { setError("Complete the required contact and address fields."); }
  }
  async function submit() {
    if (locked.current || !storage || !config || !contact || !continuationEnabled || requirementsNeedRefresh) return;
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
      if (mounted.current) {
        setReceipt(saved); setError("");
        // Display continuity only; the marker above is already cleared and the server holds the request.
        rememberConfirmedReceipt(storage, ownerKey, saved);
        onConfirmedReceipt?.(saved);
      }
    } catch (error) {
      if (sentSnapshot && frozen.current === sentSnapshot && isKnownIntentPrewriteRefusal(error)
        && clearFirstRefusedIntentAttempt(storage, sentSnapshot.attempt,
          { firstPost, stillCurrent: mounted.current, error })) {
        frozen.current = null;
        setAcknowledged(new Set());
        if (error.status === 400 && error.code === "current_acknowledgments_required") {
          // Only a proven first prewrite refusal may replace the requirements.
          // An earlier uncertain POST retains its original payload and key.
          setConfig(null); setRequirementsNeedRefresh(true);
          setError("This request was not saved. Refresh the current requirements, then review and confirm them before submitting a new attempt.");
        } else if (error.status === 403 && error.code === "agreement_standing_required"
          && onAgreementStandingRequired) {
          // We are inside the existing first-post + owned-marker clearance
          // proof. A lost reply or later refusal never reaches this callback.
          // Keep the request form mounted: selections, contact and billing stay
          // in memory. Reaccepting the policy must NOT auto-submit this request.
          setConfig(null);
          setRequirementsNeedRefresh(true);
          setError("This request was not saved. Review the current access policy and refresh the request requirements before submitting again. Your selections and contact details are still on this page. Nothing will be submitted automatically.");
          onAgreementStandingRequired();
        } else setError(intentRefusalGuidance(error));
      } else if (mounted.current) {
        setError(REQUEST_INTENT_RECOVERY_NOTICE);
      }
    }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const contactValue = (name: string, fallback: string) => String(contactDraft?.get(name) ?? fallback);
  const addressFields = (prefix: "shipping" | "billing", label: string) => {
    const address = prefix === "shipping" ? contact?.shippingAddress : contact?.billingAddress;
    return <fieldset className="xenios-order-grid">
    <legend>{label}</legend>
    {([["Line1", "line1", "Street address"], ["Line2", "line2", "Apartment or suite (optional)"], ["City", "city", "City"],
      ["Region", "region", "State or region"], ["PostalCode", "postalCode", "Postal code"], ["CountryCode", "countryCode", "Country code"]] as const).map(([suffix, key, text]) =>
      <label key={suffix}>{text}<input name={prefix + suffix} required={suffix !== "Line2"}
        maxLength={suffix === "CountryCode" ? 2 : 200} defaultValue={contactValue(prefix + suffix, address?.[key] ?? (suffix === "CountryCode" ? "US" : ""))}
        autoComplete={prefix + " " + ({ Line1: "address-line1", Line2: "address-line2", City: "address-level2",
          Region: "address-level1", PostalCode: "postal-code", CountryCode: "country" } as Record<string, string>)[suffix]} /></label>)}
    </fieldset>;
  };

  // Wait for the next page to mount: the existing fetch clears the old cards,
  // which can temporarily shorten the document and clamp an earlier scroll.
  useEffect(() => {
    if (!catalog || !pendingCatalogScroll.current) return;
    pendingCatalogScroll.current = false;
    if (compactGuestCatalog && window.matchMedia?.("(max-width: 700px)")?.matches) {
      catalogStartRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    }
  }, [catalog, compactGuestCatalog]);

  // Inside a page that already has its own h1, the form's top heading sits one level below it.
  const Heading = embedded ? "h2" : "h1";
  const catalogPages = catalog ? Math.max(1, Math.ceil(catalog.total / catalog.pageSize)) : null;
  const catalogPagination = <nav className="xenios-order-pagination" aria-label="Catalog pages">
    <button type="button" disabled={page <= 1 || !catalog} onClick={() => {
      pendingCatalogScroll.current = compactGuestCatalog && Boolean(window.matchMedia?.("(max-width: 700px)")?.matches);
      setPage((value) => value - 1);
    }}>Previous</button>
    <span aria-live="polite" aria-atomic="true">{catalogPages ? "Page " + page + " of " + catalogPages : "Page " + page}</span>
    <button type="button" disabled={!catalog || page * catalog.pageSize >= catalog.total} onClick={() => {
      pendingCatalogScroll.current = compactGuestCatalog && Boolean(window.matchMedia?.("(max-width: 700px)")?.matches);
      setPage((value) => value + 1);
    }}>Next</button>
  </nav>;
  const hasFrozenAttempt = frozen.current !== null;
  if (receipt) return <ReceiptView receipt={receipt} headingRef={heading} headingLevel={embedded ? 2 : 1}
    reopened={receipt === reopened} recovered={restored !== null}
    onStartAnother={() => { if (storage) forgetConfirmedReceipt(storage); onStartAnother(); }} />;

  if (restored) return <section className="xenios-order-page"><Heading ref={heading} tabIndex={-1}>Check your earlier request</Heading>
    <p>Only the attempt marker was retained. Product selections and contact information were not saved in this browser.</p>
    <p>{REQUEST_INTENT_RECOVERY_NOTICE}</p>{error && <p role="alert">{error}</p>}
    <button className="xenios-order-button" disabled={busy} onClick={() => void recover()}>Check saved request</button>
    <a href="/research/support">Contact support before a replacement</a></section>;

  const currentPath = typeof window === "undefined" ? "/" : normalizeResearchPath(window.location.pathname);
  const showEarlyAccessGuide = embedded && storage !== null && config !== null && !catalogFailed
    && (currentPath === EARLY_ACCESS_ENTRY_PATH || currentPath === "/research/early-access/order-request");

  return <section className={(embedded ? "xenios-order-page xenios-order-page--embedded" : "xenios-order-page")
    + (compactGuestCatalog ? " xenios-order-page--guest-catalog" : "")}>
    <header className="xenios-order-hero"><Heading ref={heading} tabIndex={-1}>Build your request</Heading>
      <p>{REQUEST_INTENT_NOTICE}</p><p>Clinical and nonclinical selections can be reviewed in one request. Do not enter medical history, upload documents or send payment here.</p></header>
    {!continuationEnabled && <p role="status">Complete the existing access and agreement requirements before continuing. No request has been submitted.</p>}
    {!embedded && <p><a href="/research/early-access">Review access and agreement requirements</a></p>}
    {!storage && <p role="alert">This browser cannot preserve a safe retry marker. Submission is unavailable. Contact support.</p>}
    {error && <p className="xenios-order-error" role="alert">{error}</p>}
    {requirementsNeedRefresh && !frozen.current && <section className="xenios-order-panel" aria-label="Refresh request requirements">
      <p role="status">{busy ? "Refreshing current requirements..." : "Refresh the current requirements to continue with your existing selections and contact details."}</p>
      <button type="button" className="xenios-order-button" disabled={busy} onClick={() => void refreshRequirements()}>Refresh requirements</button>
    </section>}
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
      {showEarlyAccessGuide && <EarlyAccessRequestGuide browseTargetId="early-access-catalog" />}
      {(compactGuestCatalog || showEarlyAccessGuide) && <div ref={catalogStartRef} className="xenios-order-catalog-start"
        id={showEarlyAccessGuide ? "early-access-catalog" : undefined} tabIndex={showEarlyAccessGuide ? -1 : undefined} />}
      <div className={compactGuestCatalog ? "xenios-order-catalog-toolbar" : undefined}>
        <div className="xenios-order-grid">
          <label>Search catalog<input value={search} onChange={(event) => { pendingCatalogScroll.current = false; setSearch(event.target.value); setPage(1); }} /></label>
          <label>Product family<select value={family} onChange={(event) => { pendingCatalogScroll.current = false; setFamily(event.target.value); setPage(1); }}>
            <option value="">All families</option>{catalog?.families.map((value) => <option key={value} value={value}>{catalogPresentationLabel(value, value.replaceAll("_", " "))}</option>)}
          </select></label>
        </div>
        {compactGuestCatalog && <div className="xenios-order-mobile-pagination">{catalogPagination}</div>}
      </div>
      {catalogFailed ? <section className="xenios-order-panel" aria-label="Catalog unavailable">
        <p role="alert">The current catalog could not be confirmed. Retry to continue with your existing selections.</p>
        <button type="button" className="xenios-order-button" onClick={() => setCatalogRetry((value) => value + 1)}>Retry catalog</button>
        <p>For manual catalog and ordering help, call <a href="tel:7374186381">737-418-6381</a>.</p>
      </section> : <p role="status">{catalog ? catalog.total + " visible catalog entries. " + selected.size + " selected." : "Loading catalog..."}</p>}
      <div className="xenios-order-catalog-layout"><div><div className="xenios-order-cards">{catalog?.items.map((item) => {
        const key = catalogItemKey(item), selection = selected.get(key);
        const sourceVariantId = item.sourceSelection?.variantId;
        const variantIds = sourceVariantId ? [sourceVariantId] : [];
        const packageLabel = reviewedPackage(item.reviewedContent);
        const guestCatalog = ownerKey === "early-access-session";
        const reviewedMemberListing = isResearchCartScope(ownerKey) && Boolean(sourceVariantId) &&
          !item.clinicalReviewRequired;
        const showMedia = guestCatalog || (reviewedMemberListing && Boolean(item.reviewedMedia));
        const showDetails = showMedia || (reviewedMemberListing && Boolean(item.reviewedContent));
        return <article className="xenios-order-card" key={key}>
          <div className="xenios-order-card-intro">
            {showMedia && <div className="xenios-order-card-media">
              <ProductMedia productName={item.productName} variantIds={variantIds} reviewedMedia={item.reviewedMedia} />
            </div>}
            <div className="xenios-order-card-identity">
              <h2>{item.productName}</h2>
              <p>{item.specification || "Form not stated"}</p>
              {item.reviewedContent && <p className="xenios-order-card-description">
                {item.reviewedContent.brand && <strong>{item.reviewedContent.brand} · </strong>}{item.reviewedContent.summary}
              </p>}
              {packageLabel && <p><strong>Package</strong> · {packageLabel}</p>}
            </div>
          </div>
          <div className="xenios-order-card-meta">
            <p>{item.clinicalReviewRequired ? "Clinical review required. Not a prescription." : item.researchUseOnly ? "Research Use Only. Nonclinical use only." : "Internal review required."}</p>
            {item.sourceRefusal && <p>Current restriction: {restrictionCopy(item.sourceRefusal)} Adding a request does not remove this restriction.</p>}
            <p>{requestIntentPriceNote(item)}</p>
          </div>
          <div className="xenios-order-card-actions">
          {showDetails && <CatalogDetails item={item} variantIds={variantIds} showMedia={showMedia} />}
          {!item.selectableForReview ? <p>{item.intentExclusion === "coming_soon" ? "Coming soon" : "Shipping or service entry, not a product request"}</p> : selection
            ? <div className="xenios-order-quantity">
              <button type="button" aria-label={"Decrease requested quantity for " + item.productName}
                disabled={clampQuantity(item, selection.quantity - item.quantityIncrement) === selection.quantity}
                onClick={() => setSelected((prior) => {
                  const current = prior.get(key); if (!current) return prior;
                  return new Map(prior).set(key, { item, quantity: clampQuantity(item, current.quantity - item.quantityIncrement) });
                })}>−</button>
              <label><span className="xenios-order-card-quantity-label">Requested quantity for {item.productName}</span>
                <input type="number" aria-label={compactGuestCatalog ? "Requested quantity for " + item.productName : undefined}
                  min={item.minimumQuantity} max={item.maximumQuantity ?? undefined} step={item.quantityIncrement} value={selection.quantity}
                onChange={(event) => setSelected((prior) => new Map(prior).set(key, { item, quantity: clampQuantity(item, Number(event.target.value)) }))} /></label>
              <button type="button" aria-label={"Increase requested quantity for " + item.productName}
                disabled={clampQuantity(item, selection.quantity + item.quantityIncrement) === selection.quantity}
                onClick={() => setSelected((prior) => {
                  const current = prior.get(key); if (!current) return prior;
                  return new Map(prior).set(key, { item, quantity: clampQuantity(item, current.quantity + item.quantityIncrement) });
                })}>+</button>
              <button type="button" className="xenios-order-link" onClick={() => setSelected((prior) => { const next = new Map(prior); next.delete(key); return next; })}>Remove {item.productName}</button></div>
            : <button type="button" className="xenios-order-button" disabled={selected.size >= 200}
                aria-label={compactGuestCatalog ? "Add to request: " + item.productName + (item.specification ? ", " + item.specification : "") : undefined}
                onClick={() => setSelected((prior) => new Map(prior).set(key, { item, quantity: item.minimumQuantity }))}>{compactGuestCatalog ? "Add to request" : "Add " + item.productName + " to request"}</button>}
          </div>
        </article>;
      })}</div>
      <div className="xenios-order-bottom-pagination">{catalogPagination}</div>
      <p>Up to 200 exact variants per request. Unavailable and coming-soon entries remain visible with their restrictions.</p>
      </div><aside className="xenios-order-summary" aria-label="Selected request items">
        {compactGuestCatalog && <button type="button" className="xenios-order-summary-toggle"
          aria-expanded={mobileSummaryOpen} aria-controls={requestSummaryId}
          onClick={() => setMobileSummaryOpen((value) => !value)}>
          <span>{EARLY_ACCESS_REQUEST_CTA.summary} ({selections.length})</span>
          <span aria-hidden="true">{mobileSummaryOpen ? "−" : "+"}</span>
        </button>}
        <div id={requestSummaryId} className={"xenios-order-summary-content" + (mobileSummaryOpen ? " is-open" : "")}>
        <h2>Your request</h2>
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
        <button className="xenios-order-button" disabled={!selected.size || !config || !storage || !continuationEnabled} onClick={() => { setStep("contact"); setError(""); }}>{EARLY_ACCESS_REQUEST_CTA.details}</button>
        </div>
      </aside></div>
    </>}
    {step === "contact" && <form id={contactFormId} onSubmit={captureContact}>
      <h2 ref={contactHeading} tabIndex={-1}>Contact details</h2>
      <div className="xenios-order-grid"><label>Full legal name<input name="name" required autoComplete="name" maxLength={200} defaultValue={contactValue("name", contact?.fullLegalName ?? "")} /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" maxLength={320} defaultValue={contactValue("email", contact?.email ?? "")} /></label>
        <label>Phone<input name="phone" type="tel" required autoComplete="tel" maxLength={50} defaultValue={contactValue("phone", contact?.mobilePhone ?? "")} /></label></div>
      {addressFields("shipping", "Delivery address")}
      <label className="xenios-order-check"><input type="checkbox" checked={billingSame} onChange={(event) => {
        const form = event.currentTarget.form;
        if (event.currentTarget.checked && form) rememberContactDraft(form);
        setBillingSame(event.currentTarget.checked);
      }} />Billing address is the same</label>
      {!billingSame && addressFields("billing", "Billing address")}
      <label className="xenios-order-check"><input name="age" type="checkbox" required defaultChecked={contactDraft ? contactDraft.get("age") === "on" : contact?.ageConfirmed ?? false} />I confirm I am at least 18 years old.</label>
      <div className="xenios-order-actions"><button type="button" onClick={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        rememberContactDraft(form); setStep("products");
      }}>Back to products</button><button className="xenios-order-button" type="submit">{EARLY_ACCESS_REQUEST_CTA.finalReview}</button></div>
    </form>}
    {step === "review" && <section className="xenios-order-panel"><h2>{EARLY_ACCESS_REQUEST_CTA.finalHeading}</h2>
      <p>{hasFrozenAttempt
        ? "If the result is unconfirmed, choose Retry same request to send the original details again."
        : "Check your items and contact details, then choose Submit request. The team will review your request before any approval or payment."}</p>
      <p>{contact?.fullLegalName} | {contact?.email}</p>
      <ul>{selections.map(({ item, quantity }) => <li key={catalogItemKey(item)}>{item.productName} | {item.specification || item.variantId} | Requested quantity: {quantity} | Pending {item.clinicalReviewRequired ? "clinical" : "internal"} review</li>)}</ul>
      <fieldset disabled={busy || frozen.current !== null} className="xenios-order-acknowledgments"><legend>Confirm the current requirements</legend>
        {requirements.map((entry) => { const key = agreementRequirementKey(entry); return <label className="xenios-order-check" key={key}>
          <input type="checkbox" checked={acknowledged.has(key)} onChange={(event) => setAcknowledged((prior) => {
            const next = new Set(prior); if (event.target.checked) next.add(key); else next.delete(key); return next;
          })} />{entry.label}</label>; })}</fieldset>
      <p>{REQUEST_INTENT_NOTICE}</p><p>Delivery dates are not guaranteed by this request. The team must confirm any proposed arrival date after review.</p>
      <div className="xenios-order-actions">
        <button disabled={busy || frozen.current !== null} onClick={() => { setAcknowledged(new Set()); setStep("products"); }}>Edit selection</button>
        <button className="xenios-order-button" disabled={busy || !continuationEnabled || !requirements.length || requirements.some((entry) => !acknowledged.has(agreementRequirementKey(entry)))}
          onClick={() => void submit()}>{finalRequestActionLabel(hasFrozenAttempt, busy && hasFrozenAttempt)}</button>
      </div><a href="/research/support">Contact support</a>
    </section>}
    <PersistentRequestBar
      state={{ step, selectedCount: selected.size, continuationEnabled,
        storageReady: Boolean(storage), configReady: Boolean(config), contactReady: Boolean(contact),
        requirementsNeedRefresh, requirementsCount: requirements.length,
        allAcknowledged: requirements.every((entry) => acknowledged.has(agreementRequirementKey(entry))),
        busy, frozen: frozen.current !== null }}
      lines={selections.map(({ item, quantity }) => ({ key: catalogItemKey(item),
        name: item.productName, specification: item.specification || item.variantId, quantity }))}
      contactFormId={contactFormId}
      focusContactHeading={() => contactHeading.current?.focus()}
      onContinue={() => {
        if (!selected.size || !config || !storage || !continuationEnabled || busy || requirementsNeedRefresh) return;
        setStep("contact"); setError("");
      }}
      onSubmit={() => void submit()} />
  </section>;
}
