import type { Express, Request, Response } from "express";
import { z } from "zod";
import { CARE_ROUTE_CONTRACTS, type CarePrincipal, type CareRecordId } from "@shared/care/contracts";
import { CARE_CONSENT_KINDS } from "@shared/care/consent";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import type { CareEligibilityRepository } from "./eligibility-repository";
import { evaluateCareEligibility, normalizeCareStateCode } from "./eligibility";
import { authorizeCareWaitlistChange } from "./waitlist";

const idempotencyKey = z.string().trim().min(8).max(128);
const locationBody = z.object({
  stateCode: z.string().trim().min(2).max(2),
  source: z.literal("patient_attestation"),
  idempotencyKey,
}).strict();
const waitlistBody = z.object({
  action: z.enum(["joined", "withdrawn"]),
  stateCode: z.string().trim().min(2).max(2),
  idempotencyKey,
}).strict();
const consentBody = z.object({
  kind: z.enum(CARE_CONSENT_KINDS),
  documentVersion: z.string().trim().min(1).max(120),
  action: z.enum(["granted", "revoked"]),
  idempotencyKey,
}).strict();

function carePrincipal(res: Response): CarePrincipal | null {
  return (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
}

function patientId(res: Response): CareRecordId | null {
  const principal = carePrincipal(res);
  return principal?.patientId
    ? (principal.patientId as CareRecordId)
    : null;
}

function sendInvalidRequest(res: Response, code = "care_invalid_request") {
  return res.status(400).json({ ok: false, code });
}

async function loadDecision(input: {
  res: Response;
  repository: CareEligibilityRepository;
  now: () => Date;
}) {
  const id = patientId(input.res);
  if (!id) throw new Error("care_patient_profile_missing");
  const context = await input.repository.loadContext(id, true);
  const decision = evaluateCareEligibility(context, input.now());
  await input.repository.recordEligibilityDecision(
    decision,
    context.location?.id ?? null,
  );
  return { id, context, decision };
}

/**
 * Clinical classification of this module: nothing here is clinical, so nothing
 * here is gated on a clinical capability.
 *
 *   GET  /eligibility                a coverage answer, no clinical content
 *   POST /eligibility/location       a state attestation used for coverage
 *   POST /eligibility/waitlist       a waitlist record
 *   POST /consents                   a consent grant or revocation
 *
 * Consent in particular must keep working with every clinical capability off.
 * It is the prerequisite for care rather than an act of care, and a person has
 * to be able to revoke a consent at any time, so putting a clinical capability
 * in front of it would be both wrong and unsafe. All four stay behind
 * `requireCarePermission` and the Care capability status.
 */
export function registerCareEligibilityApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareEligibilityRepository,
  now: () => Date = () => new Date(),
) {
  app.get(
    CARE_ROUTE_CONTRACTS.eligibility,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const { context, decision } = await loadDecision({
          res,
          repository,
          now,
        });
        return res.json({
          ok: true,
          decision,
          consent: {
            telehealth: context.telehealthConsent,
            privacyNotice: context.privacyConsent,
          },
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.eligibilityLocation,
    requireCarePermission("care:intake_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = locationBody.safeParse(req.body);
      if (!parsed.success) return sendInvalidRequest(res);
      const normalized = normalizeCareStateCode(parsed.data.stateCode);
      if (!normalized) return sendInvalidRequest(res, "care_invalid_state");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        await repository.recordLocation({
          patientId: id,
          stateCode: normalized,
          source: parsed.data.source,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        const { decision } = await loadDecision({ res, repository, now });
        return res.status(201).json({ ok: true, decision });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.eligibilityWaitlist,
    requireCarePermission("care:intake_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = waitlistBody.safeParse(req.body);
      if (!parsed.success) return sendInvalidRequest(res);
      const normalized = normalizeCareStateCode(parsed.data.stateCode);
      if (!normalized) return sendInvalidRequest(res, "care_invalid_state");
      try {
        const { id, decision } = await loadDecision({
          res,
          repository,
          now,
        });
        const gate = authorizeCareWaitlistChange(
          decision,
          normalized,
          parsed.data.action,
        );
        if (!gate.allowed) {
          return res.status(409).json({
            ok: false,
            code: `care_${gate.reason}`,
          });
        }
        const entry = await repository.changeWaitlist({
          patientId: id,
          stateCode: gate.stateCode,
          action: parsed.data.action,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        return res.status(201).json({ ok: true, waitlist: entry });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.consents,
    requireCarePermission("care:intake_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = consentBody.safeParse(req.body);
      if (!parsed.success) return sendInvalidRequest(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        if (parsed.data.action === "granted") {
          const { decision } = await loadDecision({
            res,
            repository,
            now,
          });
          const expectedReason =
            parsed.data.kind === "telehealth"
              ? "telehealth_consent_required"
              : "privacy_notice_required";
          if (
            decision.outcome !== "consent_required" ||
            decision.reason !== expectedReason
          ) {
            return res.status(409).json({
              ok: false,
              code: "care_consent_prerequisites_incomplete",
            });
          }
        }
        const consent = await repository.recordConsent({
          patientId: id,
          ...parsed.data,
          occurredAt: now().toISOString(),
        });
        return res.status(201).json({ ok: true, consent });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}
