import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  CARE_INSTRUCTION_SOURCE_KINDS,
  CARE_SUPPLY_SOURCE_VERIFICATION_STATES,
} from "@shared/care/instructions";
import {
  CARE_ROUTE_CONTRACTS,
  type CarePermission,
  type CarePrincipal,
  type CareRecordId,
} from "@shared/care/contracts";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import { evaluateCareInstructionReadiness } from "./instructions";
import type { CareInstructionRepository } from "./instruction-repository";

const uuid = z.string().uuid();
const key = z.string().trim().min(8).max(128);
const version = z.number().int().nonnegative();
const privateText = z.string().trim().min(1).max(10000);
const sourceBody = z.object({
  patientId: uuid.nullable(),
  prescriptionId: uuid.nullable(),
  kind: z.enum(CARE_INSTRUCTION_SOURCE_KINDS),
  sourceReference: z.string().trim().min(1).max(1000),
  contentHash: z.string().trim().min(8).max(500),
  content: privateText,
  idempotencyKey: key,
}).strict();
const draftBody = z.object({
  patientId: uuid,
  prescriptionId: uuid,
  instructionContent: privateText,
  pharmacyLabelSourceId: uuid,
  pharmacyInformationSourceId: uuid,
  clinicianDirectionSourceId: uuid,
  manufacturerMaterialSourceId: uuid,
  supersedesInstructionId: uuid.nullable().default(null),
  idempotencyKey: key,
}).strict();
const actionBody = z.object({ expectedVersion: version, idempotencyKey: key }).strict();
const acknowledgmentBody = z.object({ instructionVersion: version.min(1), idempotencyKey: key }).strict();
const supplyBody = z.object({
  patientId: uuid,
  prescriptionId: uuid,
  instructionId: uuid,
  supplySourceId: uuid,
  productSpecificDevice: z.string().trim().min(1).max(2000),
  replacementCadence: z.string().trim().min(1).max(2000),
  supersedesSupplyKitId: uuid.nullable().default(null),
  idempotencyKey: key,
}).strict();
const supplySourceBody = z.object({
  supplySourceId: uuid.nullable().default(null),
  legalName: z.string().trim().min(1).max(500).nullable(),
  relationshipReference: z.string().trim().min(1).max(1000).nullable(),
  supportReference: z.string().trim().min(1).max(1000).nullable(),
  verificationState: z.enum(CARE_SUPPLY_SOURCE_VERIFICATION_STATES),
  expectedVersion: version,
  idempotencyKey: key,
}).strict();
const replacementActionBody = z.object({
  expectedVersion: version,
  action: z.enum(["approve", "fulfill", "decline", "cancel"]),
  idempotencyKey: key,
}).strict();

