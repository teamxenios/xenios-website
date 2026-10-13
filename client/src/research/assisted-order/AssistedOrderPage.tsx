import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type {
  AssistedOrderActionGroup,
  AssistedOrderAddressInput,
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderSubmitInput,
  AssistedOrderWorkflowMode,
} from "../../../../shared/research/assisted-order/contract";
import {
  assistedOrderActionGroupLabels,
  assistedOrderActionGroups,
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
  attemptOwnsStoredDraft,
  clearAssistedOrderDraft,
  draftSelectionMap,
  probeAssistedOrderDraft,
  readAssistedOrderDraft,
  storeAssistedOrderDraft,
  type AssistedOrderAttemptIdentity,
  type AssistedOrderAttemptState,
  type AssistedOrderDraftInput,
  type AssistedOrderStoredAttemptState,
  type AssistedOrderWizardStep,
} from "./draft-store";
import { refreshSelectionSnapshots } from "./selection-refresh";
import { storeAssistedOrderReceipt } from "./storage";
import { EARLY_ACCESS_CUSTOMER_STEP_LABELS } from "../early-access/customerSteps";
import { OrderEntryIntentNotice } from "../early-access/OrderEntryIntentNotice";
import { matchesOrderEntryIntent, orderEntryIntentFromSearch, orderEntryQuantityAllowed, type OrderEntryIntentResolution } from "../early-access/orderEntryIntent";
import type { StorefrontIntent } from "../storefront/entry-intent";
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
  request_activation: "Request Order",
  availability_review: "Temporarily Unavailable",
};

const CATALOG_TIMEOUT_MS = 15_000;

function markCatalogTiming(name: string): void {
  try {
    globalThis.performance?.mark?.(name);
  } catch {
    // Timing evidence is diagnostic only and must never affect the order path.
  }
}

function measureCatalogTiming(
  name: string,
  startMark: string,
  endMark: string,
): void {
  try {
    globalThis.performance?.measure?.(name, startMark, endMark);
  } catch {
    // Missing marks or unsupported Performance APIs are safe to ignore.
  }
}

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

// Copy for outcomes the browser cannot know. After a network failure, a 5xx
// or a non-JSON answer the server may already hold the request, so nothing
// here may claim that nothing was ordered, and nothing may invite a fresh
// request. The only safe instruction is to retry the SAME attempt.
const UNCERTAIN_OUTCOME_MESSAGE =
  "Request not confirmed. Retry; do not start a new request. If retrying keeps failing, check your request status or contact support with the time of your attempt.";

// The key was already used for a request with different details. Whether
// that earlier request is the one the customer meant is not knowable here,
// so the key is kept and the customer is sent to status or support, never
// to a new submission.
const IDEMPOTENCY_CONFLICT_MESSAGE =
  "Your earlier request with these details may already have been received. Do not start a new request. Check your request status or contact support with the time of your attempt.";

// Shown when a draft whose last attempt was uncertain is restored (refresh,
// session re-unlock). Contact details are never persisted, so the retry only
// replays as the same request if the customer re-enters the same details.
const RESTORED_UNCERTAIN_NOTICE =
  "An earlier attempt to send this request may already have been saved. Retrying continues that same attempt: enter the same contact details and email address as before, and do not start a new request.";

// Drift after an uncertain attempt. The server checks price and catalog drift
// before it looks for a replay, so a saved earlier attempt cannot be confirmed
// from here. The key is kept, so a resubmission can only replay, conflict, or
// create the request for the first time, never duplicate it.
const DRIFT_AFTER_UNCERTAIN_MESSAGE =
  "Pricing or availability changed. An earlier attempt to send this request may already have been saved and cannot be confirmed here. Submitting again keeps the same request identity and will not create a second request.";

const DRIFT_FIRST_ATTEMPT_MESSAGE =
  "Pricing or availability changed while you were reviewing, so nothing was submitted.";

// A 403 after an uncertain attempt. Re-unlocking Early Access runs the
// protected-path storage sweep, which deletes this draft with its key and
// timestamp, so "retry the same request after unlocking" is a promise this
// page cannot keep. The only truthful direction is status or support.
const FORBIDDEN_AFTER_UNCERTAIN_MESSAGE =
  "Your Early Access session ended. An earlier attempt to send this request may already have been saved. Do not resubmit it: check your request status or contact support with the time of your attempt.";

// A 403 on a never-uncertain attempt is thrown before anything is persisted,
// and the same sweep empties the basket on re-unlock, so the request has to be
// entered again.
const FORBIDDEN_FIRST_ATTEMPT_MESSAGE =
  "Your Early Access session ended and nothing was saved. Unlock Early Access again and enter your request again.";

