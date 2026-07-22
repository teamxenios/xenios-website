import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSupabaseAdmin } from "../supabase";
import { requireMember, type MemberRow } from "./member-auth";
import { rateLimitHit, requestIp } from "./rate-limit";
import type { MemberPlatformDeps } from "./member-platform-deps";

// ---------------------------------------------------------------------------
// xenios research member platform: agreements engine (paperwork register).
//
// Versioned agreement DEFINITIONS live here as a typed constant; ACCEPTANCES
// are recorded append-only in research_agreement_acceptances (never updated;
// the latest row per subject + agreement key wins), the same posture as
// research_consent_events. Every definition is honestly marked draft until
// counsel signs off: the engine records who accepted which draft version and
// when, and never pretends a draft is effective paper.
//
// XR-MEM-003 (the $25 recurring membership authorization) carries
// separateConsent: it is authorized by its OWN checkbox at its own step after
// the activation payment, so the server refuses any call that bundles it with
// other keys. That rule is enforced in recordAcceptances so no future caller
// can route around it.
//
// Privacy: IP and user agent are stored as sha256 hashes only, never raw.
// Nothing here logs member identifiers, addresses, or agreement decisions.
// ---------------------------------------------------------------------------

const ACCEPTANCES_TABLE = "research_agreement_acceptances";

export type AgreementTrigger = "activation" | "assessment";
export type AgreementDecision = "accepted" | "declined";
export type AgreementSubjectType = "applicant" | "member";

export type AgreementDefinition = {
  key: string;
  version: string;
  title: string;
  required: boolean;
  trigger: AgreementTrigger;
  status: "draft";
  effectiveDate: null;
  supersedes: null;
  separateConsent: boolean;
  contentHash: string;
};

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Deterministic identity hash for a definition version. When real counsel
// text lands, this becomes the hash of the presented text; until then the
// key@version pair is the stable identity the acceptance rows bind to.
export function agreementContentHash(key: string, version: string): string {
  return sha256Hex(`${key}@${version}`);
}

const DRAFT_VERSION = "0.1.0-draft";

function draftDefinition(
  key: string,
  title: string,
  options: { separateConsent?: boolean; trigger?: AgreementTrigger } = {},
): AgreementDefinition {
  return {
    key,
    version: DRAFT_VERSION,
    title,
    required: true,
    trigger: options.trigger ?? "activation",
    status: "draft",
    effectiveDate: null,
    supersedes: null,
    separateConsent: options.separateConsent === true,
    contentHash: agreementContentHash(key, DRAFT_VERSION),
  };
}

// The activation bundle from the paperwork register. XR-MEM-003 is trigger
// "activation" like the rest but is NEVER bundled: its own checkbox, its own
// step, after the activation payment (frozen contract).
export const AGREEMENT_DEFINITIONS: readonly AgreementDefinition[] = [
  draftDefinition("XR-MEM-001", "Founding Membership Agreement"),
  draftDefinition("XR-MEM-002", "$50 Activation Terms"),
  draftDefinition("XR-MEM-003", "$25 Recurring Membership Authorization", { separateConsent: true }),
  draftDefinition("XR-MEM-004", "Immediate Cancellation Acknowledgment"),
  draftDefinition("XR-MEM-005", "Membership Covenant"),
  draftDefinition("XR-MEM-006", "Confidentiality Covenant"),
  draftDefinition("XR-MEM-026", "Referral and Store Credit Terms"),
  draftDefinition("XR-PUB-007", "Electronic Communications Consent"),
  // Assessment-stage umbrella consent for health-adjacent answers. Its own
  // separate acceptance event (never bundled), presented at first entry into
  // the mandatory assessment; the assessment routes enforce it server-side.
  draftDefinition("XR-MEM-012", "Sensitive Health Data Consent", { trigger: "assessment", separateConsent: true }),
];

const DEFINITIONS_BY_KEY = new Map(AGREEMENT_DEFINITIONS.map((d) => [d.key, d]));
const AGREEMENT_KEYS = AGREEMENT_DEFINITIONS.map((d) => d.key) as [string, ...string[]];

export function listDefinitions(trigger?: AgreementTrigger): AgreementDefinition[] {
  return AGREEMENT_DEFINITIONS.filter((d) => (trigger ? d.trigger === trigger : true));
}

