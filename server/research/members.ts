import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";
import { readStatusToken } from "./membership";
import { createReferralIdentity, getLedgerBalance, referralsEnabled } from "./referrals";
import { rateLimitHit, requestIp } from "./rate-limit";
import type { ReferralDashboardState } from "@shared/research/referral-types";

// ---------------------------------------------------------------------------
// xenios research member accounts (V3 sections 13, 83 Then item 3), plus the
// two backend contracts CODEX_UI requested in the UI-002 handoff:
//   GET /api/research/member/referrals  -> ReferralDashboardState (aggregates only)
//   GET /api/research/invite/:code      -> { valid, code? } (never the referrer's identity)
//
// Claiming model: the signed status link was delivered to the applicant's email,
// so presenting a valid token IS proof of email ownership. Claiming creates a
// Supabase Auth user with the email pre-confirmed and a member row bound to the
// application. Sign-in uses the site's existing Supabase browser auth. Every
// protected route re-verifies the JWT server-side; there is no UI-only gating.
// ---------------------------------------------------------------------------

const MEMBERS = "research_members";
const APPLICATIONS = "research_applications";
const IDENTITIES = "referral_identities";
const ATTRIBUTIONS = "referral_attributions";
const REWARDS = "referral_rewards";

const CLAIMABLE_STATUSES = new Set(["approved_pending_payment", "payment_pending", "active"]);

const claimSchema = z.object({
  token: z.string().min(10).max(400),
  password: z.string().min(10).max(200),
});

// Small fixed-window limiter on claim attempts (per IP), durable across
// instances via research_rate_limit_hit with an in-memory fallback.
async function allowClaim(req: Request): Promise<boolean> {
  return rateLimitHit(`research-claim:${requestIp(req as any)}`, 600, 10);
}

type MemberRow = {
  id: string;
  application_id: string;
  auth_user_id: string;
  email: string;
  first_name: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
};

async function getMemberByEmail(email: string): Promise<MemberRow | null> {
  const { data, error } = await getSupabaseAdmin().from(MEMBERS).select("*").eq("email", email.toLowerCase()).maybeSingle();
  if (error) return null;
  return (data as MemberRow) ?? null;
}

// Server-side member guard: verifies the Supabase JWT and resolves the member
// row. Never trusts hidden UI; attaches the member for downstream handlers.
export async function requireMember(req: Request, res: Response, next: NextFunction) {
  try {
    if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured." });
    const header = req.headers.authorization || "";
    const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!jwt) return res.status(401).json({ ok: false, message: "Sign in required." });
    const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
    if (error || !data?.user?.email) return res.status(401).json({ ok: false, message: "Sign in required." });
    const member = await getMemberByEmail(data.user.email);
    if (!member || member.status === "closed") {
      return res.status(403).json({ ok: false, message: "No research membership for this account." });
    }
    (req as any).researchMember = member;
    next();
  } catch (err) {
    console.error("[research members] auth error:", err);
    res.status(401).json({ ok: false, message: "Sign in required." });
  }
}

