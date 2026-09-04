import type { Express, Request, Response } from "express";
import {
  CARE_ACCESS_BUSINESS_NAME,
  CARE_ACCESS_ROLE_PREFIX,
  CARE_ACCESS_SCHEMA,
} from "./manual-access-classifier";
import {
  CARE_CONTACT_METHOD_LABELS,
  CARE_CONTACT_WINDOW_LABELS,
  CARE_GOAL_LABELS,
  CARE_MANUAL_ACCESS_REQUEST_PATH,
  CARE_MANUAL_ACCESS_SOURCE_PAGE,
  CARE_MANUAL_ACCESS_STATUS_PATH,
  CARE_US_STATE_LABELS,
  careManualAccessRequestSchema,
  type CareManualAccessAvailability,
  type CareManualAccessRequest,
} from "@shared/care/manual-access";
import { supabaseConfigured } from "../supabase";
import {
  insertLoi,
  setLoiEmailStatus,
  type LoiInput,
} from "../supabase-store";
import { rateLimitHit, requestIp } from "../research/rate-limit";
import { getResendClient, TEAM_EMAIL } from "../services/email";
import {
  adminRecipients,
  resolveEmailConfiguration,
} from "../services/email-config";
import { verifyTurnstile } from "../turnstile";

export const XENIOS_HEALTH_EMAIL_FROM =
  `Xenios Health <${TEAM_EMAIL}>` as const;

export type CareManualAccessReadiness = Readonly<{
  persistenceReady: boolean;
  notificationsReady: boolean;
}>;

export type CareManualAccessRecord = Readonly<{
  id: string;
}>;

export interface CareManualAccessDependencies {
  loadReadiness(): Promise<CareManualAccessReadiness>;
  allowRequest(ip: string): Promise<boolean>;
  verifyHuman(token: string | undefined, ip: string): Promise<boolean>;
  createRequest(
    request: CareManualAccessRequest,
    context: Readonly<{ ip: string }>,
  ): Promise<CareManualAccessRecord>;
  sendInternalAlert(
    request: CareManualAccessRequest,
    reference: string,
  ): Promise<boolean>;
  sendConfirmation(
    request: CareManualAccessRequest,
    reference: string,
  ): Promise<boolean>;
  setEmailStatus(id: string, status: "sent" | "failed"): Promise<void>;
}

const unavailableDependencies: CareManualAccessDependencies = {
  async loadReadiness() {
    return { persistenceReady: false, notificationsReady: false };
  },
  async allowRequest() {
    return false;
  },
  async verifyHuman() {
    return false;
  },
  async createRequest() {
    throw new Error("Care access persistence is not configured");
  },
  async sendInternalAlert() {
    return false;
  },
  async sendConfirmation() {
    return false;
  },
  async setEmailStatus() {},
};

export function unconfiguredCareManualAccessDependencies(): CareManualAccessDependencies {
  return unavailableDependencies;
}

export function careManualAccessAvailability(
  readiness: CareManualAccessReadiness,
): CareManualAccessAvailability {
  return {
    ok: true,
    acceptingRequests:
      readiness.persistenceReady === true && readiness.notificationsReady === true,
    workflow: "manual_human_follow_up",
    typicalResponse: "one_business_day",
    clinicalHandoff: "separate_secure_step_after_review",
  };
}

export function careManualAccessReference(id: string): string {
  const compact = id.replace(/[^a-f0-9]/giu, "").toUpperCase();
  if (compact.length < 8) throw new Error("Care access record id is invalid");
  return `CARE-${compact.slice(0, 8)}`;
}

