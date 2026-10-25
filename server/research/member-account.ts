import type { Express, Request, Response } from "express";
import { MEMBER_ACCOUNT_API } from "@shared/research/member-paths";
import { getSupabaseAdmin } from "../supabase";
import { requireMember, requireResearchSubject, type MemberRow } from "./member-auth";
import { AGREEMENT_DEFINITIONS, acceptanceStateForMember } from "./agreements";
import type { MemberPlatformDeps } from "./member-platform-deps";

// ---------------------------------------------------------------------------
// xenios research member platform: the member ACCOUNT surface.
//
// PR #209 repaired the Research admin contracts and listed the member-surface
// endpoints behind client/src/research/adapters/member.ts as the follow-on.
// Seven adapter paths had no server route at all, so five pages fell through
// the SPA catch-all. This module publishes those seven paths, and only those,
// through the one member-platform entry point. It defines no parallel auth:
// every route takes its subject from the injected guard and from nothing else,
// so there is no id in a body, a query, or a path that could address another
// member.
//
// The split is decided by what is actually in the schema, never by what would
// look finished:
//
//   SERVED FROM REAL TABLES
//     GET  /api/research/member/membership
//          research_members (status, activated_at)
//          research_fm_membership_periods (coverage, so the next renewal date)
//          research_fm_ledger (the append-only money record)
//          research_fm_obligations (what each ledger entry paid for)
//          research_agreement_acceptances (through ./agreements)
//     GET  /api/research/member/privacy/summary
//          research_consent_events (the append-only consent registry)
//          research_private_media (the member's own stored media)
//
//   REFUSED TRUTHFULLY, NO STORE EXISTS (migration work for the release
//   authority; this lane does not author migrations)
//     POST /api/research/member/cancel
//     GET  /api/research/member/security/sessions
//     POST /api/research/member/privacy/export
//     POST /api/research/member/privacy/correction
//     POST /api/research/member/privacy/deletion
//
// A refusal is a published, guarded, typed 503 rather than an unregistered
// path: the client envelope maps 404, 501, and 503 to the same `unavailable`
// pending state, but only a real route answers an anonymous caller with 401
// instead of the app shell, and only a real route can name the missing store.
// The pages already render the honest copy for that state (Security's inline
// pending panel, MembershipPage's "Online cancellation is not available yet",
// PrivacyControls' "not available online yet, a person will handle it").
//
// Every read is defensive in the same way the overview is: these FM tables
// ship as separate migrations, so a table that is not present yet reads as
// the empty state. An empty payment history renders the page's honest "not
// available yet" panel. It never renders an invented row, an invented date,
// or a zero amount.
// ---------------------------------------------------------------------------

const MEMBERSHIP_PERIODS_TABLE = "research_fm_membership_periods";
const LEDGER_TABLE = "research_fm_ledger";
const OBLIGATIONS_TABLE = "research_fm_obligations";
const CONSENT_EVENTS_TABLE = "research_consent_events";
const PRIVATE_MEDIA_TABLE = "research_private_media";

/**
 * Every path this module publishes. It is the SAME constant the client adapter
 * imports, so the client cannot ask for a path the server did not register:
 * the prefix trap that silently unpublished five pages is a drift between two
 * copies of a string, and there is now only one copy.
 */
export const MEMBER_ACCOUNT_PATHS = MEMBER_ACCOUNT_API;

/**
 * The stores that do not exist in the shipped schema, named in the refusal so
 * the gap is legible in a response, not only in a report. Recording a
 * cancellation, a session list, or a data-rights request in a table that means
 * something else would be inventing a fact, and answering 200 would report a
 * success that never happened.
 */
export const MISSING_STORES = {
  cancellation: "research_membership_cancellations",
  sessions: "research_member_sessions",
  privacyRequests: "research_privacy_requests",
} as const;

const CANCEL_PENDING =
  "Cancelling online is not switched on yet, so nothing was cancelled and your membership is unchanged. Email the team and a person will cancel it for you.";
const SESSIONS_PENDING =
  "Sign-in history is not available yet. Your current session is unaffected.";
const PRIVACY_REQUEST_PENDING =
  "Data requests are not being recorded through this form yet, so nothing was submitted. Email the team and a person will handle it for you.";

function secure(res: Response): Response {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res;
}

/** The acting member, taken only from what the guard authenticated. Fails closed. */
function memberOf(req: Request): MemberRow | null {
  const member = (req as { researchMember?: MemberRow }).researchMember;
  return member && typeof member.id === "string" && member.id.length > 0 ? member : null;
}

