// The assisted-order production composition. Everything canonical, nothing
// parallel: the master-offerings catalog service and binding artifact, the
// Early Access required-agreements list, the service-role Supabase RPC and
// storage clients (M71 is RPC-only; app code never touches the tables), the
// one durable notification outbox, and the research audit log. Any missing
// dependency composes to a refusal, never to a memory fallback.

import {
  createAssistedOrderProductionComposition,
  type AssistedOrderProductionComposition,
} from "./production";
import { CallbackAssistedOrderCatalogAdapter } from "./catalog-adapter";
import {
  createAssistedOrderMasterCatalogCallbacks,
  type AssistedOrderCommerceIdentity,
  type AssistedOrderMasterCatalogService,
} from "./production-catalog";
import { SupabaseAssistedOrderRepository, type SupabaseRpcClient } from "./supabase-repository";
import {
  SupabaseAssistedOrderDocumentStore,
  type SupabaseStorageClient,
} from "./supabase-document-store";
import type {
  AssistedOrderAuditSink,
  AssistedOrderLegalPort,
  AssistedOrderOutbox,
  AssistedOrderViewer,
} from "./ports";
import { enqueueNotificationOnce } from "../outbox";

export const ASSISTED_ORDER_BRIDGE_ENABLED_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED";
export const ASSISTED_ORDER_ADMIN_EMAIL_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL";
export const ASSISTED_ORDER_DOCUMENT_BUCKET =
  "research-assisted-order-documents";

export type AssistedOrderProductionWiring = Readonly<{
  env: NodeJS.ProcessEnv;
  /**
   * The canonical Early Access required agreement list
   * (earlyAccessPersistence.options.requiredAgreements). Undefined or empty
   * means the legal authority is unstated and the feature reports itself
   * disabled up front (D-005); nothing here invents a version.
   */
  requiredAgreements:
    | readonly Readonly<{ kind: string; version: string }>[]
    | undefined;
  /** The per-viewer canonical master-offerings service, or null. */
  masterOfferingServiceFor(
    viewer: AssistedOrderViewer,
  ): AssistedOrderMasterCatalogService | null;
  bindingFor(offeringVariantId: string): AssistedOrderCommerceIdentity | null;
  offeringVariantFor(identity: AssistedOrderCommerceIdentity): string | null;
  catalogVersion: string;
  /** The service-role Supabase client, or null when unconfigured. */
  supabaseRpc: SupabaseRpcClient | null;
  supabaseStorage: SupabaseStorageClient | null;
  /** Structured research audit writer (the canonical sink). */
  auditWrite(event: Readonly<Record<string, unknown>>): Promise<void>;
  log(message: string, source?: string): void;
}>;

export function buildAssistedOrderProduction(
  wiring: AssistedOrderProductionWiring,
): AssistedOrderProductionComposition {
  const enabled = wiring.env[ASSISTED_ORDER_BRIDGE_ENABLED_ENV_VAR] === "true";

  const legal: AssistedOrderLegalPort | null =
    wiring.requiredAgreements && wiring.requiredAgreements.length > 0
      ? {
          requiredAgreements: async () =>
            wiring.requiredAgreements!.map((entry) =>
              Object.freeze({ kind: entry.kind, version: entry.version }),
            ),
        }
      : null;

  const catalog = new CallbackAssistedOrderCatalogAdapter(
    createAssistedOrderMasterCatalogCallbacks({
      serviceFor: wiring.masterOfferingServiceFor,
      bindingFor: wiring.bindingFor,
      offeringVariantFor: wiring.offeringVariantFor,
      catalogVersion: wiring.catalogVersion,
    }),
  );

  const repository = wiring.supabaseRpc
    ? new SupabaseAssistedOrderRepository(wiring.supabaseRpc)
    : null;

  const documents = wiring.supabaseStorage
    ? new SupabaseAssistedOrderDocumentStore(
        wiring.supabaseStorage,
        ASSISTED_ORDER_DOCUMENT_BUCKET,
      )
    : null;

  // The one durable outbox. The intent's dedupe key is the durable event key,
  // so an idempotent replay can never enqueue a second copy of the same
  // notification.
  const outbox: AssistedOrderOutbox = {
    enqueue: async (intent) => {
      const outcome = await enqueueNotificationOnce({
        eventKey: intent.dedupeKey,
        eventType: intent.eventType,
        templateKey: intent.templateKey,
        recipient: intent.recipientAddress,
        payload: { ...intent.payload },
      });
      if (outcome === "unavailable") {
        throw new Error("notification outbox unavailable");
      }
    },
  };

  const audit: AssistedOrderAuditSink = {
    record: async (event) => {
      await wiring.auditWrite({ ...event });
    },
  };

  const composition = createAssistedOrderProductionComposition({
    enabled,
    catalog,
    repository,
    outbox,
    audit,
    documents,
    googleMirror: null,
    adminNotificationEmail:
      wiring.env[ASSISTED_ORDER_ADMIN_EMAIL_ENV_VAR] ?? null,
    logger: {
      info: (message) => wiring.log(message, "assisted-order"),
      warn: (message) => wiring.log(message, "assisted-order"),
      error: (message) => wiring.log(message, "assisted-order"),
    },
  });
  if (enabled && composition.refusalReason !== null) {
    wiring.log(
      `assisted-order bridge refused: ${composition.refusalReason}`,
      "assisted-order",
    );
  }
  return composition;
}
