import type { NextFunction, Request, Response } from "express";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";

// ---------------------------------------------------------------------------
// Authentication-PURPOSE check (PR #25 correction pass, founder-confirmed
// blocker 3): a password-recovery session must never act as a normal member
// or admin session, even when it maps to an active member or the admin email.
//
// Trust model (server-verifiable, not forgeable by the browser): Supabase
// signs the session's Authentication Method References into the access
// token's `amr` claim. Evidence from the installed SDK
// (node_modules/@supabase/auth-js/dist/module/lib/types.d.ts):
//   AMRMethods = ["password","otp","oauth","totp","mfa/totp","mfa/phone",
//                 "mfa/webauthn","anonymous","sso/saml","magiclink","web3",
//                 "oauth_provider/authorization_code"]
//   JwtPayload.amr?: AMREntry[] | string[]   (object OR RFC-8176 string form)
// A recovery-email link is verified through GoTrue's one-time-password path
// (amr method "otp"); a normal member sign-in uses signInWithPassword (amr
// method "password"). We therefore classify a session as LIMITED-PURPOSE
// (recovery-grade) when its amr claim exists and contains NO full-purpose
// method. auth.getUser() has already proven the token authentic before the
// claim is decoded, so the amr content is Supabase-attested, not client
// input; sessionStorage, headers, query parameters, and route names are
// never consulted.
//
// Tokens WITHOUT an amr claim (older projects, custom access-token hooks
// that strip it) are treated as normal sessions: members authenticate only
// via signInWithPassword in this product, and the client-side recovery flow
// additionally signs the recovery session out on completion or abandonment.
// This tolerance is documented as a residual risk in the PR.
// ---------------------------------------------------------------------------

const FULL_PURPOSE_AMR_METHODS = new Set([
  "password",
  "oauth",
  "sso/saml",
  "totp",
  "mfa/totp",
  "mfa/phone",
  "mfa/webauthn",
  "web3",
  "oauth_provider/authorization_code",
]);

// Decodes the (already server-verified) JWT's payload. Returns null for
// anything that does not parse; callers treat null as "no claims available".
export function decodeJwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(payload);
    return typeof claims === "object" && claims !== null ? claims : null;
  } catch {
    return null;
  }
}

// True when the token's amr claim marks a limited-purpose (recovery-grade)
// session: an amr is present and no full-purpose method appears in it.
// Handles both claim shapes the SDK documents.
export function isRecoveryPurposeSession(jwt: string): boolean {
  const claims = decodeJwtClaims(jwt);
  const amr = claims?.amr;
  if (!Array.isArray(amr) || amr.length === 0) return false;
  return !amr.some((entry) => {
    const method = typeof entry === "string" ? entry : String((entry as { method?: unknown })?.method ?? "");
    return FULL_PURPOSE_AMR_METHODS.has(method);
  });
}

// Centralized denial used by BOTH the member guards (below) and
// requireSupabaseAdmin (server/routes.ts). Returns true when the response
// was sent (caller must stop).
export function denyRecoveryPurposeSession(jwt: string, res: Response): boolean {
  if (!isRecoveryPurposeSession(jwt)) return false;
  res.status(403).json({
    ok: false,
    code: "recovery_session",
    message: "This session is for password reset only. Finish resetting your password, then sign in.",
  });
  return true;
}

// The server-side member guard, in its own module so both the member routes
// (members.ts) and the member-authed research APIs (index.ts: catalog, orders)
// can use it without an import cycle.

export type MemberRow = {
  id: string;
  application_id: string;
  auth_user_id: string;
  email: string;
  first_name: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
};

export async function getMemberByEmail(email: string): Promise<MemberRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("research_members")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) return null;
  return (data as MemberRow) ?? null;
}

export async function getMemberByAuthUserId(userId: string): Promise<MemberRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("research_members")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as MemberRow) ?? null;
}

const billingEnabled = () => process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED === "true";

// Verifies the Supabase JWT, resolves the member row, and requires ACTIVE
// membership. This is the guard for member CONTENT (catalog, orders): an
// approved-but-not-activated member may access only the activation flow, so
// pending_activation is refused here (master guide P0: the generic member
// check alone would let pending members reach the catalog). Denials carry a
// machine-readable `code` so the client can route (activation vs billing
// recovery vs signed-out). Once billing enforcement is live
// (RESEARCH_MEMBERSHIP_BILLING_ENABLED=true), billing_state must agree:
// activation writes billing_state='active'; rows created before the
// research-member-billing.sql migration have no billing_state and status
// 'active' is only ever set through admin-verified activation, so a MISSING
// state reads as verified-legacy while an EXPLICIT non-active state denies.
export async function requireActiveMember(req: Request, res: Response, next: NextFunction) {
  await requireMember(req, res, () => {
    const member = (req as any).researchMember as MemberRow | undefined;
    const status = String(member?.status ?? "");
    if (status === "active") {
      const billing = String((member as any)?.billing_state ?? "");
      if (billingEnabled() && billing && billing !== "active") {
        return res.status(403).json({
          ok: false,
          code: `billing_${billing}`,
          message: "Membership billing needs attention before this area reopens.",
        });
      }
      return next();
    }
    if (status === "pending_activation") {
      return res.status(403).json({
        ok: false,
        code: "activation_required",
        message: "Membership is not active yet. Complete activation to access member content.",
      });
    }
    if (status === "past_due") {
      return res.status(403).json({
        ok: false,
        code: "billing_past_due",
        message: "Membership billing needs attention before this area reopens.",
      });
    }
    return res.status(403).json({
      ok: false,
      code: "membership_inactive",
      message: "No active research membership for this account.",
    });
  });
}

// Verifies the Supabase JWT and resolves the member row. Never trusts hidden
// UI; attaches the member for downstream handlers. The stable identity link
// is the Auth user id (email can change); the email lookup remains only as a
// legacy fallback.
export async function requireMember(req: Request, res: Response, next: NextFunction) {
  try {
    if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured." });
    const header = req.headers.authorization || "";
    const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!jwt) return res.status(401).json({ ok: false, message: "Sign in required." });
    const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
    if (error || !data?.user?.email) return res.status(401).json({ ok: false, message: "Sign in required." });
    // Purpose check BEFORE member lookup: a recovery-grade session is denied
    // even when it maps to an active member (correction-pass blocker 3).
    if (denyRecoveryPurposeSession(jwt, res)) return;
    const member = (await getMemberByAuthUserId(data.user.id)) ?? (await getMemberByEmail(data.user.email));
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
