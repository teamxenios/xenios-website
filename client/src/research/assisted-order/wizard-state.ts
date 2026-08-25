import type {
  AssistedOrderAgreementAcceptance,
  AssistedOrderCatalogItem,
  AssistedOrderLineInput,
} from "../../../../shared/research/assisted-order/contract";
import { quantityIsAllowed } from "../../../../shared/research/assisted-order/action-policy";

export type AssistedOrderSelection = Readonly<{
  item: AssistedOrderCatalogItem;
  quantity: number;
  notes: string;
}>;

export type AssistedOrderSelectionMap = ReadonlyMap<string, AssistedOrderSelection>;

export function catalogItemKey(
  item: Pick<AssistedOrderCatalogItem, "productId" | "variantId">,
): string {
  return `${item.productId}\u0000${item.variantId}`;
}

export function addOrUpdateSelection(
  selections: AssistedOrderSelectionMap,
  item: AssistedOrderCatalogItem,
  quantity: number,
  notes = "",
): AssistedOrderSelectionMap {
  const next = new Map(selections);
  next.set(
    catalogItemKey(item),
    Object.freeze({ item, quantity, notes: notes.trim() }),
  );
  return next;
}

export function removeSelection(
  selections: AssistedOrderSelectionMap,
  item: Pick<AssistedOrderCatalogItem, "productId" | "variantId">,
): AssistedOrderSelectionMap {
  const next = new Map(selections);
  next.delete(catalogItemKey(item));
  return next;
}

/**
 * Clamps a requested quantity to the item's own MOQ / increment / maximum
 * rules. Free-typed numbers snap to the nearest allowed step at or above the
 * minimum, so the wizard can offer a plain number input without ever carrying
 * an invalid quantity into a submission.
 */
export function clampQuantity(
  item: Pick<
    AssistedOrderCatalogItem,
    "minimumQuantity" | "maximumQuantity" | "quantityIncrement"
  >,
  requested: number,
): number {
  if (!Number.isFinite(requested)) {
    return item.minimumQuantity;
  }
  const floored = Math.floor(requested);
  if (floored <= item.minimumQuantity) {
    return item.minimumQuantity;
  }
  const steps = Math.round(
    (floored - item.minimumQuantity) / item.quantityIncrement,
  );
  let candidate = item.minimumQuantity + steps * item.quantityIncrement;
  if (item.maximumQuantity !== null && candidate > item.maximumQuantity) {
    const allowedSteps = Math.floor(
      (item.maximumQuantity - item.minimumQuantity) / item.quantityIncrement,
    );
    candidate = item.minimumQuantity + allowedSteps * item.quantityIncrement;
  }
  return quantityIsAllowed(item, candidate) ? candidate : item.minimumQuantity;
}

/**
 * Whether an item may be ADDED to a research order request at all. A Care /
 * provider-pathway product must never enter this request path: it has its own
 * clinical workflow. A held/unavailable product cannot enter either, because
 * the server refuses that mode at submit. Price-pending and activation items
 * remain truthful requests rather than direct orders.
 */
export function selectableInResearchRequest(
  item: Pick<AssistedOrderCatalogItem, "workflowMode">,
): boolean {
  return item.workflowMode !== "provider_request"
    && item.workflowMode !== "availability_review";
}

export function selectionEstimateCents(
  selections: AssistedOrderSelectionMap,
): number | null {
  let total = 0;
  let priced = 0;
  for (const selection of Array.from(selections.values())) {
    if (selection.item.unitPriceCents !== null) {
      total += selection.item.unitPriceCents * selection.quantity;
      priced += 1;
    }
  }
  return priced === 0 ? null : total;
}

