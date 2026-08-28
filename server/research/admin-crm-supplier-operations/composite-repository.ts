import {
  ADMIN_OPERATIONAL_CONTROL_AREAS,
  ADMIN_OPERATIONS_AVAILABILITY,
  ADMIN_OPERATIONS_SOURCE_KEYS,
  type AdminOperationsCollectionMap,
  type AdminOperationsSource,
  type AdminOperationsSourceKey,
  type TrustDialMode,
} from "@shared/research/admin-crm-supplier-operations";
import {
  AdminCrmRefusal,
  type AdminCrmSupplierOperationsRepository,
  type AdminCrmRecommendationAtomicResult,
  type AdminCrmRecommendationCandidate,
} from "./service";
import { parseAdminOperationsItems } from "./source-schemas";

type SnapshotCollection<K extends AdminOperationsSourceKey> = AdminOperationsCollectionMap[K];

export type AdminOperationsReadResult<Item> =
  | { availability: "available" | "partial"; items: Item[]; checkedAt: string }
  | { availability: "unavailable"; items?: null; checkedAt: string };

export interface AdminOperationsSourceReader<K extends AdminOperationsSourceKey> {
  /** Read-only projection scoped to the verified storage actor. */
  read(actorId: string): Promise<AdminOperationsReadResult<SnapshotCollection<K>>>;
}

export type AdminOperationsSourceReaders = {
  [K in AdminOperationsSourceKey]?: AdminOperationsSourceReader<K>;
};

/**
 * A durable authority, never an in-memory or logger-backed implementation.
 * `readWorkspaceMode` is projection-only. The adjudication method is the sole
 * write authority and must enforce both current Trust Dial modes in the same
 * transaction that records the recommendation and audit event.
 */
export interface AdminOperationsDurableRecommendationAuthorityPort {
  readWorkspaceMode(actorId: string): Promise<TrustDialMode>;
  adjudicateTrustDialAndRecordRecommendation(
    candidate: AdminCrmRecommendationCandidate,
  ): Promise<AdminCrmRecommendationAtomicResult>;
}

export interface CompositeAdminCrmSupplierOperationsPorts {
  sources?: AdminOperationsSourceReaders;
  durableRecommendationAuthority?: AdminOperationsDurableRecommendationAuthorityPort;
}

type NormalizedRead<K extends AdminOperationsSourceKey> = AdminOperationsSource<SnapshotCollection<K>>;

const TRUST_DIALS = ["auto", "queue", "ask", "never"] as const;

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function unavailable<K extends AdminOperationsSourceKey>(
  key: K,
  checkedAt: string,
  code: string,
): NormalizedRead<K> {
  return {
    availability: "unavailable",
    code,
    message: `${key} source is unavailable in this environment.`,
    provenance: `admin_ops.${key}`,
    checkedAt,
    items: null,
  };
}

function normalizeRead<K extends AdminOperationsSourceKey>(
  key: K,
  value: AdminOperationsReadResult<SnapshotCollection<K>>,
  fallbackCheckedAt: string,
): NormalizedRead<K> {
  if (
    !value ||
    !(ADMIN_OPERATIONS_AVAILABILITY as readonly string[]).includes(value.availability)
  ) {
    return unavailable(key, fallbackCheckedAt, "source_contract_invalid");
  }

  if (!isIsoTimestamp(value.checkedAt)) {
    return unavailable(key, fallbackCheckedAt, "source_contract_invalid");
  }
  const checkedAt = value.checkedAt;
  if (value.availability === "unavailable") {
    return unavailable(key, checkedAt, "source_unavailable");
  }
  if (!Array.isArray(value.items)) {
    return unavailable(key, checkedAt, "source_contract_invalid");
  }

  let availability = value.availability;
  let items: SnapshotCollection<K>[];
  try {
    items = parseAdminOperationsItems(key, value.items);
  } catch {
    return unavailable(key, checkedAt, "source_contract_invalid");
  }
  let code = availability === "available"
    ? null
    : "source_partial";

  // A controls reader can claim complete only when every canonical control
  // area is present exactly once. Incomplete truth is downgraded, never filled.
  if (key === "controls") {
    const areas = items.map((item) => (item as { area?: unknown }).area);
    const unique = new Set(areas);
    const valid = areas.every((area) =>
      typeof area === "string" &&
      (ADMIN_OPERATIONAL_CONTROL_AREAS as readonly string[]).includes(area),
    );
    if (!valid || unique.size !== areas.length) {
      return unavailable(key, checkedAt, "controls_evidence_ambiguous");
    }
    if (availability === "available" && unique.size !== ADMIN_OPERATIONAL_CONTROL_AREAS.length) {
      availability = "partial";
      code = "controls_evidence_partial";
    }
  }

  if (availability === "available") {
    return {
      availability,
      code: null,
      message: `${key} source is available.`,
      provenance: `admin_ops.${key}`,
      checkedAt,
      items,
    };
  }
  return {
    availability,
    code: code ?? "source_partial",
    message: `${key} source returned partial evidence.`,
    provenance: `admin_ops.${key}`,
    checkedAt,
    items,
  };
}

