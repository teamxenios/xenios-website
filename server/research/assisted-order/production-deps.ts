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
  AssistedOrderLegalPort,
  AssistedOrderOutbox,
  AssistedOrderSubmissionStanding,
  AssistedOrderViewer,
} from "./ports";
import type { ResolvedAssistedOrderAuditAuthority } from "./audit-store";
import { enqueueNotificationOnce } from "../outbox";
import { reviewedHeldSpecifications } from "../master-offerings/reviewed-holds";

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
  /** The same durable agreement gate used by the Early Access order door. */
  agreementGate:
    | Readonly<{ accepted(customerRef: string): Promise<boolean> }>
    | null;
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
  /**
   * Exact, schema-probed append-only audit authority. It is deliberately
   * optional at this compatibility seam so an older protected composition
   * still compiles, but omission keeps the entire bridge unavailable.
   */
  auditAuthority?: ResolvedAssistedOrderAuditAuthority | null;
  /**
   * @deprecated A callback/logger is not durable audit authority. Retained
   * temporarily so the protected composition can be updated in one Lead-owned
   * change; it is never invoked or accepted as an audit sink.
   */
  auditWrite?(event: Readonly<Record<string, unknown>>): Promise<void>;
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

  const submissionStanding: AssistedOrderSubmissionStanding | null =
    wiring.agreementGate
      ? {
          accepted: async (viewer) => {
            const customerRef = viewer.earlyAccessCustomerRef?.trim() ?? "";
            const hasLiveSession =
              (viewer.actorType === "member" ||
                viewer.actorType === "early_access_session") &&
              (viewer.earlyAccessSessionHash?.length ?? 0) > 0;
            return hasLiveSession && customerRef.length > 0
              ? wiring.agreementGate!.accepted(customerRef)
              : false;
          },
        }
      : null;

  const catalog = new CallbackAssistedOrderCatalogAdapter(
    createAssistedOrderMasterCatalogCallbacks({
      serviceFor: wiring.masterOfferingServiceFor,
      bindingFor: wiring.bindingFor,
      offeringVariantFor: wiring.offeringVariantFor,
      catalogVersion: wiring.catalogVersion,
      // The assisted-order projection must honor the exact same reviewed
      // formulation holds as the canonical member catalog. Reading the
      // fail-closed record here makes the production seam impossible to
      // compose with an accidental empty/default hold set.
      reviewedFormulationHolds: reviewedHeldSpecifications(),
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

  // A plain callback used to serialize these events into an operational log.
  // That is neither durable nor append-only. Only the branded result of the
  // exact schema/attestation probe can satisfy production composition now.
  const audit = wiring.auditAuthority?.sink ?? null;

  const composition = createAssistedOrderProductionComposition({
    enabled,
    // The canonical legal port built above, carried through to the service.
    // Dropping this line is exactly the 2026-08-18 Phase Zero defect: the
    // production-wiring test proves config publishes these exact pairs.
    legal,
    submissionStanding,
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