// True when the member's latest decision for the key is an acceptance of the
// CURRENT definition version. The assessment routes gate health-adjacent
// answers on this (XR-MEM-012); tests mock this function.
export async function hasAcceptedCurrent(memberId: string, key: string): Promise<boolean> {
  const definition = DEFINITIONS_BY_KEY.get(key);
  if (!definition) return false;
  const state = await acceptanceStateForMember(memberId);
  const entry = state.find((s) => s.key === key);
  return entry?.acceptedVersion === definition.version;
}

// ---------------------------------------------------------------------------
// Acceptance state
// ---------------------------------------------------------------------------

export type AgreementAcceptanceState = {
  key: string;
  requiredVersion: string;
  acceptedVersion: string | null;
  // True only when the member DID accept a version and the current required
  // version has since moved on. Never-accepted reads as acceptedVersion null
  // with reacceptanceNeeded false (that is first acceptance, not RE-acceptance).
  reacceptanceNeeded: boolean;
};

type AcceptanceRow = {
  agreement_key: string;
  agreement_version: string;
  decision: string;
  created_at: string;
};

// Latest row per agreement key wins. Rows are fetched oldest-first and the
// reduce lets a later row overwrite (ties included), so a same-timestamp
// accept-then-decline sequence resolves to the later insert.
function latestByKey(rows: AcceptanceRow[]): Map<string, AcceptanceRow> {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const latest = new Map<string, AcceptanceRow>();
  for (const row of sorted) latest.set(row.agreement_key, row);
  return latest;
}

export async function acceptanceStateForMember(memberId: string): Promise<AgreementAcceptanceState[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(ACCEPTANCES_TABLE)
    .select("agreement_key, agreement_version, decision, created_at")
    .eq("subject_type", "member")
    .eq("subject_id", memberId)
    .order("created_at", { ascending: true });
  const latest = latestByKey(error ? [] : ((data as AcceptanceRow[]) ?? []));
  return AGREEMENT_DEFINITIONS.map((definition) => {
    const row = latest.get(definition.key);
    const acceptedVersion = row && row.decision === "accepted" ? row.agreement_version : null;
    return {
      key: definition.key,
      requiredVersion: definition.version,
      acceptedVersion,
      reacceptanceNeeded: acceptedVersion !== null && acceptedVersion !== definition.version,
    };
  });
}

// ---------------------------------------------------------------------------
// Recording acceptances (append-only)
// ---------------------------------------------------------------------------

export type AgreementDecisionInput = {
  key: string;
  version: string;
  decision: AgreementDecision;
};

export type AcceptanceMeta = {
  // From deps.clock.now(); service logic never reads the wall clock itself.
  now: Date;
  ip?: string | null;
  userAgent?: string | null;
};

export type RecordAcceptancesResult =
  | { ok: true; recorded: number }
  | { ok: false; code: "unknown_key" | "version_mismatch" | "separate_consent_bundled" | "storage_error"; key?: string };

export async function recordAcceptances(
  subjectType: AgreementSubjectType,
  subjectId: string,
  decisions: AgreementDecisionInput[],
  meta: AcceptanceMeta,
): Promise<RecordAcceptancesResult> {
  for (const decision of decisions) {
    const definition = DEFINITIONS_BY_KEY.get(decision.key);
    if (!definition) return { ok: false, code: "unknown_key", key: decision.key };
    if (decision.version !== definition.version) {
      return { ok: false, code: "version_mismatch", key: decision.key };
    }
    // Separate-consent rule, enforced at the service so no caller can bundle:
    // a separate-consent agreement must be the ONLY decision in its call.
    if (definition.separateConsent && decisions.length > 1) {
      return { ok: false, code: "separate_consent_bundled", key: decision.key };
    }
  }

  const ipHash = meta.ip ? sha256Hex(meta.ip) : null;
  const userAgentHash = meta.userAgent ? sha256Hex(meta.userAgent) : null;

  // Append-only: this table only ever sees inserts. A retry after a partial
  // failure appends again; duplicates are harmless because the latest row per
  // subject + key wins.
  for (const decision of decisions) {
    const { error } = await getSupabaseAdmin().from(ACCEPTANCES_TABLE).insert({
      subject_type: subjectType,
      subject_id: subjectId,
      agreement_key: decision.key,
      agreement_version: decision.version,
      content_hash: agreementContentHash(decision.key, decision.version),
      decision: decision.decision,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      created_at: meta.now.toISOString(),
    });
    if (error) return { ok: false, code: "storage_error" };
  }
  return { ok: true, recorded: decisions.length };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const decisionSchema = z.object({
  key: z.enum(AGREEMENT_KEYS),
  version: z.string().min(1).max(64),
  decision: z.enum(["accepted", "declined"]),
});

const acceptBodySchema = z.object({
  decisions: z.array(decisionSchema).min(1).max(AGREEMENT_DEFINITIONS.length),
});

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flattened = error.flatten();
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (messages && messages.length) fieldErrors[field] = messages;
  }
  if (flattened.formErrors.length) fieldErrors._form = flattened.formErrors;
  return fieldErrors;
}

function setResponseHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

type AgreementView = {
  key: string;
  version: string;
  title: string;
  required: boolean;
  trigger: AgreementTrigger;
  status: "draft";
  separateConsent: boolean;
  acceptedVersion: string | null;
  reacceptanceNeeded: boolean;
};

async function agreementViewsForMember(memberId: string): Promise<AgreementView[]> {
  const state = await acceptanceStateForMember(memberId);
  const byKey = new Map(state.map((s) => [s.key, s]));
  return listDefinitions().map((definition) => {
    const entry = byKey.get(definition.key);
    return {
      key: definition.key,
      version: definition.version,
      title: definition.title,
      required: definition.required,
      trigger: definition.trigger,
      status: definition.status,
      separateConsent: definition.separateConsent,
      acceptedVersion: entry?.acceptedVersion ?? null,
      reacceptanceNeeded: entry?.reacceptanceNeeded ?? false,
    };
  });
}

export function registerAgreementsApi(app: Express, deps: MemberPlatformDeps) {
  // requireMember, NOT requireActiveMember: agreements precede activation, so
  // a pending_activation member must be able to read and sign them.
  app.get("/api/research/agreements", requireMember, async (req: Request, res: Response) => {
    setResponseHeaders(res);
    const member = (req as { researchMember?: MemberRow }).researchMember;
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    const agreements = await agreementViewsForMember(member.id);
    res.json({ ok: true, agreements });
  });

  app.post("/api/research/agreements", requireMember, async (req: Request, res: Response) => {
    setResponseHeaders(res);
    const member = (req as { researchMember?: MemberRow }).researchMember;
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

    // Reading agreements stays open to any non-closed member, but RECORDING a
    // decision (including the XR-MEM-003 recurring-billing authorization) is
    // only meaningful while activating or active. Cancelled, paused, and
    // past_due members cannot sign; a stale authorization signed in those
    // states would be a billing-consent liability.
    if (member.status !== "pending_activation" && member.status !== "active") {
      return res.status(409).json({
        ok: false,
        code: "state_conflict",
        message: "Membership state does not permit recording agreement decisions.",
      });
    }

    const allowed = await rateLimitHit(`research:agreements:${member.id}`, 3600, 30);
    if (!allowed) return res.status(429).json({ ok: false, code: "rate_limited" });

    const parsed = acceptBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        code: "validation_failed",
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }
    const decisions = parsed.data.decisions;

    const seen = new Set<string>();
    for (const decision of decisions) {
      if (seen.has(decision.key)) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: { decisions: [`${decision.key} appears more than once in one call`] },
        });
      }
      seen.add(decision.key);
    }

    // Separate-consent agreements (XR-MEM-003) must arrive alone; a bundle is
    // a client bug, so it reads as validation, not state.
    const bundledSeparate = decisions.find(
      (d) => DEFINITIONS_BY_KEY.get(d.key)?.separateConsent && decisions.length > 1,
    );
    if (bundledSeparate) {
      return res.status(400).json({
        ok: false,
        code: "validation_failed",
        fieldErrors: {
          decisions: [`${bundledSeparate.key} requires its own separate consent and cannot be bundled with other agreements`],
        },
      });
    }

    // Stale definition version: the member signed a screen that no longer
    // matches the current paper. Surface the current version so the client
    // can re-present.
    for (const decision of decisions) {
      const definition = DEFINITIONS_BY_KEY.get(decision.key)!;
      if (decision.version !== definition.version) {
        return res.status(409).json({
          ok: false,
          code: "state_conflict",
          message: `${decision.key} current version is ${definition.version}`,
        });
      }
    }

    const recorded = await recordAcceptances("member", member.id, decisions, {
      now: deps.clock.now(),
      ip: requestIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    });
    if (!recorded.ok) {
      // The route already screened unknown keys, versions, and bundling; only
      // a storage failure reaches this branch.
      return res.status(500).json({ ok: false, message: "Could not record agreement decisions." });
    }

    const agreements = await agreementViewsForMember(member.id);
    res.json({ ok: true, agreements });
  });
}
