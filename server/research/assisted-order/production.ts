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
  googleMirror?: AssistedOrderGoogleMirrorQueue | null;
  adminNotificationEmail: string | null;
  documentBucketName?: string | null;
  logger?: AssistedOrderLogger;
}>;

export type AssistedOrderProductionComposition = Readonly<{
  enabled: boolean;
  service: AssistedOrderService | null;
  refusalReason: string | null;
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
    });
  }
  const missing: string[] = [];
  if (!inputs.catalog) missing.push("catalog");
  if (!inputs.repository) missing.push("repository");
  if (!inputs.outbox) missing.push("outbox");
  if (!inputs.audit) missing.push("audit");
  if (!inputs.documents) missing.push("documents");
  if (!inputs.adminNotificationEmail?.trim()) {
    missing.push("adminNotificationEmail");
  }
  if (missing.length > 0) {
    return Object.freeze({
      enabled: false,
      service: null,
      refusalReason: `assisted_order_dependencies_missing:${missing.join(",")}`,
    });
  }
  return Object.freeze({
    enabled: true,
    service: new AssistedOrderService({
      legal: inputs.legal,
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