// The page no longer owns its stored attempt: the protected-path sweep ran
// while it stayed mounted, or another attempt took the store. Lost ownership
// alone proves nothing about the session and nothing about what the server
// holds, so neither copy claims an ended session or an unsaved request. An
// attempt that left this page (a stamp was issued and never released, or an
// uncertain outcome) may already be saved, and only status or support can say.
const STORE_LOST_MESSAGE =
  "This request can no longer be sent from this page. Return to Early Access and enter your request again.";
const STORE_LOST_AFTER_ATTEMPT_MESSAGE =
  "This request can no longer be sent from this page, and an earlier attempt may already have been saved. Do not resubmit it: check your request status or contact support with the time of your attempt.";

type SubmitFailureKind = "uncertain" | "drift" | "conflict" | "refused";

// Classifies a failed submission by what the server can be KNOWN to have done.
// Definitive refusals (validation, agreement standing, authorization, and
// drift on a first attempt) are thrown before the request is persisted. A
// network failure, a 5xx, a non-JSON body or an unfamiliar 409 may have
// landed after persistence, so they are uncertain.
function classifySubmitFailure(reason: unknown): SubmitFailureKind {
  if (!(reason instanceof AssistedOrderApiError)) return "uncertain";
  if (reason.status >= 500 || reason.code === "request_failed") return "uncertain";
  if (reason.code === "price_changed" || reason.code === "catalog_changed") return "drift";
  if (reason.code === "idempotency_conflict") return "conflict";
  if (reason.status === 409) return "uncertain";
  return "refused";
}

function ProductCard(props: {
  item: AssistedOrderCatalogItem;
  selection: { quantity: number } | undefined;
  onAdd: (item: AssistedOrderCatalogItem) => void;
  onQuantity: (item: AssistedOrderCatalogItem, quantity: number) => void;
  onRemove: (item: AssistedOrderCatalogItem) => void;
  requestedQuantity?: number;
}) {
  const { item, selection, onAdd, onQuantity, onRemove } = props;
  const selectable = selectableInResearchRequest(item);
  const careOnly = item.workflowMode === "provider_request";
  const unavailable = item.workflowMode === "availability_review";
  const requestOnly = item.workflowMode === "request_activation";
  const quantityHelpId = `order-quantity-help-${item.variantId}`;
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
      {requestOnly ? (
        <p className="xenios-order-notice">
          Submit a request and Xenios will review availability, classification,
          and next steps.
        </p>
      ) : null}
      {careOnly ? (
        <>
          <p className="xenios-order-notice" data-testid={`order-card-care-${item.variantId}`}>
            This product requires provider review through Xenios Care and cannot
            be added to a research order request.
          </p>
          <a
            className="xenios-order-button"
            href="/care"
            data-testid={`order-card-care-cta-${item.variantId}`}
          >
            {item.actionLabel}
          </a>
        </>
      ) : unavailable ? (
        <p
          className="xenios-order-notice"
          data-testid={`order-card-unavailable-${item.variantId}`}
        >
          This product is temporarily unavailable or held and cannot be added
          to an order request right now.
        </p>
      ) : !selectable ? (
        null
      ) : selection ? (
        <div className="xenios-order-quantity" role="group" aria-label={`Quantity for ${item.productName}`}>
          <button
            type="button"
            disabled={selection.quantity <= item.minimumQuantity}
            onClick={() => onQuantity(item, selection.quantity - item.quantityIncrement)}
            aria-label="Decrease quantity"
          >−</button>
          <input
            type="number"
            inputMode="numeric"
            min={item.minimumQuantity}
            max={item.maximumQuantity ?? undefined}
            step={item.quantityIncrement}
            value={selection.quantity}
            aria-label={`Quantity for ${item.productName}`}
            aria-describedby={quantityHelpId}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) onQuantity(item, value);
            }}
            style={{ width: 72, textAlign: "center" }}
          />
          <span className="xenios-order-sr-only" id={quantityHelpId}>
            Allowed quantity {item.minimumQuantity} to {item.maximumQuantity ?? "the current server limit"}, in increments of {item.quantityIncrement}.
          </span>
          <button
            type="button"
            disabled={item.maximumQuantity !== null && selection.quantity >= item.maximumQuantity}
            onClick={() => onQuantity(item, selection.quantity + item.quantityIncrement)}
            aria-label="Increase quantity"
          >+</button>
          <button className="xenios-order-link" type="button" onClick={() => onRemove(item)}>Remove</button>
        </div>
      ) : (
        <>
        {props.requestedQuantity !== undefined ? <p className="xenios-order-notice" data-testid={`order-card-requested-${item.variantId}`}>Requested quantity: {props.requestedQuantity}. Review this option before adding it.</p> : null}
        <button
          className="xenios-order-button"
          type="button"
          data-testid={`order-card-add-${item.variantId}`}
          onClick={() => onAdd(item)}
        >
          {item.actionLabel}
        </button>
        </>
      )}
    </article>
  );
}

