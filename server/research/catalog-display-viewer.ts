import type { Request } from "express";
import { getSupabaseAnon, supabaseConfigured } from "../supabase";
import type { CatalogDisplayViewer } from "./catalog-display/routes";
import { getMemberByAuthUserId, isRecoveryPurposeSession } from "./member-auth";

// The production authorizer the catalog-display wiring injects
// (server/research/catalog-display/routes.ts documents this exact contract).
// It derives the viewer from the authenticated request on the server side
// only: the browser never chooses its audience. Return null for any caller
// the server cannot positively identify; the adapter answers its uniform 401
// and never builds a projection.
//
// Resolution mirrors the repo's canonical chains exactly:
// - member: resolveResearchMember (member-auth.ts): verify the Supabase JWT,
//   deny recovery-purpose sessions, resolve the member row by the EXACT Auth
//   user id binding only (the legacy email fallback was removed 2026-08-27 —
//   a recycled or re-registered email must never inherit another membership),
//   and require ACTIVE status, the same bar requireActiveMember sets.
// - admin: requireSupabaseAdmin (server/routes.ts): the server-verified JWT
//   email compared to ADMIN_EMAIL, lowercased and trimmed, never a client
//   supplied label.
//
// Unlike the middleware chains this function writes no responses and throws
// nothing: every failure path is null, so the adapter stays the single place
// that speaks HTTP for this surface.
export async function authorizeCatalogDisplayViewer(
  req: Request,
): Promise<CatalogDisplayViewer | null> {
  try {
    if (!supabaseConfigured()) return null;
    const header = req.headers.authorization || "";
    const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!jwt) return null;
    const { data, error } = await getSupabaseAnon().auth.getUser(jwt);
    const email = data?.user?.email ?? null;
    if (error || !data?.user || !email) return null;
    // A password-recovery-grade session is never a catalog viewer, even when
    // it maps to an active member or the admin email (PR #25 correction
    // pass, blocker 3, same rule as every other authed surface).
    if (isRecoveryPurposeSession(jwt)) return null;
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    if (adminEmail && email.toLowerCase().trim() === adminEmail) {
      return { audience: "admin", email };
    }
    const member = await getMemberByAuthUserId(data.user.id);
    if (!member || String(member.status) !== "active") return null;
    // Billing parity with requireActiveMember: when membership billing is
    // enforced, a billing_state other than active closes member content.
    if (process.env.RESEARCH_MEMBERSHIP_BILLING_ENABLED === "true") {
      const billing = String((member as Record<string, unknown>).billing_state ?? "");
      const sponsoredB2B = String((member as Record<string, unknown>).access_basis ?? "") === "sponsored_b2b";
      if (billing && billing !== "active" && !sponsoredB2B) return null;
    }
    return { audience: "member", email: member.email };
  } catch {
    // Fail closed: an unexpected resolution failure is an unauthenticated
    // viewer, never an escalation and never a 500.
    return null;
  }
}
