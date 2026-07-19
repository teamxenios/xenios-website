import type { NextFunction, Request, Response } from "express";
import { getSupabaseAdmin, getSupabaseAnon, supabaseConfigured } from "../supabase";

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
