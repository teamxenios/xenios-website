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
  type WaitlistInput,
  type LoiInput,
} from "./supabase-store";
import { supabaseConfigured } from "./supabase";

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

  return httpServer;
}
