import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWaitlistSubmissionSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/waitlist", async (req, res) => {
    try {
      const validatedData = insertWaitlistSubmissionSchema.parse(req.body);
      const submission = await storage.createWaitlistSubmission(validatedData);
      
      res.json({
        success: true,
        message: "You've been added to the list.",
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