async function readSource<K extends AdminOperationsSourceKey>(
  key: K,
  reader: AdminOperationsSourceReader<K> | undefined,
  actorId: string,
  checkedAt: string,
): Promise<NormalizedRead<K>> {
  if (!reader) return unavailable(key, checkedAt, "source_not_configured");
  try {
    return normalizeRead(key, await reader.read(actorId), checkedAt);
  } catch {
    return unavailable(key, checkedAt, "source_read_failed");
  }
}

async function workspaceTrustDial(
  ports: CompositeAdminCrmSupplierOperationsPorts,
  actorId: string,
): Promise<TrustDialMode> {
  if (!ports.durableRecommendationAuthority) return "never";
  try {
    const mode = await ports.durableRecommendationAuthority.readWorkspaceMode(actorId);
    return (TRUST_DIALS as readonly string[]).includes(mode) ? mode : "never";
  } catch {
    return "never";
  }
}

export function createCompositeAdminCrmSupplierOperationsRepository(
  ports: CompositeAdminCrmSupplierOperationsPorts,
  now: () => string = () => new Date().toISOString(),
): AdminCrmSupplierOperationsRepository {
  const readers = ports.sources ?? {};
  return {
    async readSnapshot(actorId) {
      const generatedAt = now();
      if (!isIsoTimestamp(generatedAt)) {
        throw new AdminCrmRefusal("source_evidence_invalid", "Snapshot clock is invalid.");
      }

      const [
        buyerQueue,
        organizations,
        customers,
        availabilityReviews,
        priceReviews,
        invoices,
        supplierAssignments,
        fulfillment,
        returnsReships,
        supportCases,
        reports,
        exceptions,
        controls,
        audit,
        intake,
      ] = await Promise.all([
        readSource("buyerQueue", readers.buyerQueue, actorId, generatedAt),
        readSource("organizations", readers.organizations, actorId, generatedAt),
        readSource("customers", readers.customers, actorId, generatedAt),
        readSource("availabilityReviews", readers.availabilityReviews, actorId, generatedAt),
        readSource("priceReviews", readers.priceReviews, actorId, generatedAt),
        readSource("invoices", readers.invoices, actorId, generatedAt),
        readSource("supplierAssignments", readers.supplierAssignments, actorId, generatedAt),
        readSource("fulfillment", readers.fulfillment, actorId, generatedAt),
        readSource("returnsReships", readers.returnsReships, actorId, generatedAt),
        readSource("supportCases", readers.supportCases, actorId, generatedAt),
        readSource("reports", readers.reports, actorId, generatedAt),
        readSource("exceptions", readers.exceptions, actorId, generatedAt),
        readSource("controls", readers.controls, actorId, generatedAt),
        readSource("audit", readers.audit, actorId, generatedAt),
        readSource("intake", readers.intake, actorId, generatedAt),
      ]);

      return {
        generatedAt,
        trustDial: await workspaceTrustDial(ports, actorId),
        sources: {
          buyerQueue,
          organizations,
          customers,
          availabilityReviews,
          priceReviews,
          invoices,
          supplierAssignments,
          fulfillment,
          returnsReships,
          supportCases,
          reports,
          exceptions,
          controls,
          audit,
          intake,
        },
      };
    },

    async adjudicateTrustDialAndRecordRecommendation(candidate) {
      if (!ports.durableRecommendationAuthority) {
        throw new AdminCrmRefusal(
          "operation_unavailable",
          "The durable atomic recommendation authority is not configured in this environment.",
        );
      }
      return ports.durableRecommendationAuthority.adjudicateTrustDialAndRecordRecommendation(candidate);
    },
  };
}

/** Safe mount target when no operational readers have been provisioned. */
export function createUnavailableAdminCrmSupplierOperationsRepository(
  now: () => string = () => new Date().toISOString(),
): AdminCrmSupplierOperationsRepository {
  return createCompositeAdminCrmSupplierOperationsRepository({}, now);
}

export const ADMIN_CRM_REQUIRED_SOURCE_KEYS = ADMIN_OPERATIONS_SOURCE_KEYS;
