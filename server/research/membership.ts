import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
import { sessionSecretOk } from "./index";
import { linkApplicationToAttribution, markAttributionApproved, qualifyReferralForMembershipActivation } from "./referrals";
import { rateLimitHit, requestIp } from "./rate-limit";
import { enqueueNotification, runOutboxTick } from "./outbox";
import { adminRecipients } from "../services/email-config";
import {
  APPLICATION_INTERESTS,
  canTransition,
  type ApplicationStatus,
  type ApplicationStatusView,
} from "@shared/research/membership-types";
import {
  sendApplicationApproved,
  sendApplicationDeclined,
  sendApplicationReceived,
  sendInternalApplicationAlert,
  sendMoreInformationRequested,
  sendResubmittedConfirmation,
  sendStatusLink,
} from "./membership-emails";

// ---------------------------------------------------------------------------
// xenios research membership (Phase 4): application intake, the status state
// machine, and the admin review queue. Storage is Supabase (service key), same
// model as the waitlist: fail closed with 503 when unconfigured. Every status
// change is validated against ALLOWED_TRANSITIONS and recorded as an event.
// The $50 activation fee is Phase 5 (Stripe): approval leads to a branded
// "activation opens soon" state until payment is configured.
// ---------------------------------------------------------------------------

// NaN-guarded: a malformed env value must never produce an Invalid Date expiry.
export function approvalExpiryDays(): number {
  const n = parseInt(process.env.RESEARCH_APPROVAL_EXPIRY_DAYS || "14", 10);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

// Status-link tokens: HMAC-signed, applicant-facing, reveal status only.
// RESEARCH_SESSION_SECRET is REQUIRED in production (never derived from the
// access password). Without it, token issuance and verification fail closed.
function tokenKey(): Buffer {
  const secret = process.env.RESEARCH_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEARCH_SESSION_SECRET is required in production");
    }
    // Development-only fallback; never used in production and never the password.
    return crypto.createHash("sha256").update("xenios-research-dev-only-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

// Token purposes (ACCOUNT-EMAIL-SYSTEMS-001): a status link must not double as
// an account-claim credential. v2 tokens carry an explicit purpose inside the
// signed payload; the claim endpoint accepts only 'account_claim'. The signed
// payload starts with "v2." so the MAC domain can never collide with the gate
// cookie MAC (which signs "cookie.<expires>") or with legacy tokens.
export type TokenPurpose = "status" | "account_claim";

const DAY_MS = 24 * 60 * 60 * 1000;
// account_claim tracks the (configurable) approval window so a lengthened
// approval never outlives its own claim link; never below the 14-day default.
function tokenTtlMs(purpose: TokenPurpose): number {
  return purpose === "status" ? 90 * DAY_MS : Math.max(approvalExpiryDays(), 14) * DAY_MS;
}

function signTokenPayload(payload: string): string {
  return crypto.createHmac("sha256", tokenKey()).update(payload).digest("base64url");
}

function macEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function makeResearchToken(purpose: TokenPurpose, applicationId: string): string {
  const exp = Date.now() + tokenTtlMs(purpose);
  const payload = `v2.${purpose}.${applicationId}.${exp}`;
  return `${payload}.${signTokenPayload(payload)}`;
}

// Reads a token and returns the application id when the signature verifies,
// the token is unexpired, and its purpose is in the accepted set. Legacy
// unscoped tokens (three parts, minted before purposes existed) verify for
// every purpose until their own 90-day expiry runs out; they stop being
// minted with this change, so the grandfather window closes by itself.
export function readResearchToken(token: string, accepted: TokenPurpose[]): string | null {
  const parts = token.split(".");
  if (parts.length === 5 && parts[0] === "v2") {
    const [v, purpose, id, exp, sig] = parts;
    if (!macEqual(sig, signTokenPayload(`${v}.${purpose}.${id}.${exp}`))) return null;
    if (!accepted.includes(purpose as TokenPurpose)) return null;
    if (Number(exp) < Date.now()) return null;
    return id;
  }
  if (parts.length === 3) {
    const [id, exp, sig] = parts;
    if (!macEqual(sig, signTokenPayload(`${id}.${exp}`))) return null;
    if (Number(exp) < Date.now()) return null;
    return id;
  }
  return null;
}

export function makeStatusToken(applicationId: string): string {
  return makeResearchToken("status", applicationId);
}

// Status/resubmit reads: a claim-capable token also proves status access
// (claim implies status), so both purposes are accepted here.
export function readStatusToken(token: string): string | null {
  return readResearchToken(token, ["status", "account_claim"]);
}

// Which token purpose an application's emails should carry: once the
// application is claimable, its links must be claim-capable so the approved
// applicant can recover a lost approval email through resend-link.
export function tokenPurposeFor(status: ApplicationStatus): TokenPurpose {
  return status === "approved_pending_payment" || status === "payment_pending" || status === "active"
    ? "account_claim"
    : "status";
}

// Fixed-window rate limits, durable across instances (V3 section 71): the
// counters live in Postgres (research_rate_limit_hit) with an in-memory
// fallback when the database is unreachable. Email keys are hashed so no
// address ever lands in the rate-limit table.
function emailKey(email: string): string {
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);
}
async function allowSubmit(req: Request): Promise<boolean> {
  return rateLimitHit(`research-submit:${requestIp(req as any)}`, 600, 5);
}

// Stricter limiter for status-link resends. Per-IP overuse gets an explicit
// 429; the per-email cooldown is SILENT (generic success, nothing sent) so the
// limiter itself cannot be used to probe whether an address has an application.
async function resendVerdict(req: Request, email: string): Promise<"ok" | "ip_limited" | "email_cooldown"> {
  if (!(await rateLimitHit(`research-resend-ip:${requestIp(req as any)}`, 600, 3))) return "ip_limited";
  if (!(await rateLimitHit(`research-resend-email:${emailKey(email)}`, 600, 1))) return "email_cooldown";
  return "ok";
}

const applicationSchema = z.object({
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
  email: z.string().email().max(254).toLowerCase().trim(),
  phone: z.string().max(40).optional().default(""),
  country: z.string().min(2).max(80).trim(),
  region: z.string().max(80).optional().default(""),
  city: z.string().max(120).optional().default(""),
  ageConfirmed: z.literal(true),
  applicantType: z.enum(["individual", "professional"]),
  occupation: z.string().max(160).optional().default(""),
  organization: z.string().max(160).optional().default(""),
  interests: z.array(z.enum(APPLICATION_INTERESTS)).min(1).max(APPLICATION_INTERESTS.length),
  goalsText: z.string().min(10).max(1200).trim(),
  fitText: z.string().min(10).max(1200).trim(),
  referralSource: z.string().max(160).optional().default(""),
  referralCode: z.string().max(80).optional().default(""),
  acceptAccuracy: z.literal(true),
  acceptNoGuarantee: z.literal(true),
  acceptEducational: z.literal(true),
  acceptTerms: z.literal(true),
  marketingConsent: z.boolean().optional().default(false),
  website: z.string().optional(), // honeypot
});

type ApplicationRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: ApplicationStatus;
  submitted_at: string;
  approval_expires_at: string | null;
  [key: string]: unknown;
};

