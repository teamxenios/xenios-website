import { getSupabaseAdmin } from "../../../supabase";
import { isProductionLike } from "../../commerce/production-guards";
import {
  SupabasePrivateAccessSessionRepository,
  type PrivateAccessSessionDatabaseCall,
} from "../private-access-session-repository";
import type { EarlyAccessRegistrationOptions } from "../register";
import { buildEarlyAccessDurableCartStore } from "../cart/production-store";
import { SupabaseEarlyAccessCommerceStore } from "./commerce-store";
import {
  SupabaseEarlyAccessAgreementGate,
  SupabaseEarlyAccessAgreementRecorder,
  SupabaseEarlyAccessReferralResolver,
  SupabaseEarlyAccessShippingPolicy,
  SupabaseEarlyAccessSupplierDirectory,
  type EarlyAccessRequiredAgreement,
} from "./commerce-ports";
import {
  SupabaseConsumedTokenStore,
  SupabaseEarlyAccessCustomerRepository,
  SupabaseSessionBindingStore,
} from "./identity";
import {
  EARLY_ACCESS_SESSION_IDENTITY_ENV,
  earlyAccessSessionIdentityEnabled,
} from "../identity/session-scoped-identity";
import {
  SupabaseEarlyAccessAuditSink,
  SupabaseEarlyAccessReleaseLedger,
} from "./records";
import {
  EARLY_ACCESS_PROOF_BUCKET_DEFAULT,
  SupabaseEarlyAccessProofStorage,
} from "./proof-storage";
import {
  RefusingConsumedTokenStore,
  RefusingEarlyAccessAuditSink,
  RefusingEarlyAccessCommerceStore,
  RefusingEarlyAccessCustomerRepository,
  RefusingSessionBindingStore,
} from "./refusing";
import { buildEarlyAccessProofDependencies } from "../proof/production-deps";
import { SupabaseEarlyAccessLegalBindingDirectory } from "../legal/supabase-legal-binding-directory";
import type { EarlyAccessOrderHistoryDependencies } from "../orders/member-order-history";
import { SupabaseEarlyAccessAdminPaymentReviewStore } from "../cart/supabase-admin-payment-review";
import { SupabaseEarlyAccessShippingSlaStore } from "../cart/supabase-shipping-sla";
import { SupabaseEarlyAccessShipmentEventStore } from "../cart/supabase-shipment-events";
import { createEarlyAccessShippingAlertSink } from "../cart/shipping-sla-alerts";
import { SupabaseEarlyAccessReservationStore } from "./reservation-store";
import {
  MigrationTolerantUnitHoldRegistry,
  SupabaseSupplierConfirmationStore,
  SupabaseUnitHoldRegistry,
} from "./ops-stores";
import type { EarlyAccessPersistenceCall } from "./executor";

/**
 * The Early Access persistence composition root.
 *
 * ONE rule, stated once and tested: which repositories a process runs on is a
 * function of the deployment, never of luck.
 *
 *   - tests: in-memory (they call `registerPrivateEarlyAccessApi` directly
 *     and never come through here);
 *   - local development without Supabase: in-memory, with an explicit
 *     warning that nothing survives a restart;
 *   - any deployment with Supabase configured: the durable repositories;
 *   - production-like with Early Access ENABLED and the durable
 *     configuration missing: REFUSED. The session gate is forced closed and
 *     the commerce seams are the refusing stores, which hold nothing and
 *     throw on use. There is deliberately no code path from "production
 *     wants to sell" to "a Map in process memory".
 */

export type EarlyAccessPersistenceMode = "durable" | "memory" | "refused";

export type EarlyAccessPersistenceDecision =
  | Readonly<{ mode: "durable"; warnings: readonly string[]; reason: null }>
  | Readonly<{ mode: "memory"; warnings: readonly string[]; reason: null }>
  | Readonly<{ mode: "refused"; warnings: readonly string[]; reason: string }>;

export type EarlyAccessPersistenceEnvironment = Readonly<{
  productionLike: boolean;
  earlyAccessFlag: string | undefined;
  supabaseAvailable: boolean;
  ownerId: string | null;
}>;

const OWNER_ID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readEarlyAccessPersistenceEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EarlyAccessPersistenceEnvironment {
  const owner = (env.RESEARCH_EARLY_ACCESS_OWNER_ID ?? "").trim();
  return Object.freeze({
    productionLike: isProductionLike(env),
    earlyAccessFlag: env.RESEARCH_EARLY_ACCESS_ENABLED,
    // Judged against the SAME env object as everything else here, so an
    // injected test environment cannot disagree with the real one. For
    // process.env this is exactly `supabaseConfigured()`.
    supabaseAvailable: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    ownerId: OWNER_ID_SHAPE.test(owner) ? owner : null,
  });
}

