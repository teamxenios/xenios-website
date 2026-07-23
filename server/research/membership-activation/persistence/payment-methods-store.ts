// ---------------------------------------------------------------------------
// Persistent payment-method registry (founding-membership activation).
//
// Follows the Track B persistence exemplar (server/research/commerce/
// persistence/): pure row mappers, an in-memory reference implementation, a
// Supabase implementation with an INJECTED client, and a resolver that falls
// back to the reference when Supabase is not configured. Reads are DEFENSIVE
// (an unprovisioned table reads as an empty registry, which fails closed:
// no methods means nothing is payable). Writes are LOUD (a payment method
// that half-saves is worse than one that errors).
//
// The rows store receiving instructions as CIPHERTEXT ONLY. There is no
// plaintext column, no plaintext field on any row type, and the version
// snapshots embed the same ciphertext. Encryption happens in the domain
// module (payment-methods.ts) before a record ever reaches this store.
//
// Every write pairs the method row with an APPEND-ONLY method_versions row.
// The port has no way to update or delete a version row, and the database
// enforces the same with a trigger (supabase/research-fm-payment-methods.sql).
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";
import type {
  MethodApprovalStatus,
  MethodChangeKind,
  MethodDuration,
  MethodVersionRecord,
  OwnershipClassification,
  PaymentMethodCategory,
  PaymentMethodRecord,
} from "../payment-methods";

const METHODS_TABLE = "research_fm_payment_methods";
const VERSIONS_TABLE = "research_fm_payment_method_versions";
const UNIQUE_VIOLATION = "23505";

export class PaymentMethodAlreadyExists extends Error {
  constructor(methodId: string) {
    super(`Payment method ${methodId} already exists.`);
    this.name = "PaymentMethodAlreadyExists";
  }
}

export class PaymentMethodNotFound extends Error {
  constructor(methodId: string) {
    super(`No payment method ${methodId}.`);
    this.name = "PaymentMethodNotFound";
  }
}

export class PaymentMethodStale extends Error {
  constructor(methodId: string) {
    super(
      `Payment method ${methodId} changed underneath this save (version mismatch). ` +
        `Reload and reapply the change.`,
    );
    this.name = "PaymentMethodStale";
  }
}

// ---------------------------------------------------------------------------
// Rows and pure mappers
// ---------------------------------------------------------------------------

