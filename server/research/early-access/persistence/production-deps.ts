import { getSupabaseAdmin } from "../../../supabase";
import { isProductionLike } from "../../commerce/production-guards";
import {
  SupabasePrivateAccessSessionRepository,
  type PrivateAccessSessionDatabaseCall,
} from "../private-access-session-repository";
import type { EarlyAccessRegistrationOptions } from "../register";
import { SupabaseEarlyAccessCommerceStore } from "./commerce-store";
import {
  SupabaseEarlyAccessAgreementGate,
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
  SupabaseEarlyAccessAuditSink,
  SupabaseEarlyAccessReleaseLedger,
} from "./records";
import {
  EARLY_ACCESS_PROOF_BUCKET_DEFAULT,
  SupabaseEarlyAccessProofStorage,
} from "./proof-storage";
import {
  RefusingEarlyAccessAuditSink,
  RefusingEarlyAccessCommerceStore,
  RefusingEarlyAccessCustomerRepository,
  RefusingSessionBindingStore,
} from "./refusing";
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
    return Object.freeze({
      mode: decision.mode,
      warnings: decision.warnings,
      reason: null,
      options: {},
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
      },
    });
  }

  const run = query ?? createEarlyAccessSupabaseQuery();
  const warnings = [...decision.warnings];

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
    releases: new SupabaseEarlyAccessReleaseLedger(run),
    proofStorage: new SupabaseEarlyAccessProofStorage({
      query: run,
      bucketId: env.RESEARCH_EARLY_ACCESS_PROOF_BUCKET ?? EARLY_ACCESS_PROOF_BUCKET_DEFAULT,
      signPreviewUrl: query === undefined ? createSupabasePreviewSigner() : undefined,
    }),
    suppliers: new SupabaseEarlyAccessSupplierDirectory({ query: run, now: () => Date.now() }),
    shipping: new SupabaseEarlyAccessShippingPolicy(run),
    referrals: new SupabaseEarlyAccessReferralResolver(run),
  };

  const required = readRequiredAgreements(env, warnings);
  if (required.length > 0) {
    options.agreements = new SupabaseEarlyAccessAgreementGate({ query: run, required });
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
