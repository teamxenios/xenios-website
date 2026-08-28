import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareEligibilityContext } from "@shared/care/eligibility";
import type { CareIntakeDefinition } from "@shared/care/intake";
import type { CareAccessDependencies } from "./access";
import type { CareEligibilityRepository } from "./eligibility-repository";
import type { CareIntakeRepository } from "./intake-repository";
import { registerCareIntakeApi } from "./intake-routes";

const patientId = "patient-1" as CareRecordId;
const intakeId = "intake-1" as CareRecordId;
const definition: CareIntakeDefinition = {
  id: "definition-1" as CareRecordId,
  version: "approved-v1",
  status: "approved",
  schemaHash: "sha256:approved",
  fields: [
    { key: "approved_field", kind: "text", required: true, options: [] },
  ],
  approvedAt: "2026-07-25T18:00:00.000Z",
};

function access(): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care",
      state: "enabled",
      enabled: true,
      publicMessage: "Enabled for isolated test.",
      checkedAt: "2026-07-25T20:00:00.000Z",
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId: "user-1",
      patientId,
      roles: ["care_patient"],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function eligibilityContext(): CareEligibilityContext {
  const event = (
    kind: "telehealth" | "privacy_notice",
  ) => ({
    id: (kind === "privacy_notice"
      ? "privacy-event"
      : "telehealth-event") as CareRecordId,
    patientId,
    documentId: `${kind}-document` as CareRecordId,
    kind,
    documentVersion: "approved-v1",
    action: "granted" as const,
    occurredAt: "2026-07-25T19:00:00.000Z",
  });
  return {
    patientId,
    capabilityEnabled: true,
    location: {
      id: "location-1" as CareRecordId,
      patientId,
      stateCode: "IL",
      source: "patient_attestation",
      attestedAt: "2026-07-25T18:00:00.000Z",
      supersedesLocationId: null,
    },
    identity: {
      patientId,
      state: "verified",
      verifiedAt: "2026-07-25T18:00:00.000Z",
    },
    coverage: {
      stateCode: "IL",
      supportedStateActive: true,
      serviceCoverageActive: true,
      waitlistEnabled: false,
      activeClinicianCount: 1,
    },
    telehealthConsent: {
      kind: "telehealth",
      requiredDocument: {
        id: "telehealth-document" as CareRecordId,
        kind: "telehealth",
        version: "approved-v1",
        contentHash: "sha256:approved",
        status: "approved",
        approvedAt: "2026-07-25T18:00:00.000Z",
        effectiveAt: "2026-07-25T18:00:00.000Z",
      },
      activeEvent: event("telehealth"),
      satisfied: true,
      reason: "active",
    },
    privacyConsent: {
      kind: "privacy_notice",
      requiredDocument: {
        id: "privacy_notice-document" as CareRecordId,
        kind: "privacy_notice",
        version: "approved-v1",
        contentHash: "sha256:approved",
        status: "approved",
        approvedAt: "2026-07-25T18:00:00.000Z",
        effectiveAt: "2026-07-25T18:00:00.000Z",
      },
      activeEvent: event("privacy_notice"),
      satisfied: true,
      reason: "active",
    },
  };
}

function eligibilityRepository(
  context: CareEligibilityContext = eligibilityContext(),
): CareEligibilityRepository {
  return {
    loadContext: vi.fn(async () => context),
    recordLocation: vi.fn(),
    recordEligibilityDecision: vi.fn(async () => undefined),
    changeWaitlist: vi.fn(),
    recordConsent: vi.fn(),
  };
}

