import type { Express, Request, Response } from "express";
import {
  RESEARCH_INQUIRY_API_PATH,
  researchInquiryAcceptedResponseSchema,
  researchInquiryRequestSchema,
} from "@shared/research/inquiries";
import { requestIp } from "../rate-limit";
import {
  buildDurableInquiryRecord,
  researchInquiryAcceptedResponse,
  type ResearchInquiryDependencies,
} from "./service";

function privateResponse(res: Response): void {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
}

function unavailable(res: Response) {
  return res.status(503).json({
    ok: false,
    code: "inquiry_temporarily_unavailable",
    message:
      "We couldn't confirm that your inquiry was saved. Please don't resend yet.",
  });
}

export function registerResearchInquiryApi(
  app: Express,
  dependencies: ResearchInquiryDependencies,
): void {
  app.post(RESEARCH_INQUIRY_API_PATH, async (req: Request, res: Response) => {
    privateResponse(res);

    if (typeof req.body?.website === "string" && req.body.website.length > 0) {
      return res.status(422).json({
        ok: false,
        code: "inquiry_not_submitted",
        message: "That form could not be submitted. Please check it and try again.",
      });
    }

    let ready = false;
    try {
      ready = await dependencies.persistenceReady();
    } catch {
      return unavailable(res);
    }
    if (!ready) return unavailable(res);

    const ip = requestIp(req);
    try {
      if (!(await dependencies.allowRequest(ip))) {
        return res.status(429).json({
          ok: false,
          code: "inquiry_rate_limited",
          message: "Too many requests. Please try again in a few minutes.",
        });
      }
    } catch {
      return unavailable(res);
    }

    const parsed = researchInquiryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      const fieldErrors = Object.fromEntries(
        Object.entries(flattened).flatMap(([field, messages]) =>
          messages?.[0] ? [[field, messages[0]]] : [],
        ),
      );
      return res.status(400).json({
        ok: false,
        code: "invalid_inquiry",
        message: "Please check the highlighted fields and try again.",
        fieldErrors,
      });
    }

    try {
      if (!(await dependencies.verifyHuman(parsed.data.turnstileToken, ip))) {
        return res.status(400).json({
          ok: false,
          code: "inquiry_verification_failed",
          message: "Verification failed. Please try again.",
        });
      }
    } catch {
      return unavailable(res);
    }

    try {
      const record = buildDurableInquiryRecord(parsed.data, {
        ip,
        recordedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      });
      const receipt = await dependencies.persist(record);
      if (receipt.id !== record.id) return unavailable(res);
      let confirmationDelivery: "queued" | "not_queued" = "not_queued";
      try {
        const notification = await dependencies.notify(record);
        confirmationDelivery = notification.customer;
        if (notification.operator !== "queued") {
          console.error("[public-inquiry] operator notification was not queued; durable founder lane remains authoritative");
        }
      } catch {
        // The durable inquiry is already accepted. A mail/outbox outage must
        // not turn a real receipt into an uncertain response or invite a
        // duplicate submission; the founder command-center lane still owns it.
        console.error("[public-inquiry] notification enqueue unavailable after durable acceptance");
      }
      const body = researchInquiryAcceptedResponseSchema.parse(
        researchInquiryAcceptedResponse({
          record,
          replayed: receipt.replayed,
          confirmationDelivery,
        }),
      );
      return res.status(receipt.replayed ? 200 : 201).json(body);
    } catch {
      console.error("[public-inquiry] durable inquiry creation was not confirmed");
      return unavailable(res);
    }
  });
}
