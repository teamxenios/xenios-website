import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertWaitlistSubmissionSchema } from "@shared/schema";
import { z } from "zod";
import { sendConfirmationEmail } from "./services/email";

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
        firstName: submission.firstName,
        email: submission.email,
      }).catch((err) => console.error("Email send error:", err));

      res.json({
        success: true,
        message: "Successfully joined the waitlist!",
        data: submission
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: "Invalid submission data",
          errors: error.errors
        });
      } else {
        console.error("Error creating waitlist submission:", error);
        res.status(500).json({
          success: false,
          message: "Failed to process submission. Please try again."
        });
      }
    }
  });

  app.get("/api/waitlist", async (req, res) => {
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
