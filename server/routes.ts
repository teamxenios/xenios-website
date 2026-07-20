import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertWaitlistSchema, contactMessageSchema } from "@shared/schema";
import { z } from "zod";
import {
  sendConfirmationEmail,
  sendInternalNotification,
  sendContactMessage,
  sendContactAutoReply,
  sendWaitlistConfirmationV3,
  sendWaitlistInternalAlertV3,
  sendLoiConfirmationV3,
  sendLoiInternalAlertV3,
} from "./services/email";
import {
  getDisplayCount,
  upsertWaitlist,
  setWaitlistEmailStatus,
  insertLoi,
  setLoiEmailStatus,
  listWaitlist,
  listLoi,
  listBookings,
  updateWaitlistStatus,
  updateLoiStatus,
  listNotes,
  listNotesByType,
  addNote,
  insertBooking,
  listVisibleConcepts,
  getAnalytics,
  type WaitlistInput,
  type LoiInput,
} from "./supabase-store";
import { supabaseConfigured, getSupabaseAnon } from "./supabase";
import { denyRecoveryPurposeSession } from "./research/member-auth";
import { verifyTurnstile } from "./turnstile";

const WAITLIST_STATUSES = ["New", "Contacted", "Qualified", "Not a fit", "Converted", "Archived"];
const LOI_STATUSES = ["New", "Reviewing", "Followed up", "Signed", "Not moving forward"];

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const str = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as any).code === "23505"
  );
}