function intakeRepository(
  overrides: Partial<CareIntakeRepository> = {},
): CareIntakeRepository {
  const currentIntake = {
    id: intakeId,
    patientId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    telehealthConsentEventId: "telehealth-event" as CareRecordId,
    privacyConsentEventId: "privacy-event" as CareRecordId,
    status: "draft" as const,
    version: 1,
    createdAt: "2026-07-25T20:00:00.000Z",
    submittedAt: null,
  };
  return {
    loadApprovedDefinition: vi.fn(async () => definition),
    loadCurrentIntake: vi.fn(async () => currentIntake),
    loadLatestRevision: vi.fn(async () => ({
      id: "revision-1" as CareRecordId,
      intakeId,
      patientId,
      version: 1,
      responses: { approved_field: "fixture" },
      idempotencyKey: "save-key-1",
      createdAt: "2026-07-25T20:00:00.000Z",
    })),
    startIntake: vi.fn(async (input) => ({
      id: intakeId,
      patientId: input.patientId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      telehealthConsentEventId: input.telehealthConsentEventId,
      privacyConsentEventId: input.privacyConsentEventId,
      status: "draft",
      version: 0,
      createdAt: input.occurredAt,
      submittedAt: null,
    })),
    autosave: vi.fn(async (input) => ({
      id: "revision-1" as CareRecordId,
      intakeId: input.intakeId,
      patientId: input.patientId,
      version: input.expectedVersion + 1,
      responses: input.responses,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.occurredAt,
    })),
    submit: vi.fn(async (input) => ({
      id: input.intakeId,
      patientId: input.patientId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      telehealthConsentEventId: "telehealth-event" as CareRecordId,
      privacyConsentEventId: "privacy-event" as CareRecordId,
      status: "submitted",
      version: input.expectedVersion,
      createdAt: "2026-07-25T20:00:00.000Z",
      submittedAt: input.occurredAt,
    })),
    ...overrides,
  };
}

const CLINICAL_CAPABILITIES_ON = {
  provider_actions: true,
  prescribing: true,
  clinical_fulfillment: true,
  external_communications: true,
  real_patient_data: true,
} as const;

function app(
  intakes: CareIntakeRepository,
  eligibility: CareEligibilityRepository = eligibilityRepository(),
) {
  const instance = express();
  instance.use(express.json());
  registerCareIntakeApi(
    instance,
    access(),
    eligibility,
    intakes,
    () => new Date("2026-07-25T20:00:00.000Z"),
    { readFlags: () => CLINICAL_CAPABILITIES_ON },
  );
  return instance;
}

