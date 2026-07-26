import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareEligibilityRepository } from "./eligibility-repository";
import { registerCareEligibilityApi } from "./eligibility-routes";
import type { CareAccessDependencies } from "./access";

const patientId = "patient-1" as CareRecordId;
const locationId = "location-1" as CareRecordId;

function access(
  overrides: Partial<CareAccessDependencies> = {},
): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care",
      state: "enabled",
      enabled: true,
      publicMessage: "Care enabled for testing only.",
      checkedAt: "2026-07-25T20:00:00.000Z",
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId: "user-1",
      patientId,
      roles: ["care_patient"],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
    ...overrides,
  };
}

function repository(
  overrides: Partial<CareEligibilityRepository> = {},
): CareEligibilityRepository {
  return {
    loadContext: vi.fn(async () => ({
      patientId,
      capabilityEnabled: true,
      location: {
        id: locationId,
        patientId,
        stateCode: "IL",
        source: "patient_attestation",
        attestedAt: "2026-07-25T19:00:00.000Z",
        supersedesLocationId: null,
      },
      identity: {
        patientId,
        state: "verified",
        verifiedAt: "2026-07-25T19:00:00.000Z",
      },
      coverage: {
        stateCode: "IL",
        supportedStateActive: true,
        serviceCoverageActive: false,
        waitlistEnabled: true,
        activeClinicianCount: 0,
      },
      telehealthConsent: {
        kind: "telehealth",
        requiredDocument: null,
        activeEvent: null,
        satisfied: false,
        reason: "document_unavailable",
      },
      privacyConsent: {
        kind: "privacy_notice",
        requiredDocument: null,
        activeEvent: null,
        satisfied: false,
        reason: "document_unavailable",
      },
    })),
    recordLocation: vi.fn(async (input) => ({
      id: locationId,
      patientId: input.patientId,
      stateCode: input.stateCode,
      source: input.source,
      attestedAt: input.occurredAt,
      supersedesLocationId: null,
    })),
    recordEligibilityDecision: vi.fn(async () => undefined),
    changeWaitlist: vi.fn(async (input) => ({
      id: "waitlist-1" as CareRecordId,
      patientId: input.patientId,
      stateCode: input.stateCode,
      action: input.action,
      occurredAt: input.occurredAt,
    })),
    recordConsent: vi.fn(async (input) => ({
      kind: input.kind,
      requiredDocument: null,
      activeEvent: null,
      satisfied: false,
      reason: "document_unavailable",
    })),
    ...overrides,
  };
}

function app(
  eligibilityRepository: CareEligibilityRepository,
  accessDependencies = access(),
) {
  const instance = express();
  instance.use(express.json());
  registerCareEligibilityApi(
    instance,
    accessDependencies,
    eligibilityRepository,
    () => new Date("2026-07-25T20:00:00.000Z"),
  );
  return instance;
}

describe("Care PR 2 eligibility routes", () => {
  it("returns an audited, non-clearing decision owned by the patient", async () => {
    const repo = repository();
    const response = await request(app(repo)).get("/api/care/eligibility");
    expect(response.status).toBe(200);
    expect(response.body.decision).toMatchObject({
      patientId,
      outcome: "waitlist_available",
      careEligibilityCleared: false,
    });
    expect(repo.recordEligibilityDecision).toHaveBeenCalledWith(
      expect.objectContaining({ patientId }),
      locationId,
    );
  });

  it("rejects malformed state before any persistent write", async () => {
    const repo = repository();
    const response = await request(app(repo))
      .post("/api/care/eligibility/location")
      .send({
        stateCode: "Illinois",
        source: "patient_attestation",
        idempotencyKey: "location-key-1",
      });
    expect(response.status).toBe(400);
    expect(repo.recordLocation).not.toHaveBeenCalled();
  });

  it("binds waitlist changes to the server-evaluated state", async () => {
    const repo = repository();
    const response = await request(app(repo))
      .post("/api/care/eligibility/waitlist")
      .send({
        action: "joined",
        stateCode: "WI",
        idempotencyKey: "waitlist-key-1",
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("care_state_mismatch");
    expect(repo.changeWaitlist).not.toHaveBeenCalled();
  });

  it("permits a prior-state waitlist withdrawal without promising availability", async () => {
    const repo = repository({
      loadContext: vi.fn(async () => ({
        ...(await repository().loadContext(patientId, true)),
        coverage: {
          stateCode: "IL",
          supportedStateActive: true,
          serviceCoverageActive: true,
          waitlistEnabled: false,
          activeClinicianCount: 1,
        },
      })),
    });
    const response = await request(app(repo))
      .post("/api/care/eligibility/waitlist")
      .send({
        action: "withdrawn",
        stateCode: "IL",
        idempotencyKey: "waitlist-withdraw-1",
      });
    expect(response.status).toBe(201);
    expect(response.body.waitlist).toMatchObject({
      action: "withdrawn",
      stateCode: "IL",
    });
  });

  it("requires the exact server-evaluated consent prerequisite before grant", async () => {
    const repo = repository();
    const response = await request(app(repo))
      .post("/api/care/consents")
      .send({
        kind: "privacy_notice",
        documentVersion: "approved-v1",
        action: "granted",
        idempotencyKey: "privacy-grant-key-1",
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(
      "care_consent_prerequisites_incomplete",
    );
    expect(repo.recordConsent).not.toHaveBeenCalled();
  });

  it("keeps consent revocation available without re-opening eligibility", async () => {
    const repo = repository();
    const response = await request(app(repo))
      .post("/api/care/consents")
      .send({
        kind: "telehealth",
        documentVersion: "approved-v1",
        action: "revoked",
        idempotencyKey: "telehealth-revoke-1",
      });
    expect(response.status).toBe(201);
    expect(repo.loadContext).not.toHaveBeenCalled();
    expect(repo.recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId,
        kind: "telehealth",
        action: "revoked",
      }),
    );
  });

  it("returns stable safe 503 JSON when persistence fails", async () => {
    const response = await request(
      app(
        repository({
          loadContext: vi.fn(async () => {
            throw new Error("adapter connection and private detail");
          }),
        }),
      ),
    ).get("/api/care/eligibility");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "care_temporarily_unavailable",
      message: "Care status is temporarily unavailable.",
    });
    expect(JSON.stringify(response.body)).not.toContain("private detail");
  });

  it("never lets a non-Care role reach the repository", async () => {
    const repo = repository();
    const response = await request(
      app(
        repo,
        access({
          resolvePrincipal: vi.fn(async () => ({
            subjectId: "affiliate-1",
            roles: ["affiliate"],
          })),
        }),
      ),
    ).get("/api/care/eligibility");
    expect(response.status).toBe(403);
    expect(repo.loadContext).not.toHaveBeenCalled();
  });
});
