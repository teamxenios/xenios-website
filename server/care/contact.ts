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

// This form creates no durable record: the alert to the team IS the message.
// So its failure has to reach the caller. Swallowing it let a support request
// disappear while the page told the sender it had arrived.
export async function sendCareContactInternalAlert(
  message: ContactMessage,
): Promise<void> {
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
  const { error } = await client.emails.send({
    from: XENIOS_HEALTH_EMAIL_FROM,
    to: TEAM_EMAIL,
    replyTo: message.email,
    subject,
    text,
  });
  // The provider reports a rejected send in the result rather than by throwing,
  // so an unchecked result reads as delivered when it was not.
  if (error) throw new Error("care contact internal alert was rejected");
}

export async function sendCareContactAutoReply(
  message: ContactMessage,
): Promise<void> {
  const { client } = await getResendClient();
  const firstName = message.name.trim().split(/\s+/u)[0] || "there";
  const text = `Hi ${firstName},

We received your Xenios Health support message and routed it to the team.

Please do not reply with symptoms, diagnoses, medications, medical records, or other clinical information. For urgent or emergency care, call 911 in the United States or contact local emergency services.

The Xenios Health team
`;
  const { error } = await client.emails.send({
    from: XENIOS_HEALTH_EMAIL_FROM,
    to: message.email,
    replyTo: TEAM_EMAIL,
    subject: "We received your Xenios Health support message",
    text,
  });
  // Reported the same way as the team alert. The caller decides that this one
  // is only a courtesy; it does not get to decide that it was delivered.
  if (error) throw new Error("care contact courtesy reply was rejected");
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

    try {
      await deps.sendMessage(parsed.data);
    } catch {
      // Nothing was stored, so there is nothing to recover later. Say so, and
      // name a channel that does not depend on this route.
      console.error("[care-contact] internal alert failed");
      return res.status(503).json({
        success: false,
        message: `We could not deliver your message just now. Please email ${TEAM_EMAIL} directly.`,
      });
    }

    // The team has it. A failed courtesy reply to the sender must not turn that
    // into a failure, but it must not be reported as sent either.
    let autoReplySent = true;
    try {
      await deps.sendAutoReply(parsed.data);
    } catch {
      autoReplySent = false;
      console.error("[care-contact] requester confirmation failed");
    }

    return res.json({ success: true, message: "We have it.", autoReplySent });
  });
}
