import { AssistedOrderService } from "./service";
import {
  consoleAssistedOrderLogger,
  sha256AssistedOrderHasher,
  systemAssistedOrderClock,
  systemAssistedOrderIds,
} from "./defaults";
import type {
  AssistedOrderAuditSink,
  AssistedOrderCatalogPort,
  AssistedOrderDocumentStore,
  AssistedOrderGoogleMirrorQueue,
  AssistedOrderLegalPort,
  AssistedOrderLogger,
  AssistedOrderOutbox,
  AssistedOrderRepository,
  AssistedOrderSubmissionStanding,
} from "./ports";

export type AssistedOrderProductionInputs = Readonly<{
  enabled: boolean;
  catalog: AssistedOrderCatalogPort | null;
  repository: AssistedOrderRepository | null;
  outbox: AssistedOrderOutbox | null;
  audit: AssistedOrderAuditSink | null;
  documents: AssistedOrderDocumentStore | null;
  /**
   * The canonical legal authority (the Early Access required-agreement list).
   * Deliberately REQUIRED, not optional: the 2026-08-18 recovery packet found
   * production composed without it because the field did not exist here, so a
   * caller must now state it explicitly. Null still composes a service — the
   * service reports the feature unavailable up front and refuses every
   * submission (D-005 fail-closed); nothing here invents an agreement.
   */
  legal: AssistedOrderLegalPort | null;
  /** Durable, server-recorded Early Access agreement standing. */
  submissionStanding: AssistedOrderSubmissionStanding | null;
  /**
   * How the audit sink above was obtained. Stated explicitly so the boot log,
   * the production boot test and the release packet can name it; a bridge
   * must never mount with an audit mode nobody can read back.
   */
  auditMode: AssistedOrderAuditMode;
  googleMirror?: AssistedOrderGoogleMirrorQueue | null;
  adminNotificationEmail: string | null;
  documentBucketName?: string | null;
  logger?: AssistedOrderLogger;
}>;

/**
 * - `durable_store`: the exact schema-probed append-only audit authority
 *   (RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED=true and the authority resolved).
 * - `log_line_nondurable`: the production-baseline behaviour since the
 *   2026-08-21 launch — every audit event is serialized into the operational
 *   log line. Truthfully NOT durable evidence; used only while the durable
 *   authority is not enabled.
 * - `unavailable`: no audit sink at all; the composition refuses.
 */
export type AssistedOrderAuditMode =
  | "durable_store"
  | "log_line_nondurable"
  | "unavailable";

export type AssistedOrderProductionComposition = Readonly<{
  enabled: boolean;
  service: AssistedOrderService | null;
  refusalReason: string | null;
  auditMode: AssistedOrderAuditMode;
}>;

/**
 * Fail-closed production composition. No memory store, fake outbox, or public
 * document storage is used when a production dependency is absent.
 */
export function createAssistedOrderProductionComposition(
  inputs: AssistedOrderProductionInputs,
): AssistedOrderProductionComposition {
  if (!inputs.enabled) {
    return Object.freeze({
      enabled: false,
      service: null,
      refusalReason: "assisted_order_bridge_disabled",
      auditMode: inputs.auditMode,
    });
  }
  const missing: string[] = [];
  if (!inputs.catalog) missing.push("catalog");
  if (!inputs.repository) missing.push("repository");
  if (!inputs.outbox) missing.push("outbox");
  if (!inputs.audit) missing.push("audit");
  if (!inputs.documents) missing.push("documents");
  if (!inputs.submissionStanding) missing.push("submissionStanding");
  if (!inputs.adminNotificationEmail?.trim()) {
    missing.push("adminNotificationEmail");
  }
  if (missing.length > 0) {
    return Object.freeze({
      enabled: false,
      service: null,
      refusalReason: `assisted_order_dependencies_missing:${missing.join(",")}`,
      auditMode: inputs.audit ? inputs.auditMode : "unavailable",
    });
  }
  return Object.freeze({
    enabled: true,
    auditMode: inputs.auditMode,
    service: new AssistedOrderService({
      legal: inputs.legal,
      submissionStanding: inputs.submissionStanding,
      catalog: inputs.catalog!,
      repository: inputs.repository!,
      outbox: inputs.outbox!,
      audit: inputs.audit!,
      documents: inputs.documents!,
      googleMirror: inputs.googleMirror ?? null,
      clock: systemAssistedOrderClock,
      ids: systemAssistedOrderIds,
      hasher: sha256AssistedOrderHasher,
      logger: inputs.logger ?? consoleAssistedOrderLogger,
      adminNotificationEmail: inputs.adminNotificationEmail!.trim(),
      documentBucketName:
        inputs.documentBucketName?.trim() ||
        "research-assisted-order-documents",
    }),
    refusalReason: null,
  });
}