export function selectionsToLines(
  selections: AssistedOrderSelectionMap,
): readonly AssistedOrderLineInput[] {
  return Object.freeze(
    Array.from(selections.values()).map((selection) =>
      Object.freeze({
        productId: selection.item.productId,
        variantId: selection.item.variantId,
        quantity: selection.quantity,
        expectedCatalogVersion: selection.item.catalogVersion,
        expectedPriceVersion: selection.item.priceVersion ?? undefined,
        expectedUnitPriceCents: selection.item.unitPriceCents ?? undefined,
        customerNotes: selection.notes || undefined,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Server-configured agreements. The wizard never hard-codes a (kind, version)
// pair: the required set comes from the assisted-orders config endpoint, the
// review step renders exactly that set, and submission stays refused until the
// set has loaded and every entry is acknowledged. Only the display copy lives
// here, because copy is presentation; the pairs are authority and stay server
// supplied.
// ---------------------------------------------------------------------------

export type AssistedOrderAgreementRequirement = Readonly<{
  kind: string;
  version: string;
  label: string;
}>;

const agreementCopy: Readonly<Record<string, string>> = Object.freeze({
  assisted_order_accuracy:
    "I confirm that the information I submitted is accurate.",
  assisted_order_request_notice:
    "I understand this is an order request. Xenios will confirm availability, pricing, documentation requirements, and next steps before fulfillment.",
  assisted_order_contact_consent:
    "I agree to be contacted by Xenios about this request.",
  research_use_policy:
    "I understand that products marked Research Use Only are offered solely for legitimate nonclinical research and are not for human or veterinary use.",
});

function agreementLabel(kind: string): string {
  return (
    agreementCopy[kind] ??
    `I have read and accept the ${kind.replaceAll("_", " ")} policy.`
  );
}

export function agreementRequirementKey(
  requirement: Pick<AssistedOrderAgreementRequirement, "kind" | "version">,
): string {
  return `${requirement.kind}\u0000${requirement.version}`;
}

function requirementFromEntry(
  entry: unknown,
): AssistedOrderAgreementRequirement | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind.trim() : "";
  const version =
    typeof record.version === "string" ? record.version.trim() : "";
  if (kind.length === 0 || version.length === 0) {
    return null;
  }
  const label =
    typeof record.label === "string" && record.label.trim().length > 0
      ? record.label.trim()
      : agreementLabel(kind);
  return Object.freeze({ kind, version, label });
}

/**
 * A form acknowledgment as the config endpoint publishes it: the operational
 * request fact the founder worded (D-005), with the exact copy the server will
 * verify by hash at submission. `scope` says when it is required: "always", or
 * only when the request actually carries a Research Use Only line.
 */
export type AssistedOrderFormAcknowledgmentView = Readonly<{
  id: string;
  scope: "always" | "research_use_only";
  kind: string;
  version: string;
  copy: string;
}>;

export type AssistedOrderWizardConfig = Readonly<{
  legal: readonly AssistedOrderAgreementRequirement[];
  form: readonly AssistedOrderFormAcknowledgmentView[];
}>;

function formAcknowledgmentFromEntry(
  entry: unknown,
): AssistedOrderFormAcknowledgmentView | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const kind = typeof record.kind === "string" ? record.kind.trim() : "";
  const version =
    typeof record.version === "string" ? record.version.trim() : "";
  const copy = typeof record.copy === "string" ? record.copy.trim() : "";
  const scope =
    record.scope === "always" || record.scope === "research_use_only"
      ? record.scope
      : null;
  if (!id || !kind || !version || !copy || !scope) {
    return null;
  }
  return Object.freeze({ id, scope, kind, version, copy });
}

/**
 * Parses the config endpoint's full requirement surface: the canonical legal
 * (kind, version) pairs AND the operational form acknowledgments, each of
 * which the server independently verifies at submission. Returns null when
 * either set is missing or unusable, so callers fail closed instead of
 * inventing a fallback — a submission missing either set is refused anyway.
 */
export function parseAssistedOrderConfig(
  body: unknown,
): AssistedOrderWizardConfig | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const rawLegal = Array.isArray(record.requiredAgreements)
    ? record.requiredAgreements
    : null;
  const rawForm = Array.isArray(record.formAcknowledgments)
    ? record.formAcknowledgments
    : null;
  if (!rawLegal || rawLegal.length === 0 || !rawForm || rawForm.length === 0) {
    return null;
  }
  const legal: AssistedOrderAgreementRequirement[] = [];
  for (const entry of rawLegal) {
    const requirement = requirementFromEntry(entry);
    if (!requirement) {
      return null;
    }
    legal.push(requirement);
  }
  const form: AssistedOrderFormAcknowledgmentView[] = [];
  for (const entry of rawForm) {
    const acknowledgment = formAcknowledgmentFromEntry(entry);
    if (!acknowledgment) {
      return null;
    }
    form.push(acknowledgment);
  }
  return Object.freeze({
    legal: Object.freeze(legal),
    form: Object.freeze(form),
  });
}

/** Whether any selected line is a Research Use Only item. */
export function selectionsIncludeResearchUseOnly(
  selections: AssistedOrderSelectionMap,
): boolean {
  for (const selection of Array.from(selections.values())) {
    if (selection.item.researchUseOnly) {
      return true;
    }
  }
  return false;
}

/**
 * The complete acknowledgment list this exact request must carry, rendered in
 * submission order: every legal pair, then every form fact whose scope
 * applies. Form facts use the server's own copy verbatim — the server verifies
 * that copy by hash, so no client paraphrase can stand in for it.
 */
export function requiredAcknowledgmentEntries(
  config: AssistedOrderWizardConfig,
  includesResearchUseOnly: boolean,
): readonly AssistedOrderAgreementRequirement[] {
  const entries: AssistedOrderAgreementRequirement[] = config.legal.map(
    (requirement) => requirement,
  );
  for (const acknowledgment of config.form) {
    if (
      acknowledgment.scope === "always" ||
      (acknowledgment.scope === "research_use_only" && includesResearchUseOnly)
    ) {
      entries.push(
        Object.freeze({
          kind: acknowledgment.kind,
          version: acknowledgment.version,
          label: acknowledgment.copy,
        }),
      );
    }
  }
  return Object.freeze(entries);
}

/**
 * Whether submission must stay refused: true until the server-supplied set has
 * loaded AND every entry in it has been acknowledged.
 */
export function submissionBlocked(
  requirements: readonly AssistedOrderAgreementRequirement[] | null,
  acknowledged: ReadonlySet<string>,
): boolean {
  if (requirements === null || requirements.length === 0) {
    return true;
  }
  return requirements.some(
    (requirement) => !acknowledged.has(agreementRequirementKey(requirement)),
  );
}

/** The exact server-supplied (kind, version) pairs, stamped with acceptance time. */
export function acceptedAgreements(
  requirements: readonly AssistedOrderAgreementRequirement[],
  acceptedAt: string,
): readonly AssistedOrderAgreementAcceptance[] {
  return Object.freeze(
    requirements.map((requirement) =>
      Object.freeze({
        kind: requirement.kind,
        version: requirement.version,
        acceptedAt,
      }),
    ),
  );
}

export function money(cents: number | null): string {
  if (cents === null) {
    return "Price on request";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
