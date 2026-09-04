import type { Express, Request } from "express";
import { contactMessageSchema, type ContactMessage } from "@shared/schema";
import { rateLimitHit, requestIp } from "../research/rate-limit";
import {
  sendHealthContactAutoReply,
  sendHealthContactMessage,
} from "../services/email";

export const CARE_CONTACT_PATH = "/api/care/contact" as const;

export type CareContactDependencies = Readonly<{
  allowRequest: (req: Request) => Promise<boolean>;
  sendMessage: (message: ContactMessage) => Promise<void>;
  sendAutoReply: (message: ContactMessage) => Promise<void>;
}>;

export function buildCareContactProductionDependencies(): CareContactDependencies {
  return {
    allowRequest(req) {
      return rateLimitHit(
        `care-contact:${requestIp(req)}`,
        15 * 60,
        5,
      );
    },
    sendMessage: sendHealthContactMessage,
    sendAutoReply: sendHealthContactAutoReply,
  };
}

export function registerCareContactApi(
  app: Express,
  deps: CareContactDependencies = buildCareContactProductionDependencies(),
) {
  app.post(CARE_CONTACT_PATH, async (req, res) => {
    if (typeof req.body?.website === "string" && req.body.website.length > 0) {
      return res.json({ success: true });
    }

    if (!(await deps.allowRequest(req))) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again in a few minutes.",
      });
    }

    const parsed = contactMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission data",
        errors: parsed.error.errors,
      });
    }

    Promise.allSettled([
      deps.sendMessage(parsed.data),
      deps.sendAutoReply(parsed.data),
    ]).catch(() => {});

    return res.json({ success: true, message: "We have it." });
  });
}
