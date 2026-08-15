import type {
  AssistedOrderAgreementAcceptance,
  AssistedOrderCatalogItem,
  AssistedOrderLineInput,
} from "../../../../shared/research/assisted-order/contract";

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
 * Parses the config endpoint's required-agreement set. Returns null when the
 * body does not carry a usable, non-empty set, so callers fail closed instead
 * of inventing a fallback.
 */
export function parseAgreementRequirements(
  body: unknown,
): readonly AssistedOrderAgreementRequirement[] | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const raw = Array.isArray(record.requiredAgreements)
    ? record.requiredAgreements
    : Array.isArray(record.agreements)
      ? record.agreements
      : null;
  if (!raw || raw.length === 0) {
    return null;
  }
  const requirements: AssistedOrderAgreementRequirement[] = [];
  for (const entry of raw) {
    const requirement = requirementFromEntry(entry);
    if (!requirement) {
      return null;
    }
    requirements.push(requirement);
  }
  return Object.freeze(requirements);
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
    return "Price pending";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