/**
 * Decide the persistence mode. Pure, so the refusal matrix is testable
 * without an environment.
 */
export function decideEarlyAccessPersistence(
  input: EarlyAccessPersistenceEnvironment,
): EarlyAccessPersistenceDecision {
  const enabled = input.earlyAccessFlag === "true";

  if (input.productionLike && enabled) {
    if (!input.supabaseAvailable) {
      return Object.freeze({
        mode: "refused" as const,
        warnings: Object.freeze([]),
        reason:
          "Early Access is enabled in a production-like process but Supabase is not configured " +
          "(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). The gate is forced closed and every " +
          "commerce repository refuses. In-memory fallback is not available in production.",
      });
    }
    if (input.ownerId === null) {
      return Object.freeze({
        mode: "refused" as const,
        warnings: Object.freeze([]),
        reason:
          "Early Access is enabled in a production-like process but RESEARCH_EARLY_ACCESS_OWNER_ID " +
          "is missing or not a UUID, so the durable session store cannot be mounted. The gate is " +
          "forced closed and every commerce repository refuses.",
      });
    }
    return Object.freeze({ mode: "durable" as const, warnings: Object.freeze([]), reason: null });
  }

  if (input.supabaseAvailable) {
    const warnings: string[] = [];
    if (input.ownerId === null) {
      warnings.push(
        "Supabase is configured but RESEARCH_EARLY_ACCESS_OWNER_ID is missing or invalid; the " +
          "durable commerce repositories are mounted but the SESSION store stays in-memory, so " +
          "Early Access cannot be enabled in production until it is set.",
      );
    }
    return Object.freeze({
      mode: "durable" as const,
      warnings: Object.freeze(warnings),
      reason: null,
    });
  }

  return Object.freeze({
    mode: "memory" as const,
    warnings: Object.freeze([
      "Early Access is running on in-memory repositories (no Supabase configuration). This is " +
        "acceptable for tests and local development only: nothing survives a restart.",
    ]),
    reason: null,
  });
}

export type EarlyAccessPersistenceBuild = Readonly<{
  mode: EarlyAccessPersistenceMode;
  warnings: readonly string[];
  reason: string | null;
  options: Partial<EarlyAccessRegistrationOptions>;
}>;

/**
 * Build the registration options for the decided mode.
 *
 * `query` is injectable for tests; the default speaks to the Supabase admin
 * client and is the ONLY place in the Early Access persistence lane that
 * touches it.
 */
