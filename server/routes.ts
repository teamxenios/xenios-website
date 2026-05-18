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
} from "./services/email";

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

  app.get("/api/counter", async (_req, res) => {
    try {
      const total = await storage.getCounterTotal();
      res.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      res.json({ count: total });
    } catch (err) {
      console.error("[counter] error:", err);
      res.status(500).json({ count: 550 });
    }
  });
  // Backward-compat alias
  app.get("/api/waitlist/count", async (_req, res) => {
    try {
      const total = await storage.getCounterTotal();
      res.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      res.json({ count: total });
    } catch (err) {
      console.error("[counter] error:", err);
      res.status(500).json({ count: 550 });
    }
  });

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
      if (typeof req.body?.website === "string" && req.body.website.length > 0) {
        return res.json({ success: true, position: 0, count: 0 });
      }
      if (!rateLimit(req)) {
        return res.status(429).json({ success: false, message: "Too many requests. Please try again in a few minutes." });
      }
      const emailParsed = z.string().email().max(254).toLowerCase().trim().safeParse(req.body?.email);
      if (!emailParsed.success) {
        return res.status(400).json({ success: false, message: "Please enter a valid email." });
      }
      const email = emailParsed.data;

      const idem = await buildIdempotentResponse(email);
      if (idem) return res.json(idem);

      const ipCountry = (req.headers["x-vercel-ip-country"] as string) || (req.headers["cf-ipcountry"] as string) || null;
      const userAgent = (req.headers["user-agent"] as string) || null;

      const synthesized = insertWaitlistSchema.parse({
        firstName: "Friend",
        lastName: "—",
        email,
        practitionerType: "other",
        city: "—",
        country: "—",
        freeText: null,
        howHeard: "coming-soon",
      });

      let result;
      try {
        result = await storage.createWaitlist(synthesized, { ipCountry, userAgent });
      } catch (e) {
        if (isUniqueViolation(e)) {
          const fallback = await buildIdempotentResponse(email);
          if (fallback) return res.json(fallback);
        }
        throw e;
      }
      const { signup, totalCount } = result;

      Promise.allSettled([
        sendConfirmationEmail({ email: signup.email, firstName: signup.firstName, position: Number(signup.position), totalCount }),
        sendInternalNotification({ signup, totalCount }),
      ]).catch(() => {});

      res.json({ success: true, position: Number(signup.position), count: totalCount });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: "Invalid submission." });
      }
      console.error("[waitlist/quick] error:", error);
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