export interface PaymentMethodRow {
  method_id: string;
  provider_code: string;
  category: string;
  member_facing_name: string;
  admin_facing_name: string;
  enabled: boolean;
  duration: string;
  active_start_at: string | null;
  active_end_at: string | null;
  currency: string;
  activation_eligible: boolean;
  renewal_eligible: boolean;
  product_eligible: boolean;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  settlement_time: string;
  receiving_legal_entity: string;
  ownership_classification: string;
  approval_status: string;
  approval_date: string | null;
  compliance_review_note: string | null;
  approved_by: string | null;
  receiving_instructions_enc: string;
  receiving_instructions_masked: string;
  mobile_instructions: string | null;
  desktop_instructions: string | null;
  memo_instructions: string | null;
  deep_link_ref: string | null;
  qr_asset_ref: string | null;
  support_contact_ref: string | null;
  disabled_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_METHOD_COLUMNS =
  "method_id, provider_code, category, member_facing_name, admin_facing_name, enabled, duration, " +
  "active_start_at, active_end_at, currency, activation_eligible, renewal_eligible, product_eligible, " +
  "min_amount_cents, max_amount_cents, settlement_time, receiving_legal_entity, ownership_classification, " +
  "approval_status, approval_date, compliance_review_note, approved_by, receiving_instructions_enc, " +
  "receiving_instructions_masked, mobile_instructions, desktop_instructions, memo_instructions, " +
  "deep_link_ref, qr_asset_ref, support_contact_ref, disabled_reason, version, created_at, updated_at";

export function paymentMethodRecordToRow(record: PaymentMethodRecord): PaymentMethodRow {
  return {
    method_id: record.methodId,
    provider_code: record.providerCode,
    category: record.category,
    member_facing_name: record.memberFacingName,
    admin_facing_name: record.adminFacingName,
    enabled: record.enabled,
    duration: record.duration,
    active_start_at: record.activeStartAt,
    active_end_at: record.activeEndAt,
    currency: record.currency,
    activation_eligible: record.activationEligible,
    renewal_eligible: record.renewalEligible,
    product_eligible: record.productEligible,
    min_amount_cents: record.minAmountCents,
    max_amount_cents: record.maxAmountCents,
    settlement_time: record.settlementTime,
    receiving_legal_entity: record.receivingLegalEntity,
    ownership_classification: record.ownershipClassification,
    approval_status: record.approvalStatus,
    approval_date: record.approvalDate,
    compliance_review_note: record.complianceReviewNote,
    approved_by: record.approvedBy,
    receiving_instructions_enc: record.receivingInstructionsEncrypted,
    receiving_instructions_masked: record.receivingInstructionsMasked,
    mobile_instructions: record.mobileInstructions,
    desktop_instructions: record.desktopInstructions,
    memo_instructions: record.memoInstructions,
    deep_link_ref: record.deepLinkRef,
    qr_asset_ref: record.qrAssetRef,
    support_contact_ref: record.supportContactRef,
    disabled_reason: record.disabledReason,
    version: record.version,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function paymentMethodRowToRecord(row: PaymentMethodRow): PaymentMethodRecord {
  return {
    methodId: row.method_id,
    providerCode: row.provider_code,
    category: row.category as PaymentMethodCategory,
    memberFacingName: row.member_facing_name,
    adminFacingName: row.admin_facing_name,
    enabled: row.enabled,
    duration: row.duration as MethodDuration,
    activeStartAt: row.active_start_at,
    activeEndAt: row.active_end_at,
    currency: row.currency,
    activationEligible: row.activation_eligible,
    renewalEligible: row.renewal_eligible,
    productEligible: row.product_eligible,
    minAmountCents: row.min_amount_cents,
    maxAmountCents: row.max_amount_cents,
    settlementTime: row.settlement_time,
    receivingLegalEntity: row.receiving_legal_entity,
    ownershipClassification: row.ownership_classification as OwnershipClassification,
    approvalStatus: row.approval_status as MethodApprovalStatus,
    approvalDate: row.approval_date,
    complianceReviewNote: row.compliance_review_note,
    approvedBy: row.approved_by,
    receivingInstructionsEncrypted: row.receiving_instructions_enc,
    receivingInstructionsMasked: row.receiving_instructions_masked,
    mobileInstructions: row.mobile_instructions,
    desktopInstructions: row.desktop_instructions,
    memoInstructions: row.memo_instructions,
    deepLinkRef: row.deep_link_ref,
    qrAssetRef: row.qr_asset_ref,
    supportContactRef: row.support_contact_ref,
    disabledReason: row.disabled_reason,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface MethodVersionRow {
  version_id: string;
  method_id: string;
  version: number;
  change_kind: string;
  changed_by: string;
  changed_at: string;
  snapshot: PaymentMethodRow;
}

export const METHOD_VERSION_COLUMNS = "version_id, method_id, version, change_kind, changed_by, changed_at, snapshot";

export function methodVersionRecordToRow(record: MethodVersionRecord): MethodVersionRow {
  return {
    version_id: record.versionId,
    method_id: record.methodId,
    version: record.version,
    change_kind: record.changeKind,
    changed_by: record.changedBy,
    changed_at: record.changedAt,
    snapshot: paymentMethodRecordToRow(record.snapshot),
  };
}

export function methodVersionRowToRecord(row: MethodVersionRow): MethodVersionRecord {
  return {
    versionId: row.version_id,
    methodId: row.method_id,
    version: row.version,
    changeKind: row.change_kind as MethodChangeKind,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    snapshot: paymentMethodRowToRecord(row.snapshot),
  };
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * There is deliberately no delete anywhere, and no way to write a method row
 * without its paired version row: history is the point.
 */
export interface PaymentMethodsRepository {
  /** Insert a NEW method plus its v1 audit row. Duplicate methodId errors. */
  create(record: PaymentMethodRecord, version: MethodVersionRecord): Promise<void>;
  get(methodId: string): Promise<PaymentMethodRecord | undefined>;
  /** Every method, enabled or not; the caller filters with the domain gates. */
  list(): Promise<readonly PaymentMethodRecord[]>;
  /**
   * Persist an updated record plus its audit row. Guarded optimistically: the
   * update matches only when the stored version is record.version - 1, so two
   * racing admins cannot silently clobber each other.
   */
  save(record: PaymentMethodRecord, version: MethodVersionRecord): Promise<void>;
  /** The append-only history, oldest first. */
  listVersions(methodId: string): Promise<readonly MethodVersionRecord[]>;
}

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

export function createInMemoryPaymentMethodsStore(): PaymentMethodsRepository {
  const methods = new Map<string, PaymentMethodRecord>();
  const versions: MethodVersionRecord[] = [];
  const cloneMethod = (r: PaymentMethodRecord): PaymentMethodRecord => ({ ...r });
  const cloneVersion = (v: MethodVersionRecord): MethodVersionRecord => ({ ...v, snapshot: { ...v.snapshot } });

  return {
    async create(record, version) {
      if (methods.has(record.methodId)) throw new PaymentMethodAlreadyExists(record.methodId);
      methods.set(record.methodId, cloneMethod(record));
      versions.push(cloneVersion(version));
    },
    async get(methodId) {
      const record = methods.get(methodId);
      return record ? cloneMethod(record) : undefined;
    },
    async list() {
      return Array.from(methods.values(), cloneMethod).sort((a, b) => a.methodId.localeCompare(b.methodId));
    },
    async save(record, version) {
      const existing = methods.get(record.methodId);
      if (!existing) throw new PaymentMethodNotFound(record.methodId);
      if (existing.version !== record.version - 1) throw new PaymentMethodStale(record.methodId);
      methods.set(record.methodId, cloneMethod(record));
      versions.push(cloneVersion(version));
    },
    async listVersions(methodId) {
      return versions
        .filter((v) => v.methodId === methodId)
        .sort((a, b) => a.version - b.version)
        .map(cloneVersion);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

export function createSupabasePaymentMethodsStore(
  client: SupabaseClient = getSupabaseAdmin(),
): PaymentMethodsRepository {
  // Defensive reads: an unprovisioned table reads as an empty registry, which
  // fails closed (nothing payable). Writes below are loud.
  async function readRows<T>(table: string, columns: string, apply?: (query: any) => any): Promise<T[]> {
    try {
      let query: any = client.from(table).select(columns);
      if (apply) query = apply(query);
      const { data, error } = await query;
      if (error || !Array.isArray(data)) return [];
      return data as T[];
    } catch {
      return [];
    }
  }

  async function appendVersion(version: MethodVersionRecord): Promise<void> {
    const ins = await client.from(VERSIONS_TABLE).insert(methodVersionRecordToRow(version));
    if (ins.error) throw new Error(`payment-method version append failed: ${ins.error.message}`);
  }

  return {
    async create(record, version) {
      const ins = await client.from(METHODS_TABLE).insert(paymentMethodRecordToRow(record));
      if (ins.error) {
        if (ins.error.code === UNIQUE_VIOLATION) throw new PaymentMethodAlreadyExists(record.methodId);
        throw new Error(`payment-method create failed: ${ins.error.message}`);
      }
      await appendVersion(version);
    },

    async get(methodId) {
      try {
        const { data, error } = await client
          .from(METHODS_TABLE)
          .select(PAYMENT_METHOD_COLUMNS)
          .eq("method_id", methodId)
          .maybeSingle();
        if (error || !data) return undefined;
        return paymentMethodRowToRecord(data as unknown as PaymentMethodRow);
      } catch {
        return undefined;
      }
    },

    async list() {
      const rows = await readRows<PaymentMethodRow>(METHODS_TABLE, PAYMENT_METHOD_COLUMNS);
      return rows.map(paymentMethodRowToRecord).sort((a, b) => a.methodId.localeCompare(b.methodId));
    },

    async save(record, version) {
      // The version filter IS the optimistic guard: only the row still at the
      // previous version matches, so a concurrent save loses loudly, not
      // silently.
      const upd = await client
        .from(METHODS_TABLE)
        .update(paymentMethodRecordToRow(record))
        .eq("method_id", record.methodId)
        .eq("version", record.version - 1)
        .select("method_id")
        .maybeSingle();
      if (upd.error) throw new Error(`payment-method save failed: ${upd.error.message}`);
      if (!upd.data) {
        const existing = await client
          .from(METHODS_TABLE)
          .select("method_id")
          .eq("method_id", record.methodId)
          .maybeSingle();
        if (existing.error) throw new Error(`payment-method save lookup failed: ${existing.error.message}`);
        if (existing.data) throw new PaymentMethodStale(record.methodId);
        throw new PaymentMethodNotFound(record.methodId);
      }
      await appendVersion(version);
    },

    async listVersions(methodId) {
      const rows = await readRows<MethodVersionRow>(VERSIONS_TABLE, METHOD_VERSION_COLUMNS, (q) =>
        q.eq("method_id", methodId),
      );
      return rows.map(methodVersionRowToRecord).sort((a, b) => a.version - b.version);
    },
  };
}

/** The real store when Supabase is configured, else the in-memory reference. */
export function resolvePaymentMethodsStore(): PaymentMethodsRepository {
  return supabaseConfigured() ? createSupabasePaymentMethodsStore() : createInMemoryPaymentMethodsStore();
}
