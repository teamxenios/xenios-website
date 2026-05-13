import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertWaitlistSubmissionSchema } from "@shared/schema";
import { z } from "zod";
import { sendConfirmationEmail } from "./services/email";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as any).code === "23505"
  );
}

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return res.status(503).json({
      success: false,
      message: "Admin access not configured",
    });
  }

  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", (_req, res) => {
    res.json({ status: "Xenios API is running" });
  });
  
  app.post("/api/waitlist", async (req, res) => {
    try {
      const validatedData = insertWaitlistSubmissionSchema.parse({
        ...req.body,
        email: req.body.email?.toLowerCase?.(),
      });

      const existing = await storage.findWaitlistSubmissionByEmail(validatedData.email);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "You are already on the waitlist.",
        });
      }

      const submission = await storage.createWaitlistSubmission(validatedData);

      sendConfirmationEmail({
        firstName: submission.firstName ?? "there",
        email: submission.email,
      }).catch((err) => console.error("Email send error:", err));

      res.json({
        success: true,
        message: "Successfully joined the waitlist!",
        data: submission
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid submission data",
          errors: error.errors
        });
      }

      if (isUniqueViolation(error)) {
        return res.status(400).json({
          success: false,
          message: "You are already on the waitlist.",
        });
      }

      console.error("Error creating waitlist submission:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process submission. Please try again."
      });
    }
  });

  app.get("/api/waitlist", adminAuth, async (_req, res) => {
    try {
      const submissions = await storage.getAllWaitlistSubmissions();
      res.json({
        success: true,
        data: submissions
      });
    } catch (error) {
      console.error("Error fetching waitlist submissions:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch submissions"
      });
    }
  });

  return httpServer;
}