export function AssistedOrderPage({
  embedded = false,
  continuationEnabled = true,
  onStepChange,
  entryIntent: suppliedEntryIntent,
  entryResolution,
}: Readonly<{
  embedded?: boolean;
  continuationEnabled?: boolean;
  onStepChange?: (step: AssistedOrderWizardStep) => void;
  entryIntent?: StorefrontIntent | null;
  entryResolution?: OrderEntryIntentResolution | null;
}> = {}) {
  const entryIntent = suppliedEntryIntent ?? orderEntryIntentFromSearch(typeof window === "undefined" ? "" : window.location.search);
  const [localEntryResolution, setLocalEntryResolution] = useState<OrderEntryIntentResolution | null>(null);
  const resolvedEntry = embedded ? entryResolution : localEntryResolution;
  const seededEntry = useRef<string | null>(null);
  // A draft persisted before a session bounce restores the basket and the
  // idempotency key, so the resumed submission replays as the SAME request.
  // Contact details are never persisted, so a restored wizard can resume at
  // products or contact, never directly at review.
  const [draft] = useState(() => readAssistedOrderDraft());
  const [step, setStep] = useState<AssistedOrderWizardStep>(() => {
    if (!continuationEnabled || !draft || draft.selections.length === 0) {
      return "products";
    }
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
  // The attempt key is minted once and never rotated by this page: a key that
  // changed after an uncertain outcome is how a duplicate order is made.
  const [idempotencyKey] = useState(
    () => draft?.idempotencyKey ?? newIdempotencyKey(),
  );
  // The acceptance timestamp is stamped once per attempt key and then frozen.
  // The server fingerprints acceptedAt, so a retry that restamped it would
  // stop replaying and read as a DIFFERENT request under the same key.
  const [acceptedAt, setAcceptedAt] = useState<string | null>(
    () => draft?.acceptedAt ?? null,
  );
  // "uncertain" once any submission under this key ended without a definitive
  // answer. From then on the key and timestamp are kept for every retry and
  // refresh, and no copy may invite a fresh request.
  const [attemptState, setAttemptState] = useState<AssistedOrderAttemptState>(
    () => draft?.attemptState ?? "none",
  );
  const [contact, setContact] = useState<ContactState>(initialContact);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [actionGroup, setActionGroup] = useState<"" | AssistedOrderActionGroup>("");
  const [page, setPage] = useState(1);
  const [catalogRequestVersion, setCatalogRequestVersion] = useState(0);
  const [catalog, setCatalog] = useState<AssistedOrderCatalogPage | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigState>({ kind: "loading" });
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() =>
    draft?.attemptState === "uncertain" ? RESTORED_UNCERTAIN_NOTICE : null,
  );
  const refreshedDraft = useRef(false);
  // True only while a POST is outstanding. Read by the write-through effect so
  // a re-render during the request keeps the in-flight marker in the draft
  // instead of overwriting it with the page's pre-answer state.
  const inFlight = useRef(false);
  // Lifecycle generation. A submit closure captures the value when it starts
  // and compares after every await: a changed value means this page was lost
  // (unmounted) and the closure is retired, whatever it learned.
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  // Whether this page ever managed to store its draft, and whether its own
  // last write failed. Once a draft was stored, a reachable but empty store
  // means the draft was taken away (the protected-path sweep, or a receipt):
  // the page owns nothing and writes nothing more. A page whose own writes
  // fail keeps working in memory, exactly as before.
  // A page restored from a draft already owns that draft: a previous page in
  // this tab wrote it, and it is this page's last known persisted identity.
  // Seeding both refs from the restored draft (Doc102 QS-1) means a restored
  // page whose own writes fail from its first render is still forgiven that
  // lag on its receipt, refusal and uncertain paths, instead of dropping its
  // own committed success, and is still disowned after the sweep (store
  // absent, draft once stored). A fresh page is unchanged.
  const storedOnce = useRef(draft !== null);
  const storeFailed = useRef(false);
  // The identity this page last managed to write. While its own writes fail,
  // the store may lag behind the page by exactly this identity, and that lag
  // is the only thing a failed write forgives.
  const lastPersisted = useRef<AssistedOrderAttemptIdentity | null>(
    draft ? { idempotencyKey: draft.idempotencyKey, acceptedAt: draft.acceptedAt } : null,
  );
  const persistDraft = (draft: AssistedOrderDraftInput): void => {
    if (storeAssistedOrderDraft(draft)) {
      storedOnce.current = true;
      storeFailed.current = false;
      lastPersisted.current = {
        idempotencyKey: draft.idempotencyKey,
        acceptedAt: draft.acceptedAt ?? null,
      };
    } else {
      storeFailed.current = true;
    }
  };
  const ownsAttempt = (attempt: AssistedOrderAttemptIdentity): boolean => {
    const probe = probeAssistedOrderDraft();
    if (attemptOwnsStoredDraft(attempt, storedOnce.current, probe)) {
      return true;
    }
    // A readable store that is empty after this page's own write, or that
    // holds any other identity, is never this page's to touch, whatever its
    // own write failures say. Only its last successful write is forgiven.
    const last = lastPersisted.current;
    return (
      storeFailed.current &&
      probe.kind === "present" &&
      last !== null &&
      probe.draft.idempotencyKey === last.idempotencyKey &&
      probe.draft.acceptedAt === last.acceptedAt
    );
  };
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!entryIntent || entryIntent.action === "CARE" || resolvedEntry?.kind !== "matched" ||
      resolvedEntry.quantity !== entryIntent.quantity) return;
    const key = JSON.stringify(entryIntent);
    if (seededEntry.current === key || !matchesOrderEntryIntent(resolvedEntry.item, entryIntent)) return;
    seededEntry.current = key;
    setSearch(resolvedEntry.item.productName);
    setFamily(entryIntent.family);
    setPage(1);
  }, [entryIntent, resolvedEntry]);

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  useEffect(() => {
    if (continuationEnabled) return;
    setContact(initialContact);
    setAcknowledged(new Set());
    if (step !== "products") {
      setStep("products");
      setError(
        "Complete the required agreement and account checks above before continuing.",
      );
    }
  }, [continuationEnabled, step]);

  const loadConfig = useCallback(() => {
    setConfig({ kind: "loading" });
    loadAssistedOrderConfig()
      .then((value) => setConfig({ kind: "ready", config: value }))
      .catch(() =>
        setConfig({
          kind: "error",
          message: "The required acknowledgments could not be loaded. Please retry before submitting.",
        }),
      );
  }, []);

  useEffect(loadConfig, [loadConfig]);

  // Every meaningful wizard change is written through to the draft store, so
  // a session expiry or re-unlock costs the customer nothing but their
  // contact fields.
  useEffect(() => {
    // Only the page that owns the stored attempt may write it. After the
    // protected-path sweep, or after a receipt cleared the draft, the store is
    // empty although this page had written before: it owns nothing and must
    // not repopulate it.
    if (!ownsAttempt({ idempotencyKey, acceptedAt })) return;
    persistDraft({
      idempotencyKey,
      acceptedAt,
      // While a POST is outstanding the stored state is the in-flight marker
      // (unless the attempt is already uncertain), whatever this render says.
      attemptState:
        inFlight.current && attemptState !== "uncertain" ? "in_flight" : attemptState,
      step,
      selections,
      generalNotes,
    });
  }, [idempotencyKey, acceptedAt, attemptState, step, selections, generalNotes]);

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
    let disposed = false;
    let timedOut = false;
    let requestTimeout: number | undefined;
    setCatalogLoading(true);
    setCatalogError(null);
    markCatalogTiming("xenios:assisted-catalog:requested");
    const timer = window.setTimeout(() => {
      markCatalogTiming("xenios:assisted-catalog:fetch-start");
      requestTimeout = window.setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, CATALOG_TIMEOUT_MS);
      loadAssistedOrderCatalog({
        search: search || undefined,
        family: family || undefined,
        actionGroup: actionGroup || undefined,
        page,
        pageSize: 24,
      }, abort.signal)
        .then((result) => {
          if (disposed) return;
          markCatalogTiming("xenios:assisted-catalog:fetch-complete");
          setCatalog(result);
          setCatalogError(null);
          const removedNames = result.items
            .filter((item) =>
              selections.has(catalogItemKey(item)) &&
              !selectableInResearchRequest(item),
            )
            .map((item) => item.productName);
          if (removedNames.length > 0) {
            setNotice(
              `No longer available and removed from your request: ${removedNames.join(", ")}.`,
            );
          }
          // Any selection visible on this fresh page adopts the fresh
          // snapshot, so displayed prices heal while the customer browses.
          setSelections((current) => {
            let next = current;
            for (const item of result.items) {
              const existing = current.get(catalogItemKey(item));
              if (existing) {
                next = selectableInResearchRequest(item)
                  ? addOrUpdateSelection(
                      next,
                      item,
                      clampQuantity(item, existing.quantity),
                      existing.notes,
                    )
                  : removeSelection(next, existing.item);
              }
            }
            return next;
          });
        })
        .catch((cause) => {
          if (disposed) return;
          setCatalog(null);
          setCatalogError(
            timedOut
              ? "The catalog took too long to respond. Please try again."
              : cause instanceof AssistedOrderApiError &&
                  (cause.status === 401 || cause.status === 403)
                ? "The full catalog is unavailable until the required agreement and account checks are complete."
                : "We couldn't load the catalog. Check your connection and try again.",
          );
        })
        .finally(() => {
          if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
          if (!disposed) setCatalogLoading(false);
        });
    }, 200);
    return () => {
      disposed = true;
      abort.abort();
      window.clearTimeout(timer);
      if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
    };
  }, [step, search, family, actionGroup, page, catalogRequestVersion]);

  useEffect(() => {
    if (step !== "products" || catalogLoading || !catalog || catalog.items.length === 0) {
      return;
    }
    markCatalogTiming("xenios:assisted-catalog:first-card");
    measureCatalogTiming(
      "xenios:assisted-catalog:fetch-to-first-card",
      "xenios:assisted-catalog:fetch-start",
      "xenios:assisted-catalog:first-card",
    );
    if (catalog.items.some((item) => item.unitPriceCents !== null)) {
      markCatalogTiming("xenios:assisted-catalog:first-price");
      measureCatalogTiming(
        "xenios:assisted-catalog:fetch-to-first-price",
        "xenios:assisted-catalog:fetch-start",
        "xenios:assisted-catalog:first-price",
      );
    }
  }, [step, catalogLoading, catalog]);

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
  const hasCatalogFilters = search.trim() !== "" || family !== "" || actionGroup !== "";
  const emptyCatalogMessage = search.trim() !== ""
    ? hasCatalogFilters && (family !== "" || actionGroup !== "")
      ? "No products match your search and selected filters."
      : "No products match that search."
    : family !== "" && actionGroup !== ""
      ? "No products match the selected Family and Action."
      : family !== ""
        ? "No products match the selected Family."
        : actionGroup !== ""
          ? "No products match the selected Action."
          : "No products are available right now.";

  const clearCatalogFilters = () => {
    setSearch("");
    setFamily("");
    setActionGroup("");
    setPage(1);
  };

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

  const requestedQuantityFor = (item: AssistedOrderCatalogItem): number | undefined => {
    if (!entryIntent || entryIntent.action === "CARE" || resolvedEntry?.kind !== "matched" ||
      resolvedEntry.quantity !== entryIntent.quantity || item.family !== entryIntent.family ||
      !matchesOrderEntryIntent(item, entryIntent) ||
      item.productId !== resolvedEntry.item.productId || item.variantId !== resolvedEntry.item.variantId ||
      !selectableInResearchRequest(item) || !orderEntryQuantityAllowed(item, entryIntent.quantity) ||
      catalog?.items.filter((candidate) => matchesOrderEntryIntent(candidate, entryIntent)).length !== 1) return undefined;
    return entryIntent.quantity;
  };

  const addItem = (item: AssistedOrderCatalogItem) => {
    if (!selectableInResearchRequest(item)) return;
    setSelections((current) => addOrUpdateSelection(current, item, requestedQuantityFor(item) ?? item.minimumQuantity));
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
    if (!continuationEnabled) {
      setError(
        "Complete the required agreement and account checks above before continuing.",
      );
      return;
    }
    setStep("contact");
    window.scrollTo({ top: 0 });
  };

  const continueFromContact = () => {
    setError(null);
    if (!continuationEnabled) {
      setStep("products");
      setError(
        "Complete the required agreement and account checks above before continuing.",
      );
      return;
    }
    if (validateContact()) {
      setStep("review");
      window.scrollTo({ top: 0 });
    }
  };

  // Pricing or availability moved between review and submission. Re-resolve
  // every selection against the live catalog and keep the customer on review:
  // the request now carries current server values and they decide again.
  const recoverFromDrift = async (message: string, stillOwned: () => boolean) => {
    try {
      const result = await refreshSelectionSnapshots(selections);
      // The refresh took time. A page lost or disowned meanwhile (unmounted,
      // or swept) may not apply what came back.
      if (!stillOwned()) return;
      setSelections(result.selections);
      const removed =
        result.missing.length > 0
          ? ` No longer available and removed: ${result.missing.join(", ")}.`
          : "";
      setNotice(`${message}${removed} Please review the updated request and submit again.`);
    } catch {
      if (!stillOwned()) return;
      setNotice(`${message} Please go back to products, review current values, and submit again.`);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    setNotice(null);
    if (!continuationEnabled) {
      setStep("products");
      setError(
        "Complete the required agreement and account checks above before continuing.",
      );
      return;
    }
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
    // Ownership preflight, before anything is stamped, written or sent. A page
    // whose stored attempt was taken away while it stayed mounted (the
    // protected-path sweep), or replaced by another attempt, may neither
    // reclaim the store nor send. Lost ownership alone proves nothing about
    // the session or about earlier attempts, so the copy claims neither; an
    // attempt that left this page may already be saved.
    if (!ownsAttempt({ idempotencyKey, acceptedAt })) {
      setError(
        attemptState === "uncertain" || acceptedAt !== null
          ? STORE_LOST_AFTER_ATTEMPT_MESSAGE
          : STORE_LOST_MESSAGE,
      );
      return;
    }
    // Stamp once per attempt key, then reuse: a refresh after a lost response
    // must retry the identical attempt rather than mint a new one.
    const attemptAcceptedAt = acceptedAt ?? new Date().toISOString();
    if (acceptedAt === null) {
      setAcceptedAt(attemptAcceptedAt);
    }
    // What this closure expects to find in the store, and the page generation
    // it belongs to. Both are checked after every await, before anything is
    // written, cleared, shown or navigated: a POST that answers a page already
    // lost, or whose draft the protected-path sweep took away, may act on
    // nothing. The expected stamp moves only on this closure's own authorized
    // transitions (a release sets it to null), so a legitimate current-page
    // recovery is never mistaken for a foreign draft.
    const gen = generation.current;
    const expected: { idempotencyKey: string; acceptedAt: string | null } = {
      idempotencyKey,
      acceptedAt: attemptAcceptedAt,
    };
    const stillOwned = (): boolean => gen === generation.current && ownsAttempt(expected);
    // Persisted BEFORE every POST, not only the first. The in-flight marker
    // records that this attempt has left the browser with its outcome unknown:
    // a page lost from here on restores as uncertain, with the same key and
    // timestamp, instead of restoring clean and later claiming nothing was
    // saved. An attempt that is already uncertain stays uncertain.
    const storedAttemptState: AssistedOrderStoredAttemptState =
      attemptState === "uncertain" ? "uncertain" : "in_flight";
    inFlight.current = true;
    persistDraft({
      idempotencyKey,
      acceptedAt: attemptAcceptedAt,
      attemptState: storedAttemptState,
      step,
      selections,
      generalNotes,
    });
    const agreements = acceptedAgreements(requirements, attemptAcceptedAt);
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
      inFlight.current = false;
      // Terminal handling belongs to the page that still owns this attempt. A
      // page that was lost, or whose draft the protected-path sweep took away,
      // stores no credential, clears nothing and navigates nowhere: the request
      // exists server-side, and the page that owns the attempt now resolves it
      // by replaying the same key and stamp.
      if (!stillOwned()) return;
      // Local persistence is best-effort and atomic per receipt. A browser
      // quota/privacy failure must never reinterpret this accepted server
      // request as a failed submission; the path still carries its safe
      // public reference and the server/session remains authoritative.
      storeAssistedOrderReceipt(receipt);
      clearAssistedOrderDraft();
      navigate(
        `/research/early-access/order-request/confirmation/${encodeURIComponent(
          receipt.publicReference,
        )}`,
      );
    } catch (reason) {
      // The POST has answered, or failed to: the flight is over either way, and
      // what follows records the real outcome in place of the marker.
      inFlight.current = false;
      // A lost page, or a page whose draft is no longer its own, learns
      // nothing it may act on: no state, no storage, no recovery.
      if (!stillOwned()) return;
      const failure = classifySubmitFailure(reason);
      if (failure === "uncertain") {
        // The server may hold this request already. Freeze the attempt for
        // good, say so truthfully, and never offer a fresh request.
        setAttemptState("uncertain");
        persistDraft({
          idempotencyKey,
          acceptedAt: attemptAcceptedAt,
          attemptState: "uncertain",
          step,
          selections,
          generalNotes,
        });
        setError(UNCERTAIN_OUTCOME_MESSAGE);
      } else if (failure === "drift") {
        // Refused before persistence on a first attempt, so the acceptance
        // time is released like any other definitive refusal. After an
        // uncertain attempt the same refusal proves nothing, because the
        // server checks drift before it looks for a replay, so everything
        // stays frozen; the key is kept either way.
        if (attemptState !== "uncertain") {
          setAcceptedAt(null);
          persistDraft({
            idempotencyKey,
            acceptedAt: null,
            attemptState: "none",
            step,
            selections,
            generalNotes,
          });
          // This closure's own authorized transition: from here on it expects
          // a released stamp in the store, not the one it was issued with.
          expected.acceptedAt = null;
        }
        await recoverFromDrift(
          attemptState === "uncertain"
            ? DRIFT_AFTER_UNCERTAIN_MESSAGE
            : DRIFT_FIRST_ATTEMPT_MESSAGE,
          stillOwned,
        );
      } else if (failure === "conflict") {
        // Never rotate the key here: the earlier request may be the real one.
        // A conflict also proves that SOMETHING was already saved under this
        // key, so the attempt is uncertain from now on and stays so across a
        // refresh; the restored draft says so.
        setAttemptState("uncertain");
        persistDraft({
          idempotencyKey,
          acceptedAt: attemptAcceptedAt,
          attemptState: "uncertain",
          step,
          selections,
          generalNotes,
        });
        setNotice(IDEMPOTENCY_CONFLICT_MESSAGE);
      } else {
        // A definitive refusal, thrown before anything was persisted. On a
        // never-uncertain attempt the acceptance time is released so the
        // corrected submission is stamped when it is actually accepted; after
        // an uncertain attempt everything stays frozen.
        const code = reason instanceof AssistedOrderApiError ? reason.code : "";
        const field = reason instanceof AssistedOrderApiError ? reason.field : undefined;
        if (attemptState !== "uncertain") {
          // The server answered and refused before persisting: the in-flight
          // marker written before this POST is cleared with the stamp.
          setAcceptedAt(null);
          persistDraft({
            idempotencyKey,
            acceptedAt: null,
            attemptState: "none",
            step,
            selections,
            generalNotes,
          });
          // This closure's own authorized transition: the released stamp is
          // what it expects to find from now on.
          expected.acceptedAt = null;
        }
        setError(
          code === "agreement_required"
            ? "Review and accept the current Research Use Policy before submitting."
            : code === "forbidden"
              ? attemptState === "uncertain"
                ? FORBIDDEN_AFTER_UNCERTAIN_MESSAGE
                : FORBIDDEN_FIRST_ATTEMPT_MESSAGE
              : code === "validation_error"
                ? "Review the highlighted information and try again."
                : "The order request was not accepted and was not saved. Please review your details and try again.",
        );
        setFieldError(code === "validation_error" ? field ?? null : null);
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const stepIndex: Record<AssistedOrderWizardStep, number> = {
    products: 0,
    contact: 1,
    review: 2,
  };

  return (
    <div className={`xenios-order-page${embedded ? " xenios-order-page--embedded" : ""}`}>
      <header className="xenios-order-hero">
        <p className="xenios-order-eyebrow">Private Early Access</p>
        {embedded ? <h3>Request an order</h3> : <h1>Request an order</h1>}
        <p>
          Choose products and quantities. Xenios confirms availability and
          payment details before fulfillment.
        </p>
      </header>

      {!embedded && entryIntent ? <OrderEntryIntentNotice intent={entryIntent} enabled={config.kind === "ready"} onResolved={setLocalEntryResolution} /> : null}

      {embedded ? null : (
        <nav className="xenios-order-steps" aria-label="Order request progress">
          {(["products", "contact", "review"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={step === value ? "is-active" : ""}
              data-testid={`order-step-${value}`}
              aria-current={step === value ? "step" : undefined}
              disabled={stepIndex[value] > stepIndex[step]}
              onClick={() => {
                if (value === "products") setStep(value);
                if (continuationEnabled && value === "contact" && selections.size > 0) setStep(value);
                if (continuationEnabled && value === "review" && selections.size > 0 && validateContact()) setStep(value);
              }}
            >
              <span>{stepIndex[value] + 1}</span>
              {EARLY_ACCESS_CUSTOMER_STEP_LABELS[stepIndex[value]]}
            </button>
          ))}
          <button type="button" data-testid="order-step-confirmation" disabled>
            <span>4</span>
            {EARLY_ACCESS_CUSTOMER_STEP_LABELS[3]}
          </button>
        </nav>
      )}

      {error ? <div className="xenios-order-error" role="alert" data-testid="order-error">{error}{fieldError ? ` (${fieldError})` : ""}</div> : null}
      {notice ? <div className="xenios-order-notice" role="status" data-testid="order-notice">{notice}</div> : null}

      {step === "products" ? (
        <section className="xenios-order-catalog-layout" aria-labelledby="order-catalog-heading">
          <div>
            <h2 className="xenios-order-sr-only" id="order-catalog-heading">Browse all products</h2>
            <div className="xenios-order-panel xenios-order-filters">
              <label>
                Search
                <input data-testid="order-filter-search" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Product or specification" />
              </label>
              <label>
                Family
                <select data-testid="order-filter-family" value={family} onChange={(e) => { setFamily(e.target.value); setPage(1); }}>
                  <option value="">All families</option>
                  {catalog?.families.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Action
                <select data-testid="order-filter-action" value={actionGroup} onChange={(e) => { setActionGroup(e.target.value as "" | AssistedOrderActionGroup); setPage(1); }}>
                  <option value="">All actions</option>
                  {assistedOrderActionGroups.map((value) => <option key={value} value={value}>{assistedOrderActionGroupLabels[value]}</option>)}
                </select>
              </label>
              <div className="xenios-order-filter-actions">
                <span>Search, Family, and Action apply before pagination.</span>
                <button
                  type="button"
                  data-testid="order-clear-filters"
                  disabled={!hasCatalogFilters}
                  onClick={clearCatalogFilters}
                >
                  Clear filters
                </button>
              </div>
            </div>
            <div className="xenios-order-results" aria-busy={catalogLoading}>
              <p className="xenios-order-sr-only" role="status" aria-live="polite" data-testid="order-catalog-status">
                {catalogLoading
                  ? "Loading catalog."
                  : catalogError
                    ? catalogError
                    : catalog
                      ? `${catalog.total} ${catalog.total === 1 ? "result" : "results"}. ${hasCatalogFilters ? "Selected filters applied." : "No filters selected."}`
                      : "Catalog not loaded."}
              </p>
              {catalogLoading ? (
                <>
                  <p className="xenios-order-loading">Loading catalog…</p>
                  <div className="xenios-order-cards" aria-hidden="true" data-testid="order-catalog-skeletons">
                    {Array.from({ length: 4 }, (_, index) => (
                      <article className="xenios-order-card xenios-order-card--skeleton" key={index}>
                        <span className="xenios-order-skeleton xenios-order-skeleton--short" />
                        <span className="xenios-order-skeleton xenios-order-skeleton--title" />
                        <span className="xenios-order-skeleton" />
                        <span className="xenios-order-skeleton" />
                        <span className="xenios-order-skeleton xenios-order-skeleton--button" />
                      </article>
                    ))}
                  </div>
                </>
              ) : catalogError ? (
                <div className="xenios-order-error xenios-order-error--catalog" role="alert" data-testid="order-catalog-error">
                  <p>{catalogError}</p>
                  <button type="button" onClick={() => setCatalogRequestVersion((value) => value + 1)}>
                    Try again
                  </button>
                </div>
              ) : catalog ? (
                <>
                  <p className="xenios-order-result-count" data-testid="order-result-count">
                    {catalog.total} {catalog.total === 1 ? "result" : "results"}. Sorted by product name.
                  </p>
                  <div className="xenios-order-cards">
                    {catalog.items.map((item) => {
                      const selection = selections.get(catalogItemKey(item));
                      return <ProductCard key={catalogItemKey(item)} item={item} selection={selection} requestedQuantity={requestedQuantityFor(item)} onAdd={addItem} onQuantity={setQuantity} onRemove={removeItem} />;
                    })}
                  </div>
                  {catalog.total === 0 ? (
                    <div className="xenios-order-empty" data-testid="order-catalog-empty">
                      <p>{emptyCatalogMessage}</p>
                      {hasCatalogFilters ? <button type="button" onClick={clearCatalogFilters}>Clear filters</button> : null}
                    </div>
                  ) : null}
                  {catalog.total > catalog.pageSize ? (
                    <nav className="xenios-order-pagination" aria-label="Catalog pages">
                      <button type="button" disabled={catalog.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                      <span aria-live="polite">Page {catalog.page} of {Math.ceil(catalog.total / catalog.pageSize)}</span>
                      <button type="button" disabled={catalog.page >= Math.ceil(catalog.total / catalog.pageSize)} onClick={() => setPage((value) => value + 1)}>Next</button>
                    </nav>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <aside className="xenios-order-summary">
            <h2>Your request</h2>
            {selectionList.length === 0 ? <p>No products selected yet.</p> : (
              <ul>{selectionList.map((selection) => <li key={catalogItemKey(selection.item)}><div><strong>{selection.item.productName}</strong><span>{selection.item.specification}</span></div><span>{selection.quantity} × {money(selection.item.unitPriceCents)}</span></li>)}</ul>
            )}
            <div className="xenios-order-total"><span>Estimated priced total</span><strong data-testid="order-estimate">{money(estimate)}</strong></div>
            <p className="xenios-order-small">Estimates only. Xenios confirms availability and payment details before fulfillment.</p>
            {!continuationEnabled ? (
              <p className="xenios-order-notice" id="order-continuation-gate" role="status">
                Complete the required agreement and account checks above before continuing.
              </p>
            ) : null}
            <div className="xenios-order-actions">
              <button
                className="xenios-order-button"
                type="button"
                data-testid="order-continue-contact"
                aria-describedby={!continuationEnabled ? "order-continuation-gate" : undefined}
                disabled={selections.size === 0 || !continuationEnabled}
                onClick={continueFromProducts}
              >
                Continue
              </button>
            </div>
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
                <div><span>Qty {selection.quantity}</span><strong>{selection.item.unitPriceCents === null ? "Price on request" : money(selection.item.unitPriceCents * selection.quantity)}</strong></div>
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
                <button className="xenios-order-retry" type="button" onClick={loadConfig}>
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