export function buildEarlyAccessPersistence(
  env: NodeJS.ProcessEnv = process.env,
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): EarlyAccessPersistenceBuild {
  const environment = readEarlyAccessPersistenceEnvironment(env);
  const decision = decideEarlyAccessPersistence(environment);

  if (decision.mode === "memory") {
    // Local development honors the SAME switch with the SAME semantics, so
    // what an operator rehearses locally is what production does.
    return Object.freeze({
      mode: decision.mode,
      warnings: decision.warnings,
      reason: null,
      options: { sessionIdentity: earlyAccessSessionIdentityEnabled(env) },
    });
  }

  if (decision.mode === "refused") {
    // No `repository` here, deliberately: the session layer's own
    // `decideEarlyAccessAdapter` sees an in-memory repository in production
    // with the flag on and forces the gate closed with its own loud error.
    // Two independent fail-closed layers, one refusal.
    return Object.freeze({
      mode: decision.mode,
      warnings: decision.warnings,
      reason: decision.reason,
      options: {
        store: new RefusingEarlyAccessCommerceStore(),
        audit: new RefusingEarlyAccessAuditSink(),
        customers: new RefusingEarlyAccessCustomerRepository(),
        sessionBindings: new RefusingSessionBindingStore(),
        consumed: new RefusingConsumedTokenStore(),
      },
    });
  }

  const run = query ?? createEarlyAccessSupabaseQuery();
  const warnings = [...decision.warnings];
  // The deployment's session-identity stance is stated in the logs on every
  // boot, deliberately and without any secret: whether the shared launch code
  // mints per-session checkout identities is exactly the kind of fact an
  // operator should never have to infer from behavior.
  warnings.push(
    earlyAccessSessionIdentityEnabled(env)
      ? `Session-scoped identity is ENABLED (${EARLY_ACCESS_SESSION_IDENTITY_ENV}="true"): each valid private session checks out under its own opaque customer reference.`
      : `Session-scoped identity is DISABLED (${EARLY_ACCESS_SESSION_IDENTITY_ENV} is not exactly "true"): the pre-existing verified-link identity path is in charge.`,
  );

  const options: {
    -readonly [K in keyof EarlyAccessRegistrationOptions]?: EarlyAccessRegistrationOptions[K];
  } = {
    store: new SupabaseEarlyAccessCommerceStore({
      query: run,
      reservationTtlMinutes: readReservationTtlMinutes(env),
    }),
    audit: new SupabaseEarlyAccessAuditSink(run),
    customers: new SupabaseEarlyAccessCustomerRepository(run),
    sessionBindings: new SupabaseSessionBindingStore(run),
    // The launch code is the access credential. When the kill switch is
    // deliberately set, each valid durable session gets its own opaque
    // identity and email verification becomes an optional recovery path, not
    // a checkout prerequisite. Anything but the exact string "true" keeps the
    // pre-existing verified-link path in charge.
    sessionIdentity: earlyAccessSessionIdentityEnabled(env),
    consumed: new SupabaseConsumedTokenStore(run),
    releases: new SupabaseEarlyAccessReleaseLedger(run),
    proofStorage: new SupabaseEarlyAccessProofStorage({
      query: run,
      bucketId: env.RESEARCH_EARLY_ACCESS_PROOF_BUCKET ?? EARLY_ACCESS_PROOF_BUCKET_DEFAULT,
      signPreviewUrl: query === undefined ? createSupabasePreviewSigner() : undefined,
    }),
    suppliers: new SupabaseEarlyAccessSupplierDirectory({ query: run, now: () => Date.now() }),
    shipping: new SupabaseEarlyAccessShippingPolicy(run),
    referrals: new SupabaseEarlyAccessReferralResolver(run),
    // THE TWO STORES THE PROJECTION READS, AND THE OMISSION THAT HELD THE
    // WHOLE CATALOGUE.
    //
    // These are not commerce ports like the ones above: they are read at
    // PROJECTION time, by `ProductControlDeclaredFactsReader`, to answer
    // "has a named human confirmed supply for this exact unit" and "is this
    // unit under a prohibition". They were the only two options production
    // never supplied, so `register.ts` took its fallbacks and the live
    // process asked an EMPTY in-memory store about supply that the database
    // had recorded 44 times.
    //
    // The result was the entire opening set held: an unconfirmed unit carries
    // a non-waivable supply blocker, so `decideEarlyAccessRelease` refused
    // before it ever looked at a release, and the customer saw 22 visible, 0
    // purchasable, 22 held with no price on anything. The releases, the
    // confirmations, the identity and the agreement were all correct the
    // whole time; nothing in the process could see two of them.
    //
    // Same shape as the founderHeldUnits omission: a seam that exists, is
    // fully tested, and that the composition root silently never fills. The
    // regression test beside this file builds the options through THIS
    // function and asserts both keys are present and durable, so removing
    // either one is a failing test rather than a dark catalogue.
    // The hold registry is wrapped, because production proved the RPC it
    // reads does not exist yet: migration 54 is not applied, and a projection
    // that throws once per unit turns the whole catalogue into 503. The
    // wrapper degrades that ONE read to "no durable holds" and warns once;
    // every other reason a unit is held is untouched, and recording a hold
    // still throws. When 54 lands it becomes a pass-through.
    supplierConfirmations: buildEarlyAccessSupplierConfirmationStore(run),
    holds: new MigrationTolerantUnitHoldRegistry(buildEarlyAccessUnitHoldRegistry(run)),
    // THE DURABLE CART STORE, and the other half of F4.
    //
    // F4 made the SAFETY half true: production plus the cart flag plus no
    // durable store refuses to boot instead of holding a paid checkout in
    // RAM. That is only half a system. Without this line the refusal was the
    // ONLY reachable outcome, because nothing in the composition root ever
    // supplied `cartCheckoutStore`, so turning the flag on in production
    // could never have produced a working cart, only a crash.
    //
    // Supplying it here is exactly what `buildEarlyAccessDurableCartStore`
    // documents: the cart persists through the reviewed
    // research_early_access_commit_cart_checkout RPC on the SAME query seam
    // every other durable repository above uses. It is built in durable mode
    // ONLY; refused and memory mode return before reaching this object, so
    // production still cannot arrive at process memory by omission.
    cartCheckoutStore: buildEarlyAccessDurableCartStore(run),
    // THE CUSTOMER PAYMENT-PROOF DOOR'S DURABLE DEPENDENCIES.
    //
    // Built ONLY here, in the durable branch, for the same reason the cart
    // store is: refused and memory mode both return before this object exists,
    // so there is no path from a deployment that cannot persist to a door that
    // accepts a customer's proof. Registration mounts the door only when this
    // key is present, so an unsupplied dependency is an absent route rather
    // than a route that fails at the first upload.
    //
    // `checkouts` is deliberately not among them: the mount passes the SAME
    // resolved cart store the quote, checkout and status routes use.
    proofDependencies: buildEarlyAccessProofDependencies({
      query: run,
      env,
      warnings,
    }),
    // THE PAYMENT-REVIEW AUTHORITY, ONE OBJECT FOR THREE PORTS.
    //
    // `SupabaseEarlyAccessAdminPaymentReviewStore` implements the admin
    // submission projection, the agreement-standing projection AND the
    // accepted-submission evidence port over the same M62 routines. Built ONCE
    // here so the review a named admin reads and the evidence the settlement
    // bridges are the same source of truth, rather than two objects that could
    // answer differently about the same order.
    //
    // Its absence was B2: the customer proof door was mounted, the settlement
    // service could bridge an accepted submission, and nothing in production
    // ever connected them, so a customer who uploaded correctly could not be
    // settled through the canonical door at all.
    cartPaymentReview: new SupabaseEarlyAccessAdminPaymentReviewStore(run),
    // THE 72-HOUR SHIPPING SLA MONITOR'S TWO PORTS.
    //
    // `store` is M64's read-only work list, the routine that exists precisely
    // because M62 revokes every one of its tables from service_role and grants
    // no list-shaped reader. `alerts` is the ONE notification outbox, so an
    // overdue order becomes a durable, deduplicated row a human is shown.
    //
    // Durable branch only. Refused and memory mode return before this object
    // exists, so no deployment that cannot persist starts a monitor, and no
    // test starts a timer.
    shippingSla: Object.freeze({
      store: new SupabaseEarlyAccessShippingSlaStore(run),
      alerts: createEarlyAccessShippingAlertSink(),
    }),
    // The named-admin shipment door's writer, over M62's fulfilment RPC. The
    // application has no other way to record a shipment fact, and could not
    // have one: the events table is revoked from service_role.
    fulfilmentEvents: new SupabaseEarlyAccessShipmentEventStore(run),
  };

  const required = readRequiredAgreements(env, warnings);
  if (required.length > 0) {
    options.agreements = new SupabaseEarlyAccessAgreementGate({ query: run, required });
    // The write half. Without it the gate above can only ever answer false,
    // because nothing else in the process can put an acceptance on file.
    options.agreementRecorder = new SupabaseEarlyAccessAgreementRecorder(run);
    options.requiredAgreements = required;
  } else {
    warnings.push(
      "RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS is not set; the agreement gate stays fail-closed " +
        "(no order can clear AGREEMENT_REQUIRED) until the required agreement list is stated.",
    );
  }

  if (environment.ownerId !== null) {
    options.repository = new SupabasePrivateAccessSessionRepository({
      query: (call: PrivateAccessSessionDatabaseCall) => run(call),
      ownerId: environment.ownerId,
    });
  }

  return Object.freeze({
    mode: decision.mode,
    warnings: Object.freeze(warnings),
    reason: null,
    options,
  });
}