export function registerMemberApi(app: Express) {
  // Claim: approved applicant + signed token -> auth user + member row.
  app.post("/api/research/member/claim", async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Temporarily unavailable." });
      if (!(await allowClaim(req))) return res.status(429).json({ ok: false, message: "Too many attempts. Try again in a few minutes." });
      const parsed = claimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "Enter the link token and a password of at least 10 characters." });
      }
      const applicationId = readStatusToken(parsed.data.token);
      if (!applicationId) return res.status(401).json({ ok: false, message: "This link is not valid. Use the most recent link from your email." });

      const { data: application } = await getSupabaseAdmin().from(APPLICATIONS).select("*").eq("id", applicationId).maybeSingle();
      if (!application) return res.status(404).json({ ok: false, message: "Application not found." });
      if (!CLAIMABLE_STATUSES.has((application as any).status)) {
        return res.status(409).json({ ok: false, message: "Your account opens after approval. Check your application status." });
      }

      const email = String((application as any).email).toLowerCase();
      const existing = await getMemberByEmail(email);
      if (existing) return res.status(409).json({ ok: false, message: "This account is already set up. Sign in instead." });

      // Email ownership was proven by the emailed token: confirm the email.
      const { data: created, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
        email,
        password: parsed.data.password,
        email_confirm: true,
      });
      if (authError || !created?.user) {
        const already = String(authError?.message ?? "").toLowerCase().includes("already");
        return res
          .status(already ? 409 : 500)
          .json({ ok: false, message: already ? "This account is already set up. Sign in instead." : "The account could not be created. Please try again." });
      }

      const { error: memberError } = await getSupabaseAdmin().from(MEMBERS).insert({
        application_id: applicationId,
        auth_user_id: created.user.id,
        email,
        first_name: (application as any).first_name,
        status: (application as any).status === "active" ? "active" : "pending_activation",
      });
      if (memberError) {
        console.error("[research members] member insert failed:", memberError.message);
        return res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
      }
      console.log(`[research members] claimed for application ${applicationId}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("[research members] claim error:", error);
      res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
    }
  });

  // Session probe for the auth-aware navigation (V3 section 4.3).
  app.get("/api/research/member/me", requireMember, async (req, res) => {
    const member = (req as any).researchMember as MemberRow;
    const { data: application } = await getSupabaseAdmin()
      .from(APPLICATIONS)
      .select("status")
      .eq("id", member.application_id)
      .maybeSingle();
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      member: {
        firstName: member.first_name,
        status: member.status,
        applicationStatus: (application as any)?.status ?? null,
        memberSince: member.created_at,
      },
    });
  });

  // CODEX_UI contract: aggregate referral dashboard state. Aggregates ONLY;
  // no individual activity rows, no invitee identities (UI-002 handoff +
  // shared/research/referral-types.ts).
  app.get("/api/research/member/referrals", requireMember, async (req, res) => {
    const member = (req as any).researchMember as MemberRow;
    res.set("Cache-Control", "no-store");
    const empty: ReferralDashboardState = {
      enabled: false,
      code: null,
      counts: { visits: 0, applications: 0, qualified: 0 },
      creditAvailableCents: 0,
      creditPendingCents: 0,
    };
    if (!referralsEnabled()) return res.json({ ok: true, referrals: empty });

    try {
      let { data: identity } = await getSupabaseAdmin()
        .from(IDENTITIES)
        .select("*")
        .eq("owner_email", member.email)
        .eq("status", "active")
        .maybeSingle();

      // Issue the member's referral identity on first eligible access. Only
      // ACTIVE members share; pending members see "available after activation".
      if (!identity && member.status === "active") {
        const created = await createReferralIdentity({
          ownerType: "member",
          ownerId: member.id,
          ownerEmail: member.email,
        });
        if (created) {
          const { data: fresh } = await getSupabaseAdmin()
            .from(IDENTITIES)
            .select("*")
            .eq("id", created.id)
            .maybeSingle();
          identity = fresh;
        }
      }
      if (!identity) {
        return res.json({
          ok: true,
          referrals: { ...empty, enabled: true, eligible: member.status === "active" },
        });
      }

      const { data: attributions } = await getSupabaseAdmin()
        .from(ATTRIBUTIONS)
        .select("status")
        .eq("referral_identity_id", (identity as any).id);
      const rows = (attributions as any[]) ?? [];
      const applications = rows.filter((r) =>
        ["application-submitted", "approved", "activated", "qualified"].includes(r.status),
      ).length;
      const qualified = rows.filter((r) => r.status === "qualified").length;

      const { data: held } = await getSupabaseAdmin()
        .from(REWARDS)
        .select("value_cents")
        .eq("recipient_member_id", (identity as any).owner_id)
        .eq("status", "held");
      const pending = ((held as any[]) ?? []).reduce((sum, r) => sum + (r.value_cents ?? 0), 0);

      const state: ReferralDashboardState = {
        enabled: true,
        code: (identity as any).code,
        eligible: true,
        counts: { visits: rows.length, applications, qualified },
        creditAvailableCents: await getLedgerBalance((identity as any).owner_id),
        creditPendingCents: pending,
      };
      res.json({ ok: true, referrals: state });
    } catch (error) {
      console.error("[research members] referrals state error:", error);
      res.json({ ok: true, referrals: empty });
    }
  });

  // CODEX_UI contract: public invitation validation. Returns validity only;
  // never the referrer's identity, email, or ids.
  app.get("/api/research/invite/:code", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!referralsEnabled() || !supabaseConfigured()) return res.json({ ok: true, invitation: { valid: false } });
    try {
      const code = String(req.params.code || "").trim();
      if (!code || code.length > 40) return res.json({ ok: true, invitation: { valid: false } });
      const { data: identity } = await getSupabaseAdmin()
        .from(IDENTITIES)
        .select("code,status")
        .eq("code", code)
        .eq("status", "active")
        .maybeSingle();
      if (!identity) return res.json({ ok: true, invitation: { valid: false } });
      res.json({ ok: true, invitation: { valid: true, code: (identity as any).code } });
    } catch {
      res.json({ ok: true, invitation: { valid: false } });
    }
  });
}
