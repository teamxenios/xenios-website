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

// Verifies the Supabase JWT, resolves the member row, and requires ACTIVE
// membership. This is the guard for member CONTENT (catalog, orders): an
// approved-but-not-activated member may access only the activation flow, so
// pending_activation is refused here (master guide P0: the generic member
// check alone would let pending members reach the catalog).
export async function requireActiveMember(req: Request, res: Response, next: NextFunction) {
  await requireMember(req, res, () => {
    const member = (req as any).researchMember as MemberRow | undefined;
    if (!member || member.status !== "active") {
      return res.status(403).json({
        ok: false,
        message: "Membership is not active yet. Complete activation to access member content.",
      });
    }
    next();
  });
}

// Verifies the Supabase JWT and resolves the member row. Never trusts hidden
// UI; attaches the member for downstream handlers.
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