export function careManualAccessOperationsRecord(
  request: CareManualAccessRequest,
  ip: string,
): LoiInput {
  return {
    name: request.fullName,
    email: request.email,
    phone: request.phone ?? null,
    business_name: CARE_ACCESS_BUSINESS_NAME,
    role: `${CARE_ACCESS_ROLE_PREFIX}${request.careGoal}`,
    url_or_handle: `preferred_contact:${request.contactMethod}`,
    client_count: `contact_window:${request.contactWindow}`,
    why_interested: JSON.stringify({
      schema: CARE_ACCESS_SCHEMA,
      locationState: request.locationState,
      careGoal: request.careGoal,
      contactMethod: request.contactMethod,
      contactWindow: request.contactWindow,
      adultConfirmation: true,
      boundaryAcknowledgement: true,
      medicalFreeTextCollected: false,
    }),
    nonbinding_ack: true,
    source_page: CARE_MANUAL_ACCESS_SOURCE_PAGE,
    landing_page: CARE_MANUAL_ACCESS_SOURCE_PAGE,
    referrer_url: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    ip,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendCareAccessInternalAlert(
  request: CareManualAccessRequest,
  reference: string,
): Promise<boolean> {
  try {
    const { client } = await getResendClient();
    const subject = `[Xenios Care] New access request ${reference}`;
    const text = `New Xenios Care access request.

Reference: ${reference}
Name: ${request.fullName}
Email: ${request.email}
Phone: ${request.phone ?? "(not provided)"}
Current state: ${CARE_US_STATE_LABELS[request.locationState]} (${request.locationState})
Routing category: ${CARE_GOAL_LABELS[request.careGoal]}
Preferred contact: ${CARE_CONTACT_METHOD_LABELS[request.contactMethod]}
Best time: ${CARE_CONTACT_WINDOW_LABELS[request.contactWindow]}

The requester confirmed they are 18 or older and in the United States. The public form collected no symptoms, diagnoses, medications, medical history, or clinical free text. Move any clinical intake to an authorized secure system before requesting medical information.
`;
    await client.emails.send({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: adminRecipients(),
      replyTo: request.email,
      subject,
      text,
    });
    return true;
  } catch (error) {
    console.error(`[care-access] internal alert failed for ${reference}`);
    return false;
  }
}

async function sendCareAccessConfirmation(
  request: CareManualAccessRequest,
  reference: string,
): Promise<boolean> {
  try {
    const { client } = await getResendClient();
    const firstName = request.fullName.trim().split(/\s+/u)[0] || "there";
    const subject = `We received your Xenios Care request (${reference})`;
    const text = `Hi ${firstName},

We received your Xenios Care access request. Your reference is ${reference}.

A human on the Xenios team will review your contact and routing details and follow up through your preferred contact method, typically within one business day. This request is not a medical intake, appointment, clinician-patient relationship, treatment decision, or prescription.

Do not reply with symptoms, diagnoses, medications, medical history, or other medical information. If an appropriate clinical next step is available, we will direct you to an authorized secure system.

If you may be experiencing a medical emergency, call 911 in the United States or contact your local emergency services now.

The Xenios team
`;
    const safeFirstName = escapeHtml(firstName);
    const safeReference = escapeHtml(reference);
    const html = `
      <div style="font-family:Arial,sans-serif;color:#111;max-width:620px;margin:0 auto;padding:32px;">
        <p style="font-size:26px;font-weight:800;margin:0 0 28px;">xenios care</p>
        <h1 style="font-size:30px;line-height:1.1;margin:0 0 20px;">We received your request.</h1>
        <p style="font-size:16px;line-height:1.6;">Hi ${safeFirstName},</p>
        <p style="font-size:16px;line-height:1.6;">Your reference is <strong>${safeReference}</strong>.</p>
        <p style="font-size:16px;line-height:1.6;">A human on the Xenios team will review your contact and routing details and follow up through your preferred contact method, typically within one business day.</p>
        <p style="font-size:16px;line-height:1.6;"><strong>This request is not a medical intake, appointment, clinician-patient relationship, treatment decision, or prescription.</strong></p>
        <p style="font-size:16px;line-height:1.6;">Do not reply with symptoms, diagnoses, medications, medical history, or other medical information. If an appropriate clinical next step is available, we will direct you to an authorized secure system.</p>
        <p style="font-size:14px;line-height:1.6;color:#555;">If you may be experiencing a medical emergency, call 911 in the United States or contact your local emergency services now.</p>
      </div>
    `;
    await client.emails.send({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: request.email,
      replyTo: TEAM_EMAIL,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error(`[care-access] confirmation failed for ${reference}`);
    return false;
  }
}

export function buildCareManualAccessProductionDependencies(): CareManualAccessDependencies {
  return {
    async loadReadiness() {
      const email = await resolveEmailConfiguration();
      return {
        persistenceReady: supabaseConfigured(),
        notificationsReady: email.provider !== "unavailable" && Boolean(email.apiKey),
      };
    },
    async allowRequest(ip) {
      return rateLimitHit(`care-manual-access:${ip}`, 15 * 60, 5);
    },
    async verifyHuman(token, ip) {
      return verifyTurnstile(token, ip);
    },
    async createRequest(request, context) {
      const row = await insertLoi(careManualAccessOperationsRecord(request, context.ip));
      return { id: row.id };
    },
    sendInternalAlert: sendCareAccessInternalAlert,
    sendConfirmation: sendCareAccessConfirmation,
    async setEmailStatus(id, status) {
      await setLoiEmailStatus(id, status);
    },
  };
}

function noStore(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
}

function unavailable(res: Response) {
  return res.status(503).json({
    ok: false,
    code: "care_access_temporarily_unavailable",
    message: "Care requests are temporarily unavailable. Please try again shortly.",
  });
}

export function registerCareManualAccessApi(
  app: Express,
  deps: CareManualAccessDependencies = unconfiguredCareManualAccessDependencies(),
) {
  app.get(CARE_MANUAL_ACCESS_STATUS_PATH, async (_req, res) => {
    noStore(res);
    try {
      res.json(careManualAccessAvailability(await deps.loadReadiness()));
    } catch {
      res.json(careManualAccessAvailability({
        persistenceReady: false,
        notificationsReady: false,
      }));
    }
  });

  app.post(CARE_MANUAL_ACCESS_REQUEST_PATH, async (req: Request, res: Response) => {
    noStore(res);

    if (typeof req.body?.website === "string" && req.body.website.length > 0) {
      return res.status(201).json({
        ok: true,
        reference: "CARE-RECEIVED",
        saved: true,
        confirmationSent: true,
      });
    }

    let availability: CareManualAccessAvailability;
    try {
      availability = careManualAccessAvailability(await deps.loadReadiness());
    } catch {
      return unavailable(res);
    }
    if (!availability.acceptingRequests) return unavailable(res);

    const ip = requestIp(req);
    if (!(await deps.allowRequest(ip))) {
      return res.status(429).json({
        ok: false,
        code: "care_access_rate_limited",
        message: "Too many requests. Please try again in a few minutes.",
      });
    }

    const parsed = careManualAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        code: "invalid_care_access_request",
        message: "Please check the highlighted fields and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    if (!(await deps.verifyHuman(parsed.data.turnstileToken, ip))) {
      return res.status(400).json({
        ok: false,
        code: "care_access_verification_failed",
        message: "Verification failed. Please try again.",
      });
    }

    try {
      const row = await deps.createRequest(parsed.data, { ip });
      const reference = careManualAccessReference(row.id);
      const [internalResult, confirmationResult] = await Promise.allSettled([
        deps.sendInternalAlert(parsed.data, reference),
        deps.sendConfirmation(parsed.data, reference),
      ]);
      const internalSent =
        internalResult.status === "fulfilled" && internalResult.value === true;
      const confirmationSent =
        confirmationResult.status === "fulfilled" && confirmationResult.value === true;
      await deps
        .setEmailStatus(row.id, internalSent && confirmationSent ? "sent" : "failed")
        .catch(() => {});

      return res.status(201).json({
        ok: true,
        reference,
        saved: true,
        confirmationSent,
      });
    } catch {
      console.error("[care-access] durable request creation failed");
      return unavailable(res);
    }
  });
}
