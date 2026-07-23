// ---------------------------------------------------------------------------
// Founding membership activation: the three-state production composition.
//
// server/index.ts calls buildFoundingActivationDependencies() bare. The build
// resolves to exactly one of three states, decided ONCE at composition time,
// mirroring the commerce composition (commerce/production-deps.ts):
//
//   STATE 1, RESEARCH_FOUNDING_ACTIVATION_ENABLED off (the production
//     default). Every route answers { ok:false, code:"capability_disabled" }.
//     No store is resolved, no provider is constructed, no database call
//     happens; the returned object carries no service at all, so the states
//     are structurally side-effect free (the wiring test proves it with
//     resolver spies).
//
//   STATE 2, flag on but storage not provisioned (SUPABASE_URL or
//     SUPABASE_SERVICE_ROLE_KEY absent). Every route answers the precise
//     { ok:false, code:"not_provisioned" } denial. Still no store, no
//     provider, no partial write.
//
//   STATE 3, flag on and storage configured. The real composition over the
//     domain services and their resolved stores. The synthetic-data guard
//     runs FIRST over the composition configuration, so a sandbox fixture can
//     never compose into a live process.
//
// This module adapts the built domains without modifying them:
//   - the activation and renewal services run over the shared resolved stores,
//   - membership state, the money ledger, and receipts get Supabase-backed
//     implementations of the domain PORTS (research_members,
//     research_fm_ledger, research_fm_receipts),
//   - identity flows that read the flag from process.env inside the domain
//     (requestIdentityUploadUrl and friends) are recomposed here from the
//     domain's own exported validators, because THIS composition is only ever
//     built when the injected environment says the flag is on,
//   - emails ride the existing outbox through emails.ts at the domain
//     transitions; an email failure never blocks a money action.
// ---------------------------------------------------------------------------

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminContext,
  AdminObligationAction,
  FoundingActivationDependencies,
  FoundingActivationServices,
  MemberContext,
  ReadinessArea,
  ReadinessItem,
  ReportPaymentWire,
  ServiceResult,
  SignAgreementWire,
  UploadUrlWire,
  VerifyWire,
} from "./routes";
import {
  BRIDGE_PHASES,
  SUBMISSION_DISPLAY_CONTRACT,
  SUBMITTABLE_STATUSES,
  TERMINAL_STATUSES,
  findDuplicateExternalRefs,
  foundingActivationEnabled,
  migrateObligationMethod,
  newId,
  type AdminIdentity,
  type BridgePhase as ObligationBridgePhase,
  type MemberPaymentSubmission,
  type ObligationRecord,
  type ObligationStatus,
  type PaymentMethodSnapshot,
} from "./obligations";
import {
  createActivationService,
  createInMemoryLedger,
  createInMemoryMembershipState,
  createInMemoryReceipts,
  type LedgerEntry,
  type LedgerWriter,
  type MembershipStateWriter,
  type MembershipStatus,
  type ReceiptIssuer,
  type ReceiptRecord,
} from "./activation";
import { createRenewalService } from "./renewals";
import {
  MANUAL_EXTERNAL_PAYMENT,
  approvePaymentMethod,
  createAesGcmInstructionCipher,
  createPaymentMethod,
  disablePaymentMethod,
  isMethodUsableAt,
  toAuthenticatedMemberMethod,
  type CreatePaymentMethodInput,
  type InstructionCipher,
  type MethodDuration,
  type OwnershipClassification,
  type PaymentMethodRecord,
} from "./payment-methods";
import {
  bridgePhase,
  canCreateObligationWith,
  defaultBridgeSettings,
  effectiveEndAt,
  emergencyDisableBridge,
  requestBridgeExtension,
  type BridgeSettings,
  type ReplacementProviderStatus,
} from "./bridge";
import { DOCUMENT_CATEGORY_REGISTRY, DocumentLifecycle } from "./documents";
import {
  SignatureService,
  newSignatureFormState,
  type EsignAcceptance,
  type SignatureRecord,
} from "./signatures";
import {
  DEFAULT_IDENTITY_UPLOAD_CONFIG,
  IDENTITY_APPLICANT_GUIDANCE,
  IDENTITY_DEFAULT_TENANT,
  IDENTITY_REJECTED_CONTENT_TYPES,
  SupabaseIdentityMediaProvider,
  allowedIdentityContentTypes,
  canTransition as identityCanTransition,
  consentGateOpen,
  openIdentityCase,
  recordIdentityConsent,
  sanitizeIdentityFileName,
  submitIdentityCaseForReview,
  type IdentityDocumentCase,
  type IdentityMediaPort,
  type IdentityUploadConfig,
  type IdentityUploadGrant,
} from "./identity-documents";
import {
  IDENTITY_REJECTION_CATEGORIES,
  completeIdentityReview,
  identityActivationGate,
  isMaskedLast4,
  startIdentityReview,
  type IdentityRejectionCategory,
  type IdentityReviewFindings,
  type IdentityVerificationRecord,
} from "./identity-reviews";
import {
  IDENTITY_ADMIN_ACCESS_TTL_SECONDS,
  emergencyDeleteRawSource,
} from "./identity-retention";
import { resolveObligationsStore, type ObligationsStore } from "./persistence/obligations-store";
import {
  resolvePeriodsStore,
  type MembershipPeriodRecord,
  type PeriodsStore,
} from "./persistence/periods-store";
import {
  resolvePaymentMethodsStore,
  type PaymentMethodsRepository,
} from "./persistence/payment-methods-store";
import { resolveBridgeStore, type BridgeRepository } from "./persistence/bridge-store";
import { resolveDocumentsStore, type DocumentsStore } from "./persistence/documents-store";
import { resolveIdentityStore, type IdentityStore } from "./persistence/identity-store";
import {
  InMemoryIdempotencyStore,
  SupabaseIdempotencyStore,
  type IdempotencyRow,
  type IdempotencyStore,
} from "../commerce/persistence/idempotency-store";
import { assertNoSyntheticDataInProduction } from "../commerce/production-guards";
import {
  isSafeStoragePath,
  type ProviderResult,
  type StorageBucketFactory,
} from "../media-provider";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import { enqueueNotification } from "../outbox";
import { enqueueFoundingEmail, type FoundingEmailEnqueue } from "./emails";
import {
  type ArchiveRecord,
  type EsignMediaPort,
  type EsignProvider,
  type EsignStore,
  type SigningRequestRecord,
} from "./esign/contracts";
import { resolveEsignProvider } from "./esign/provider";
import { resolveEsignStore } from "./esign/persistence/esign-store";
import {
  InMemoryEsignMediaProvider,
  RESEARCH_ESIGN_BUCKET,
  SupabaseEsignMediaProvider,
  buildMemberPacketZip,
  esignSignedPdfPath,
  ingestCompletedDocuments,
  missingEsignMediaEnv,
} from "./esign/archive";
import {
  EsignService,
  type CreateSigningSessionFailure,
  type ProcessWebhookFailure,
} from "./esign/signing";

// ---------------------------------------------------------------------------
// Environment reads (all against the injected env, decided per build)
// ---------------------------------------------------------------------------

/** Mirrors supabaseConfigured() in server/supabase.ts, over an injectable env. */
function databaseConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export const EVIDENCE_BUCKET_ENV = "RESEARCH_EVIDENCE_BUCKET";

// ---------------------------------------------------------------------------
// Domain-port adapters (Supabase-backed implementations of the ports the
// activation domain declares; the domain files are not modified)
// ---------------------------------------------------------------------------

/** research_members.status values mapped onto the domain's membership states.
 * The existing member system spells suspension "past_due" and cancellation
 * "closed"; this adapter is the one place that mapping lives. */
export function memberStatusToMembershipStatus(status: string): MembershipStatus {
  if (status === "active") return "active";
  if (status === "past_due") return "suspended";
  if (status === "closed") return "cancelled";
  return "pending_activation";
}

const MEMBERS_TABLE = "research_members";

/** The MembershipStateWriter port over the EXISTING member record. Writes are
 * loud: a membership state that cannot be persisted aborts the verification
 * transaction rather than half-activating. */
export function createSupabaseMembershipWriter(
  client: SupabaseClient = getSupabaseAdmin(),
): MembershipStateWriter {
  const writer: MembershipStateWriter = {
    async getState(memberId) {
      const res = await client
        .from(MEMBERS_TABLE)
        .select("status, activated_at")
        .eq("id", memberId)
        .maybeSingle();
      if (res.error) throw new Error(`member state load failed: ${res.error.message}`);
      if (!res.data) throw new Error(`no research member ${memberId}`);
      const row = res.data as { status?: string; activated_at?: string | null };
      return {
        memberId,
        status: memberStatusToMembershipStatus(String(row.status ?? "")),
        activatedAt: row.activated_at ?? null,
      };
    },
    async setActive(memberId, activatedAt) {
      // The FIRST activation timestamp is the activation of record.
      const prior = await writer.getState(memberId);
      const up = await client
        .from(MEMBERS_TABLE)
        .update({
          status: "active",
          billing_state: "active",
          activated_at: prior.activatedAt ?? activatedAt,
        })
        .eq("id", memberId);
      if (up.error) throw new Error(`member activation write failed: ${up.error.message}`);
    },
    async setSuspended(memberId) {
      const up = await client
        .from(MEMBERS_TABLE)
        .update({ status: "past_due", billing_state: "past_due" })
        .eq("id", memberId);
      if (up.error) throw new Error(`member suspension write failed: ${up.error.message}`);
    },
  };
  return writer;
}

const LEDGER_TABLE = "research_fm_ledger";

/** The append-only LedgerWriter port over research_fm_ledger. */
export function createSupabaseLedger(client: SupabaseClient = getSupabaseAdmin()): LedgerWriter {
  interface LedgerRow {
    entry_id: string;
    member_id: string;
    obligation_id: string;
    entry_type: LedgerEntry["entryType"];
    amount_cents: number;
    actor_id: string;
    recorded_at: string;
  }
  const rowToEntry = (row: LedgerRow): LedgerEntry => ({
    entryId: row.entry_id,
    memberId: row.member_id,
    obligationId: row.obligation_id,
    entryType: row.entry_type,
    amountCents: row.amount_cents,
    recordedAt: row.recorded_at,
    actorId: row.actor_id,
  });
  const list = async (column: string, value: string): Promise<LedgerEntry[]> => {
    const res = await client.from(LEDGER_TABLE).select("*").eq(column, value);
    if (res.error) throw new Error(`ledger read failed: ${res.error.message}`);
    return ((res.data ?? []) as LedgerRow[]).map(rowToEntry);
  };
  return {
    async append(entry) {
      const ins = await client.from(LEDGER_TABLE).insert({
        entry_id: entry.entryId,
        member_id: entry.memberId,
        obligation_id: entry.obligationId,
        entry_type: entry.entryType,
        amount_cents: entry.amountCents,
        actor_id: entry.actorId,
        recorded_at: entry.recordedAt,
      });
      if (ins.error) throw new Error(`ledger append failed: ${ins.error.message}`);
    },
    listByObligation: (obligationId) => list("obligation_id", obligationId),
    listByMember: (memberId) => list("member_id", memberId),
  };
}

const RECEIPTS_TABLE = "research_fm_receipts";
const UNIQUE_VIOLATION = "23505";

/** The once-per-obligation ReceiptIssuer port over research_fm_receipts. The
 * database UNIQUE (obligation_id) constraint is the authority under
 * concurrency; a losing insert returns the winner. */
export function createSupabaseReceipts(client: SupabaseClient = getSupabaseAdmin()): ReceiptIssuer {
  interface ReceiptRow {
    id: string;
    receipt_number: string;
    obligation_id: string;
    member_id: string;
    amount_cents: number;
    currency: string;
    method_label: string;
    issued_at: string;
  }
  const rowToReceipt = (row: ReceiptRow): ReceiptRecord => ({
    receiptId: row.id,
    receiptNumber: row.receipt_number,
    obligationId: row.obligation_id,
    memberId: row.member_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    methodLabel: row.method_label,
    issuedAt: row.issued_at,
  });
  const findByObligation = async (obligationId: string): Promise<ReceiptRecord | null> => {
    const res = await client
      .from(RECEIPTS_TABLE)
      .select("*")
      .eq("obligation_id", obligationId)
      .maybeSingle();
    if (res.error) throw new Error(`receipt lookup failed: ${res.error.message}`);
    return res.data ? rowToReceipt(res.data as ReceiptRow) : null;
  };
  return {
    async issueOnce(receipt) {
      const ins = await client.from(RECEIPTS_TABLE).insert({
        id: receipt.receiptId,
        receipt_number: receipt.receiptNumber,
        obligation_id: receipt.obligationId,
        member_id: receipt.memberId,
        amount_cents: receipt.amountCents,
        currency: receipt.currency,
        method_label: receipt.methodLabel,
        issued_at: receipt.issuedAt,
      });
      if (ins.error) {
        if ((ins.error as { code?: string }).code === UNIQUE_VIOLATION) {
          const existing = await findByObligation(receipt.obligationId);
          if (existing) return existing;
        }
        throw new Error(`receipt insert failed: ${ins.error.message}`);
      }
      return { ...receipt };
    },
    findByObligation,
  };
}

// ---------------------------------------------------------------------------
// Payment-evidence media (the media seam, evidence configuration)
// ---------------------------------------------------------------------------

/** The slice of the identity media port an evidence upload needs. */
export type EvidenceMediaPort = Pick<IdentityMediaPort, "createUploadUrl">;

