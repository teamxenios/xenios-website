import crypto from "crypto";
import type { Express, Request } from "express";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";
import { readResearchToken } from "./membership";
import { enqueueNotification, runOutboxTick } from "./outbox";
import { createReferralIdentity, getLedgerBalance, referralsEnabled } from "./referrals";
import { rateLimitHit, requestIp } from "./rate-limit";
import type { ReferralDashboardState } from "@shared/research/referral-types";

// ---------------------------------------------------------------------------
// xenios research member accounts (V3 sections 13, 83 Then item 3), plus the
// two backend contracts CODEX_UI requested in the UI-002 handoff:
//   GET /api/research/member/referrals  -> ReferralDashboardState (aggregates only)
//   GET /api/research/invite/:code      -> { valid, code? } (never the referrer's identity)
//
// Claiming model: the signed CLAIM link was delivered to the applicant's email,
// so presenting a valid claim-purpose token IS proof of email ownership (a
// pre-approval status link can never claim; see membership.ts token purposes).
// Claiming creates a Supabase Auth user with the email pre-confirmed and a
// member row bound to the application. Sign-in uses the site's existing
// Supabase browser auth. Every protected route re-verifies the JWT
// server-side; there is no UI-only gating.
// ---------------------------------------------------------------------------

const MEMBERS = "research_members";
const APPLICATIONS = "research_applications";
const IDENTITIES = "referral_identities";
const ATTRIBUTIONS = "referral_attributions";
const REWARDS = "referral_rewards";

const CLAIMABLE_STATUSES = new Set(["approved_pending_payment", "payment_pending", "active"]);

const SITE = process.env.SITE_URL || "https://xeniostechnology.com";

const claimSchema = z.object({
  token: z.string().min(10).max(400),
  password: z.string().min(10).max(200),
});

// Rate-limit keys never store a raw address.
function hashedEmail(email: string): string {
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);
}

// Small fixed-window limiter on claim attempts (per IP), durable across
// instances via research_rate_limit_hit with an in-memory fallback.
async function allowClaim(req: Request): Promise<boolean> {
  return rateLimitHit(`research-claim:${requestIp(req as any)}`, 600, 10);
}

// The member guards and row type live in member-auth.ts (shared with the
// member-authed research APIs); re-exported here for existing importers.
export { requireMember } from "./member-auth";
import { getMemberByEmail, requireMember, type MemberRow } from "./member-auth";

// Resolve a Supabase Auth user by email through the admin API. Used only to
// heal a stranded claim (auth user exists, member row does not); the member
// base is small, so a bounded page scan is fine.
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  try {
    const admin = getSupabaseAdmin().auth.admin as any;
    if (typeof admin.listUsers !== "function") return null;
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await admin.listUsers({ page, perPage: 200 });
      if (error) return null;
      const users: any[] = data?.users ?? [];
      const match = users.find((user) => String(user?.email ?? "").toLowerCase() === email);
      if (match?.id) return { id: String(match.id) };
      if (users.length < 200) return null;
    }
    return null;
  } catch {
    return null;
  }
}