const APPLICATIONS = "research_applications";
const EVENTS = "research_application_events";

async function getApplication(id: string): Promise<ApplicationRow | null> {
  const { data, error } = await getSupabaseAdmin().from(APPLICATIONS).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ApplicationRow) ?? null;
}

async function getApplicationByEmail(email: string): Promise<ApplicationRow | null> {
  const { data, error } = await getSupabaseAdmin().from(APPLICATIONS).select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return (data as ApplicationRow) ?? null;
}

async function recordEvent(input: {
  applicationId: string;
  previousStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus | null;
  actorType: "applicant" | "admin" | "system";
  actorId?: string | null;
  reasonCode?: string | null;
  internalNote?: string | null;
  memberVisibleNote?: string | null;
}) {
  const { error } = await getSupabaseAdmin().from(EVENTS).insert({
    application_id: input.applicationId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    reason_code: input.reasonCode ?? null,
    internal_note: input.internalNote ?? null,
    member_visible_note: input.memberVisibleNote ?? null,
  });
  if (error) console.error("[research membership] event record failed:", error.message);
}

async function transition(
  row: ApplicationRow,
  to: ApplicationStatus,
  actor: { type: "applicant" | "admin" | "system"; id?: string | null },
  extras: Record<string, unknown> = {},
  notes: { internalNote?: string | null; memberVisibleNote?: string | null; reasonCode?: string | null } = {},
): Promise<ApplicationRow> {
  if (!canTransition(row.status, to)) {
    throw Object.assign(new Error(`Transition ${row.status} -> ${to} is not allowed`), { statusCode: 409 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from(APPLICATIONS)
    .update({ status: to, updated_at: new Date().toISOString(), ...extras })
    .eq("id", row.id)
    .eq("status", row.status) // optimistic guard against concurrent review
    .select()
    .single();
  if (error) throw error;
  await recordEvent({
    applicationId: row.id,
    previousStatus: row.status,
    newStatus: to,
    actorType: actor.type,
    actorId: actor.id ?? null,
    ...notes,
  });
  return data as ApplicationRow;
}

// Durable-first notification: enqueue in the outbox, then drain immediately so
// the happy path still delivers within the request. If the outbox itself is
// unavailable, fall back to the direct send so no notification is ever ONLY
// dependent on the queue. A failed send is retried by the worker either way.
async function notify(
  input: { eventKey: string; eventType: string; templateKey: string; recipient: string; applicationId?: string | null; payload?: Record<string, unknown> },
  fallback: () => Promise<unknown>,
) {
  let queued = false;
  try {
    queued = await enqueueNotification(input);
  } catch {
    queued = false;
  }
  if (queued) {
    try {
      await runOutboxTick();
    } catch {
      /* the worker interval will retry */
    }
  } else {
    void fallback().catch(() => {});
  }
}

function statusView(row: ApplicationRow, memberVisibleNote: string | null): ApplicationStatusView {
  return {
    status: row.status,
    firstName: row.first_name,
    submittedAt: row.submitted_at,
    memberVisibleNote,
    approvalExpiresAt: row.approval_expires_at,
  };
}

export function registerMembershipApi(app: Express) {
  // Fail closed: in production without RESEARCH_SESSION_SECRET, no signed
  // artifact can be issued or verified, so the whole membership API refuses.
  app.use("/api/research/applications", (_req, res, next) => {
    if (!sessionSecretOk()) {
      return res.status(503).json({ ok: false, message: "The membership system is not configured." });
    }
    next();
  });

  // -------------------------------------------------------------------------
  // Applicant-facing
  // -------------------------------------------------------------------------
  app.post("/api/research/applications", async (req, res) => {
    try {
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ ok: true }); // honeypot: pretend success
      }
      if (!(await allowSubmit(req))) {
        return res.status(429).json({ ok: false, message: "Too many submissions. Please try again in a few minutes." });
      }
      if (!supabaseConfigured()) {
        return res.status(503).json({ ok: false, message: "Applications are temporarily unavailable. Please try again shortly." });
      }
      const parsed = applicationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "Please review the application form.", issues: parsed.error.flatten() });
      }
      const a = parsed.data;
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;

      const existing = await getApplicationByEmail(a.email);
      if (existing) {
        // PRIVACY: never reveal that an application exists, its status, or its
        // token to the submitter. Send a fresh secure link to the address
        // already on file, and return the same generic response as a brand-new
        // submission. Matching an email never updates anything; updates require
        // a valid signed status token (see /resubmit).
        await notify(
          {
            eventKey: `status-link:${existing.id}:${Math.floor(Date.now() / 600000)}`,
            eventType: "status_link_requested_applicant",
            templateKey: "applicant_status_link",
            recipient: existing.email,
            applicationId: existing.id,
            payload: { firstName: existing.first_name, tokenPurpose: tokenPurposeFor(existing.status) },
          },
          () =>
            sendStatusLink({
              email: existing.email,
              firstName: existing.first_name,
              token: makeResearchToken(tokenPurposeFor(existing.status), existing.id),
            }),
        );
        return res.json({ ok: true });
      }

      const { data, error } = await getSupabaseAdmin()
        .from(APPLICATIONS)
        .insert({
          email: a.email,
          first_name: a.firstName,
          last_name: a.lastName,
          phone: a.phone || null,
          country: a.country,
          region: a.region || null,
          city: a.city || null,
          age_confirmed: true,
          applicant_type: a.applicantType,
          occupation: a.occupation || null,
          organization: a.organization || null,
          interests: a.interests,
          goals_text: a.goalsText,
          fit_text: a.fitText,
          referral_source: a.referralSource || null,
          referral_code: a.referralCode || null,
          marketing_consent: a.marketingConsent,
          status: "submitted",
          ip,
          source_page: typeof req.body?.source_page === "string" ? req.body.source_page.slice(0, 300) : null,
        })
        .select()
        .single();
      if (error) throw error;
      const row = data as ApplicationRow;

      await recordEvent({
        applicationId: row.id,
        previousStatus: null,
        newStatus: "submitted",
        actorType: "applicant",
        reasonCode: "application_submitted",
      });

      // The status token travels ONLY by email to the applicant's own address;
      // it is minted at SEND time by the outbox and never stored or returned.
      await notify(
        {
          eventKey: `application-received:${row.id}`,
          eventType: "application_received_applicant",
          templateKey: "applicant_received",
          recipient: row.email,
          applicationId: row.id,
          payload: { firstName: row.first_name, tokenPurpose: "status" },
        },
        () => sendApplicationReceived({ email: row.email, firstName: row.first_name, token: makeStatusToken(row.id) }),
      );
      for (const admin of adminRecipients()) {
        await notify(
          {
            eventKey: `admin-new-application:${row.id}:${admin}`,
            eventType: "application_received_admin",
            templateKey: "admin_new_application",
            recipient: admin,
            applicationId: row.id,
            payload: { applicantEmail: row.email, applicantName: `${row.first_name} ${row.last_name}`, applicantType: a.applicantType },
          },
          () =>
            sendInternalApplicationAlert({
              to: admin,
              email: row.email,
              name: `${row.first_name} ${row.last_name}`,
              applicantType: a.applicantType,
            }),
        );
      }

      // Referral attribution (flag-gated no-op while referrals are disabled;
      // never affects the application itself). Self-referral is recorded as
      // disqualified inside.
      void linkApplicationToAttribution({
        applicationId: row.id,
        referralCode: a.referralCode,
        applicantEmail: row.email,
        landingPath: typeof req.body?.source_page === "string" ? req.body.source_page.slice(0, 300) : null,
        applicantIp: ip,
      }).catch(() => {});

      // Log without PII beyond the id.
      console.log(`[research membership] application submitted ${row.id}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("[research membership] submit error:", error);
      res.status(500).json({ ok: false, message: "The application could not be submitted. Please try again." });
    }
  });

  // Resend a status link. Always the same generic response, whether or not an
  // application exists, whether or not the cooldown suppressed the send.
  app.post("/api/research/applications/resend-link", async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Temporarily unavailable." });
      const parsed = z.object({ email: z.string().email().max(254).toLowerCase().trim() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, message: "Enter a valid email address." });
      const verdict = await resendVerdict(req, parsed.data.email);
      if (verdict === "ip_limited") {
        return res.status(429).json({ ok: false, message: "Too many requests. Please try again in a few minutes." });
      }
      if (verdict === "ok") {
        const existing = await getApplicationByEmail(parsed.data.email);
        if (existing) {
          await notify(
            {
              eventKey: `status-link:${existing.id}:${Math.floor(Date.now() / 600000)}`,
              eventType: "status_link_requested_applicant",
              templateKey: "applicant_status_link",
              recipient: existing.email,
              applicationId: existing.id,
              payload: { firstName: existing.first_name, tokenPurpose: tokenPurposeFor(existing.status) },
            },
            () =>
              sendStatusLink({
                email: existing.email,
                firstName: existing.first_name,
                token: makeResearchToken(tokenPurposeFor(existing.status), existing.id),
              }),
          );
        }
      }
      // Generic either way: existence is never confirmed or denied.
      res.json({ ok: true, message: "If an application exists for that address, a secure status link is on its way." });
    } catch (error) {
      console.error("[research membership] resend error:", error);
      res.status(500).json({ ok: false, message: "The request could not be processed." });
    }
  });

  // Resubmit after a request for more information. Requires a VALID SIGNED
  // status token; matching an email alone can never modify an application.
  app.post("/api/research/applications/resubmit", async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Temporarily unavailable." });
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const id = token ? readStatusToken(token) : null;
      if (!id) return res.status(401).json({ ok: false, message: "This update link is not valid. Use the link from your email." });
      const row = await getApplication(id);
      if (!row) return res.status(404).json({ ok: false, message: "Application not found." });
      if (row.status !== "more_information_requested") {
        return res.status(409).json({ ok: false, message: "This application is not awaiting an update." });
      }
      const parsed = applicationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "Please review the application form.", issues: parsed.error.flatten() });
      }
      const a = parsed.data;
      // The email on file is authoritative; a submitted email is ignored.
      const updated = await transition(
        row,
        "resubmitted",
        { type: "applicant" },
        {
          first_name: a.firstName,
          last_name: a.lastName,
          phone: a.phone || null,
          country: a.country,
          region: a.region || null,
          city: a.city || null,
          applicant_type: a.applicantType,
          occupation: a.occupation || null,
          organization: a.organization || null,
          interests: a.interests,
          goals_text: a.goalsText,
          fit_text: a.fitText,
        },
        { reasonCode: "applicant_resubmitted" },
      );

      // Confirmation to the applicant, and the internal alert that was missing
      // before this change (a resubmission previously sat silently until an
      // admin polled the queue).
      // Bucketed per 10 minutes: rapid double-submits stay deduplicated, but
      // a LATER resubmission cycle (another request-info round) notifies again.
      const resubmitBucket = Math.floor(Date.now() / 600000);
      await notify(
        {
          eventKey: `resubmitted:${updated.id}:${resubmitBucket}`,
          eventType: "application_resubmitted_applicant",
          templateKey: "applicant_resubmitted",
          recipient: updated.email,
          applicationId: updated.id,
          payload: { firstName: updated.first_name, tokenPurpose: "status" },
        },
        () =>
          sendResubmittedConfirmation({
            email: updated.email,
            firstName: updated.first_name,
            token: makeStatusToken(updated.id),
          }),
      );
      for (const admin of adminRecipients()) {
        await notify(
          {
            eventKey: `admin-resubmitted:${updated.id}:${admin}:${resubmitBucket}`,
            eventType: "application_resubmitted_admin",
            templateKey: "admin_resubmitted",
            recipient: admin,
            applicationId: updated.id,
            payload: {
              applicantEmail: updated.email,
              applicantName: `${updated.first_name} ${updated.last_name}`,
              applicantType: (updated as any).applicant_type ?? "individual",
              kind: "resubmitted",
            },
          },
          () =>
            sendInternalApplicationAlert({
              to: admin,
              email: updated.email,
              name: `${updated.first_name} ${updated.last_name}`,
              applicantType: (updated as any).applicant_type ?? "individual",
              kind: "resubmitted",
            }),
        );
      }
      console.log(`[research membership] application resubmitted ${updated.id}`);
      res.json({ ok: true });
    } catch (error: any) {
      const code = error?.statusCode === 409 ? 409 : 500;
      if (code !== 409) console.error("[research membership] resubmit error:", error);
      res.status(code).json({ ok: false, message: code === 409 ? "This application is not awaiting an update." : "The update could not be submitted." });
    }
  });

  app.get("/api/research/applications/status", async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Status is temporarily unavailable." });
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const id = token ? readStatusToken(token) : null;
      if (!id) return res.status(401).json({ ok: false, message: "This status link is not valid." });
      const row = await getApplication(id);
      if (!row) return res.status(404).json({ ok: false, message: "Application not found." });
      // Latest member-visible note, if any (internal notes never leave the server).
      const { data } = await getSupabaseAdmin()
        .from(EVENTS)
        .select("member_visible_note")
        .eq("application_id", id)
        .not("member_visible_note", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const note = (data?.[0]?.member_visible_note as string | undefined) ?? null;
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, application: statusView(row, note) });
    } catch (error) {
      console.error("[research membership] status error:", error);
      res.status(500).json({ ok: false, message: "Status could not be loaded." });
    }
  });

  // -------------------------------------------------------------------------
  // Admin review (Supabase-JWT gated, same as the rest of /api/admin)
  // -------------------------------------------------------------------------
  app.get("/api/admin/research/applications", requireSupabaseAdmin, async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const queue = typeof req.query.queue === "string" ? req.query.queue : "all";
      let query = getSupabaseAdmin().from(APPLICATIONS).select("*").order("submitted_at", { ascending: false }).limit(200);
      const QUEUES: Record<string, ApplicationStatus[]> = {
        new: ["submitted", "resubmitted"],
        under_review: ["under_review"],
        needs_information: ["more_information_requested"],
        approved_awaiting_payment: ["approved_pending_payment", "payment_pending"],
        active: ["active"],
        declined: ["declined"],
        expired: ["expired", "withdrawn"],
      };
      if (queue !== "all" && QUEUES[queue]) query = query.in("status", QUEUES[queue]);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ ok: true, applications: data });
    } catch (error) {
      console.error("[research membership] admin list error:", error);
      res.status(500).json({ ok: false, message: "Could not load applications." });
    }
  });

  app.get("/api/admin/research/applications/:id", requireSupabaseAdmin, async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const row = await getApplication(String(req.params.id));
      if (!row) return res.status(404).json({ ok: false, message: "Not found" });
      const { data: events } = await getSupabaseAdmin()
        .from(EVENTS)
        .select("*")
        .eq("application_id", row.id)
        .order("created_at", { ascending: true });
      res.json({ ok: true, application: row, events: events ?? [] });
    } catch (error) {
      console.error("[research membership] admin detail error:", error);
      res.status(500).json({ ok: false, message: "Could not load the application." });
    }
  });

  const adminAction = (
    to: ApplicationStatus,
    extras?: (row: ApplicationRow, body: any) => Record<string, unknown>,
    after?: (row: ApplicationRow, body: any) => Promise<void>,
  ) =>
    async (req: Request, res: any) => {
      try {
        if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
        const row = await getApplication(String(req.params.id));
        if (!row) return res.status(404).json({ ok: false, message: "Not found" });
        const adminEmail = (req as any).adminEmail as string | undefined;
        const internalNote = typeof req.body?.internalNote === "string" ? req.body.internalNote.slice(0, 2000) : null;
        const memberVisibleNote =
          typeof req.body?.memberVisibleNote === "string" ? req.body.memberVisibleNote.slice(0, 1000) : null;
        const updated = await transition(
          row,
          to,
          { type: "admin", id: adminEmail ?? "admin" },
          extras ? extras(row, req.body) : {},
          { internalNote, memberVisibleNote },
        );
        if (after) await after(updated, req.body);
        res.json({ ok: true, application: updated });
      } catch (error: any) {
        const code = error?.statusCode === 409 ? 409 : 500;
        if (code !== 409) console.error("[research membership] admin action error:", error);
        res.status(code).json({ ok: false, message: code === 409 ? error.message : "The action failed." });
      }
    };

  app.post("/api/admin/research/applications/:id/review", requireSupabaseAdmin,
    adminAction("under_review", () => ({ review_started_at: new Date().toISOString() })));

  app.post("/api/admin/research/applications/:id/request-info", requireSupabaseAdmin,
    adminAction("more_information_requested", undefined, async (row, body) => {
      const note = typeof body?.memberVisibleNote === "string" ? body.memberVisibleNote : null;
      await notify(
        {
          eventKey: `more-info:${row.id}:${Date.now()}`,
          eventType: "more_information_requested_applicant",
          templateKey: "applicant_more_info",
          recipient: row.email,
          applicationId: row.id,
          payload: { firstName: row.first_name, note, tokenPurpose: "status" },
        },
        () => sendMoreInformationRequested({ email: row.email, firstName: row.first_name, token: makeStatusToken(row.id), note }),
      );
    }));

  app.post("/api/admin/research/applications/:id/approve", requireSupabaseAdmin,
    adminAction(
      "approved_pending_payment",
      () => {
        const expires = new Date(Date.now() + approvalExpiryDays() * DAY_MS);
        return { reviewed_at: new Date().toISOString(), approval_expires_at: expires.toISOString() };
      },
      async (row) => {
        // Referral visibility: the attribution (if any) advances to approved.
        // Qualification still happens only at verified activation.
        void markAttributionApproved(row.id).catch(() => {});
        await notify(
          {
            eventKey: `approved:${row.id}`,
            eventType: "application_approved_applicant",
            templateKey: "applicant_approved",
            recipient: row.email,
            applicationId: row.id,
            payload: { firstName: row.first_name, approvalExpiresAt: row.approval_expires_at, tokenPurpose: "account_claim" },
          },
          () =>
            sendApplicationApproved({
              email: row.email,
              firstName: row.first_name,
              token: makeResearchToken("account_claim", row.id),
              approvalExpiresAt: new Date(row.approval_expires_at as string),
            }),
        );
      },
    ));

  // ---------------------------------------------------------------------------
  // Activation (interim, admin-verified) behind RESEARCH_MEMBERSHIP_BILLING_ENABLED
  // (default FALSE): while billing is off there is NO path to an active member
  // and NO path to referral qualification. Membership is a $50 one-time
  // activation PLUS a $25 recurring monthly membership; a member becomes
  // active only when BOTH are verified, so activation requires both the
  // activation payment reference and the active monthly-membership reference.
  // Phase 5 replaces the attestations with verified Stripe webhook events.
  // ---------------------------------------------------------------------------
  const billingEnabled = () => process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED === "true";
  const requireBillingEnabled = (_req: Request, res: Response, next: NextFunction) => {
    if (!billingEnabled()) {
      return res.status(503).json({
        ok: false,
        message: "Membership billing is not enabled (RESEARCH_MEMBERSHIP_BILLING_ENABLED=false). Activation is disabled until billing verification is live.",
      });
    }
    next();
  };

  app.post("/api/admin/research/applications/:id/begin-activation", requireSupabaseAdmin,
    requireBillingEnabled, adminAction("payment_pending", undefined, async () => {}));

  app.post("/api/admin/research/applications/:id/activate", requireSupabaseAdmin, requireBillingEnabled, async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const row = await getApplication(String(req.params.id));
      if (!row) return res.status(404).json({ ok: false, message: "Not found" });

      // The applicant must have claimed their account: activation binds to a member.
      const { data: member } = await getSupabaseAdmin()
        .from("research_members")
        .select("*")
        .eq("application_id", row.id)
        .maybeSingle();
      if (!member) {
        return res.status(409).json({ ok: false, message: "The applicant has not created their member account yet. Ask them to use the link in their approval email first." });
      }

      const adminEmail = (req as any).adminEmail as string | undefined;
      // Both attestations are REQUIRED (fail closed): the $50 activation
      // payment AND the active $25 monthly membership. A single click must
      // never mint an active member or referral credit with anything
      // unverified behind it (V3 section 71).
      const ref = (field: string) =>
        typeof req.body?.[field] === "string" && req.body[field].trim()
          ? (req.body[field].trim().slice(0, 120) as string)
          : null;
      const paymentReference = ref("paymentReference");
      const subscriptionReference = ref("subscriptionReference");
      if (!paymentReference || !subscriptionReference) {
        return res.status(400).json({
          ok: false,
          message: "Activation requires BOTH references: the verified $50 activation payment (paymentReference) and the active $25 monthly membership (subscriptionReference).",
        });
      }

      // Idempotent recovery: if a previous activation attempt moved the
      // application but failed on the member update, a retry must not 409 on
      // the active -> active transition.
      const updated =
        row.status === "active"
          ? row
          : await transition(
              row,
              "active",
              { type: "admin", id: adminEmail ?? "admin" },
              {},
              {
                reasonCode: "admin_verified_activation",
                internalNote: `payment_reference=${paymentReference} subscription_reference=${subscriptionReference}`,
              },
            );

      // Admin-verified activation IS billing verification (both references
      // required above), so billing_state becomes active together with the
      // member status. Pre-migration schemas have no billing_state column;
      // retry without it so activation never silently fails.
      const activatedAt = new Date();
      const memberPatch = {
        status: "active",
        activated_at: activatedAt.toISOString(),
        updated_at: activatedAt.toISOString(),
      };
      let { error: memberUpdateError } = await getSupabaseAdmin()
        .from("research_members")
        .update({ ...memberPatch, billing_state: "active" })
        .eq("id", (member as any).id);
      if (memberUpdateError && /billing_state|column|schema/i.test(String(memberUpdateError.message ?? ""))) {
        ({ error: memberUpdateError } = await getSupabaseAdmin()
          .from("research_members")
          .update(memberPatch)
          .eq("id", (member as any).id));
      }
      if (memberUpdateError) {
        console.error("[research membership] member activation update failed:", memberUpdateError.message);
        return res.status(500).json({ ok: false, message: "The member record could not be activated. Retry the activation." });
      }

      // Referral qualification: the same idempotent service a Stripe webhook
      // will call in Phase 5. Flag-gated inside; failures never block activation.
      const qualification = await qualifyReferralForMembershipActivation({
        applicationId: row.id,
        memberId: (member as any).id,
        paymentId: paymentReference,
        activationTimestamp: activatedAt,
      }).catch(() => ({ qualified: false, reason: "qualification_error" }));

      res.json({ ok: true, application: updated, referral: qualification });
    } catch (error: any) {
      const code = error?.statusCode === 409 ? 409 : 500;
      if (code !== 409) console.error("[research membership] activate error:", error);
      res.status(code).json({ ok: false, message: code === 409 ? error.message : "The activation failed." });
    }
  });

  app.post("/api/admin/research/applications/:id/decline", requireSupabaseAdmin,
    adminAction("declined", () => ({ reviewed_at: new Date().toISOString() }), async (row) => {
      await notify(
        {
          eventKey: `declined:${row.id}`,
          eventType: "application_declined_applicant",
          templateKey: "applicant_declined",
          recipient: row.email,
          applicationId: row.id,
          payload: { firstName: row.first_name },
        },
        () => sendApplicationDeclined({ email: row.email, firstName: row.first_name }),
      );
    }));
}