/** Screenshots and bank receipts: images plus PDF, modest size, short URL. */
export const EVIDENCE_UPLOAD_CONFIG: IdentityUploadConfig = {
  maxBytes: 15 * 1024 * 1024,
  allowPdf: true,
  uploadUrlTtlSeconds: 10 * 60,
};

/**
 * Payment evidence storage over the same StorageBucketApi seam as member
 * media, in its OWN private bucket (RESEARCH_EVIDENCE_BUCKET) so a payment
 * screenshot can never be reached through an identity or media code path.
 * Unconfigured reads as a truthful refusal, never a fabricated URL.
 */
export class SupabaseEvidenceMediaProvider implements EvidenceMediaPort {
  private readonly bucketFactory: StorageBucketFactory;

  constructor(
    bucketFactory: StorageBucketFactory = (bucket) => getSupabaseAdmin().storage.from(bucket),
  ) {
    this.bucketFactory = bucketFactory;
  }

  async createUploadUrl(input: {
    storagePath: string;
    contentType: string;
    contentLengthBytes: number;
    maxBytes: number;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityUploadGrant>> {
    const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", EVIDENCE_BUCKET_ENV].filter(
      (name) => !process.env[name],
    );
    if (missing.length > 0) {
      return {
        ok: false,
        code: "NOT_CONFIGURED",
        message: `Payment evidence storage is not configured: ${missing.join(", ")}`,
      };
    }
    if (!isSafeStoragePath(input.storagePath)) {
      return { ok: false, code: "REFUSED", message: "That storage path is not one this system generates." };
    }
    try {
      const bucket = this.bucketFactory(process.env[EVIDENCE_BUCKET_ENV] as string);
      const { data, error } = await bucket.createSignedUploadUrl(input.storagePath);
      if (error || !data) {
        return { ok: false, code: "PROVIDER_ERROR", message: `Evidence storage refused the upload URL.` };
      }
      return {
        ok: true,
        value: {
          uploadUrl: data.signedUrl,
          storagePath: input.storagePath,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
          maxBytes: input.maxBytes,
        },
      };
    } catch (err) {
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        message: `Evidence storage failed${err instanceof Error ? `: ${err.message}` : "."}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// The Day 15 checklist store (a simple persisted checklist)
// ---------------------------------------------------------------------------

export interface ChecklistItemState {
  done: boolean;
  note: string | null;
  updatedBy: string;
  updatedAt: string;
}

export type ChecklistState = Record<string, ChecklistItemState>;

export interface ChecklistStore {
  get(): Promise<ChecklistState>;
  put(state: ChecklistState): Promise<void>;
}

export const DAY15_CHECKLIST_ITEMS: readonly { key: string; label: string }[] = [
  { key: "replacement_provider_selected", label: "Replacement business payment provider selected" },
  { key: "provider_account_approved", label: "Business provider account approved and configured" },
  { key: "business_methods_configured", label: "Phase B business methods configured in the registry" },
  { key: "open_obligations_migrated", label: "Open obligations migrated to business methods" },
  { key: "bridge_methods_disabled", label: "Manual bridge methods disabled" },
  { key: "members_notified", label: "Members notified of the payment method change" },
];

export function createInMemoryChecklistStore(): ChecklistStore {
  let state: ChecklistState = {};
  return {
    async get() {
      return { ...state };
    },
    async put(next) {
      state = { ...next };
    },
  };
}

const CHECKLIST_TABLE = "research_fm_bridge_checklist";
const CHECKLIST_ROW_ID = "day15";

/** One jsonb row. Reads fail soft (an unprovisioned table is an empty
 * checklist); writes are loud so progress is never silently lost. NOTE: the
 * table ships with a follow-up migration; until then writes error truthfully. */
export function createSupabaseChecklistStore(client: SupabaseClient = getSupabaseAdmin()): ChecklistStore {
  return {
    async get() {
      try {
        const res = await client
          .from(CHECKLIST_TABLE)
          .select("items")
          .eq("id", CHECKLIST_ROW_ID)
          .maybeSingle();
        if (res.error || !res.data) return {};
        return ((res.data as { items?: ChecklistState }).items ?? {}) as ChecklistState;
      } catch {
        return {};
      }
    },
    async put(state) {
      const up = await client
        .from(CHECKLIST_TABLE)
        .upsert({ id: CHECKLIST_ROW_ID, items: state }, { onConflict: "id" });
      if (up.error) throw new Error(`checklist save failed: ${up.error.message}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Default lookups
// ---------------------------------------------------------------------------

/** The member's email for notifications. Null on any failure: an email that
 * cannot resolve must never block a money action. */
async function lookupMemberEmail(memberId: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(MEMBERS_TABLE)
      .select("email")
      .eq("id", memberId)
      .maybeSingle();
    if (error || !data) return null;
    const email = (data as { email?: unknown }).email;
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wiring seam (every store and provider resolved through this table so the
// composition is testable; index.ts passes nothing, so production always gets
// the real resolvers)
// ---------------------------------------------------------------------------

export interface FoundingActivationWiring {
  resolveObligationsStore(): ObligationsStore;
  resolvePeriodsStore(): PeriodsStore;
  resolvePaymentMethodsStore(): PaymentMethodsRepository;
  resolveBridgeStore(): BridgeRepository;
  resolveDocumentsStore(): DocumentsStore;
  resolveIdentityStore(): IdentityStore;
  resolveMembershipWriter(): MembershipStateWriter;
  resolveLedger(): LedgerWriter;
  resolveReceipts(): ReceiptIssuer;
  resolveIdempotencyStore(): IdempotencyStore;
  resolveIdentityMedia(): IdentityMediaPort;
  resolveEvidenceMedia(): EvidenceMediaPort;
  /** Resolved LAZILY, at the first method-create, so a missing encryption key
   * refuses that request truthfully instead of failing the whole boot. */
  resolveInstructionCipher(): InstructionCipher;
  resolveChecklistStore(): ChecklistStore;
  memberEmail(memberId: string): Promise<string | null>;
  enqueueEmail: FoundingEmailEnqueue;
  identityUploadConfig?: IdentityUploadConfig;
  evidenceUploadConfig?: IdentityUploadConfig;
  /** The e-signature provider (OpenSign), the store, and the completed-document
   * media port. Optional so a test injects fakes; defaultWiring supplies the
   * real resolvers, which stay disabled/in-memory until the flag and the
   * OpenSign configuration are both present. */
  resolveEsignProvider?: () => EsignProvider;
  resolveEsignStore?: () => EsignStore;
  resolveEsignMedia?: () => EsignMediaPort;
  /** Where the admin records copy of an e-sign completion notice is sent. */
  adminRecordsEmail?: string;
}

function defaultWiring(env: NodeJS.ProcessEnv): FoundingActivationWiring {
  return {
    resolveObligationsStore,
    resolvePeriodsStore,
    resolvePaymentMethodsStore,
    resolveBridgeStore,
    resolveDocumentsStore,
    resolveIdentityStore,
    resolveMembershipWriter: () =>
      supabaseConfigured() ? createSupabaseMembershipWriter() : createInMemoryMembershipState(),
    resolveLedger: () => (supabaseConfigured() ? createSupabaseLedger() : createInMemoryLedger()),
    resolveReceipts: () => (supabaseConfigured() ? createSupabaseReceipts() : createInMemoryReceipts()),
    resolveIdempotencyStore: () =>
      supabaseConfigured()
        ? new SupabaseIdempotencyStore(getSupabaseAdmin() as unknown as IdempotencyRow)
        : new InMemoryIdempotencyStore(),
    resolveIdentityMedia: () => new SupabaseIdentityMediaProvider(),
    resolveEvidenceMedia: () => new SupabaseEvidenceMediaProvider(),
    resolveInstructionCipher: () => createAesGcmInstructionCipher(),
    resolveChecklistStore: () =>
      supabaseConfigured() ? createSupabaseChecklistStore() : createInMemoryChecklistStore(),
    memberEmail: lookupMemberEmail,
    enqueueEmail: enqueueNotification,
    // E-signature resolvers. The provider is Disabled unless the flag AND the
    // OpenSign configuration are both present (resolveEsignProvider decides);
    // the store falls back to in-memory until Supabase is configured; the media
    // port is Supabase only when its bucket env is present, else in-memory. None
    // of these touch the network at resolution time.
    resolveEsignProvider: () => resolveEsignProvider(env),
    resolveEsignStore: () => resolveEsignStore(),
    resolveEsignMedia: () =>
      missingEsignMediaEnv(env).length === 0
        ? new SupabaseEsignMediaProvider()
        : new InMemoryEsignMediaProvider(),
    adminRecordsEmail: env.RESEARCH_ADMIN_RECORDS_EMAIL ?? "samuel@xeniostechnology.com",
  };
}

// ---------------------------------------------------------------------------
// Serializations (explicit construction everywhere; receiving-instruction
// plaintext and ciphertext have no field to travel in)
// ---------------------------------------------------------------------------

/** What a MEMBER may see about one of their obligations. */
function memberObligationView(record: ObligationRecord): Record<string, unknown> {
  return {
    xeniosRef: record.humanRef,
    type: record.type,
    status: record.status,
    expectedAmountCents: record.expectedAmountCents,
    currency: record.currency,
    description: record.description,
    dueAt: record.dueAt,
    methodId: record.method.methodId,
    methodLabel: record.method.label,
    submittedAt: record.submission?.submittedAt ?? null,
    receiptRef: record.receiptRef,
  };
}

/** The admin view: every domain field, by explicit construction. The method
 * snapshot is structurally incapable of carrying receiving details. */
function adminObligationView(record: ObligationRecord): Record<string, unknown> {
  return {
    obligationId: record.obligationId,
    humanRef: record.humanRef,
    memberId: record.memberId,
    type: record.type,
    expectedAmountCents: record.expectedAmountCents,
    currency: record.currency,
    description: record.description,
    status: record.status,
    bridgePhase: record.bridgePhase,
    method: { ...record.method },
    agreements: {
      capturedAt: record.agreements.capturedAt,
      agreements: record.agreements.agreements.map((a) => ({ ...a })),
    },
    submission: record.submission ? { ...record.submission } : null,
    verification: record.verification ? { ...record.verification } : null,
    receivingAccountRef: record.receivingAccountRef,
    receiptRef: record.receiptRef,
    createdAt: record.createdAt,
    dueAt: record.dueAt,
    expiresAt: record.expiresAt,
  };
}

/** The admin method view. receivingInstructionsEncrypted NEVER serializes. */
function adminMethodView(record: PaymentMethodRecord): Record<string, unknown> {
  return {
    methodId: record.methodId,
    providerCode: record.providerCode,
    category: record.category,
    memberFacingName: record.memberFacingName,
    adminFacingName: record.adminFacingName,
    enabled: record.enabled,
    duration: record.duration,
    activeStartAt: record.activeStartAt,
    activeEndAt: record.activeEndAt,
    currency: record.currency,
    activationEligible: record.activationEligible,
    renewalEligible: record.renewalEligible,
    productEligible: record.productEligible,
    minAmountCents: record.minAmountCents,
    maxAmountCents: record.maxAmountCents,
    settlementTime: record.settlementTime,
    receivingLegalEntity: record.receivingLegalEntity,
    ownershipClassification: record.ownershipClassification,
    approvalStatus: record.approvalStatus,
    approvalDate: record.approvalDate,
    approvedBy: record.approvedBy,
    complianceReviewNote: record.complianceReviewNote,
    receivingInstructionsMasked: record.receivingInstructionsMasked,
    mobileInstructions: record.mobileInstructions,
    desktopInstructions: record.desktopInstructions,
    memoInstructions: record.memoInstructions,
    deepLinkRef: record.deepLinkRef,
    qrAssetRef: record.qrAssetRef,
    supportContactRef: record.supportContactRef,
    disabledReason: record.disabledReason,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** The member identity view. The storage path NEVER serializes to a member. */
function memberIdentityCaseView(
  kase: IdentityDocumentCase,
  review: IdentityVerificationRecord | null,
): Record<string, unknown> {
  return {
    status: kase.status,
    consentVersion: kase.consentVersion,
    consentRecordedAt: kase.consentRecordedAt,
    uploadedAt: kase.uploadedAt,
    outcome: review?.outcome ?? null,
    rejectionCategory: review?.rejectionCategory ?? null,
  };
}

/** The admin identity case view. Still no storage path: access to the object
 * goes only through the audited view-URL route. */
function adminIdentityCaseView(kase: IdentityDocumentCase): Record<string, unknown> {
  return {
    caseId: kase.caseId,
    memberId: kase.memberId,
    status: kase.status,
    consentVersion: kase.consentVersion,
    consentRecordedAt: kase.consentRecordedAt,
    contentType: kase.contentType,
    uploadedAt: kase.uploadedAt,
    reviewId: kase.reviewId,
    rawDeletedAt: kase.rawDeletedAt,
    createdAt: kase.createdAt,
    updatedAt: kase.updatedAt,
  };
}

function reviewView(record: IdentityVerificationRecord): Record<string, unknown> {
  return {
    reviewId: record.reviewId,
    caseId: record.caseId,
    memberId: record.memberId,
    reviewType: record.reviewType,
    nameMatch: record.nameMatch,
    ageThresholdMet: record.ageThresholdMet,
    documentNotExpired: record.documentNotExpired,
    jurisdiction: record.jurisdiction,
    licenseLast4: record.licenseLast4,
    outcome: record.outcome,
    rejectionCategory: record.rejectionCategory,
    reviewerId: record.reviewerId,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    rawSourceDeletedAt: record.rawSourceDeletedAt,
  };
}

function signatureView(record: SignatureRecord): Record<string, unknown> {
  return {
    id: record.id,
    category: record.category,
    documentVersionId: record.documentVersionId,
    semver: record.semver,
    contentHash: record.contentHash,
    typedLegalName: record.typedLegalName,
    separateAcknowledgment: record.separateAcknowledgment,
    signedAt: record.signedAt,
  };
}

function periodView(period: MembershipPeriodRecord): Record<string, unknown> {
  return {
    periodId: period.periodId,
    sequence: period.sequence,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    fundingObligationId: period.fundingObligationId,
  };
}

function receiptViewOf(receipt: ReceiptRecord): Record<string, unknown> {
  return {
    receiptId: receipt.receiptId,
    receiptNumber: receipt.receiptNumber,
    amountCents: receipt.amountCents,
    currency: receipt.currency,
    methodLabel: receipt.methodLabel,
    issuedAt: receipt.issuedAt,
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// E-signature serializations. The storage refs (signedPdfRef / certificateRef)
// are NEVER serialized: the signed document and certificate are reached only
// through the audited, admin-guarded download route that mints a short-lived
// signed URL. Integrity hashes DO travel (they are the point of the record).
// ---------------------------------------------------------------------------

/** What a MEMBER may see about one of their signing requests. */
function memberEsignRequestView(record: SigningRequestRecord): Record<string, unknown> {
  return {
    requestId: record.id,
    mode: record.mode,
    status: record.signingLinkStatus,
    documentVersionIds: [...record.xeniosDocumentVersionIds],
    signedPdfHash: record.signedPdfHash,
    certificateHash: record.certificateHash,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
  };
}

/** The admin view of a signing request. No storage ref; access to the document
 * is only through the download route. */
function adminEsignRequestView(record: SigningRequestRecord): Record<string, unknown> {
  return {
    requestId: record.id,
    memberId: record.memberId,
    mode: record.mode,
    provider: record.provider,
    providerDocumentId: record.providerDocumentId,
    status: record.signingLinkStatus,
    documentVersionIds: [...record.xeniosDocumentVersionIds],
    signedPdfHash: record.signedPdfHash,
    certificateHash: record.certificateHash,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
  };
}

/** The admin view of an archive record. No storage ref either. */
function adminEsignArchiveView(record: ArchiveRecord): Record<string, unknown> {
  return {
    archiveId: record.id,
    memberId: record.memberId,
    packetOrDocumentId: record.packetOrDocumentId,
    documentVersionId: record.documentVersionId,
    provider: record.provider,
    providerDocumentId: record.providerDocumentId,
    signedPdfHash: record.signedPdfHash,
    certificateHash: record.certificateHash,
    xeniosSourceHash: record.xeniosSourceHash,
    completedAt: record.completedAt,
    archiveStatus: record.archiveStatus,
    accessClassification: record.accessClassification,
    createdAt: record.createdAt,
  };
}

/** Map a signing-session domain failure to a precise wire denial. */
function esignSessionDenial(code: CreateSigningSessionFailure): { code: string; message: string } {
  switch (code) {
    case "no_versions":
      return { code: "validation_failed", message: "At least one document version is required." };
    case "mode_not_provider_backed":
      return { code: "mode_not_supported", message: "That signing mode is not backed by a provider." };
    case "version_not_published":
      return { code: "not_published", message: "A requested document version is not published." };
    case "template_drift":
      return { code: "template_drift", message: "The document text changed; a new template is required." };
    case "provider_error":
      return { code: "provider_error", message: "The e-signature provider could not complete the request." };
  }
}

/** Map a webhook-processing failure to a non-2xx status for the provider. */
function esignWebhookStatus(code: ProcessWebhookFailure): number {
  switch (code) {
    case "unknown_document":
      return 404;
    case "unverified_completion":
      return 422;
    case "provider_error":
      return 502;
    case "ingest_failed":
      return 500;
  }
}

// ---------------------------------------------------------------------------
// The live composition
// ---------------------------------------------------------------------------

const QUEUE_STATUSES: ReadonlySet<ObligationStatus> = new Set<ObligationStatus>([
  "submitted",
  "under_review",
  "info_requested",
  "mismatch",
  "duplicate",
]);

/** Identity case statuses a member's flow can continue on. Everything else
 * (declined, rejected, deleted, verified) means a fresh case for a retry. */
const REUSABLE_CASE_STATUSES: ReadonlySet<string> = new Set([
  "awaiting_consent",
  "consent_recorded",
  "upload_url_issued",
  "upload_expired",
  "uploaded",
  "review_pending",
  "under_review",
]);

const IDENTITY_QUEUE_STATUSES: ReadonlySet<string> = new Set([
  "uploaded",
  "review_pending",
  "under_review",
]);

function buildLiveServices(
  now: () => Date,
  wiring: FoundingActivationWiring,
  env: NodeJS.ProcessEnv,
): FoundingActivationServices {
  const obligations = wiring.resolveObligationsStore();
  const periods = wiring.resolvePeriodsStore();
  const methods = wiring.resolvePaymentMethodsStore();
  const bridge = wiring.resolveBridgeStore();
  const documents = wiring.resolveDocumentsStore();
  const identityStore = wiring.resolveIdentityStore();
  const membership = wiring.resolveMembershipWriter();
  const ledger = wiring.resolveLedger();
  const receipts = wiring.resolveReceipts();
  const idempotency = wiring.resolveIdempotencyStore();
  const identityMedia = wiring.resolveIdentityMedia();
  const evidenceMedia = wiring.resolveEvidenceMedia();
  const checklistStore = wiring.resolveChecklistStore();
  const identityConfig = wiring.identityUploadConfig ?? DEFAULT_IDENTITY_UPLOAD_CONFIG;
  const evidenceConfig = wiring.evidenceUploadConfig ?? EVIDENCE_UPLOAD_CONFIG;
  const tenant = IDENTITY_DEFAULT_TENANT;

  const signatures = new SignatureService(documents, { now });

  // ---- e-signature (OpenSign) composition ----------------------------------
  // The provider is EXECUTION ONLY; the agreement engine above stays the source
  // of legal truth. A completion advances the gate only through a VERIFIED
  // webhook (never a browser redirect), and the signed document + certificate
  // are ingested into xenios' own private storage.
  const documentLifecycle = new DocumentLifecycle(documents, { now });
  const esignProvider = (wiring.resolveEsignProvider ?? (() => resolveEsignProvider(env)))();
  const esignStore = (wiring.resolveEsignStore ?? resolveEsignStore)();
  const esignMedia = (wiring.resolveEsignMedia ?? (() => new InMemoryEsignMediaProvider()))();
  const adminRecordsEmail =
    wiring.adminRecordsEmail ?? env.RESEARCH_ADMIN_RECORDS_EMAIL ?? "samuel@xeniostechnology.com";

  const esignService = new EsignService({
    store: esignStore,
    provider: esignProvider,
    media: esignMedia,
    lifecycle: documentLifecycle,
    signatures,
    now,
    // Ingest completions through the archive module so xenios holds its own
    // hashed copy of the signed pdf + certificate + metadata under the legal
    // record hierarchy (not the signing service's default flat path).
    ingestCompleted: async (input) => {
      const version = input.xeniosDocumentVersionIds[0] ?? input.packetOrDocumentId;
      if (input.certificateFile) {
        const result = await ingestCompletedDocuments({
          memberId: input.memberId,
          packetOrDocumentId: input.packetOrDocumentId,
          version,
          signedPdf: input.signedFile,
          certificate: input.certificateFile,
          media: esignMedia,
          provider: esignProvider.name,
          completedAt: input.completedAt,
        });
        return {
          signedPdfRef: result.signedPdfRef,
          signedPdfHash: result.signedPdfHash,
          certificateRef: result.certificateRef,
          certificateHash: result.certificateHash,
        };
      }
      // A completion with no certificate: store the signed pdf alone at the same
      // archive path, still hashed by xenios. Nothing partially succeeds.
      const signedPdfRef = esignSignedPdfPath(input.memberId, input.packetOrDocumentId, version);
      const put = await esignMedia.putObject({
        storagePath: signedPdfRef,
        bytes: input.signedFile.bytes,
        contentType: input.signedFile.contentType ?? "application/pdf",
      });
      if (!put.ok) throw new Error("signed document store failed");
      return {
        signedPdfRef,
        signedPdfHash: crypto.createHash("sha256").update(input.signedFile.bytes).digest("hex"),
        certificateRef: null,
        certificateHash: null,
      };
    },
  });

  /** The three-state refusal every esign SERVICE returns when the provider is
   * not live (founding activation on, but e-signature off). */
  function esignDisabled(): ServiceResult {
    return { ok: false, code: "capability_disabled", message: "E-signature is not enabled." };
  }

  /** The member's completed e-sign acceptances, mapped to the (category,
   * publishedVersionId) shape the agreements gate reads. A completed request's
   * versions are resolved through the lifecycle so a stale version is skipped
   * rather than counted. Empty when the provider is not live. */
  async function esignAcceptancesFor(memberId: string): Promise<EsignAcceptance[]> {
    if (!esignProvider.isLive) return [];
    const requests = await esignStore.requests.listByMember(memberId);
    const acceptances: EsignAcceptance[] = [];
    for (const record of requests) {
      if (record.signingLinkStatus !== "completed") continue;
      for (const versionId of record.xeniosDocumentVersionIds) {
        const version = await documentLifecycle.getVersion(versionId);
        if (!version) continue;
        acceptances.push({ category: version.category, documentVersionId: version.id });
      }
    }
    return acceptances;
  }

  /** Best-effort document title + version for an esign notification. */
  async function esignDocumentMeta(
    versionIds: readonly string[],
  ): Promise<{ title: string; version: string }> {
    if (versionIds.length === 1) {
      const version = await documentLifecycle.getVersion(versionIds[0]);
      if (version) return { title: version.title, version: version.semver };
    }
    return { title: `activation packet (${versionIds.length} documents)`, version: "packet" };
  }

  /** Enqueue the member + admin completion notices. Failures are swallowed by
   * notify(), so a notification can never block a webhook. NO storage ref, no
   * signed URL, and no evidence content travels in either payload. */
  async function sendEsignCompletionNotices(
    record: SigningRequestRecord,
    subjectId: string,
  ): Promise<void> {
    const meta = await esignDocumentMeta(record.xeniosDocumentVersionIds);
    await notify("fm_esign_completed_member", await recipientFor(record.memberId), subjectId, {
      documentTitle: meta.title,
      version: meta.version,
      signedAt: record.completedAt,
    });
    await notify("fm_admin_esign_completed", adminRecordsEmail, subjectId, {
      memberName: record.memberId,
      memberId: record.memberId,
      documentTitle: meta.title,
      version: meta.version,
      completedAt: record.completedAt,
      signedPdfHash: record.signedPdfHash,
      certificateHash: record.certificateHash,
      // A path into the AUTHENTICATED admin document center, never a raw URL.
      adminLink: `/admin/research/activation/esign/member/${record.memberId}`,
    });
  }

  /** Persist an archive record for a freshly-completed signing request, so the
   * admin document center and the member packet ZIP have a first-class row to
   * read. Idempotent by construction: only a newly-applied completion calls it. */
  async function recordEsignArchive(record: SigningRequestRecord): Promise<void> {
    const nowIso = now().toISOString();
    const archiveRecord: ArchiveRecord = {
      id: newId(),
      memberId: record.memberId,
      packetOrDocumentId: record.packetOrDocumentId,
      documentVersionId:
        record.xeniosDocumentVersionIds.length === 1 ? record.xeniosDocumentVersionIds[0] : null,
      provider: record.provider,
      providerDocumentId: record.providerDocumentId,
      signedPdfRef: record.signedPdfRef,
      signedPdfHash: record.signedPdfHash,
      certificateRef: record.certificateRef,
      certificateHash: record.certificateHash,
      xeniosSourceHash: record.sourceContentHashes[0] ?? null,
      signerEmail: record.signerIdentifier,
      completedAt: record.completedAt,
      retentionClass: "legal_records",
      accessClassification: "member_and_admin",
      archiveStatus: "stored",
      emailDeliveryStatus: "sent",
      localExportStatus: "not_exported",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    try {
      await esignStore.archive.insert(archiveRecord);
    } catch (error) {
      // A failed archive-row write must not fail the webhook; the durable
      // signing request already carries the refs + hashes.
      console.error(
        "[founding-activation] esign archive insert failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // BOTH verification services over the SAME stores, so an activation and its
  // renewals share one money spine, one membership state, and one idempotency
  // scope per obligation.
  const activationService = createActivationService({
    obligations,
    periods,
    membership,
    ledger,
    receipts,
    idempotency,
    now,
  });
  const renewalService = createRenewalService({
    obligations,
    periods,
    membership,
    ledger,
    receipts,
    idempotency,
    now,
  });

  const randomHex = () => crypto.randomBytes(12).toString("hex");

  // ---- email plumbing (never blocks the action it follows) -----------------

  async function notify(
    templateKey: string,
    recipient: string | null,
    subjectId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!recipient) return;
    try {
      await enqueueFoundingEmail(wiring.enqueueEmail, { templateKey, recipient, subjectId, payload });
    } catch (error) {
      console.error(
        "[founding-activation] email enqueue failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  async function recipientFor(memberId: string): Promise<string | null> {
    try {
      return await wiring.memberEmail(memberId);
    } catch {
      return null;
    }
  }

  // ---- shared resolution helpers -------------------------------------------

  function adminIdentityOf(admin: AdminContext): AdminIdentity {
    return { adminId: admin.adminId, role: "admin", ip: admin.ip, userAgent: admin.userAgent };
  }

  function openActivationObligation(all: readonly ObligationRecord[]): ObligationRecord | null {
    return (
      all.find(
        (record) =>
          record.type === "activation_50" &&
          record.status !== "verified" &&
          !TERMINAL_STATUSES.includes(record.status),
      ) ?? null
    );
  }

  /** The obligation the member is currently expected to pay: the activation
   * while it is open, else the earliest reportable renewal. */
  async function currentPayableObligation(memberId: string): Promise<ObligationRecord | null> {
    const all = await obligations.listByMember(memberId);
    const activation = openActivationObligation(all);
    if (activation) return activation;
    const renewals = all
      .filter(
        (record) =>
          record.type === "renewal_25" &&
          record.status !== "verified" &&
          !TERMINAL_STATUSES.includes(record.status) &&
          (SUBMITTABLE_STATUSES.includes(record.status) || record.status === "under_review"),
      )
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return renewals[0] ?? null;
  }

  async function latestIdentityCase(memberId: string): Promise<IdentityDocumentCase | null> {
    const cases = await identityStore.listCasesByMember(tenant, memberId);
    if (cases.length === 0) return null;
    return cases.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[cases.length - 1];
  }

  async function latestCompletedReview(memberId: string): Promise<IdentityVerificationRecord | null> {
    const cases = await identityStore.listCasesByMember(tenant, memberId);
    const reviews: IdentityVerificationRecord[] = [];
    for (const kase of cases) {
      const review = await identityStore.getReviewForCase(tenant, kase.caseId);
      if (review) reviews.push(review);
    }
    if (reviews.length === 0) return null;
    return reviews.sort((a, b) => a.completedAt.localeCompare(b.completedAt))[reviews.length - 1];
  }

  // The activation preconditions the payment surface must hold, evaluated
  // server-side from durable state: the identity review must have verified the
  // member, and every required agreement must be satisfied. Both the
  // pre-obligation method list AND the mutating select-method (which mints the
  // $50 obligation) run this, so the obligation can never be created for an
  // unverified or unsigned member. Returns null when clear, else the precise
  // denial to return to the caller.
  async function activationGatesDenial(
    memberId: string,
  ): Promise<{ code: string; message: string } | null> {
    const identityGate = identityActivationGate(await latestCompletedReview(memberId));
    if (identityGate.blocked) {
      return {
        code: identityGate.reason,
        message:
          identityGate.reason === "identity_rejected"
            ? "The identity review did not pass; payment methods stay sealed."
            : "The manual identity review has not verified this member yet.",
      };
    }
    const agreementsGate = await signatures.requiredAgreementsSatisfied(memberId, {
      esignAcceptances: await esignAcceptancesFor(memberId),
    });
    if (!agreementsGate.satisfied) {
      return {
        code: "agreements_unsatisfied",
        message: `Required agreements are not satisfied: ${agreementsGate.blocking
          .map((b) => `${b.category} (${b.reason})`)
          .join(", ")}`,
      };
    }
    return null;
  }

  async function appendIdentityAudit(
    kase: IdentityDocumentCase,
    kind:
      | "case_opened"
      | "consent_recorded"
      | "consent_declined"
      | "upload_url_issued"
      | "upload_confirmed"
      | "submitted_for_review"
      | "review_started"
      | "review_completed"
      | "admin_viewed",
    actorType: "member" | "admin" | "system",
    actorId: string | null,
    detail: string | null = null,
  ): Promise<void> {
    await identityStore.appendAuditEvent({
      tenantId: kase.tenantId,
      caseId: kase.caseId,
      memberId: kase.memberId,
      kind,
      actorType,
      actorId,
      at: now().toISOString(),
      detail,
    });
  }

  async function memberSignatures(memberId: string): Promise<readonly SignatureRecord[]> {
    return documents.listSignaturesForMember(memberId);
  }

  // ---- the step tracker ----------------------------------------------------

  type StepState = "complete" | "action_required" | "pending" | "blocked";

  async function statusView(member: MemberContext): Promise<ServiceResult> {
    const all = await obligations.listByMember(member.memberId);
    const activation =
      all.find((r) => r.type === "activation_50" && r.status === "verified") ??
      openActivationObligation(all);
    const membershipState = await membership.getState(member.memberId);
    const latestPeriod = await periods.latestForMember(member.memberId);
    const review = await latestCompletedReview(member.memberId);
    const identityCase = await latestIdentityCase(member.memberId);
    // Compose the SAME esign acceptances the authoritative gates use, so an
    // e-signed member's progress reads correctly here instead of showing a
    // completed agreement as still outstanding.
    const agreementsGate = await signatures.requiredAgreementsSatisfied(member.memberId, {
      esignAcceptances: await esignAcceptancesFor(member.memberId),
    });

    // The electronic-record consent, on its own step (it gates every other
    // signature), computed against the published version.
    const consentPublished = await documents.getPublished("electronic_record_consent");
    const sigs = await memberSignatures(member.memberId);
    const consentSigned = consentPublished
      ? sigs.some((s) => s.documentVersionId === consentPublished.id) ||
        (!consentPublished.reacceptanceRequired &&
          sigs.some((s) => s.category === "electronic_record_consent"))
      : false;

    const identityGate = identityActivationGate(review);
    let identityState: StepState;
    let identityDetail: string | null = null;
    if (!identityGate.blocked) {
      identityState = "complete";
    } else if (identityGate.reason === "identity_rejected") {
      identityState = "blocked";
      identityDetail = "The identity review did not pass. Start a new attempt from the identity step.";
    } else if (identityCase && REUSABLE_CASE_STATUSES.has(identityCase.status)) {
      identityState = "action_required";
      identityDetail = `Identity case is ${identityCase.status}.`;
    } else {
      identityState = "pending";
    }

    let paymentState: StepState = "pending";
    let paymentDetail: string | null = null;
    if (activation) {
      if (activation.status === "verified") paymentState = "complete";
      else if (activation.status === "info_requested" || activation.status === "rejected") {
        paymentState = "action_required";
        paymentDetail = `Your payment report is ${activation.status.replace("_", " ")}.`;
      } else if (QUEUE_STATUSES.has(activation.status)) {
        paymentState = "action_required";
        paymentDetail = "Your payment report is awaiting verification by a person.";
      } else {
        paymentState = "action_required";
        paymentDetail = "Send your activation payment and report it here.";
      }
    }

    const steps: Array<{ step: string; state: StepState; detail: string | null }> = [
      { step: "application", state: "complete", detail: null },
      { step: "claim", state: "complete", detail: null },
      { step: "email", state: member.email ? "complete" : "pending", detail: null },
      {
        step: "consents",
        state: consentPublished ? (consentSigned ? "complete" : "action_required") : "blocked",
        detail: consentPublished ? null : "The electronic records consent has not been published yet.",
      },
      { step: "identity", state: identityState, detail: identityDetail },
      {
        step: "agreements",
        state: agreementsGate.satisfied ? "complete" : "action_required",
        detail: agreementsGate.satisfied
          ? null
          : `Outstanding: ${agreementsGate.blocking.map((b) => b.category).join(", ")}`,
      },
      {
        step: "obligation",
        state: activation ? "complete" : "action_required",
        detail: activation ? null : "Choose a payment method to create your activation obligation.",
      },
      { step: "payment", state: paymentState, detail: paymentDetail },
      {
        step: "verification",
        state: activation?.status === "verified" ? "complete" : "pending",
        detail: activation?.status === "verified" ? null : "Xenios verifies every payment by hand.",
      },
      {
        step: "active",
        state: membershipState.status === "active" ? "complete" : "pending",
        detail: null,
      },
    ];
    const currentStep = steps.find((s) => s.state !== "complete")?.step ?? null;

    return {
      ok: true,
      steps,
      currentStep,
      active: membershipState.status === "active",
      membershipStatus: membershipState.status,
      activatedAt: membershipState.activatedAt,
      renewalDate: latestPeriod?.endsAt ?? null,
      submissionContract: SUBMISSION_DISPLAY_CONTRACT,
    };
  }

  // ---- the services --------------------------------------------------------

  return {
    status: statusView,

    esign: {
      async startSession(member, input) {
        if (!esignProvider.isLive) return esignDisabled();
        const result = await esignService.createSigningSession({
          memberId: member.memberId,
          signerEmail: member.email,
          mode: input.mode,
          xeniosDocumentVersionIds: input.documentVersionIds,
          idempotencyKey: input.idempotencyKey,
        });
        if (!result.ok) {
          const denial = esignSessionDenial(result.code);
          return { ok: false, code: denial.code, message: denial.message };
        }
        // On a fresh provider-backed session (not an idempotent replay), let the
        // member know the signing link is ready. The signing URL itself is
        // provider-ephemeral and returned inline, never emailed.
        if (!result.idempotentReplay) {
          const meta = await esignDocumentMeta(result.request.xeniosDocumentVersionIds);
          await notify("fm_esign_signing_ready", await recipientFor(member.memberId), result.request.id, {
            documentTitle: meta.title,
          });
        }
        return {
          ok: true,
          requestId: result.request.id,
          providerDocumentId: result.request.providerDocumentId,
          status: result.request.signingLinkStatus,
          signingUrl: result.signingUrl,
          idempotentReplay: result.idempotentReplay,
        };
      },
      async documents(member) {
        if (!esignProvider.isLive) return esignDisabled();
        const requests = await esignStore.requests.listByMember(member.memberId);
        return { ok: true, documents: requests.map(memberEsignRequestView) };
      },
    },

    // The provider webhook: the ONLY thing that advances an e-sign acceptance,
    // processed server-side, deduplicated by provider event id. Returns a bare
    // { status, body } the route relays; it never throws to the route.
    async esignWebhook(rawBody, signatureHeader, nowMs) {
      if (!esignProvider.isLive) {
        return { status: 503, body: { ok: false, code: "capability_disabled" } };
      }
      const verified = esignProvider.verifyWebhook(rawBody, signatureHeader, nowMs);
      if (!verified.ok) {
        return { status: 400, body: { ok: false, code: verified.code } };
      }
      let result;
      try {
        result = await esignService.processWebhookEvent(verified.event);
      } catch (error) {
        // Never log the raw body or the signature.
        console.error(
          "[founding-activation] esign webhook processing failed:",
          error instanceof Error ? error.message : "unknown",
        );
        return { status: 500, body: { ok: false, code: "internal_error" } };
      }
      if (!result.ok) {
        return { status: esignWebhookStatus(result.code), body: { ok: false, code: result.code } };
      }
      // A newly-applied completion: archive the record and notify. A replay
      // (applied:false) is a no-op here, so nothing double-archives or re-emails.
      if (result.applied && result.status === "completed") {
        const record = await esignStore.requests.getByProviderDocumentId(
          verified.event.providerDocumentId,
        );
        if (record) {
          await recordEsignArchive(record);
          await sendEsignCompletionNotices(record, record.id);
        }
      }
      return { status: 200, body: { ok: true, applied: result.applied, status: result.status } };
    },

    identity: {
      async consent(member, input) {
        let kase = await latestIdentityCase(member.memberId);
        if (!kase || !REUSABLE_CASE_STATUSES.has(kase.status)) {
          kase = openIdentityCase({ memberId: member.memberId, now: now() });
          await identityStore.saveCase(kase);
          await appendIdentityAudit(kase, "case_opened", "member", member.memberId);
        }
        if (kase.status !== "awaiting_consent") {
          if (input.accepted && consentGateOpen(kase)) {
            // Idempotent: consent already granted on this case.
            return { ok: true, case: memberIdentityCaseView(kase, null), guidance: IDENTITY_APPLICANT_GUIDANCE };
          }
          return { ok: false, code: "invalid_state", message: "Consent was already answered for this case." };
        }
        const updated = recordIdentityConsent(kase, {
          accepted: input.accepted,
          consentVersion: input.consentVersion,
          now: now(),
        });
        await identityStore.saveCase(updated);
        await appendIdentityAudit(
          updated,
          input.accepted ? "consent_recorded" : "consent_declined",
          "member",
          member.memberId,
          `version=${input.consentVersion}`,
        );
        return { ok: true, case: memberIdentityCaseView(updated, null), guidance: IDENTITY_APPLICANT_GUIDANCE };
      },

      // The domain's requestIdentityUploadUrl reads the flag from process.env;
      // this composition exists only when the injected env already said yes,
      // so the SAME exported validators are composed here, in the SAME order.
      async uploadUrl(member, input) {
        const kase = await latestIdentityCase(member.memberId);
        if (!kase || !consentGateOpen(kase)) {
          return {
            ok: false,
            code: "consent_required",
            message: "Identity consent must be recorded before any upload path opens.",
          };
        }
        if (!identityCanTransition(kase.status, "upload_url_issued")) {
          return {
            ok: false,
            code: "invalid_state",
            message: `An upload URL cannot be issued from status ${kase.status}.`,
          };
        }
        if (IDENTITY_REJECTED_CONTENT_TYPES.includes(input.contentType)) {
          return {
            ok: false,
            code: "content_type_rejected",
            message: "That content type is never accepted for an identity document.",
          };
        }
        const allowed = allowedIdentityContentTypes(identityConfig);
        if (!allowed.includes(input.contentType)) {
          return {
            ok: false,
            code: "content_type_rejected",
            message: `contentType must be one of: ${allowed.join(", ")}`,
          };
        }
        if (input.contentLengthBytes > identityConfig.maxBytes) {
          return {
            ok: false,
            code: "validation_failed",
            message: `An identity document upload must be at most ${identityConfig.maxBytes} bytes.`,
          };
        }
        if (sanitizeIdentityFileName(input.fileName, identityConfig) === null) {
          return {
            ok: false,
            code: "validation_failed",
            message: "That file name is not acceptable for an identity document.",
          };
        }
        const storagePath = `identity/${kase.tenantId}/${kase.memberId}/${kase.caseId}-${randomHex()}`;
        const grant = await identityMedia.createUploadUrl({
          storagePath,
          contentType: input.contentType,
          contentLengthBytes: input.contentLengthBytes,
          maxBytes: identityConfig.maxBytes,
          expiresInSeconds: identityConfig.uploadUrlTtlSeconds,
          now: now(),
        });
        if (!grant.ok) {
          return { ok: false, code: "provider_error", message: "Identity storage refused the upload URL." };
        }
        const updated: IdentityDocumentCase = {
          ...kase,
          status: "upload_url_issued",
          storagePath: grant.value.storagePath,
          contentType: input.contentType,
          uploadUrlExpiresAt: grant.value.expiresAt,
          updatedAt: now().toISOString(),
        };
        await identityStore.saveCase(updated);
        await appendIdentityAudit(updated, "upload_url_issued", "member", member.memberId);
        // The storage path stays server-side; a member needs only the URL.
        return {
          ok: true,
          grant: {
            uploadUrl: grant.value.uploadUrl,
            expiresAt: grant.value.expiresAt,
            maxBytes: grant.value.maxBytes,
          },
        };
      },

      async markUploaded(member) {
        const kase = await latestIdentityCase(member.memberId);
        if (!kase || kase.status !== "upload_url_issued" || kase.storagePath === null) {
          return { ok: false, code: "invalid_state", message: "There is no pending upload to confirm." };
        }
        // Storage is asked, never assumed.
        const stat = await identityMedia.statObject(kase.storagePath);
        if (!stat.ok) {
          return { ok: false, code: "provider_error", message: "Identity storage could not be checked." };
        }
        if (!stat.value.exists) {
          return { ok: false, code: "upload_missing", message: "No uploaded object was found for this case." };
        }
        const at = now();
        let updated: IdentityDocumentCase = {
          ...kase,
          status: "uploaded",
          uploadedAt: at.toISOString(),
          updatedAt: at.toISOString(),
        };
        updated = submitIdentityCaseForReview(updated, at);
        await identityStore.saveCase(updated);
        await appendIdentityAudit(updated, "upload_confirmed", "member", member.memberId);
        await appendIdentityAudit(updated, "submitted_for_review", "member", member.memberId);
        return { ok: true, case: memberIdentityCaseView(updated, null) };
      },

      async status(member) {
        const kase = await latestIdentityCase(member.memberId);
        const review = kase ? await identityStore.getReviewForCase(tenant, kase.caseId) : null;
        return {
          ok: true,
          case: kase ? memberIdentityCaseView(kase, review) : null,
          guidance: IDENTITY_APPLICANT_GUIDANCE,
        };
      },
    },

    agreements: {
      async required(member) {
        const sigs = await memberSignatures(member.memberId);
        // The additive e-sign acceptances, so a category signed through
        // OpenSign reads as signed here exactly as it satisfies the gate.
        const esignAcceptances = await esignAcceptancesFor(member.memberId);
        const esignVersionIds = new Set(esignAcceptances.map((a) => a.documentVersionId));
        const esignCategories = new Set(esignAcceptances.map((a) => a.category));
        const list: Record<string, unknown>[] = [];
        for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
          const published = await documents.getPublished(definition.category);
          if (!published) continue; // published versions only
          const signedCurrent =
            sigs.some((s) => s.documentVersionId === published.id) || esignVersionIds.has(published.id);
          const carriedOver =
            !published.reacceptanceRequired &&
            (sigs.some((s) => s.category === definition.category) || esignCategories.has(definition.category));
          list.push({
            category: published.category,
            title: published.title,
            documentVersionId: published.id,
            semver: published.semver,
            requirement: published.requirement,
            activationStep: published.activationStep,
            requiresSeparateAcknowledgment: published.requiresSeparateAcknowledgment,
            jurisdiction: published.jurisdiction,
            effectiveDate: published.effectiveDate,
            content: published.content,
            contentHash: published.contentHash,
            signed: signedCurrent || carriedOver,
            signedCurrentVersion: signedCurrent,
          });
        }
        const gate = await signatures.requiredAgreementsSatisfied(member.memberId, {
          esignAcceptances,
        });
        return {
          ok: true,
          agreements: list,
          satisfied: gate.satisfied,
          blocking: gate.blocking,
          // Exported blank state: nothing is ever prechecked.
          formState: newSignatureFormState(),
        };
      },

      async sign(member, input: SignAgreementWire) {
        const result = await signatures.sign({
          memberId: member.memberId,
          documentVersionId: input.documentVersionId,
          typedLegalName: input.typedLegalName,
          fullDocumentShown: input.fullDocumentShown,
          affirmativeConsent: input.affirmativeConsent,
          separateAcknowledgment: input.separateAcknowledgment,
          ip: member.ip,
          userAgent: member.userAgent,
        });
        if (!result.ok) return { ok: false, code: result.code };
        return { ok: true, replayed: result.replayed, signature: signatureView(result.signature) };
      },

      async signed(member) {
        const documentsSigned = await signatures.listSignedDocuments(member.memberId);
        return {
          ok: true,
          signed: documentsSigned.map((entry) => ({
            signature: signatureView(entry.signature),
            document: entry.document
              ? {
                  id: entry.document.id,
                  category: entry.document.category,
                  title: entry.document.title,
                  semver: entry.document.semver,
                  status: entry.document.status,
                  content: entry.document.content,
                  contentHash: entry.document.contentHash,
                  jurisdiction: entry.document.jurisdiction,
                  publishedAt: entry.document.publishedAt,
                  effectiveDate: entry.document.effectiveDate,
                }
              : null,
          })),
        };
      },
    },

    payment: {
      // Authenticated members only, masked instructions only. With a payable
      // obligation the list is scoped to its purpose and carries the memo
      // reference. BEFORE any obligation exists, the member must pass the
      // same preconditions select-method's flow enforces (the verified
      // identity gate and the satisfied agreements gate); then the list opens
      // so a first-time member can actually choose a method, with each
      // method's activation eligibility computed by the bridge creation gate.
      // Members before those gates still get the precise denial, and the
      // pre-auth surface never reaches this service at all.
      async methods(member) {
        const at = now();
        const payable = await currentPayableObligation(member.memberId);
        if (payable) {
          const purposeEligible = (record: PaymentMethodRecord) =>
            payable.type === "activation_50" ? record.activationEligible : record.renewalEligible;
          const usable = (await methods.list()).filter(
            (record) => isMethodUsableAt(record, at) && purposeEligible(record),
          );
          return {
            ok: true,
            methods: usable.map((record) => ({
              ...toAuthenticatedMemberMethod(record),
              // The memo the member must include so the payment matches them.
              memoReference: payable.humanRef,
            })),
            memoReference: payable.humanRef,
            submissionContract: SUBMISSION_DISPLAY_CONTRACT,
          };
        }

        // Pre-obligation: the chooser's list, behind the activation gates.
        const denial = await activationGatesDenial(member.memberId);
        if (denial) return { ok: false, code: denial.code, message: denial.message };
        const settings = await bridge.getSettings();
        const listable = (await methods.list()).filter(
          (record) => isMethodUsableAt(record, at) && record.activationEligible,
        );
        return {
          ok: true,
          methods: listable.map((record) => ({
            ...toAuthenticatedMemberMethod(record),
            // Whether select-method would accept this method right now,
            // straight from the bridge creation gate (purpose: activation).
            activationEligibleNow: settings
              ? canCreateObligationWith(record, settings, at, "activation").allowed
              : false,
          })),
          // No obligation yet, so there is no memo reference to cite.
          memoReference: null,
          submissionContract: SUBMISSION_DISPLAY_CONTRACT,
        };
      },

      async selectMethod(member, methodId) {
        // The SAME activation gates the pre-obligation list enforces, now on
        // the mutating path: an unverified or unsigned member can never mint a
        // $50 obligation, no matter how they reach select-method.
        const denial = await activationGatesDenial(member.memberId);
        if (denial) return { ok: false, code: denial.code, message: denial.message };
        const record = await methods.get(methodId);
        if (!record) return { ok: false, code: "method_not_found", message: "No payment method with that id." };
        const settings = await bridge.getSettings();
        if (!settings) {
          return { ok: false, code: "bridge_not_configured", message: "The payment bridge is not configured yet." };
        }
        const state = await membership.getState(member.memberId);
        if (state.status === "active") {
          return { ok: false, code: "already_active", message: "This membership is already active." };
        }
        const gate = canCreateObligationWith(record, settings, now(), "activation");
        if (!gate.allowed) {
          return { ok: false, code: gate.reason, message: "A new obligation cannot be created with this method right now." };
        }
        const snapshot: PaymentMethodSnapshot = {
          methodId: record.methodId,
          category: MANUAL_EXTERNAL_PAYMENT,
          label: record.memberFacingName,
          // Opaque pointer at the registry row holding the encrypted
          // instructions; the details themselves have no field to live in.
          instructionsRef: record.methodId,
          productPurchaseEligible: false,
          capturedAt: now().toISOString(),
        };
        const all = await obligations.listByMember(member.memberId);
        const existing = openActivationObligation(all);
        if (existing && existing.method.methodId === record.methodId) {
          return { ok: true, obligation: memberObligationView(existing), created: false };
        }
        if (existing) {
          // The member switches methods on their open obligation: the audited
          // domain migration, with the member as the recorded actor.
          const migrated = migrateObligationMethod(
            existing,
            snapshot,
            existing.bridgePhase,
            { actorType: "member", actorId: member.memberId, ip: member.ip, userAgent: member.userAgent },
            now(),
          );
          await obligations.save(migrated);
          return { ok: true, obligation: memberObligationView(migrated), created: false };
        }
        const created = await activationService.createActivation(member.memberId, snapshot);
        await notify("fm_activation_obligation_created", member.email || null, created.obligationId, {
          xeniosRef: created.humanRef,
        });
        return { ok: true, obligation: memberObligationView(created), created: true };
      },

      async obligation(member) {
        const payable = await currentPayableObligation(member.memberId);
        return {
          ok: true,
          obligation: payable ? memberObligationView(payable) : null,
          submissionContract: SUBMISSION_DISPLAY_CONTRACT,
        };
      },

      async report(member, input: ReportPaymentWire) {
        const payable = await currentPayableObligation(member.memberId);
        if (!payable) {
          return { ok: false, code: "no_obligation", message: "There is no payable obligation to report against." };
        }
        // The method and the memo reference are the OBLIGATION's, resolved
        // server-side; a report cannot point at another obligation or method.
        const submission: Omit<MemberPaymentSubmission, "submittedAt"> = {
          methodId: payable.method.methodId,
          amountCents: input.amountCents,
          sentDate: input.sentDate,
          sentTime: input.sentTime,
          senderName: input.senderName,
          senderContact: input.senderContact,
          senderIdentifierMasked: input.senderIdentifierMasked,
          externalRef: input.externalRef,
          xeniosRef: payable.humanRef,
          note: input.note,
          evidenceRef: input.evidenceRef,
          accuracyCertified: input.accuracyCertified,
        };
        const updated = await activationService.recordSubmission(payable.obligationId, submission, {
          memberId: member.memberId,
          ip: member.ip,
          userAgent: member.userAgent,
        });
        await notify("fm_payment_report_received", member.email || null, updated.obligationId, {
          xeniosRef: updated.humanRef,
        });
        return {
          ok: true,
          obligation: memberObligationView(updated),
          submissionContract: SUBMISSION_DISPLAY_CONTRACT,
        };
      },

      async evidenceUploadUrl(member, input: UploadUrlWire) {
        const payable = await currentPayableObligation(member.memberId);
        if (!payable) {
          return { ok: false, code: "no_obligation", message: "There is no payable obligation to attach evidence to." };
        }
        if (IDENTITY_REJECTED_CONTENT_TYPES.includes(input.contentType)) {
          return { ok: false, code: "content_type_rejected", message: "That content type is never accepted." };
        }
        const allowed = allowedIdentityContentTypes(evidenceConfig);
        if (!allowed.includes(input.contentType)) {
          return {
            ok: false,
            code: "content_type_rejected",
            message: `contentType must be one of: ${allowed.join(", ")}`,
          };
        }
        if (input.contentLengthBytes > evidenceConfig.maxBytes) {
          return {
            ok: false,
            code: "validation_failed",
            message: `A payment evidence upload must be at most ${evidenceConfig.maxBytes} bytes.`,
          };
        }
        if (sanitizeIdentityFileName(input.fileName, evidenceConfig) === null) {
          return { ok: false, code: "validation_failed", message: "That file name is not acceptable." };
        }
        const storagePath = `payment-evidence/${tenant}/${member.memberId}/${payable.obligationId}-${randomHex()}`;
        const grant = await evidenceMedia.createUploadUrl({
          storagePath,
          contentType: input.contentType,
          contentLengthBytes: input.contentLengthBytes,
          maxBytes: evidenceConfig.maxBytes,
          expiresInSeconds: evidenceConfig.uploadUrlTtlSeconds,
          now: now(),
        });
        if (!grant.ok) {
          if (grant.code === "NOT_CONFIGURED" || grant.code === "DISABLED") {
            return { ok: false, code: "capability_disabled", message: "Payment evidence storage is not available yet." };
          }
          return { ok: false, code: "provider_error", message: "Evidence storage refused the upload URL." };
        }
        return {
          ok: true,
          grant: {
            uploadUrl: grant.value.uploadUrl,
            expiresAt: grant.value.expiresAt,
            maxBytes: grant.value.maxBytes,
            // The opaque reference the member cites in their payment report.
            evidenceRef: grant.value.storagePath,
          },
        };
      },
    },

    admin: {
      async queue() {
        const all = await obligations.listAll();
        const queued = all
          .filter((record) => QUEUE_STATUSES.has(record.status))
          .sort((a, b) =>
            (a.submission?.submittedAt ?? a.createdAt).localeCompare(b.submission?.submittedAt ?? b.createdAt),
          );
        return {
          ok: true,
          queue: queued.map((record) => ({
            ...adminObligationView(record),
            duplicates: findDuplicateExternalRefs(all, record).map((dup) => ({
              obligationId: dup.obligationId,
              humanRef: dup.humanRef,
              memberId: dup.memberId,
              status: dup.status,
            })),
            priorAttempts: record.events.filter((event) => event.action === "member_submitted").length,
          })),
        };
      },

      async detail(obligationId) {
        const record = await obligations.get(obligationId);
        if (!record) return { ok: false, code: "not_found", message: "No obligation with that id." };
        const all = await obligations.listAll();
        return {
          ok: true,
          obligation: {
            ...adminObligationView(record),
            duplicates: findDuplicateExternalRefs(all, record).map((dup) => ({
              obligationId: dup.obligationId,
              humanRef: dup.humanRef,
              memberId: dup.memberId,
              status: dup.status,
            })),
            priorAttempts: record.events.filter((event) => event.action === "member_submitted").length,
          },
          auditHistory: record.events.map((event) => ({ ...event })),
        };
      },

      async verify(admin, obligationId, fields: VerifyWire, idempotencyKey) {
        const record = await obligations.get(obligationId);
        if (!record) return { ok: false, code: "not_found", message: "No obligation with that id." };
        const identity = adminIdentityOf(admin);

        if (record.type === "activation_50") {
          // Activation is the one moment membership state moves forward, so
          // the OTHER domains' gates compose here: a rejected or missing
          // identity review blocks it, and so do unsatisfied agreements.
          const gate = identityActivationGate(await latestCompletedReview(record.memberId));
          if (gate.blocked) {
            return {
              ok: false,
              code: gate.reason,
              message:
                gate.reason === "identity_rejected"
                  ? "The identity review did not pass; activation is blocked."
                  : "The manual identity review has not verified this member yet.",
            };
          }
          const agreementsGate = await signatures.requiredAgreementsSatisfied(record.memberId, {
            esignAcceptances: await esignAcceptancesFor(record.memberId),
          });
          if (!agreementsGate.satisfied) {
            return {
              ok: false,
              code: "agreements_unsatisfied",
              message: `Required agreements are not satisfied: ${agreementsGate.blocking
                .map((b) => `${b.category} (${b.reason})`)
                .join(", ")}`,
            };
          }
          const result = await activationService.verifyPayment(identity, obligationId, fields, idempotencyKey);
          const recipient = await recipientFor(record.memberId);
          await notify("fm_payment_verified_receipt", recipient, record.obligationId, {
            xeniosRef: result.obligation.humanRef,
            receiptNumber: result.receipt.receiptNumber,
            amount: formatCents(result.receipt.amountCents),
            methodLabel: result.receipt.methodLabel,
          });
          await notify("fm_membership_activated", recipient, record.obligationId, {
            effectiveAt: result.portalUnlock.effectiveAt,
            renewalDueAt: result.renewalObligation.dueAt,
          });
          await notify("fm_renewal_obligation_created", recipient, result.renewalObligation.obligationId, {
            xeniosRef: result.renewalObligation.humanRef,
            renewalDueAt: result.renewalObligation.dueAt,
          });
          return {
            ok: true,
            replayed: result.replayed,
            obligation: adminObligationView(result.obligation),
            period: periodView(result.period),
            renewalObligation: adminObligationView(result.renewalObligation),
            receipt: receiptViewOf(result.receipt),
            membership: result.membership,
            portalUnlock: result.portalUnlock,
          };
        }

        const result = await renewalService.verifyRenewal(identity, obligationId, fields, idempotencyKey);
        const recipient = await recipientFor(record.memberId);
        await notify("fm_renewal_verified", recipient, record.obligationId, {
          xeniosRef: result.obligation.humanRef,
          coveredThrough: result.period.endsAt,
        });
        return {
          ok: true,
          replayed: result.replayed,
          obligation: adminObligationView(result.obligation),
          period: periodView(result.period),
          nextRenewalObligation: adminObligationView(result.nextRenewalObligation),
          receipt: receiptViewOf(result.receipt),
          membership: result.membership,
        };
      },

      async transition(admin, obligationId, action: AdminObligationAction, detail) {
        const identity = adminIdentityOf(admin);
        let updated: ObligationRecord;
        let templateKey: string;
        switch (action) {
          case "reject":
            updated = await activationService.reject(identity, obligationId, detail);
            templateKey = "fm_payment_rejected";
            break;
          case "request-info":
            updated = await activationService.requestInfo(identity, obligationId, detail);
            templateKey = "fm_payment_info_requested";
            break;
          case "mismatch":
            updated = await activationService.markMismatch(identity, obligationId, detail);
            templateKey = "fm_payment_mismatch";
            break;
          case "duplicate":
            updated = await activationService.markDuplicate(identity, obligationId, detail);
            templateKey = "fm_payment_duplicate";
            break;
          case "cancel":
            updated = await activationService.cancel(identity, obligationId, detail);
            templateKey = "fm_obligation_cancelled";
            break;
          case "reversed":
            updated = await activationService.reversePayment(identity, obligationId, detail);
            templateKey = "fm_payment_reversed";
            break;
          case "refunded":
            updated = await activationService.refundPayment(identity, obligationId, detail);
            templateKey = "fm_payment_refunded";
            break;
        }
        await notify(templateKey, await recipientFor(updated.memberId), updated.obligationId, {
          xeniosRef: updated.humanRef,
        });
        return { ok: true, obligation: adminObligationView(updated) };
      },

      async migrate(admin, obligationId, methodId, phase) {
        if (!(BRIDGE_PHASES as readonly string[]).includes(phase)) {
          return { ok: false, code: "validation_failed", message: `phase must be one of: ${BRIDGE_PHASES.join(", ")}` };
        }
        const record = await methods.get(methodId);
        if (!record) return { ok: false, code: "method_not_found", message: "No payment method with that id." };
        const snapshot: PaymentMethodSnapshot = {
          methodId: record.methodId,
          category: MANUAL_EXTERNAL_PAYMENT,
          label: record.memberFacingName,
          instructionsRef: record.methodId,
          productPurchaseEligible: false,
          capturedAt: now().toISOString(),
        };
        const updated = await activationService.migrateMethod(
          adminIdentityOf(admin),
          obligationId,
          snapshot,
          phase as ObligationBridgePhase,
        );
        return { ok: true, obligation: adminObligationView(updated) };
      },

      async bridgeSettings() {
        const settings = await bridge.getSettings();
        return {
          ok: true,
          settings,
          phase: settings ? bridgePhase(now(), settings) : null,
          effectiveEndAt: settings ? effectiveEndAt(settings) : null,
          auditEvents: await bridge.listAuditEvents(),
        };
      },

      async updateBridgeSettings(admin, body) {
        const action = String(body.action ?? "");
        const at = now();

        if (action === "initialize") {
          const existing = await bridge.getSettings();
          if (existing) {
            return { ok: false, code: "already_initialized", message: "The bridge is already configured." };
          }
          const startAt = body.startAt;
          const timezone = body.timezone;
          if (typeof startAt !== "string" || !Number.isFinite(Date.parse(startAt))) {
            return { ok: false, code: "validation_failed", message: "initialize needs a valid startAt instant." };
          }
          if (typeof timezone !== "string" || timezone.trim().length === 0) {
            return { ok: false, code: "validation_failed", message: "initialize needs an IANA timezone." };
          }
          let settings: BridgeSettings;
          try {
            settings = defaultBridgeSettings(startAt, timezone.trim());
          } catch {
            return { ok: false, code: "validation_failed", message: "timezone must be a valid IANA zone." };
          }
          await bridge.saveSettings(settings);
          await bridge.appendAuditEvent({
            eventId: newId(),
            kind: "bridge_settings_updated",
            actorId: admin.adminId,
            reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "bridge_initialized",
            at: at.toISOString(),
            detail: { action: "initialize", startAt: settings.startAt, endAt: settings.endAt, timezone: settings.timezone },
          });
          return { ok: true, settings, phase: bridgePhase(at, settings), effectiveEndAt: effectiveEndAt(settings) };
        }

        const settings = await bridge.getSettings();
        if (!settings) {
          return { ok: false, code: "bridge_not_configured", message: "Initialize the bridge first." };
        }

        if (action === "extend") {
          // No silent extension: reason AND expiry, through the domain's
          // audited path, persisted together with the audit event.
          if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
            return { ok: false, code: "validation_failed", message: "An extension requires a reason." };
          }
          if (typeof body.expiresAt !== "string" || body.expiresAt.length === 0) {
            return { ok: false, code: "validation_failed", message: "An extension requires an expiresAt." };
          }
          const { settings: next, event } = requestBridgeExtension(settings, {
            eventId: newId(),
            actorId: admin.adminId,
            reason: body.reason.trim(),
            expiresAt: body.expiresAt,
            now: at,
          });
          await bridge.saveSettings(next);
          await bridge.appendAuditEvent(event);
          return { ok: true, settings: next, phase: bridgePhase(at, next), effectiveEndAt: effectiveEndAt(next), event };
        }

        if (action === "emergency_disable") {
          if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
            return { ok: false, code: "validation_failed", message: "An emergency disable requires a reason." };
          }
          const { settings: next, event } = emergencyDisableBridge(settings, {
            eventId: newId(),
            actorId: admin.adminId,
            reason: body.reason.trim(),
            now: at,
          });
          await bridge.saveSettings(next);
          await bridge.appendAuditEvent(event);
          return { ok: true, settings: next, phase: bridgePhase(at, next), effectiveEndAt: effectiveEndAt(next), event };
        }

        if (action === "update") {
          if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
            return { ok: false, code: "validation_failed", message: "A settings update requires a reason." };
          }
          const patchIn = (body.patch ?? {}) as Record<string, unknown>;
          const patch: Partial<BridgeSettings> = {};
          if (typeof patchIn.acceptingNewActivationPayments === "boolean") {
            patch.acceptingNewActivationPayments = patchIn.acceptingNewActivationPayments;
          }
          if (typeof patchIn.acceptingExistingObligationPayments === "boolean") {
            patch.acceptingExistingObligationPayments = patchIn.acceptingExistingObligationPayments;
          }
          if (typeof patchIn.bridgeEnabled === "boolean") patch.bridgeEnabled = patchIn.bridgeEnabled;
          if (typeof patchIn.replacementProviderStatus === "string") {
            const statuses: readonly ReplacementProviderStatus[] = [
              "not_started",
              "in_progress",
              "testing",
              "ready",
              "live",
            ];
            if (!(statuses as readonly string[]).includes(patchIn.replacementProviderStatus)) {
              return { ok: false, code: "validation_failed", message: "Unknown replacementProviderStatus." };
            }
            patch.replacementProviderStatus = patchIn.replacementProviderStatus as ReplacementProviderStatus;
          }
          if (Object.keys(patch).length === 0) {
            return { ok: false, code: "validation_failed", message: "The update carried no recognized settings." };
          }
          const next: BridgeSettings = { ...settings, ...patch };
          await bridge.saveSettings(next);
          await bridge.appendAuditEvent({
            eventId: newId(),
            kind: "bridge_settings_updated",
            actorId: admin.adminId,
            reason: body.reason.trim(),
            at: at.toISOString(),
            detail: { action: "update", patch: { ...patch } },
          });
          return { ok: true, settings: next, phase: bridgePhase(at, next), effectiveEndAt: effectiveEndAt(next) };
        }

        return {
          ok: false,
          code: "validation_failed",
          message: "action must be one of: initialize, extend, emergency_disable, update.",
        };
      },

      async listMethods() {
        return { ok: true, methods: (await methods.list()).map(adminMethodView) };
      },

      // Plaintext arrives ONLY here, over the authenticated admin route, and
      // is handed straight to the domain constructor, which encrypts it
      // before any record exists. It is never stored, logged, or echoed; the
      // response is the explicit admin view, which has no field for it.
      async createMethod(admin, body) {
        const input = parseCreateMethodWire(body);
        if ("errors" in input) {
          return { ok: false, code: "validation_failed", message: "The method is incomplete.", fieldErrors: input.errors };
        }
        const cipher = wiring.resolveInstructionCipher();
        const { record, version } = createPaymentMethod(input.wire, cipher, admin.adminId, now());
        await methods.create(record, version);
        return { ok: true, method: adminMethodView(record) };
      },

      async approveMethod(admin, methodId, note) {
        const record = await methods.get(methodId);
        if (!record) return { ok: false, code: "method_not_found", message: "No payment method with that id." };
        const { record: next, version } = approvePaymentMethod(record, {
          approvedBy: admin.adminId,
          complianceReviewNote: note,
          now: now(),
        });
        await methods.save(next, version);
        return { ok: true, method: adminMethodView(next) };
      },

      async disableMethod(admin, methodId, reason) {
        const record = await methods.get(methodId);
        if (!record) return { ok: false, code: "method_not_found", message: "No payment method with that id." };
        const { record: next, version } = disablePaymentMethod(record, {
          actorId: admin.adminId,
          reason,
          now: now(),
        });
        await methods.save(next, version);
        return { ok: true, method: adminMethodView(next) };
      },

      async checklist() {
        const state = await checklistStore.get();
        return {
          ok: true,
          items: DAY15_CHECKLIST_ITEMS.map((item) => ({
            key: item.key,
            label: item.label,
            done: state[item.key]?.done ?? false,
            note: state[item.key]?.note ?? null,
            updatedBy: state[item.key]?.updatedBy ?? null,
            updatedAt: state[item.key]?.updatedAt ?? null,
          })),
        };
      },

      async updateChecklist(admin, key, done, note) {
        if (!DAY15_CHECKLIST_ITEMS.some((item) => item.key === key)) {
          return { ok: false, code: "validation_failed", message: "Unknown checklist item." };
        }
        const state = await checklistStore.get();
        state[key] = { done, note, updatedBy: admin.adminId, updatedAt: now().toISOString() };
        await checklistStore.put(state);
        return {
          ok: true,
          items: DAY15_CHECKLIST_ITEMS.map((item) => ({
            key: item.key,
            label: item.label,
            done: state[item.key]?.done ?? false,
            note: state[item.key]?.note ?? null,
            updatedBy: state[item.key]?.updatedBy ?? null,
            updatedAt: state[item.key]?.updatedAt ?? null,
          })),
        };
      },

      async reconciliation() {
        return { ok: true, report: await buildReconciliation() };
      },

      // Aggregates only: no evidence references, no raw images, no member ids.
      async reconciliationCsv() {
        const report = await buildReconciliation();
        const lines = ["date,method_label,verified_count,total_cents"];
        for (const day of report.days) {
          for (const [label, entry] of Object.entries(day.byMethod)) {
            lines.push(`${day.date},${csvCell(label)},${entry.count},${entry.totalCents}`);
          }
        }
        return lines.join("\n") + "\n";
      },

      // The go-live readiness report. Every item sits in exactly one of the
      // four READINESS_STATES; no secret value ever serializes (environment
      // checks report presence booleans and variable NAMES only, and details
      // are counts and static citations). A final legal package discovered on
      // disk is NOT this server's concern: legal readiness is reported from
      // the documents registry alone.
      async readiness() {
        const at = now();
        const present = (name: string): boolean =>
          typeof env[name] === "string" && (env[name] as string).trim().length > 0;
        const areas: ReadinessArea[] = [];

        // LEGAL, from the documents registry only.
        const requiredCategories = DOCUMENT_CATEGORY_REGISTRY.filter(
          (definition) => definition.defaultRequirement === "required",
        );
        let approvedCount = 0;
        let publishedCount = 0;
        const unapprovedCategories: string[] = [];
        for (const definition of requiredCategories) {
          const versions = await documents.listVersions(definition.category);
          const hasApproved = versions.some(
            (version) =>
              version.counselReview === "approved" &&
              version.status !== "withdrawn" &&
              version.status !== "archived",
          );
          if (hasApproved) approvedCount += 1;
          else unapprovedCategories.push(definition.category);
          if (await documents.getPublished(definition.category)) publishedCount += 1;
        }
        const sequenceConfigured = requiredCategories.every(
          (definition) => definition.activationStep !== null,
        );
        areas.push({
          area: "legal",
          title: "Legal documents",
          items: [
            {
              key: "approved_versions",
              label: "Counsel-approved versions present per required category",
              state: approvedCount === requiredCategories.length ? "code_ready" : "external_approval_missing",
              detail:
                approvedCount === requiredCategories.length
                  ? `All ${requiredCategories.length} required categories carry a counsel-approved version in the registry.`
                  : `${approvedCount} of ${requiredCategories.length} required categories carry a counsel-approved version. Awaiting counsel: ${unapprovedCategories.join(", ")}.`,
            },
            {
              key: "signing_sequence",
              label: "Signing sequence configured",
              state: sequenceConfigured ? "code_ready" : "configuration_missing",
              detail: sequenceConfigured
                ? "Every required category is bound to an activation step and ordering in the typed registry (documents.ts)."
                : "One or more required categories has no activation step configured.",
            },
            {
              key: "publication_status",
              label: "Publication status",
              state:
                publishedCount === requiredCategories.length
                  ? "code_ready"
                  : approvedCount === requiredCategories.length
                    ? "configuration_missing"
                    : "external_approval_missing",
              detail: `${publishedCount} of ${requiredCategories.length} required categories have a published version.`,
            },
          ],
        });

        // IDENTITY.
        const identityEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEARCH_IDENTITY_BUCKET"];
        const identityMissing = identityEnv.filter((name) => !present(name));
        areas.push({
          area: "identity",
          title: "Identity verification",
          items: [
            {
              key: "storage_configured",
              label: "Identity document storage configured",
              state: identityMissing.length === 0 ? "code_ready" : "configuration_missing",
              detail:
                identityMissing.length === 0
                  ? "All identity storage environment variables are present."
                  : `Missing environment variables: ${identityMissing.join(", ")}.`,
            },
            {
              key: "retention_worker",
              label: "Raw-source retention worker wired",
              state: "code_ready",
              detail:
                "The hourly production scheduler tick (registered in server/index.ts) runs the raw-source retention deletion sweep.",
            },
            {
              key: "deletion_test",
              label: "Production deletion test",
              state: "production_test_missing",
              detail: "No production deletion run has been recorded in this environment yet.",
            },
          ],
        });

        // PAYMENTS.
        const bridgeSettings = await bridge.getSettings();
        const enabledApprovedMethods = (await methods.list()).filter(
          (record) =>
            record.enabled && record.disabledReason === null && record.approvalStatus === "approved",
        ).length;
        areas.push({
          area: "payments",
          title: "Payments",
          items: [
            {
              key: "bridge_configured",
              label: "Bridge settings row present",
              state: bridgeSettings ? "code_ready" : "configuration_missing",
              detail: bridgeSettings
                ? `The bridge is configured; phase is ${bridgePhase(at, bridgeSettings)}.`
                : "No bridge settings row exists yet; initialize the bridge.",
            },
            {
              key: "methods_configured",
              label: "Enabled approved payment methods",
              state: enabledApprovedMethods > 0 ? "code_ready" : "configuration_missing",
              detail: `${enabledApprovedMethods} enabled approved method(s) in the registry.`,
            },
            {
              key: "cipher_key_present",
              label: "Instruction encryption key present",
              state: present("PAYMENT_INSTRUCTIONS_ENC_KEY") ? "code_ready" : "configuration_missing",
              detail: `PAYMENT_INSTRUCTIONS_ENC_KEY present: ${present("PAYMENT_INSTRUCTIONS_ENC_KEY")}.`,
            },
            {
              key: "verification_idempotency",
              label: "Verification idempotency",
              state: "code_ready",
              detail:
                "Replay-safe verification is enforced by the idempotency store and proven by the queue tests (a repeated key replays, a new key hits the status guard).",
            },
          ],
        });

        // EMAIL. Presence booleans only, never a value.
        const resendKeyPresent = present("RESEND_API_KEY");
        const fromEmailPresent = present("FROM_EMAIL");
        areas.push({
          area: "email",
          title: "Email",
          items: [
            {
              key: "resend_configured",
              label: "Resend environment configured",
              state: resendKeyPresent && fromEmailPresent ? "code_ready" : "configuration_missing",
              detail: `RESEND_API_KEY present: ${resendKeyPresent}. FROM_EMAIL present: ${fromEmailPresent}.`,
            },
            {
              key: "domain_verification",
              label: "Sending domain verification",
              state: "external_approval_missing",
              detail:
                "Domain verification is confirmed at the email provider, outside this system; it cannot be asserted from code.",
            },
            {
              key: "test_send",
              label: "Production test send",
              state: "production_test_missing",
              detail: "No production test send has been recorded in this environment yet.",
            },
          ],
        });

        // MEMBERSHIP.
        areas.push({
          area: "membership",
          title: "Membership model",
          items: [
            {
              key: "pricing_model",
              label: "$50 activation includes the 30 day founding period",
              state: "code_ready",
              detail:
                "The database check constraint research_fm_obligations_amount_matches_type binds activation_50 to exactly 5000 cents (funding the 30 day founding period) and renewal_25 to exactly 2500 cents.",
            },
            {
              key: "portal_gate",
              label: "Portal gate",
              state: "code_ready",
              detail:
                "Activation verification composes the identity and agreements gates, and the member portal unlocks only through a verified payment.",
            },
          ],
        });

        // DAY 15: owner fields straight from the checklist store, plus the
        // scheduled sunset from the bridge settings.
        const checklistState = await checklistStore.get();
        const day15Items: ReadinessItem[] = DAY15_CHECKLIST_ITEMS.map((item) => {
          const entry = checklistState[item.key];
          const done = entry?.done === true;
          return {
            key: item.key,
            label: item.label,
            state: done
              ? "code_ready"
              : item.key === "provider_account_approved"
                ? "external_approval_missing"
                : "configuration_missing",
            detail: entry?.updatedBy
              ? `Owner: ${entry.updatedBy}${entry.updatedAt ? ` (updated ${entry.updatedAt})` : ""}.`
              : "No owner recorded yet.",
          };
        });
        day15Items.push({
          key: "sunset_scheduled",
          label: "Bridge sunset scheduled",
          state: bridgeSettings?.endAt ? "code_ready" : "configuration_missing",
          detail: bridgeSettings?.endAt
            ? `The bridge end is scheduled for ${effectiveEndAt(bridgeSettings)}.`
            : "The bridge has no end instant yet; initializing the bridge schedules the sunset.",
        });
        areas.push({ area: "day15", title: "Day 15 exits", items: day15Items });

        // E-SIGNATURE (OpenSign). Presence booleans and variable NAMES only,
        // never a value: the OpenSign token and webhook secret never serialize.
        const esignSandboxConfigured = present("OPENSIGN_BASE_URL") && present("OPENSIGN_API_TOKEN");
        const esignWebhookSecretPresent = present("OPENSIGN_WEBHOOK_SECRET");
        const esignBucketPresent = present(RESEARCH_ESIGN_BUCKET);
        areas.push({
          area: "esign",
          title: "E-signature (OpenSign)",
          items: [
            {
              key: "provider_adapter",
              label: "OpenSign provider adapter and signing domain wired",
              state: "code_ready",
              detail:
                "The provider adapter, signing service, archive, and persistence are built and tested; the gate advances only on a verified webhook.",
            },
            {
              key: "sandbox_configured",
              label: "OpenSign endpoint and token configured",
              state: esignSandboxConfigured ? "code_ready" : "configuration_missing",
              detail: `OPENSIGN_BASE_URL present: ${present("OPENSIGN_BASE_URL")}. OPENSIGN_API_TOKEN present: ${present("OPENSIGN_API_TOKEN")}.`,
            },
            {
              key: "webhook_secret",
              label: "Webhook signing secret present",
              state: esignWebhookSecretPresent ? "code_ready" : "configuration_missing",
              detail: `OPENSIGN_WEBHOOK_SECRET present: ${esignWebhookSecretPresent}.`,
            },
            {
              key: "webhook_verification",
              label: "Webhook signature verification",
              state: "production_test_missing",
              detail: "No production webhook has been verified in this environment yet.",
            },
            {
              key: "template_provisioning",
              label: "Provider template provisioning",
              state: "production_test_missing",
              detail: "No production template has been provisioned against the live provider yet.",
            },
            {
              key: "completed_ingestion",
              label: "Completed-document ingestion",
              state: "production_test_missing",
              detail: "No production completion has been ingested into the archive yet.",
            },
            {
              key: "member_document_center",
              label: "Member signing surface",
              state: "code_ready",
              detail:
                "The member session and documents routes are wired behind the three-state gate and the member guard.",
            },
            {
              key: "admin_notification",
              label: "Admin completion notification",
              state: "code_ready",
              detail:
                "A verified completion notifies the member and the records address with integrity facts and an authenticated admin link, never a raw storage URL.",
            },
            {
              key: "secure_archive",
              label: "Private archive bucket configured",
              state: esignBucketPresent ? "code_ready" : "configuration_missing",
              detail: `${RESEARCH_ESIGN_BUCKET} present: ${esignBucketPresent}.`,
            },
            {
              key: "local_export",
              label: "Member packet export",
              state: "code_ready",
              detail:
                "The packet ZIP builder assembles the signed agreements and certificates only; raw identity and payment evidence are excluded by default.",
            },
          ],
        });

        return { ok: true, generatedAt: at.toISOString(), areas };
      },

      async identityQueue() {
        const cases = (await identityStore.listCasesWithRawSource(tenant)).filter((kase) =>
          IDENTITY_QUEUE_STATUSES.has(kase.status),
        );
        return {
          ok: true,
          queue: cases
            .sort((a, b) => (a.uploadedAt ?? a.createdAt).localeCompare(b.uploadedAt ?? b.createdAt))
            .map(adminIdentityCaseView),
        };
      },

      // The audit event is written and awaited FIRST, so there is never a
      // view without a record of the view (the domain's view-audit posture).
      async identityViewUrl(admin, caseId) {
        const kase = await identityStore.getCase(tenant, caseId);
        if (!kase) return { ok: false, code: "case_not_found", message: "No identity case with that id." };
        if (kase.storagePath === null) {
          return { ok: false, code: "invalid_state", message: "The raw source for this case no longer exists." };
        }
        await appendIdentityAudit(kase, "admin_viewed", "admin", admin.adminId);
        const grant = await identityMedia.createAdminAccessUrl({
          storagePath: kase.storagePath,
          expiresInSeconds: IDENTITY_ADMIN_ACCESS_TTL_SECONDS,
          now: now(),
        });
        if (!grant.ok) {
          return { ok: false, code: "provider_error", message: "Identity storage refused the access URL." };
        }
        return { ok: true, grant: grant.value };
      },

      async identityReview(admin, caseId, findingsBody) {
        const parsed = parseFindingsWire(findingsBody);
        if ("errors" in parsed) {
          return { ok: false, code: "validation_failed", message: "The review is incomplete.", fieldErrors: parsed.errors };
        }
        const kase = await identityStore.getCase(tenant, caseId);
        if (!kase) return { ok: false, code: "case_not_found", message: "No identity case with that id." };

        let working = kase;
        let start: { reviewId: string; caseId: string; reviewerId: string; startedAt: string };
        if (working.status === "review_pending") {
          const opened = startIdentityReview(working, admin.adminId, now());
          working = opened.kase;
          start = opened.start;
          await identityStore.saveCase(working);
          await appendIdentityAudit(working, "review_started", "admin", admin.adminId);
        } else if (working.status === "under_review" && working.reviewId) {
          // A crashed earlier attempt: the review that opened the case
          // completes it; only the original start instant was lost.
          start = {
            reviewId: working.reviewId,
            caseId: working.caseId,
            reviewerId: admin.adminId,
            startedAt: now().toISOString(),
          };
        } else {
          return { ok: false, code: "invalid_state", message: `A review cannot run from status ${working.status}.` };
        }

        const completed = completeIdentityReview(working, start, parsed.findings, now());
        await identityStore.saveReview(completed.record);
        await identityStore.saveCase(completed.kase);
        await appendIdentityAudit(
          completed.kase,
          "review_completed",
          "admin",
          admin.adminId,
          `outcome=${completed.record.outcome}`,
        );
        await notify(
          completed.record.outcome === "verified" ? "fm_identity_verified" : "fm_identity_rejected",
          await recipientFor(kase.memberId),
          kase.caseId,
          completed.record.outcome === "verified"
            ? {}
            : { rejectionCategory: completed.record.rejectionCategory ?? "other" },
        );
        return { ok: true, case: adminIdentityCaseView(completed.kase), review: reviewView(completed.record) };
      },

      async identityEmergencyDelete(admin, caseId) {
        const kase = await identityStore.getCase(tenant, caseId);
        if (!kase) return { ok: false, code: "case_not_found", message: "No identity case with that id." };
        const review = await identityStore.getReviewForCase(tenant, caseId);
        const result = await emergencyDeleteRawSource({
          kase,
          review,
          actorType: "admin",
          actorId: admin.adminId,
          provider: identityMedia,
          audit: (event) => identityStore.appendAuditEvent(event),
          now: now(),
        });
        if (!result.ok) {
          return {
            ok: false,
            code: result.code === "PROVIDER_ERROR" ? "provider_error" : "invalid_state",
            message: result.message,
          };
        }
        await identityStore.saveCase(result.value.kase);
        if (result.value.review) await identityStore.saveReview(result.value.review);
        return { ok: true, case: adminIdentityCaseView(result.value.kase) };
      },

      // ---- e-signature document center -------------------------------------
      async esignMemberDocuments(memberId) {
        if (!esignProvider.isLive) return esignDisabled();
        const requests = await esignStore.requests.listByMember(memberId);
        const completed = requests.filter((record) => record.signingLinkStatus === "completed");
        const archive = await esignStore.archive.listByMember(memberId);
        return {
          ok: true,
          memberId,
          requests: completed.map(adminEsignRequestView),
          archive: archive.map(adminEsignArchiveView),
        };
      },

      // A short-lived signed download URL for the signed document or the
      // certificate. Admin-guarded (the route) and never a public URL; the
      // storage ref never leaves this method.
      async esignDownloadUrl(admin, requestId, which) {
        if (!esignProvider.isLive) return esignDisabled();
        void admin;
        const record = await esignStore.requests.getById(requestId);
        if (!record) return { ok: false, code: "not_found", message: "No signing request with that id." };
        const ref = which === "certificate" ? record.certificateRef : record.signedPdfRef;
        if (!ref) {
          return { ok: false, code: "invalid_state", message: `No ${which} document is stored for this request.` };
        }
        const grant = await esignMedia.createAccessUrl({
          storagePath: ref,
          expiresInSeconds: IDENTITY_ADMIN_ACCESS_TTL_SECONDS,
          now: now(),
        });
        if (!grant.ok) {
          return { ok: false, code: "provider_error", message: "E-signature storage refused the access URL." };
        }
        return { ok: true, which, grant: grant.value };
      },

      async esignPacketZip(memberId) {
        const records = esignProvider.isLive ? await esignStore.archive.listByMember(memberId) : [];
        // Signed agreements + completion certificates only; raw identity and
        // payment evidence are excluded by default (they live in other buckets).
        return buildMemberPacketZip({ records, media: esignMedia, include: {} });
      },

      async esignResendNotification(admin, requestId) {
        if (!esignProvider.isLive) return esignDisabled();
        void admin;
        const record = await esignStore.requests.getById(requestId);
        if (!record) return { ok: false, code: "not_found", message: "No signing request with that id." };
        if (record.signingLinkStatus !== "completed" || !record.completedAt) {
          return { ok: false, code: "invalid_state", message: "That signing request is not completed." };
        }
        await sendEsignCompletionNotices(record, `${record.id}:resend`);
        return { ok: true, resent: true, requestId: record.id };
      },
    },
  };

  // ---- local helpers over the closed-over stores ---------------------------

  async function buildReconciliation(): Promise<{
    generatedAt: string;
    days: Array<{
      date: string;
      count: number;
      totalCents: number;
      byMethod: Record<string, { count: number; totalCents: number }>;
    }>;
    statusCounts: Record<string, number>;
  }> {
    const all = await obligations.listAll();
    const statusCounts: Record<string, number> = {};
    for (const record of all) {
      statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
    }
    const byDay = new Map<
      string,
      { date: string; count: number; totalCents: number; byMethod: Record<string, { count: number; totalCents: number }> }
    >();
    for (const record of all) {
      if (!record.verification) continue;
      if (record.status !== "verified" && record.status !== "reversed" && record.status !== "refunded") continue;
      const date = record.verification.reconciliationDate;
      const day = byDay.get(date) ?? { date, count: 0, totalCents: 0, byMethod: {} };
      day.count += 1;
      day.totalCents += record.verification.amountReceivedCents;
      const label = record.method.label;
      const method = day.byMethod[label] ?? { count: 0, totalCents: 0 };
      method.count += 1;
      method.totalCents += record.verification.amountReceivedCents;
      day.byMethod[label] = method;
      byDay.set(date, day);
    }
    return {
      generatedAt: now().toISOString(),
      days: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      statusCounts,
    };
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// ---------------------------------------------------------------------------
// Wire parsing for the two rich admin bodies (structure only)
// ---------------------------------------------------------------------------

const OWNERSHIP_CLASSIFICATIONS: readonly OwnershipClassification[] = ["business", "personal", "third_party"];
const METHOD_DURATIONS: readonly MethodDuration[] = ["temporary", "permanent"];

function parseCreateMethodWire(
  body: Record<string, unknown>,
): { wire: CreatePaymentMethodInput } | { errors: string[] } {
  const errors: string[] = [];
  const str = (key: string): string | null =>
    typeof body[key] === "string" && (body[key] as string).trim().length > 0 ? (body[key] as string) : null;
  const required = (key: string): string => {
    const value = str(key);
    if (value === null) errors.push(`${key} is required`);
    return value ?? "";
  };
  const methodId = required("methodId");
  const providerCode = required("providerCode");
  const memberFacingName = required("memberFacingName");
  const adminFacingName = required("adminFacingName");
  const settlementTime = required("settlementTime");
  const receivingLegalEntity = required("receivingLegalEntity");
  const receivingInstructions = required("receivingInstructions");
  const duration = str("duration");
  if (!duration || !(METHOD_DURATIONS as readonly string[]).includes(duration)) {
    errors.push(`duration must be one of: ${METHOD_DURATIONS.join(", ")}`);
  }
  const ownership = str("ownershipClassification");
  if (!ownership || !(OWNERSHIP_CLASSIFICATIONS as readonly string[]).includes(ownership)) {
    errors.push(`ownershipClassification must be one of: ${OWNERSHIP_CLASSIFICATIONS.join(", ")}`);
  }
  if (typeof body.activationEligible !== "boolean") errors.push("activationEligible must be a boolean");
  if (typeof body.renewalEligible !== "boolean") errors.push("renewalEligible must be a boolean");
  if (errors.length > 0) return { errors };
  const optional = (key: string): string | null => str(key);
  const optionalInt = (key: string): number | null =>
    Number.isInteger(body[key]) ? (body[key] as number) : null;
  return {
    wire: {
      methodId,
      providerCode,
      memberFacingName,
      adminFacingName,
      duration: duration as MethodDuration,
      activeStartAt: optional("activeStartAt"),
      activeEndAt: optional("activeEndAt"),
      currency: optional("currency") ?? undefined,
      activationEligible: body.activationEligible as boolean,
      renewalEligible: body.renewalEligible as boolean,
      productEligible: body.productEligible === true,
      minAmountCents: optionalInt("minAmountCents"),
      maxAmountCents: optionalInt("maxAmountCents"),
      settlementTime,
      receivingLegalEntity,
      ownershipClassification: ownership as OwnershipClassification,
      complianceReviewNote: optional("complianceReviewNote"),
      receivingInstructions,
      mobileInstructions: optional("mobileInstructions"),
      desktopInstructions: optional("desktopInstructions"),
      memoInstructions: optional("memoInstructions"),
      deepLinkRef: optional("deepLinkRef"),
      qrAssetRef: optional("qrAssetRef"),
      supportContactRef: optional("supportContactRef"),
    },
  };
}

function parseFindingsWire(
  body: Record<string, unknown>,
): { findings: IdentityReviewFindings } | { errors: string[] } {
  const errors: string[] = [];
  if (body.nameMatch !== "match" && body.nameMatch !== "mismatch") {
    errors.push('nameMatch must be "match" or "mismatch"');
  }
  if (typeof body.ageThresholdMet !== "boolean") errors.push("ageThresholdMet must be a boolean");
  if (typeof body.documentNotExpired !== "boolean") errors.push("documentNotExpired must be a boolean");
  const jurisdiction = typeof body.jurisdiction === "string" && body.jurisdiction.trim() ? body.jurisdiction : null;
  let licenseLast4: string | null = null;
  if (typeof body.licenseLast4 === "string" && body.licenseLast4.length > 0) {
    if (!isMaskedLast4(body.licenseLast4)) {
      errors.push("licenseLast4 must be exactly four characters; the full number never enters this system");
    } else {
      licenseLast4 = body.licenseLast4;
    }
  }
  let rejectionCategory: IdentityRejectionCategory | undefined;
  if (body.rejectionCategory !== undefined && body.rejectionCategory !== null) {
    if (
      typeof body.rejectionCategory !== "string" ||
      !(IDENTITY_REJECTION_CATEGORIES as readonly string[]).includes(body.rejectionCategory)
    ) {
      errors.push(`rejectionCategory must be one of: ${IDENTITY_REJECTION_CATEGORIES.join(", ")}`);
    } else {
      rejectionCategory = body.rejectionCategory as IdentityRejectionCategory;
    }
  }
  if (errors.length > 0) return { errors };
  return {
    findings: {
      nameMatch: body.nameMatch as "match" | "mismatch",
      ageThresholdMet: body.ageThresholdMet as boolean,
      documentNotExpired: body.documentNotExpired as boolean,
      jurisdiction,
      licenseLast4,
      ...(rejectionCategory ? { rejectionCategory } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Builds the founding-activation dependencies for the running server.
 *
 * index.ts calls it bare. `env` defaults to process.env and exists so the
 * three states are provable under test without mutating process state;
 * `wiring` defaults to the real resolvers and exists so the live state is
 * provable over injected stores. In production both defaults apply.
 */
export function buildFoundingActivationDependencies(
  now: () => Date = () => new Date(),
  env: NodeJS.ProcessEnv = process.env,
  wiring?: Partial<FoundingActivationWiring>,
): FoundingActivationDependencies {
  if (!foundingActivationEnabled(env)) return { state: "disabled" };
  if (!databaseConfigured(env)) return { state: "unprovisioned" };

  // The activation chokepoint, FIRST: no store or provider may exist over a
  // configuration carrying a synthetic fixture marker while this process is
  // production-like (the flag itself is a production flag; see
  // commerce/production-guards.ts PRODUCTION_FLAG_NAMES).
  assertNoSyntheticDataInProduction(
    {
      supabase: { url: env.SUPABASE_URL ?? "" },
      identityStorage: { bucket: env.RESEARCH_IDENTITY_BUCKET ?? "unconfigured" },
      evidenceStorage: { bucket: env[EVIDENCE_BUCKET_ENV] ?? "unconfigured" },
      activation: { flag: env.RESEARCH_FOUNDING_ACTIVATION_ENABLED ?? "false" },
    },
    env,
  );

  const resolved: FoundingActivationWiring = { ...defaultWiring(env), ...wiring };
  return { state: "live", services: buildLiveServices(now, resolved, env) };
}