/**
 * The consumed-token store for the verification-token redemption door.
 *
 * Exported for the door's mount, which does not exist yet:
 * `registerPrivateEarlyAccessApi` has no `consumed` option today, so nothing
 * can wire this in. Building the durable store anyway means the door's only
 * missing piece is the seam, not the persistence.
 */
export function buildEarlyAccessConsumedTokenStore(
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): SupabaseConsumedTokenStore {
  return new SupabaseConsumedTokenStore(query ?? createEarlyAccessSupabaseQuery());
}

/**
 * The durable reservation store (migration 53) for the standalone
 * hold-before-payment lifecycle. `registerPrivateEarlyAccessApi` has no
 * reservation option yet, so the integration lane composes this directly
 * wherever the reservation routes mount.
 */
export function buildEarlyAccessReservationStore(
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): SupabaseEarlyAccessReservationStore {
  return new SupabaseEarlyAccessReservationStore(query ?? createEarlyAccessSupabaseQuery());
}

/**
 * The durable supplier-confirmation store (migration 52 table, port
 * completed by migration 54). One instance serves both roles the integration
 * lane composes: `supplierConfirmations` on the declared-facts reader (it
 * satisfies SupplierConfirmationLiveReader structurally) and the full store
 * for the admin recording path.
 */
export function buildEarlyAccessSupplierConfirmationStore(
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): SupabaseSupplierConfirmationStore {
  return new SupabaseSupplierConfirmationStore(query ?? createEarlyAccessSupabaseQuery());
}