const RL_MAX = 5;
const RL_WINDOW_MS = 10 * 60 * 1000;
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request): boolean {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const now = Date.now();
  const b = rlBuckets.get(ip);
  if (!b || b.resetAt < now) {
    rlBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (b.count >= RL_MAX) return false;
  b.count += 1;
  return true;
}

function clientIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

function s(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function readAttribution(body: any) {
  return {
    source_page: s(body?.source_page, 300),
    landing_page: s(body?.landing_page, 300),
    referrer_url: s(body?.referrer_url, 500),
    utm_source: s(body?.utm_source, 200),
    utm_medium: s(body?.utm_medium, 200),
    utm_campaign: s(body?.utm_campaign, 200),
    utm_content: s(body?.utm_content, 200),
    utm_term: s(body?.utm_term, 200),
  };
}

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return res.status(503).json({ success: false, message: "Admin access not configured" });
  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

// Supabase-Auth admin gate: verifies the user's JWT and that the email matches
// ADMIN_EMAIL. Used by the /admin dashboard endpoints and the research admin API.
export async function requireSupabaseAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    if (!adminEmail || !supabaseConfigured()) {
      return res.status(503).json({ success: false, message: "Admin access not configured" });
    }
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });
    const { data, error } = await getSupabaseAnon().auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    // A password-recovery-grade session is never an admin session, even when
    // the email matches ADMIN_EMAIL (PR #25 correction pass, blocker 3).
    if (denyRecoveryPurposeSession(token, res)) return;
    if ((data.user.email || "").toLowerCase() !== adminEmail) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    (req as any).adminEmail = data.user.email;
    next();
  } catch (err) {
    console.error("[admin auth] error:", err);
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await storage.ensureCounterSeeded(550).catch((e) => console.error("[seed] counter seed failed:", e));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "Xenios API is running" });
  });

  const handleCount = async (_req: Request, res: Response) => {
    try {
      const total = await getDisplayCount();
      res.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      res.json({ count: total });
    } catch (err) {
      console.error("[counter] error:", err);
      res.status(500).json({ count: 556 });
    }
  };
  app.get("/api/counter", handleCount);
  // Backward-compat alias
  app.get("/api/waitlist/count", handleCount);

  async function buildIdempotentResponse(email: string) {
    const existing = await storage.findWaitlistByEmail(email);
    if (!existing) return null;
    const total = await storage.getCounterTotal();
    return {
      success: true as const,
      message: "You're already on the list.",
      position: Number(existing.position),
      count: total,
      duplicate: true,
    };
  }

  app.post("/api/waitlist", async (req, res) => {
    try {
      // Honeypot — bots fill 'website', humans don't see it
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ success: true, position: 0, count: 0 });
      }

      if (!rateLimit(req)) {
        return res.status(429).json({
          success: false,
          message: "Too many requests. Please try again in a few minutes.",
        });
      }

      // Strip non-schema fields (consent, website honeypot)
      const validated = insertWaitlistSchema.parse({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email?.toLowerCase?.(),
        practitionerType: req.body.practitionerType,
        city: req.body.city,
        country: req.body.country,
        freeText: req.body.freeText || null,
        howHeard: req.body.howHeard || null,
      });

      const idem = await buildIdempotentResponse(validated.email);
      if (idem) return res.json(idem);

      const ipCountry =
        (req.headers["x-vercel-ip-country"] as string) ||
        (req.headers["cf-ipcountry"] as string) ||
        null;
      const userAgent = (req.headers["user-agent"] as string) || null;

      let result;
      try {
        result = await storage.createWaitlist(validated, { ipCountry, userAgent });
      } catch (e) {
        if (isUniqueViolation(e)) {
          const fallback = await buildIdempotentResponse(validated.email);
          if (fallback) return res.json(fallback);
        }
        throw e;
      }

      const { signup, totalCount } = result;

      // Fire-and-forget emails
      Promise.allSettled([
        sendConfirmationEmail({
          email: signup.email,
          firstName: signup.firstName,
          position: Number(signup.position),
          totalCount,
        }),
        sendInternalNotification({
          signup,
          totalCount,
        }),
      ]).catch(() => {});

      res.json({
        success: true,
        message: "Successfully joined the waitlist!",
        position: Number(signup.position),
        count: totalCount,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid submission data",
          errors: error.errors,
        });
      }
      console.error("[waitlist] error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process submission. Please try again.",
      });
    }
  });

  app.post("/api/waitlist/quick", async (req, res) => {
    try {
      // Honeypot
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ success: true, count: 0 });
      }
      if (!rateLimit(req)) {
        return res.status(429).json({ success: false, message: "Too many requests. Please try again in a few minutes." });
      }
      if (!(await verifyTurnstile(req.body?.turnstileToken, clientIp(req)))) {
        return res.status(400).json({ success: false, message: "Verification failed. Please try again." });
      }
      if (!supabaseConfigured()) {
        return res.status(503).json({ success: false, message: "The waitlist is temporarily unavailable. Please try again shortly." });
      }
      const emailParsed = z.string().email().max(254).toLowerCase().trim().safeParse(req.body?.email);
      if (!emailParsed.success) {
        return res.status(400).json({ success: false, message: "Please enter a valid email." });
      }

      const interestedIn = Array.isArray(req.body?.interestedIn)
        ? req.body.interestedIn
            .filter((x: unknown): x is string => typeof x === "string")
            .map((v: string) => v.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      const input: WaitlistInput = {
        email: emailParsed.data,
        name: s(req.body?.name, 160),
        phone: s(req.body?.phone, 40),
        role: s(req.body?.role, 80),
        company: s(req.body?.company, 120),
        city: s(req.body?.city, 120),
        handle_or_url: s(req.body?.handleOrUrl ?? req.body?.handle_or_url, 200),
        client_count: s(req.body?.clientCount ?? req.body?.client_count, 40),
        interest: interestedIn.length ? interestedIn.join(", ") : s(req.body?.interest, 400),
        consent: req.body?.consent === true,
        ip: clientIp(req),
        ...readAttribution(req.body),
      };

      // Upsert: a repeat email updates the existing row instead of duplicating.
      const row = await upsertWaitlist(input);
      const count = await getDisplayCount();

      // Email: never lose the lead — record sent/failed.
      const confirmed = await sendWaitlistConfirmationV3({ email: row.email, name: row.name });
      void sendWaitlistInternalAlertV3(row).catch(() => {});
      await setWaitlistEmailStatus(row.id, confirmed ? "sent" : "failed");

      res.json({ success: true, count });
    } catch (error) {
      console.error("[waitlist/quick] error:", error);
      res.status(500).json({ success: false, message: "Failed to process submission. Please try again." });
    }
  });

  // Early-interest / LOI — keeps full history (no dedupe).
  app.post("/api/early-interest", async (req, res) => {
    try {
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ success: true });
      }
      if (!rateLimit(req)) {
        return res.status(429).json({ success: false, message: "Too many requests. Please try again in a few minutes." });
      }
      if (!(await verifyTurnstile(req.body?.turnstileToken, clientIp(req)))) {
        return res.status(400).json({ success: false, message: "Verification failed. Please try again." });
      }
      if (!supabaseConfigured()) {
        return res.status(503).json({ success: false, message: "The form is temporarily unavailable. Please try again shortly." });
      }
      const emailParsed = z.string().email().max(254).toLowerCase().trim().safeParse(req.body?.email);
      if (!emailParsed.success) {
        return res.status(400).json({ success: false, message: "Please enter a valid email." });
      }

      const input: LoiInput = {
        email: emailParsed.data,
        name: s(req.body?.name, 160),
        phone: s(req.body?.phone, 40),
        business_name: s(req.body?.businessName ?? req.body?.business_name, 160),
        role: s(req.body?.role, 80),
        url_or_handle: s(req.body?.urlOrHandle ?? req.body?.url_or_handle, 200),
        client_count: s(req.body?.clientCount ?? req.body?.client_count, 40),
        why_interested: s(req.body?.whyInterested ?? req.body?.why_interested, 2000),
        nonbinding_ack: (req.body?.nonbindingAck ?? req.body?.nonbinding_ack) === true,
        ip: clientIp(req),
        ...readAttribution(req.body),
      };

      const row = await insertLoi(input);

      const confirmed = await sendLoiConfirmationV3({ email: input.email!, name: input.name });
      void sendLoiInternalAlertV3(row).catch(() => {});
      await setLoiEmailStatus(row.id, confirmed ? "sent" : "failed");

      res.json({ success: true });
    } catch (error) {
      console.error("[early-interest] error:", error);
      res.status(500).json({ success: false, message: "Failed to process submission. Please try again." });
    }
  });

  app.get("/api/waitlist", adminAuth, async (_req, res) => {
    try {
      const submissions = await storage.getAllWaitlist();
      res.json({ success: true, data: submissions });
    } catch (err) {
      console.error("[admin] list error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch submissions" });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      // Honeypot
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ success: true });
      }
      if (!rateLimit(req)) {
        return res.status(429).json({
          success: false,
          message: "Too many requests. Please try again in a few minutes.",
        });
      }
      const validated = contactMessageSchema.parse(req.body);

      Promise.allSettled([
        sendContactMessage(validated),
        sendContactAutoReply(validated),
      ]).catch(() => {});

      res.json({ success: true, message: "We have it." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid submission data",
          errors: error.errors,
        });
      }
      console.error("[contact] error:", error);
      res.status(500).json({
        success: false,
        message: "Something broke on our side.",
      });
    }
  });

  // ---- Public runtime config (safe values only; no secrets) ----
  app.get("/api/config", (_req, res) => {
    res.set("Cache-Control", "public, max-age=30");
    res.json({
      metaPixelId: process.env.META_PIXEL_ID || null,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
      calendlyUrl: process.env.CALENDLY_URL || "https://calendly.com/samuel-xeniostechnology/30min",
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    });
  });

  // ---- Public concept gallery (visible items only) ----
  app.get("/api/concepts", async (_req, res) => {
    try {
      if (!supabaseConfigured()) return res.json({ success: true, data: [] });
      const items = await listVisibleConcepts();
      res.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
      res.json({ success: true, data: items });
    } catch (err) {
      console.error("[concepts] error:", err);
      res.status(500).json({ success: false, data: [] });
    }
  });

  // ---- Calendly webhook -> records a booking ----
  // Guard with ?token=CALENDLY_WEBHOOK_SECRET (set on the Calendly webhook URL).
  // The secret is MANDATORY: with no secret configured the endpoint refuses to
  // process any payload, so bookings can never be injected unauthenticated.
  app.post("/api/calendly/webhook", async (req, res) => {
    try {
      const secret = process.env.CALENDLY_WEBHOOK_SECRET;
      if (!secret) {
        console.warn("[calendly webhook] rejected: CALENDLY_WEBHOOK_SECRET not set");
        return res.status(503).json({ ok: false, message: "Webhook not configured" });
      }
      if (req.query.token !== secret) {
        return res.status(401).json({ ok: false });
      }
      if (!supabaseConfigured()) return res.status(200).json({ ok: true });
      const evt = req.body?.event as string | undefined;
      const payload = req.body?.payload ?? {};
      const name = payload?.name ?? payload?.invitee?.name ?? null;
      const email = payload?.email ?? payload?.invitee?.email ?? null;
      const event_time =
        payload?.scheduled_event?.start_time ??
        payload?.event?.start_time ??
        payload?.start_time ??
        null;
      await insertBooking({
        name,
        email,
        event_time,
        source: "calendly",
        status: evt === "invitee.canceled" ? "canceled" : "scheduled",
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[calendly webhook] error:", err);
      res.status(200).json({ ok: true });
    }
  });

  // ---- Admin dashboard API (Supabase Auth JWT, email === ADMIN_EMAIL) ----
  app.get("/api/admin/me", requireSupabaseAdmin, (req, res) => {
    res.json({ success: true, email: (req as any).adminEmail });
  });

  app.get("/api/admin/waitlist", requireSupabaseAdmin, async (_req, res) => {
    try {
      res.json({ success: true, data: await listWaitlist() });
    } catch (err) {
      console.error("[admin/waitlist] error:", err);
      res.status(500).json({ success: false, message: "Failed to load waitlist" });
    }
  });

  app.get("/api/admin/loi", requireSupabaseAdmin, async (_req, res) => {
    try {
      res.json({ success: true, data: await listLoi() });
    } catch (err) {
      console.error("[admin/loi] error:", err);
      res.status(500).json({ success: false, message: "Failed to load early interest" });
    }
  });

  app.get("/api/admin/bookings", requireSupabaseAdmin, async (_req, res) => {
    try {
      res.json({ success: true, data: await listBookings() });
    } catch (err) {
      console.error("[admin/bookings] error:", err);
      res.status(500).json({ success: false, message: "Failed to load bookings" });
    }
  });

  app.get("/api/admin/analytics", requireSupabaseAdmin, async (_req, res) => {
    try {
      res.json({ success: true, data: await getAnalytics() });
    } catch (err) {
      console.error("[admin/analytics] error:", err);
      res.status(500).json({ success: false, message: "Failed to load analytics" });
    }
  });

  app.patch("/api/admin/waitlist/:id/status", requireSupabaseAdmin, async (req, res) => {
    try {
      const status = String(req.body?.status || "");
      if (!WAITLIST_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      await updateWaitlistStatus(String(req.params.id), status);
      res.json({ success: true });
    } catch (err) {
      console.error("[admin/waitlist status] error:", err);
      res.status(500).json({ success: false, message: "Failed to update status" });
    }
  });

  app.patch("/api/admin/loi/:id/status", requireSupabaseAdmin, async (req, res) => {
    try {
      const status = String(req.body?.status || "");
      if (!LOI_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      await updateLoiStatus(String(req.params.id), status);
      res.json({ success: true });
    } catch (err) {
      console.error("[admin/loi status] error:", err);
      res.status(500).json({ success: false, message: "Failed to update status" });
    }
  });

  app.get("/api/admin/notes", requireSupabaseAdmin, async (req, res) => {
    try {
      const recordType = String(req.query.record_type || "");
      const recordId = String(req.query.record_id || "");
      if (!recordType || !recordId) {
        return res.status(400).json({ success: false, message: "record_type and record_id required" });
      }
      res.json({ success: true, data: await listNotes(recordType, recordId) });
    } catch (err) {
      console.error("[admin/notes list] error:", err);
      res.status(500).json({ success: false, message: "Failed to load notes" });
    }
  });

  app.post("/api/admin/notes", requireSupabaseAdmin, async (req, res) => {
    try {
      const record_type = String(req.body?.record_type || "");
      const record_id = String(req.body?.record_id || "");
      const note = String(req.body?.note || "").trim();
      if (!record_type || !record_id || !note) {
        return res.status(400).json({ success: false, message: "record_type, record_id and note required" });
      }
      const created = await addNote({
        record_type,
        record_id,
        note: note.slice(0, 4000),
        author: (req as any).adminEmail || null,
      });
      res.json({ success: true, data: created });
    } catch (err) {
      console.error("[admin/notes add] error:", err);
      res.status(500).json({ success: false, message: "Failed to add note" });
    }
  });

  app.get("/api/admin/export", requireSupabaseAdmin, async (req, res) => {
    try {
      const type = String(req.query.type || "waitlist");
      const rows =
        type === "loi" ? await listLoi() : type === "bookings" ? await listBookings() : await listWaitlist();

      let exportRows = rows as Record<string, any>[];
      if (type === "waitlist" || type === "loi") {
        const notes = await listNotesByType(type);
        const byRecord = new Map<string, string[]>();
        for (const n of notes) {
          const ts = n.created_at ? `${n.created_at} ` : "";
          const author = n.author ? `${n.author}: ` : "";
          const line = `${ts}${author}${n.note}`.trim();
          const list = byRecord.get(n.record_id) ?? [];
          list.push(line);
          byRecord.set(n.record_id, list);
        }
        exportRows = exportRows.map((r) => ({
          ...r,
          notes: (byRecord.get(String(r.id)) ?? []).join(" | "),
        }));
      }

      const csv = toCsv(exportRows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="xenios-${type}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error("[admin/export] error:", err);
      res.status(500).json({ success: false, message: "Failed to export" });
    }
  });

  return httpServer;
}
