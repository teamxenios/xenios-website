// The assisted-order production composition. Everything canonical, nothing
// parallel: the master-offerings catalog service and binding artifact, the
// Early Access required-agreements list, the service-role Supabase RPC and
// storage clients (M71 is RPC-only; app code never touches the tables), the
// one durable notification outbox, and the research audit log. Any missing
// dependency composes to a refusal, never to a memory fallback.

import {
  createAssistedOrderProductionComposition,
  type AssistedOrderAuditMode,
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
  AssistedOrderSubmissionStanding,
  AssistedOrderViewer,
} from "./ports";
import {
  ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR,
  type ResolvedAssistedOrderAuditAuthority,
} from "./audit-store";
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
   * Exact, schema-probed append-only audit authority (audit mode
   * `durable_store`). Resolved by the composition root only when
   * RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED=true; when that flag is set and the
   * authority is absent the composition refuses rather than downgrading.
   */
  auditAuthority?: ResolvedAssistedOrderAuditAuthority | null;
  /**
   * The production-baseline audit sink (audit mode `log_line_nondurable`):
   * every audit event is serialized into the operational log, exactly as the
   * live bridge has done since the 2026-08-21 launch. It is NOT durable
   * evidence and is used only while durable audit is not enabled. Omitting it
   * while durable audit is not enabled composes to a refusal (audit mode
   * `unavailable`).
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

  // Audit resolution, stated as an explicit mode so a bridge can never mount
  // with an audit posture nobody can read back (2026-08-29 incident: the
  // durable authority became mandatory while production had no audit-store
  // migration, the composition refused, and the live doors vanished into a
  // generic 404).
  //
  //   durable_store       RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED=true and the
  //                       branded schema/attestation-probed authority resolved.
  //   (refusal)           RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED=true but the
  //                       authority did not resolve: the operator asked for
  //                       durable audit, so nothing weaker may stand in.
  //   log_line_nondurable durable audit NOT enabled: the production-baseline
  //                       sink since the 2026-08-21 launch — every event is
  //                       serialized into the operational log through
  //                       `auditWrite`. Truthfully non-durable; never presented
  //                       as evidence; never touches the unapplied audit table.
  //   unavailable         no sink of any kind; the composition refuses.
  const auditExplicitlyEnabled =
    wiring.env[ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR] === "true";
  let audit: AssistedOrderAuditSink | null;
  let auditMode: AssistedOrderAuditMode;
  if (wiring.auditAuthority) {
    audit = wiring.auditAuthority.sink;
    auditMode = "durable_store";
  } else if (auditExplicitlyEnabled) {
    audit = null;
    auditMode = "unavailable";
  } else if (wiring.auditWrite) {
    const write = wiring.auditWrite;
    audit = {
      record: async (event) => {
        await write({ ...event });
      },
    };
    auditMode = "log_line_nondurable";
  } else {
    audit = null;
    auditMode = "unavailable";
  }

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
    auditMode,
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
      `assisted-order bridge refused: ${composition.refusalReason} (audit mode: ${composition.auditMode})`,
      "assisted-order",
    );
  }
  return composition;
}