export function registerMemberApi(app: Express) {
  // Claim: approved applicant + signed claim token -> auth user + member row.
  app.post("/api/research/member/claim", async (req, res) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Temporarily unavailable." });
      if (!(await allowClaim(req))) return res.status(429).json({ ok: false, message: "Too many attempts. Try again in a few minutes." });
      const parsed = claimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "Enter the link token and a password of at least 10 characters." });
      }
      // Purpose scoping (ACCOUNT-EMAIL-SYSTEMS-001): only a claim-capable token
      // (minted for an approved application, or a legacy pre-purpose token)
      // can create an account. A pre-approval status link can never claim.
      const applicationId = readResearchToken(parsed.data.token, ["account_claim"]);
      if (!applicationId) return res.status(401).json({ ok: false, message: "This link is not valid. Use the most recent link from your email." });

      const { data: application } = await getSupabaseAdmin().from(APPLICATIONS).select("*").eq("id", applicationId).maybeSingle();
      if (!application) return res.status(404).json({ ok: false, message: "Application not found." });
      if (!CLAIMABLE_STATUSES.has((application as any).status)) {
        return res.status(409).json({ ok: false, message: "Your account opens after approval. Check your application status." });
      }
      const approvalExpiresAt = (application as any).approval_expires_at as string | null;
      if ((application as any).status === "approved_pending_payment" && approvalExpiresAt && Date.parse(approvalExpiresAt) < Date.now()) {
        return res.status(409).json({ ok: false, message: "This approval has expired. Contact research support to reopen it." });
      }

      const email = String((application as any).email).toLowerCase();
      const memberStatus = (application as any).status === "active" ? "active" : "pending_activation";
      const existing = await getMemberByEmail(email);
      if (existing) return res.status(409).json({ ok: false, message: "This account is already set up. Sign in instead." });

      const insertMemberRow = async (authUserId: string) => {
        const base = {
          application_id: applicationId,
          auth_user_id: authUserId,
          email,
          first_name: (application as any).first_name,
          status: memberStatus,
        };
        // An already-active application means billing was verified at
        // activation; record it when the billing_state column exists
        // (pre-migration schemas retry without it).
        const payload = memberStatus === "active" ? { ...base, billing_state: "active" } : base;
        let { error } = await getSupabaseAdmin().from(MEMBERS).insert(payload);
        if (error && memberStatus === "active" && /billing_state|column|schema/i.test(String(error.message ?? ""))) {
          ({ error } = await getSupabaseAdmin().from(MEMBERS).insert(base));
        }
        return error ?? null;
      };

      const confirmClaim = async () => {
        try {
          const queued = await enqueueNotification({
            eventKey: `claim-success:${applicationId}`,
            eventType: "account_claim_success_applicant",
            templateKey: "account_claim_success",
            recipient: email,
            applicationId,
            payload: { firstName: (application as any).first_name },
          });
          if (queued) await runOutboxTick();
        } catch {
          /* the confirmation email is best-effort; the claim itself succeeded */
        }
      };

      // Email ownership was proven by the emailed claim token: confirm the email.
      const { data: created, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
        email,
        password: parsed.data.password,
        email_confirm: true,
      });
      if (authError || !created?.user) {
        const already = String(authError?.message ?? "").toLowerCase().includes("already");
        if (!already) {
          return res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
        }
        // An auth user exists but no member row does: a previous claim died
        // between the two writes (the "bricked account" failure). The claim
        // token proves email ownership, so complete the claim: reset the
        // password on the stranded auth user and create the member row.
        const stranded = await findAuthUserByEmail(email);
        if (!stranded) {
          return res.status(409).json({ ok: false, message: "This account is already set up. Sign in instead." });
        }
        const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(stranded.id, {
          password: parsed.data.password,
          email_confirm: true,
        } as any);
        if (updateError) {
          console.error("[research members] stranded-claim password reset failed:", updateError.message);
          return res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
        }
        const memberError = await insertMemberRow(stranded.id);
        if (memberError && !String(memberError.message ?? "").toLowerCase().includes("duplicate")) {
          console.error("[research members] stranded-claim member insert failed:", memberError.message);
          return res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
        }
        console.log(`[research members] stranded claim completed for application ${applicationId}`);
        await confirmClaim();
        return res.json({ ok: true });
      }

      const memberError = await insertMemberRow(created.user.id);
      if (memberError) {
        if (String(memberError.message ?? "").toLowerCase().includes("duplicate")) {
          // A concurrent claim for the same application won the insert; the
          // account exists and this claimant proved the same email. Done.
          console.log(`[research members] concurrent claim resolved for application ${applicationId}`);
          await confirmClaim();
          return res.json({ ok: true });
        }
        console.error("[research members] member insert failed:", memberError.message);
        // Compensate: never leave a confirmed auth user with no member row
        // (the previous behavior permanently bricked the email address).
        try {
          await (getSupabaseAdmin().auth.admin as any).deleteUser?.(created.user.id);
        } catch (cleanupError) {
          console.error("[research members] orphan auth-user cleanup failed:", (cleanupError as Error).message);
        }
        return res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
      }
      console.log(`[research members] claimed for application ${applicationId}`);
      await confirmClaim();
      res.json({ ok: true });
    } catch (error) {
      console.error("[research members] claim error:", error);
      res.status(500).json({ ok: false, message: "The account could not be created. Please try again." });
    }
  });

  // Forgot password: server-mediated Supabase recovery email. Always the same
  // generic response, whether or not a member exists (no enumeration); per-IP
  // overuse gets an explicit 429 and the per-email cooldown stays SILENT.
  app.post("/api/research/member/forgot-password", async (req, res) => {
    const generic = {
      ok: true,
      message: "If a member account exists for that address, a password reset email is on its way.",
    };
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Temporarily unavailable." });
      const parsed = z.object({ email: z.string().email().max(254).toLowerCase().trim() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, message: "Enter a valid email address." });
      if (!(await rateLimitHit(`research-forgot-ip:${requestIp(req as any)}`, 600, 3))) {
        return res.status(429).json({ ok: false, message: "Too many requests. Please try again in a few minutes." });
      }
      if (!(await rateLimitHit(`research-forgot-email:${hashedEmail(parsed.data.email)}`, 600, 1))) {
        return res.json(generic);
      }
      const member = await getMemberByEmail(parsed.data.email);
      if (member && member.status !== "closed") {
        // Fire-and-forget: the response returns on the same path for existing
        // and unknown addresses, so completion timing cannot enumerate.
        void getSupabaseAnon()
          .auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${SITE}/research/reset-password` })
          .then(({ error }: { error: { message: string } | null }) => {
            if (error) console.warn("[research members] reset email failed:", error.message);
          })
          .catch(() => {});
      }
      res.json(generic);
    } catch (error) {
      console.error("[research members] forgot-password error:", error);
      res.json(generic);
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
