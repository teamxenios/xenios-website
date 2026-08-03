import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSupabaseAdmin, supabaseConfigured } from "../supabase";
import { requireSupabaseAdmin } from "../routes";
import { FRAUD_ACTIONS, FRAUD_FLAG_REASONS } from "@shared/research/referral-types";
import { applyFraudAction, openFraudFlag, REFERRALS_DISABLED_MESSAGE } from "./fraud";
import { referralsEnabled } from "./referrals";

// The referral fraud review queue admin API (V3 sections 64 and 71).
// Every action requires an audit reason; the queue exposes internal state to
// authenticated admins only and never to members.
//
// The authoritative capability gate lives in fraud.ts, not here: applyFraudAction
// and openFraudFlag refuse on their own when RESEARCH_REFERRALS_ENABLED is not
// exactly "true", so a caller that is not one of these routes cannot reach the
// reward table or the credit ledger either. What these routes add is the HTTP
// shape: 409 with code "referrals_disabled".
//
// 409 and not 503. This comment claims no house convention, because there is
// not one: documents.ts, media.ts and questions.ts answer 409 with code
// "capability_disabled", while catalog-display/routes.ts, pricing/routes.ts and
// membership-activation/routes.ts answer 503 with a code of their own. Both
// reasons for choosing 409 are local to this file.
//
//   1. 503 is already taken on these three routes. The supabaseConfigured()
//      guards below answer 503 for "storage is not configured", a different
//      condition with a different fix and a different owner. Reusing 503 for
//      "the referral program is switched off" would leave one status meaning
//      two things on one route, separable only by reading the code field.
//   2. On a 503 that code field is unreadable to this route's own adapter.
//      adapters/adminOps.ts (actOnReferralFlag, reportReferralFraud) calls
//      through research/lib/api.ts, which maps 404, 501 and 503 to
//      "unavailable" WITHOUT parsing the body, so on a 503 both the code and
//      the message are discarded before the ok:false envelope is inspected. At
//      409 the same refusal arrives as { kind: "denied", code:
//      "referrals_disabled", message }, which is the whole point of the code.

const FLAGS = "referral_fraud_flags";

// The message comes from fraud.ts so the HTTP refusal and the service refusal
// are the same sentence by construction and cannot drift.
const REFERRALS_DISABLED_BODY = {
  ok: false as const,
  code: "referrals_disabled" as const,
  message: REFERRALS_DISABLED_MESSAGE,
};

export function registerReferralFraudAdmin(app: Express) {
  app.get("/api/admin/research/referral-fraud", requireSupabaseAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const status = typeof req.query.status === "string" ? req.query.status : "open";
      const { data, error } = await getSupabaseAdmin()
        .from(FLAGS)
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return res.status(500).json({ ok: false, message: "Query failed." });
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, flags: data ?? [], reasons: FRAUD_FLAG_REASONS, actions: FRAUD_ACTIONS });
    } catch (err) {
      console.error("[referral fraud] queue error:", err);
      res.status(500).json({ ok: false, message: "Query failed." });
    }
  });

  app.post("/api/admin/research/referral-fraud/:id/action", requireSupabaseAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const parsed = z
        .object({
          action: z.enum(FRAUD_ACTIONS),
          reason: z.string().trim().min(5, "An audit reason is required.").max(500),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "A valid action and an audit reason are required." });
      }
      const result = await applyFraudAction({
        flagId: String(req.params.id),
        action: parsed.data.action,
        reason: parsed.data.reason,
        adminId: (req as any).adminEmail ?? null,
      });
      if (!result.ok) {
        // 409 for "the capability is off", 404 for "no such flag" or "already
        // resolved", which is what this route already returned.
        return res.status(result.code === "referrals_disabled" ? 409 : 404).json(result);
      }
      res.json(result);
    } catch (err) {
      console.error("[referral fraud] action error:", err);
      res.status(500).json({ ok: false, message: "The action failed." });
    }
  });

  // Manual report: an admin can open a flag directly (reason 'manual-report').
  app.post("/api/admin/research/referral-fraud/report", requireSupabaseAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseConfigured()) return res.status(503).json({ ok: false, message: "Not configured" });
      const parsed = z
        .object({
          attributionId: z.string().uuid().optional(),
          identityId: z.string().uuid().optional(),
          applicationId: z.string().uuid().optional(),
          detail: z.string().trim().min(5).max(500),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, message: "A detail note is required." });
      // openFraudFlag already refuses when the capability is off and writes
      // nothing. Reporting that refusal here keeps the route from answering
      // ok: true with a null flagId, which would read as "deduplicated".
      if (!referralsEnabled()) return res.status(409).json(REFERRALS_DISABLED_BODY);
      const id = await openFraudFlag({
        reason: "manual-report",
        attributionId: parsed.data.attributionId ?? null,
        identityId: parsed.data.identityId ?? null,
        applicationId: parsed.data.applicationId ?? null,
        detail: parsed.data.detail,
      });
      res.json({ ok: true, flagId: id });
    } catch (err) {
      console.error("[referral fraud] report error:", err);
      res.status(500).json({ ok: false, message: "The report failed." });
    }
  });
}