/**
 * A calendar day in UTC, the format the membership surface renders (the page
 * prints the string as-is). Anything unparseable reads as absent rather than
 * as a guessed date.
 */
export function isoDay(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Rows for one member, or the empty list.
 *
 * Two rules, both deliberate. The filter is always the member the guard
 * resolved, so no request can widen it. The projection is always an explicit
 * column list rather than "*": the obligations table carries a method snapshot
 * and an admin verification record, and the ledger carries the acting admin,
 * none of which belong anywhere near a member-facing response even though the
 * views below would not serialize them.
 *
 * A missing table, a missing column, or a read error reads as the empty state.
 * These FM tables ship as separate migrations that land at different times, and
 * a member's own account page has to stay truthful rather than crash.
 */
async function rowsForMember(
  table: string,
  columns: string,
  memberId: string,
  orderColumn: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(table)
      .select(columns)
      .eq("member_id", memberId)
      .order(orderColumn, { ascending: false });
    if (error) return [];
    return (data as unknown as Array<Record<string, unknown>>) ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export type MembershipPaymentView = {
  id: string;
  at: string;
  label: string;
  amountCents: number;
  status: string;
};

export type MembershipAgreementView = {
  key: string;
  title: string;
  version: string;
  summary: string | null;
  accepted: boolean;
};

export type MembershipView = {
  status: string;
  startedAt: string | null;
  nextChargeAt: string | null;
  payments: MembershipPaymentView[];
  agreements: MembershipAgreementView[];
};

/**
 * What each ledger entry says in plain English. The ledger's signed amounts
 * are the record: a payment is positive, a reversal or refund is negative, and
 * the row states which it was rather than netting them into a total.
 */
const LEDGER_LABELS: Record<string, { label: string; status: string }> = {
  activation_payment: { label: "Activation (includes your first 30 days)", status: "Paid" },
  renewal_payment: { label: "30-day renewal", status: "Paid" },
  reversal: { label: "Payment reversed", status: "Reversed" },
  refund: { label: "Refund", status: "Refunded" },
};

/**
 * A reversal or a refund reads better when it names what it undid, and the
 * funding obligation is the only place that says so. When the obligation row
 * is not readable the generic label stands: naming the wrong payment would be
 * worse than naming none.
 */
const CORRECTION_LABELS: Record<string, Record<string, string>> = {
  reversal: {
    activation_50: "Activation payment reversed",
    renewal_25: "Renewal payment reversed",
  },
  refund: {
    activation_50: "Activation payment refunded",
    renewal_25: "Renewal payment refunded",
  },
};

/**
 * The member's payment history from the append-only ledger. A row with no
 * usable id, date, or amount is DROPPED rather than rendered with a filler
 * value, and a zero amount is impossible by database constraint and dropped
 * here too, so the surface can never print $0.
 */
export function paymentsFromLedger(
  ledgerRows: ReadonlyArray<Record<string, unknown>>,
  obligationTypeById: ReadonlyMap<string, string>,
): MembershipPaymentView[] {
  const payments: MembershipPaymentView[] = [];
  for (const row of ledgerRows) {
    const entryType = typeof row.entry_type === "string" ? row.entry_type : "";
    const known = LEDGER_LABELS[entryType];
    if (!known) continue;
    const id = typeof row.entry_id === "string" && row.entry_id.length > 0 ? row.entry_id : null;
    const at = isoDay(row.recorded_at);
    const amountCents = typeof row.amount_cents === "number" && Number.isFinite(row.amount_cents)
      ? Math.trunc(row.amount_cents)
      : null;
    if (id === null || at === null || amountCents === null || amountCents === 0) continue;
    const obligationId = typeof row.obligation_id === "string" ? row.obligation_id : "";
    const obligationType = obligationTypeById.get(obligationId) ?? "";
    const label = CORRECTION_LABELS[entryType]?.[obligationType] ?? known.label;
    payments.push({ id, at, label, amountCents, status: known.status });
  }
  return payments;
}

/**
 * The next renewal date is the end of the coverage the member has already
 * paid for. No period means no funded coverage, which is null (the page then
 * shows no renewal row at all) rather than a projected date.
 */
export function nextChargeFromPeriods(
  periodRows: ReadonlyArray<Record<string, unknown>>,
): string | null {
  let latest: number | null = null;
  for (const row of periodRows) {
    const endsAt = typeof row.ends_at === "string" ? Date.parse(row.ends_at) : Number.NaN;
    if (Number.isNaN(endsAt)) continue;
    if (latest === null || endsAt > latest) latest = endsAt;
  }
  return latest === null ? null : new Date(latest).toISOString().slice(0, 10);
}

/**
 * The paperwork register as the membership page shows it: the real keys,
 * titles, and versions from ./agreements, with the member's own acceptance
 * state. Every definition is honestly a draft today, and its version string
 * says so; nothing here marks a draft accepted or invents a summary.
 */
export function membershipAgreements(
  acceptance: ReadonlyArray<{ key: string; acceptedVersion: string | null }>,
): MembershipAgreementView[] {
  const acceptedByKey = new Map(acceptance.map((entry) => [entry.key, entry.acceptedVersion]));
  return AGREEMENT_DEFINITIONS.map((definition) => ({
    key: definition.key,
    title: definition.title,
    version: definition.version,
    summary: definition.content,
    accepted: acceptedByKey.get(definition.key) === definition.version,
  }));
}

// ---------------------------------------------------------------------------
// Privacy summary
// ---------------------------------------------------------------------------

export type PrivacyConsentView = {
  key: string;
  label: string;
  status: string;
  grantedAt: string | null;
};

export type PrivacyMediaView = { id: string; kind: string; addedAt: string };

export type PrivacySummaryView = {
  consents: PrivacyConsentView[];
  media: PrivacyMediaView[];
};

/** Plain-English names for the consent kinds the registry stores. */
const CONSENT_LABELS: Record<string, string> = {
  application_terms: "Application terms",
  marketing_email: "Marketing email",
  membership_covenant: "Membership covenant",
  research_use_policy: "Research use policy",
  age_attestation: "Age attestation",
  identity_verification: "Identity verification",
  health_data_collection: "Health data collection",
  data_export_archival: "Data export and archival",
};

const MEDIA_KIND_LABELS: Record<string, string> = {
  progress_photo: "Progress photo",
  voice_note: "Voice note",
  exercise_video: "Exercise video",
};

/**
 * The consent registry is append-only, so the LATEST row per kind is the
 * standing answer and a withdrawal is a later row with granted=false. A
 * withdrawn consent keeps its own status and carries no granted date, so the
 * page never shows a date beside "Withdrawn".
 */
export function consentsFromEvents(
  rows: ReadonlyArray<Record<string, unknown>>,
): PrivacyConsentView[] {
  const latest = new Map<string, { granted: boolean; createdAt: string }>();
  for (const row of rows) {
    const kind = typeof row.consent_kind === "string" ? row.consent_kind : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (kind.length === 0 || Number.isNaN(Date.parse(createdAt))) continue;
    const held = latest.get(kind);
    // Latest row per kind wins, compared by timestamp rather than by arrival,
    // so the answer does not depend on the order the database returned. A tie
    // keeps the row seen first, which under the newest-first query is the one
    // the registry itself would treat as latest.
    if (held && Date.parse(held.createdAt) >= Date.parse(createdAt)) continue;
    latest.set(kind, { granted: row.granted === true, createdAt });
  }
  return Array.from(latest.entries())
    .map(([kind, state]) => ({
      key: kind,
      label: CONSENT_LABELS[kind] ?? kind,
      status: state.granted ? "Granted" : "Withdrawn",
      grantedAt: state.granted ? isoDay(state.createdAt) : null,
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/**
 * The member's own stored media, as an inventory of what still exists. A row
 * whose object has been deleted is not listed: an inventory that lists deleted
 * objects as present is not an inventory.
 */
export function mediaFromRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): PrivacyMediaView[] {
  const media: PrivacyMediaView[] = [];
  for (const row of rows) {
    if (row.processing_state === "deleted") continue;
    const id = typeof row.id === "string" && row.id.length > 0 ? row.id : null;
    const kind = typeof row.kind === "string" ? row.kind : "";
    const addedAt = isoDay(row.uploaded_at);
    if (id === null || kind.length === 0 || addedAt === null) continue;
    media.push({ id, kind: MEDIA_KIND_LABELS[kind] ?? kind, addedAt });
  }
  return media;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMemberAccountApi(app: Express, _deps: MemberPlatformDeps) {
  // requireMember, not requireActiveMember: this is where a past_due member
  // goes to understand their own billing, so the page that explains a lapse
  // must not itself be closed by the lapse. It still resolves the member from
  // a verified, non-recovery session and refuses a closed account.
  app.get(MEMBER_ACCOUNT_PATHS.membership, requireMember, async (req: Request, res: Response) => {
    secure(res);
    const member = memberOf(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

    const [periodRows, ledgerRows, obligationRows, acceptance] = await Promise.all([
      rowsForMember(MEMBERSHIP_PERIODS_TABLE, "sequence, starts_at, ends_at", member.id, "sequence"),
      rowsForMember(
        LEDGER_TABLE,
        "entry_id, obligation_id, entry_type, amount_cents, recorded_at",
        member.id,
        "recorded_at",
      ),
      rowsForMember(OBLIGATIONS_TABLE, "id, type", member.id, "created_at"),
      acceptanceStateForMember(member.id).catch(() => []),
    ]);

    const obligationTypeById = new Map<string, string>();
    for (const row of obligationRows) {
      if (typeof row.id === "string" && typeof row.type === "string") {
        obligationTypeById.set(row.id, row.type);
      }
    }

    const membership: MembershipView = {
      status: typeof member.status === "string" ? member.status : "",
      startedAt: isoDay(member.activated_at),
      nextChargeAt: nextChargeFromPeriods(periodRows),
      payments: paymentsFromLedger(ledgerRows, obligationTypeById),
      agreements: membershipAgreements(acceptance),
    };
    return res.json({ ok: true, ...membership });
  });

  // Cancellation changes membership state, ends coverage, and has to survive a
  // dispute. There is no cancellation table in the shipped schema and this
  // lane does not author migrations, so the surface refuses instead of
  // recording the intent somewhere it does not belong or reporting a
  // cancellation that never happened.
  app.post(MEMBER_ACCOUNT_PATHS.cancel, requireMember, (req: Request, res: Response) => {
    secure(res);
    if (!memberOf(req)) return res.status(403).json({ ok: false, code: "membership_inactive" });
    return res.status(503).json({
      ok: false,
      code: "capability_disabled",
      message: CANCEL_PENDING,
      missingStore: MISSING_STORES.cancellation,
    });
  });

  // Sign-in history needs a session record per device. Supabase Auth owns the
  // sessions and does not expose a per-user session list to this server, and
  // there is no research session table, so there is nothing truthful to list.
  // Reporting an empty array would read as "you have no other sessions", which
  // is a claim this server cannot make.
  app.get(MEMBER_ACCOUNT_PATHS.securitySessions, requireMember, (req: Request, res: Response) => {
    secure(res);
    if (!memberOf(req)) return res.status(403).json({ ok: false, code: "membership_inactive" });
    return res.status(503).json({
      ok: false,
      code: "capability_disabled",
      message: SESSIONS_PENDING,
      missingStore: MISSING_STORES.sessions,
    });
  });

  // requireResearchSubject: a data-rights surface must stay reachable for a
  // subject whose membership has ended, which is exactly what that guard
  // exists for. It still requires a verified, non-recovery session.
  app.get(MEMBER_ACCOUNT_PATHS.privacySummary, requireResearchSubject, async (req: Request, res: Response) => {
    secure(res);
    const member = memberOf(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });

    const [consentRows, mediaRows] = await Promise.all([
      consentEventsForMember(member.id),
      rowsForMember(PRIVATE_MEDIA_TABLE, "id, kind, uploaded_at, processing_state", member.id, "uploaded_at"),
    ]);

    const summary: PrivacySummaryView = {
      consents: consentsFromEvents(consentRows),
      media: mediaFromRows(mediaRows),
    };
    return res.json({ ok: true, ...summary });
  });

  // Export, correction, and deletion are legal data-subject rights with a
  // response deadline, so the request itself has to be durable and auditable.
  // No privacy-request table exists, so each refuses truthfully and the page
  // shows the email path it already renders for this state.
  for (const path of [
    MEMBER_ACCOUNT_PATHS.privacyExport,
    MEMBER_ACCOUNT_PATHS.privacyCorrection,
    MEMBER_ACCOUNT_PATHS.privacyDeletion,
  ]) {
    app.post(path, requireResearchSubject, (req: Request, res: Response) => {
      secure(res);
      if (!memberOf(req)) return res.status(403).json({ ok: false, code: "membership_inactive" });
      return res.status(503).json({
        ok: false,
        code: "capability_disabled",
        message: PRIVACY_REQUEST_PENDING,
        missingStore: MISSING_STORES.privacyRequests,
      });
    });
  }
}

/**
 * The consent registry is keyed by (subject_type, subject_id), not member_id,
 * so it needs its own read. Same defensive posture as rowsForMember.
 */
async function consentEventsForMember(memberId: string): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(CONSENT_EVENTS_TABLE)
      .select("consent_kind, granted, created_at")
      .eq("subject_type", "member")
      .eq("subject_id", memberId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data as Array<Record<string, unknown>>) ?? [];
  } catch {
    return [];
  }
}