const principal = (res: Response) =>
  (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
const invalid = (res: Response) =>
  res.status(400).json({ ok: false, code: "care_invalid_request" });
const safe = (res: Response) => sendCareTemporarilyUnavailable(res);

export function registerCareInstructionApi(
  app: Express,
  access: CareAccessDependencies,
  repository: CareInstructionRepository,
  now: () => Date = () => new Date(),
) {
  const registerSourceRoute = (
    path: string,
    permission: CarePermission,
    allowedKinds: readonly (typeof CARE_INSTRUCTION_SOURCE_KINDS)[number][],
  ) => {
    app.post(
      path,
      requireCarePermission(permission, access),
      async (req: Request, res) => {
        res.set("Cache-Control", "no-store");
        const parsed = sourceBody.safeParse(req.body);
        const actorUserId = principal(res)?.subjectId;
        if (!parsed.success || !allowedKinds.includes(parsed.data.kind)) {
          return invalid(res);
        }
        if (!actorUserId) return safe(res);
        try {
          return res.status(201).json({
            ok: true,
            source: await repository.createSource({
              ...parsed.data,
              patientId: parsed.data.patientId as CareRecordId | null,
              prescriptionId: parsed.data.prescriptionId as CareRecordId | null,
              actorUserId,
              occurredAt: now().toISOString(),
            }),
          });
        } catch {
          return safe(res);
        }
      },
    );
  };

  registerSourceRoute(
    `${CARE_ROUTE_CONTRACTS.instructions}/sources/clinician`,
    "care:prescribe_assigned",
    ["clinician_direction"],
  );
  registerSourceRoute(
    `${CARE_ROUTE_CONTRACTS.instructions}/sources/pharmacy`,
    "care:pharmacy_assigned",
    ["pharmacy_label", "pharmacy_information"],
  );
  registerSourceRoute(
    `${CARE_ROUTE_CONTRACTS.instructions}/sources/admin`,
    "care:administer",
    ["manufacturer_material", "general_education"],
  );

  app.get(
    CARE_ROUTE_CONTRACTS.instructions,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safe(res);
      try {
        return res.json({
          ok: true,
          instructions: await repository.listPatientInstructions(patientId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    CARE_ROUTE_CONTRACTS.instructions,
    requireCarePermission("care:prescribe_assigned", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = draftBody.safeParse(req.body);
      const clinicianUserId = principal(res)?.subjectId;
      if (!parsed.success) return invalid(res);
      if (!clinicianUserId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          instruction: await repository.createInstructionDraft({
            ...parsed.data,
            patientId: parsed.data.patientId as CareRecordId,
            prescriptionId: parsed.data.prescriptionId as CareRecordId,
            pharmacyLabelSourceId: parsed.data.pharmacyLabelSourceId as CareRecordId,
            pharmacyInformationSourceId:
              parsed.data.pharmacyInformationSourceId as CareRecordId,
            clinicianDirectionSourceId:
              parsed.data.clinicianDirectionSourceId as CareRecordId,
            manufacturerMaterialSourceId:
              parsed.data.manufacturerMaterialSourceId as CareRecordId,
            supersedesInstructionId:
              parsed.data.supersedesInstructionId as CareRecordId | null,
            clinicianUserId,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.instructions}/:instructionId/release`,
    requireCarePermission("care:prescribe_assigned", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = actionBody.safeParse(req.body);
      const instructionId = uuid.safeParse(req.params.instructionId);
      const clinicianUserId = principal(res)?.subjectId;
      if (!parsed.success || !instructionId.success) return invalid(res);
      if (!clinicianUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          instruction: await repository.releaseInstruction({
            instructionId: instructionId.data as CareRecordId,
            clinicianUserId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.instructions}/:instructionId/acknowledge`,
    requireCarePermission("care:read_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = acknowledgmentBody.safeParse(req.body);
      const instructionId = uuid.safeParse(req.params.instructionId);
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!parsed.success || !instructionId.success) return invalid(res);
      if (!patientId) return safe(res);
      try {
        return res.json({
          ok: true,
          instruction: await repository.acknowledgeInstruction({
            instructionId: instructionId.data as CareRecordId,
            patientId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.get(
    CARE_ROUTE_CONTRACTS.supplies,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!patientId) return safe(res);
      try {
        const [supplyKits, replacements] = await Promise.all([
          repository.listPatientSupplyKits(patientId),
          repository.listPatientReplacements(patientId),
        ]);
        return res.json({ ok: true, supplyKits, replacements });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.supplies}/:supplyKitId/replacements`,
    requireCarePermission("care:read_self", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = z.object({ idempotencyKey: key }).strict().safeParse(req.body);
      const supplyKitId = uuid.safeParse(req.params.supplyKitId);
      const patientId = principal(res)?.patientId as CareRecordId | undefined;
      if (!parsed.success || !supplyKitId.success) return invalid(res);
      if (!patientId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          replacement: await repository.requestReplacement({
            supplyKitId: supplyKitId.data as CareRecordId,
            patientId,
            idempotencyKey: parsed.data.idempotencyKey,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.get(
    `${CARE_ROUTE_CONTRACTS.supplies}/pharmacy/replacements`,
    requireCarePermission("care:pharmacy_assigned", access),
    async (_req, res) => {
      res.set("Cache-Control", "no-store");
      const operatorUserId = principal(res)?.subjectId;
      if (!operatorUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          replacements: await repository.listAssignedReplacements(operatorUserId),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.supplies}/pharmacy/replacements/:replacementId/action`,
    requireCarePermission("care:pharmacy_assigned", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = replacementActionBody.safeParse(req.body);
      const replacementId = uuid.safeParse(req.params.replacementId);
      const actorUserId = principal(res)?.subjectId;
      if (!parsed.success || !replacementId.success) return invalid(res);
      if (!actorUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          replacement: await repository.applyReplacementAction({
            replacementId: replacementId.data as CareRecordId,
            actorUserId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );

  app.get(
    `${CARE_ROUTE_CONTRACTS.instructions}/admin/readiness`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const prescriptionId =
        typeof req.query.prescriptionId === "string" &&
        uuid.safeParse(req.query.prescriptionId).success
          ? (req.query.prescriptionId as CareRecordId)
          : null;
      try {
        return res.json({
          ok: true,
          readiness: evaluateCareInstructionReadiness(
            await repository.loadReadiness(prescriptionId),
          ),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.supplies}/admin/sources`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = supplySourceBody.safeParse(req.body);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        return res.status(parsed.data.supplySourceId ? 200 : 201).json({
          ok: true,
          supplySource: await repository.saveSupplySource({
            ...parsed.data,
            supplySourceId:
              parsed.data.supplySourceId as CareRecordId | null,
            adminUserId,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.supplies}/admin/kits`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = supplyBody.safeParse(req.body);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        return res.status(201).json({
          ok: true,
          supplyKit: await repository.createSupplyKit({
            ...parsed.data,
            patientId: parsed.data.patientId as CareRecordId,
            prescriptionId: parsed.data.prescriptionId as CareRecordId,
            instructionId: parsed.data.instructionId as CareRecordId,
            supplySourceId: parsed.data.supplySourceId as CareRecordId,
            supersedesSupplyKitId:
              parsed.data.supersedesSupplyKitId as CareRecordId | null,
            adminUserId,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );
  app.post(
    `${CARE_ROUTE_CONTRACTS.supplies}/admin/kits/:supplyKitId/release`,
    requireCarePermission("care:administer", access),
    async (req: Request, res) => {
      res.set("Cache-Control", "no-store");
      const parsed = actionBody.safeParse(req.body);
      const supplyKitId = uuid.safeParse(req.params.supplyKitId);
      const adminUserId = principal(res)?.subjectId;
      if (!parsed.success || !supplyKitId.success) return invalid(res);
      if (!adminUserId) return safe(res);
      try {
        return res.json({
          ok: true,
          supplyKit: await repository.releaseSupplyKit({
            supplyKitId: supplyKitId.data as CareRecordId,
            adminUserId,
            ...parsed.data,
            occurredAt: now().toISOString(),
          }),
        });
      } catch {
        return safe(res);
      }
    },
  );
}