/**
 * The durable founder release ledger. Composed into the registration options
 * above; exported separately so the one-time release initialization can reach
 * the SAME ledger without standing up the whole persistence object.
 */
export function buildEarlyAccessReleaseLedger(
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): SupabaseEarlyAccessReleaseLedger {
  return new SupabaseEarlyAccessReleaseLedger(query ?? createEarlyAccessSupabaseQuery());
}

/**
 * The durable unit-hold registry (migration 54, QA R4's durable half): the
 * `holds` reader on the declared-facts source plus the record/withdraw
 * surface for the operator path. A hold recorded here survives every
 * restart, which is the point.
 */
export function buildEarlyAccessUnitHoldRegistry(
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): SupabaseUnitHoldRegistry {
  return new SupabaseUnitHoldRegistry(query ?? createEarlyAccessSupabaseQuery());
}

/**
 * The member order-history read pair (M67): the legal binding directory that
 * answers `customerRefsFor(memberId)` and the commerce store that answers
 * `placementsForCustomers(refs)`. The commerce composition root
 * (server/research/commerce/production-deps.ts, defaultWiring) calls this to
 * decorate GET /api/research/orders with a member's own Early Access orders.
 *
 * Durable mode only. Anything except a durable persistence decision returns
 * null, so a deployment without durable Early Access persistence keeps the
 * undecorated orders service, which is the previous behaviour exactly, rather
 * than a history read that can only fail.
 */
export function buildEarlyAccessOrderHistory(
  env: NodeJS.ProcessEnv = process.env,
  query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>,
): EarlyAccessOrderHistoryDependencies | null {
  const decision = decideEarlyAccessPersistence(readEarlyAccessPersistenceEnvironment(env));
  if (decision.mode !== "durable") return null;
  const run = query ?? createEarlyAccessSupabaseQuery();
  return Object.freeze({
    bindings: new SupabaseEarlyAccessLegalBindingDirectory(run),
    store: new SupabaseEarlyAccessCommerceStore({
      query: run,
      reservationTtlMinutes: readReservationTtlMinutes(env),
    }),
  });
}

function createEarlyAccessSupabaseQuery(): (
  call: EarlyAccessPersistenceCall,
) => Promise<unknown> {
  return async (call) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc(call.fn, call.args as Record<string, unknown>);
    if (error) {
      // The driver error can carry the connection string and argument
      // values; the adapter layer's opaque error is the only thing callers
      // may see.
      throw new Error(`rpc ${call.fn} failed`);
    }
    return data;
  };
}

function createSupabasePreviewSigner() {
  return async (input: {
    bucketId: string;
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string | null> => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(input.bucketId)
      .createSignedUrl(input.objectKey, input.expiresInSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  };
}

function readReservationTtlMinutes(env: NodeJS.ProcessEnv): number | null {
  const raw = (env.RESEARCH_EARLY_ACCESS_RESERVATION_TTL_MINUTES ?? "").trim();
  if (raw.length === 0) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readRequiredAgreements(
  env: NodeJS.ProcessEnv,
  warnings: string[],
): readonly EarlyAccessRequiredAgreement[] {
  const raw = (env.RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS ?? "").trim();
  if (raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    const entries: EarlyAccessRequiredAgreement[] = [];
    for (const entry of parsed) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as Record<string, unknown>).kind !== "string" ||
        typeof (entry as Record<string, unknown>).version !== "string"
      ) {
        throw new Error("entry is not {kind, version}");
      }
      entries.push(
        Object.freeze({
          kind: (entry as Record<string, string>).kind,
          version: (entry as Record<string, string>).version,
        }),
      );
    }
    return Object.freeze(entries);
  } catch {
    warnings.push(
      "RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS is set but not a valid JSON array of " +
        '{"kind","version"} entries; treating it as unset, so the agreement gate stays fail-closed.',
    );
    return [];
  }
}
