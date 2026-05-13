import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertWaitlistSchema } from "@shared/schema";
import { z } from "zod";
import { sendConfirmationEmail, sendInternalNotification } from "./services/email";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as any).code === "23505"
  );
}

// Simple in-memory IP rate limiter: 5 POSTs per IP per 10min window.
const RL_MAX = 5;
const RL_WINDOW_MS = 10 * 60 * 1000;
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request): boolean {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
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
  await storage.ensureOffsetSeeded(550).catch((e) => console.error("[seed] offset seed failed:", e));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "Xenios API is running" });
  });

  app.get("/api/waitlist/count", async (_req, res) => {
    try {
      const { total } = await storage.getWaitlistCount();
      res.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      res.json({ count: total });
    } catch (err) {
      console.error("[count] error:", err);
      res.status(500).json({ count: 550 });
    }
  });

  async function buildIdempotentResponse(email: string) {
    const existing = await storage.findWaitlistByEmail(email);
    const { offset, total } = await storage.getWaitlistCount();
    if (!existing) return null;
    const position = offset + Number(existing.position);
    return {
      success: true as const,
      message: "You're already on the list.",
      position,
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
        return res.status(429).json({ success: false, message: "Too many requests. Please try again in a few minutes." });
      }

      const validated = insertWaitlistSchema.parse({
        ...req.body,
        email: req.body.email?.toLowerCase?.(),
      });

      const idem = await buildIdempotentResponse(validated.email);
      if (idem) return res.json(idem);

      const referrer = (req.headers["referer"] as string) || null;
      const source = (req.query.utm_source as string) || null;
      const country =
        (req.headers["x-vercel-ip-country"] as string) ||
        (req.headers["cf-ipcountry"] as string) ||
        null;

      let submission;
      try {
        submission = await storage.createWaitlist(validated, { source, referrer, country });
      } catch (e) {
        if (isUniqueViolation(e)) {
          // Race: row was just inserted by another request — return idempotent success.
          const fallback = await buildIdempotentResponse(validated.email);
          if (fallback) return res.json(fallback);
        }
        throw e;
      }

      const { offset, total: countAfter } = await storage.getWaitlistCount();
      const position = offset + Number(submission.position);

      // Fire-and-forget emails
      Promise.allSettled([
        sendConfirmationEmail({ email: submission.email, position, count: countAfter }),
        sendInternalNotification({
          submission,
          position,
          count: countAfter,
          referrer,
          source,
          country,
        }),
      ]).catch(() => {});

      res.json({
        success: true,
        message: "Successfully joined the waitlist!",
        position,
        count: countAfter,
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

  return httpServer;
}