describe("Care PR 2 intake routes", () => {
  it("starts only an approved, exact-consent-bound draft", async () => {
    const repo = intakeRepository();
    const response = await request(app(repo))
      .post("/api/care/intake")
      .send({ idempotencyKey: "intake-start-key-1" });
    expect(response.status).toBe(201);
    expect(response.body.intake).toMatchObject({
      patientId,
      status: "draft",
      version: 0,
    });
    expect(repo.startIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        definition,
        idempotencyKey: "intake-start-key-1",
      }),
    );
  });

  it("fails closed when no approved definition exists", async () => {
    const response = await request(
      app(
        intakeRepository({
          loadApprovedDefinition: vi.fn(async () => null),
        }),
      ),
    )
      .post("/api/care/intake")
      .send({ idempotencyKey: "intake-start-key-1" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(
      "care_intake_definition_unavailable",
    );
  });

  it("rejects fields absent from the approved definition before persistence", async () => {
    const repo = intakeRepository();
    const response = await request(app(repo))
      .patch(`/api/care/intake/${intakeId}/autosave`)
      .send({
        expectedVersion: 0,
        responses: { invented_medical_question: "value" },
        idempotencyKey: "intake-save-key-1",
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("care_intake_unknown_field");
    expect(repo.autosave).not.toHaveBeenCalled();
  });

  it("always binds patient identity from the authenticated principal", async () => {
    const repo = intakeRepository();
    await request(app(repo))
      .patch(`/api/care/intake/${intakeId}/autosave`)
      .send({
        expectedVersion: 0,
        responses: { approved_field: "value" },
        idempotencyKey: "intake-save-key-1",
        patientId: "attacker-controlled",
      });
    expect(repo.autosave).not.toHaveBeenCalled();

    const accepted = await request(app(repo))
      .patch(`/api/care/intake/${intakeId}/autosave`)
      .send({
        expectedVersion: 0,
        responses: { approved_field: "value" },
        idempotencyKey: "intake-save-key-1",
      });
    expect(accepted.status).toBe(200);
    expect(repo.autosave).toHaveBeenCalledWith(
      expect.objectContaining({ patientId }),
    );
  });

  it("rejects autosave when the approved definition is not the draft's exact version", async () => {
    const repo = intakeRepository({
      loadApprovedDefinition: vi.fn(async () => ({
        ...definition,
        id: "definition-2" as CareRecordId,
        version: "approved-v2",
      })),
    });
    const response = await request(app(repo))
      .patch(`/api/care/intake/${intakeId}/autosave`)
      .send({
        expectedVersion: 1,
        responses: { approved_field: "value" },
        idempotencyKey: "intake-save-key-2",
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(
      "care_intake_definition_unavailable",
    );
    expect(repo.autosave).not.toHaveBeenCalled();
  });

  it("rejects submit when the authenticated patient's current intake does not match", async () => {
    const repo = intakeRepository({
      loadCurrentIntake: vi.fn(async () => null),
    });
    const response = await request(app(repo))
      .post(`/api/care/intake/${intakeId}/submit`)
      .send({
        expectedVersion: 1,
        idempotencyKey: "intake-submit-key-2",
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("care_intake_incomplete");
    expect(repo.submit).not.toHaveBeenCalled();
  });

  it.each(["telehealthConsent", "privacyConsent"] as const)(
    "blocks autosave and submit after a later %s revocation",
    async (consentKey) => {
      const current = eligibilityContext();
      const revoked = {
        ...current,
        [consentKey]: {
          ...current[consentKey],
          activeEvent: null,
          satisfied: false,
          reason: "revoked" as const,
        },
      };
      const repo = intakeRepository();
      const instance = app(repo, eligibilityRepository(revoked));

      const autosave = await request(instance)
        .patch(`/api/care/intake/${intakeId}/autosave`)
        .send({
          expectedVersion: 1,
          responses: { approved_field: "value" },
          idempotencyKey: `revoked-${consentKey}-save`,
        });
      const submit = await request(instance)
        .post(`/api/care/intake/${intakeId}/submit`)
        .send({
          expectedVersion: 1,
          idempotencyKey: `revoked-${consentKey}-submit`,
        });

      expect(autosave.status).toBe(409);
      expect(autosave.body.code).toBe("care_intake_consent_required");
      expect(submit.status).toBe(409);
      expect(submit.body.code).toBe("care_intake_consent_required");
      expect(repo.autosave).not.toHaveBeenCalled();
      expect(repo.submit).not.toHaveBeenCalled();
    },
  );

  it("blocks autosave and submit after the required privacy notice is superseded", async () => {
    const current = eligibilityContext();
    const superseded = {
      ...current,
      privacyConsent: {
        ...current.privacyConsent,
        requiredDocument: {
          ...current.privacyConsent.requiredDocument!,
          id: "privacy_notice-document-v2" as CareRecordId,
          version: "approved-v2",
        },
        activeEvent: null,
        satisfied: false,
        reason: "wrong_version" as const,
      },
    };
    const repo = intakeRepository();
    const instance = app(repo, eligibilityRepository(superseded));

    const autosave = await request(instance)
      .patch(`/api/care/intake/${intakeId}/autosave`)
      .send({
        expectedVersion: 1,
        responses: { approved_field: "value" },
        idempotencyKey: "superseded-privacy-save",
      });
    const submit = await request(instance)
      .post(`/api/care/intake/${intakeId}/submit`)
      .send({
        expectedVersion: 1,
        idempotencyKey: "superseded-privacy-submit",
      });

    expect(autosave.status).toBe(409);
    expect(autosave.body.code).toBe("care_intake_consent_required");
    expect(submit.status).toBe(409);
    expect(submit.body.code).toBe("care_intake_consent_required");
    expect(repo.autosave).not.toHaveBeenCalled();
    expect(repo.submit).not.toHaveBeenCalled();
  });

  it("continues autosave and submit only while both exact bound grants are current", async () => {
    const repo = intakeRepository();
    const instance = app(repo);

    const autosave = await request(instance)
      .patch(`/api/care/intake/${intakeId}/autosave`)
      .send({
        expectedVersion: 1,
        responses: { approved_field: "value" },
        idempotencyKey: "current-consent-save",
      });
    const submit = await request(instance)
      .post(`/api/care/intake/${intakeId}/submit`)
      .send({
        expectedVersion: 1,
        idempotencyKey: "current-consent-submit",
      });

    expect(autosave.status).toBe(200);
    expect(submit.status).toBe(200);
    expect(repo.autosave).toHaveBeenCalledTimes(1);
    expect(repo.submit).toHaveBeenCalledTimes(1);
  });

  it("returns stable safe 503 JSON for repository failures", async () => {
    const response = await request(
      app(
        intakeRepository({
          loadCurrentIntake: vi.fn(async () => {
            throw new Error("private adapter detail");
          }),
        }),
      ),
    ).get("/api/care/intake");
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_temporarily_unavailable");
    expect(JSON.stringify(response.body)).not.toContain("private adapter");
  });
});
