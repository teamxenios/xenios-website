import crypto from "crypto";
import type { Express, Request } from "express";
import { z } from "zod";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
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
} from "./membership-emails";

// ---------------------------------------------------------------------------
// xenios research membership (Phase 4): application intake, the status state
// machine, and the admin review queue. Storage is Supabase (service key), same
// model as the waitlist: fail closed with 503 when unconfigured. Every status
// change is validated against ALLOWED_TRANSITIONS and recorded as an event.
// The $50 activation fee is Phase 5 (Stripe): approval leads to a branded
// "activation opens soon" state until payment is configured.
// ---------------------------------------------------------------------------

const APPROVAL_EXPIRY_DAYS = () => parseInt(process.env.RESEARCH_APPROVAL_EXPIRY_DAYS || "14", 10);

// Status-link tokens: HMAC-signed, applicant-facing, reveal status only.
function tokenKey(): Buffer {
  const secret =
    process.env.RESEARCH_SESSION_SECRET || `xenios-research-status:${process.env.RESEARCH_ACCESS_PASSWORD || ""}`;
  return crypto.createHash("sha256").update(secret).digest();
}

export function makeStatusToken(applicationId: string): string {
  const exp = Date.now() + 90 * 24 * 60 * 60 * 1000; // 90 days
  const payload = `${applicationId}.${exp}`;
  const sig = crypto.createHmac("sha256", tokenKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readStatusToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = crypto.createHmac("sha256", tokenKey()).update(`${id}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return id;
}

// Fixed-window rate limit for submissions (per IP).
const buckets = new Map<string, { count: number; resetAt: number }>();
function allowSubmit(req: Request): boolean {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (bucket.count >= 5) return false;
  bucket.count += 1;
  return true;
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
  // -------------------------------------------------------------------------
  // Applicant-facing
  // -------------------------------------------------------------------------
  app.post("/api/research/applications", async (req, res) => {
    try {
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ ok: true }); // honeypot: pretend success
      }
      if (!allowSubmit(req)) {
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
        // Resubmission after a request for more information updates the record.
        if (existing.status === "more_information_requested") {
          const updated = await transition(
            existing,
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
          return res.json({ ok: true, resubmitted: true, token: makeStatusToken(updated.id), status: updated.status });
        }
        // Otherwise: idempotent. Do not create a duplicate; return the status.
        return res.json({ ok: true, duplicate: true, token: makeStatusToken(existing.id), status: existing.status });
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

      const token = makeStatusToken(row.id);
      void sendApplicationReceived({ email: row.email, firstName: row.first_name, token }).catch(() => {});
      void sendInternalApplicationAlert({
        email: row.email,
        name: `${row.first_name} ${row.last_name}`,
        applicantType: a.applicantType,
      }).catch(() => {});

      // Log without PII beyond the id.
      console.log(`[research membership] application submitted ${row.id}`);
      res.json({ ok: true, token, status: row.status });
    } catch (error) {
      console.error("[research membership] submit error:", error);
      res.status(500).json({ ok: false, message: "The application could not be submitted. Please try again." });
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
      void sendMoreInformationRequested({
        email: row.email,
        firstName: row.first_name,
        token: makeStatusToken(row.id),
        note,
      }).catch(() => {});
    }));

  app.post("/api/admin/research/applications/:id/approve", requireSupabaseAdmin,
    adminAction(
      "approved_pending_payment",
      () => {
        const expires = new Date(Date.now() + APPROVAL_EXPIRY_DAYS() * 24 * 60 * 60 * 1000);
        return { reviewed_at: new Date().toISOString(), approval_expires_at: expires.toISOString() };
      },
      async (row) => {
        void sendApplicationApproved({
          email: row.email,
          firstName: row.first_name,
          token: makeStatusToken(row.id),
          approvalExpiresAt: new Date(row.approval_expires_at as string),
        }).catch(() => {});
      },
    ));

  app.post("/api/admin/research/applications/:id/decline", requireSupabaseAdmin,
    adminAction("declined", () => ({ reviewed_at: new Date().toISOString() }), async (row) => {
      void sendApplicationDeclined({ email: row.email, firstName: row.first_name }).catch(() => {});
    }));
}
