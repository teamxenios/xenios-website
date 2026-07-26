import type { Express, Response } from "express";
import { z } from "zod";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import type { CareIntakeResponseValue } from "@shared/care/intake";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import type { CareEligibilityRepository } from "./eligibility-repository";
import type { CareIntakeRepository } from "./intake-repository";
import { evaluateCareEligibility } from "./eligibility";
import {
  authorizeCareIntakeStart,
  validateCareIntakeResponses,
} from "./intake";

const idempotencyKey = z.string().trim().min(8).max(128);
const startBody = z.object({ idempotencyKey }).strict();
const responses = z.record(
  z.string().min(1).max(120),
  z.union([
    z.string().max(4_000),
    z.boolean(),
    z.array(z.string().max(240)).max(100),
  ]),
);
const autosaveBody = z.object({
  expectedVersion: z.number().int().min(0),
  responses,
  idempotencyKey,
}).strict();
const submitBody = z.object({
  expectedVersion: z.number().int().min(0),
  idempotencyKey,
}).strict();

function patientId(res: Response): CareRecordId | null {
  const principal = res.locals.carePrincipal as CarePrincipal | undefined;
  return principal?.patientId
    ? (principal.patientId as CareRecordId)
    : null;
}

function invalid(res: Response, code = "care_invalid_request") {
  return res.status(400).json({ ok: false, code });
}

export function registerCareIntakeApi(
  app: Express,
  access: CareAccessDependencies,
  eligibilityRepository: CareEligibilityRepository,
  intakeRepository: CareIntakeRepository,
  now: () => Date = () => new Date(),
) {
  app.get(
    CARE_ROUTE_CONTRACTS.intake,
    requireCarePermission("care:intake_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const [intake, definition] = await Promise.all([
          intakeRepository.loadCurrentIntake(id),
          intakeRepository.loadApprovedDefinition(),
        ]);
        const revision = intake
          ? await intakeRepository.loadLatestRevision(id, intake.id)
          : null;
        return res.json({
          ok: true,
          intake,
          revision,
          definition,
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    CARE_ROUTE_CONTRACTS.intake,
    requireCarePermission("care:intake_self", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = startBody.safeParse(req.body);
      if (!parsed.success) return invalid(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const [context, definition] = await Promise.all([
          eligibilityRepository.loadContext(id, true),
          intakeRepository.loadApprovedDefinition(),
        ]);
        const eligibility = evaluateCareEligibility(context, now());
        await eligibilityRepository.recordEligibilityDecision(
          eligibility,
          context.location?.id ?? null,
        );
        const gate = authorizeCareIntakeStart({
          eligibility,
          definition,
          telehealthConsent: context.telehealthConsent,
          privacyConsent: context.privacyConsent,
        });
        if (!gate.allowed) {
          return res.status(409).json({
            ok: false,
            code: `care_intake_${gate.reason}`,
          });
        }
        const intake = await intakeRepository.startIntake({
          patientId: id,
          definition: definition!,
          telehealthConsentEventId:
            context.telehealthConsent.activeEvent!.id,
          privacyConsentEventId: context.privacyConsent.activeEvent!.id,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        return res.status(201).json({ ok: true, intake });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.patch(
    `${CARE_ROUTE_CONTRACTS.intake}/:intakeId/autosave`,
    requireCarePermission("care:intake_self", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = autosaveBody.safeParse(req.body);
      if (!parsed.success) return invalid(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      try {
        const [intake, definition] = await Promise.all([
          intakeRepository.loadCurrentIntake(id),
          intakeRepository.loadApprovedDefinition(),
        ]);
        if (
          !intake ||
          intake.id !== (req.params.intakeId as CareRecordId) ||
          !definition ||
          definition.id !== intake.definitionId ||
          definition.version !== intake.definitionVersion
        ) {
          return res.status(409).json({
            ok: false,
            code: "care_intake_definition_unavailable",
          });
        }
        const validation = validateCareIntakeResponses(
          definition,
          parsed.data.responses as Record<string, CareIntakeResponseValue>,
          false,
        );
        if (!validation.valid) {
          return invalid(res, `care_intake_${validation.code}`);
        }
        const revision = await intakeRepository.autosave({
          patientId: id,
          intakeId: req.params.intakeId as CareRecordId,
          expectedVersion: parsed.data.expectedVersion,
          responses: parsed.data.responses,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, revision });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  app.post(
    `${CARE_ROUTE_CONTRACTS.intake}/:intakeId/submit`,
    requireCarePermission("care:intake_self", access),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = submitBody.safeParse(req.body);
      if (!parsed.success) return invalid(res);
      const id = patientId(res);
      if (!id) return sendCareTemporarilyUnavailable(res);
      const intakeId = req.params.intakeId as CareRecordId;
      try {
        const [currentIntake, definition, revision] = await Promise.all([
          intakeRepository.loadCurrentIntake(id),
          intakeRepository.loadApprovedDefinition(),
          intakeRepository.loadLatestRevision(id, intakeId),
        ]);
        if (
          !currentIntake ||
          currentIntake.id !== intakeId ||
          !definition ||
          definition.id !== currentIntake.definitionId ||
          definition.version !== currentIntake.definitionVersion ||
          !revision
        ) {
          return res.status(409).json({
            ok: false,
            code: "care_intake_incomplete",
          });
        }
        const validation = validateCareIntakeResponses(
          definition,
          revision.responses,
          true,
        );
        if (!validation.valid) {
          return res.status(409).json({
            ok: false,
            code: `care_intake_${validation.code}`,
          });
        }
        const intake = await intakeRepository.submit({
          patientId: id,
          intakeId,
          expectedVersion: parsed.data.expectedVersion,
          idempotencyKey: parsed.data.idempotencyKey,
          occurredAt: now().toISOString(),
        });
        return res.json({ ok: true, intake });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}
