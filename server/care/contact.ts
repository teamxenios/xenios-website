import type { Express, Request } from "express";
import { contactMessageSchema, type ContactMessage } from "@shared/schema";
import { rateLimitHit, requestIp } from "../research/rate-limit";
import { getResendClient, TEAM_EMAIL } from "../services/email";
import { XENIOS_HEALTH_EMAIL_FROM } from "./email-identity";

export const CARE_CONTACT_PATH = "/api/care/contact" as const;

export type CareContactDependencies = Readonly<{
  allowRequest: (req: Request) => Promise<boolean>;
  sendMessage: (message: ContactMessage) => Promise<void>;
  sendAutoReply: (message: ContactMessage) => Promise<void>;
}>;

function normalizedSubject(subject: string): string {
  const stripped = subject.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  return `[Xenios Health] ${stripped}`.trim();
}

export async function sendCareContactInternalAlert(
  message: ContactMessage,
): Promise<void> {
  try {
    const { client } = await getResendClient();
    const subject = normalizedSubject(message.subject);
    const text = `New nonclinical Xenios Health support message

Name: ${message.name}
Email: ${message.email}
Subject: ${subject}

Message:
${message.message}

This public support form is for website and operational navigation only. Move any medical or clinical information to an authorized secure system.
`;
    await client.emails.send({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: TEAM_EMAIL,
      replyTo: message.email,
      subject,
      text,
    });
  } catch (error) {
    console.error("[care-contact] internal alert failed");
  }
}

export async function sendCareContactAutoReply(
  message: ContactMessage,
): Promise<void> {
  try {
    const { client } = await getResendClient();
    const firstName = message.name.trim().split(/\s+/u)[0] || "there";
    const text = `Hi ${firstName},

We received your Xenios Health support message and routed it to the team.

Please do not reply with symptoms, diagnoses, medications, medical records, or other clinical information. For urgent or emergency care, call 911 in the United States or contact local emergency services.

The Xenios Health team
`;
    await client.emails.send({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: message.email,
      replyTo: TEAM_EMAIL,
      subject: "We received your Xenios Health support message",
      text,
    });
  } catch (error) {
    console.error("[care-contact] requester confirmation failed");
  }
}

export function buildCareContactProductionDependencies(): CareContactDependencies {
  return {
    allowRequest(req) {
      return rateLimitHit(
        `care-contact:${requestIp(req)}`,
        15 * 60,
        5,
      );
    },
    sendMessage: sendCareContactInternalAlert,
    sendAutoReply: sendCareContactAutoReply,
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
