import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { CARE_CLINICAL_CAPABILITIES_DISABLED } from "@shared/care/clinical-actions";
import type { CareRole } from "@shared/care/contracts";
import { CARE_REFERRAL_ROUTES } from "@shared/care/referral";
import type { CareAccessDependencies } from "./access";
import type { CareReferralCoverage } from "./referral";
import { registerCareReferralApi } from "./referral-routes";
import { inMemoryCareReferralRepository } from "./referral-repository";

const PATIENT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "33333333-3333-4333-8333-333333333333";

const COVERAGE: Readonly<Record<string, CareReferralCoverage>> = {
  IL: {
    stateCode: "IL",
    supportedStateActive: true,
    serviceCoverageActive: true,
    waitlistEnabled: true,
    activeClinicianCount: 2,
    supportedServiceCategories: ["general_consultation", "follow_up_visit"],
  },
};

const ENABLED_FLAGS = {
  ...CARE_CLINICAL_CAPABILITIES_DISABLED,
  real_patient_data: true,
};

function access(
  role: CareRole | null,
  subjectId: string,
  careEnabled = true,
): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state: careEnabled ? ("enabled" as const) : ("disabled" as const),
      enabled: careEnabled,
      publicMessage: "test",
      checkedAt: "2026-08-01T15:00:00Z",
    })),
    resolvePrincipal: vi.fn(async () =>
      role
        ? {
            subjectId,
            roles: [role],
            patientId: role === "care_patient" ? PATIENT : undefined,
          }
        : null,
    ),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function appFor(
  role: CareRole | null,
  subjectId = PATIENT,
  options: {
    flags?: typeof ENABLED_FLAGS;
    handoff?: Record<string, string | undefined>;
    careEnabled?: boolean;
  } = {},
) {
  const inner = inMemoryCareReferralRepository({ coverage: COVERAGE });
  const spied = {
    ...inner,
    save: vi.fn(inner.save),
    loadCoverage: vi.fn(inner.loadCoverage),
    listForUser: vi.fn(inner.listForUser),
    listForOperations: vi.fn(inner.listForOperations),
  };
  const app = express();
  app.use(express.json());
  registerCareReferralApi(app, access(role, subjectId, options.careEnabled ?? true), {
    repository: spied,
    readFlags: () => options.flags ?? CARE_CLINICAL_CAPABILITIES_DISABLED,
    // Injected, so the test can never inherit a configured Tebra URL from the
    // machine it runs on.
    handoff: () => ({
      mode: "concierge",
      schedulingUrl: null,
      widgetScriptUrl: null,
      configured: false,
      ...(options.handoff ?? {}),
    }),
    now: () => new Date("2026-08-01T15:00:00Z"),
    newReferralId: () => "ref-0001",
  });
  return { app, repository: spied, rows: inner.rows };
}

const CREATE = {
  serviceCategory: "general_consultation",
  stateCode: "IL",
};

describe("care referral routes: authorization", () => {
  it("refuses an anonymous read before the repository is called", async () => {
    const { app, repository } = appFor(null);
    const response = await request(app).get(CARE_REFERRAL_ROUTES.referrals);
    expect(response.status).toBe(401);
    expect(repository.listForUser).not.toHaveBeenCalled();
  });

  it("refuses an anonymous write before the repository is called", async () => {
    const { app, repository } = appFor(null);
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send(CREATE);
    expect(response.status).toBe(401);
    expect(repository.loadCoverage).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("refuses an anonymous concierge submission before the repository is called", async () => {
    const { app, repository } = appFor(null);
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.concierge)
      .send({ ...CREATE, contactMethod: "email", message: "Please call me." });
    expect(response.status).toBe(401);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("refuses the operations queue to a patient before the repository is called", async () => {
    const { app, repository } = appFor("care_patient");
    const response = await request(app).get(CARE_REFERRAL_ROUTES.queue);
    expect(response.status).toBe(403);
    expect(repository.listForOperations).not.toHaveBeenCalled();
  });

  it("refuses a referral write to a role without the appointment permission", async () => {
    const { app, repository } = appFor("lab_reviewer", ADMIN);
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send(CREATE);
    expect(response.status).toBe(403);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("refuses every route while care is not enabled", async () => {
    const { app, repository } = appFor("care_patient", PATIENT, {
      careEnabled: false,
    });
    expect((await request(app).get(CARE_REFERRAL_ROUTES.referrals)).status).toBe(
      503,
    );
    expect(repository.listForUser).not.toHaveBeenCalled();
  });

  it("allows the operations queue to a clinical admin", async () => {
    const { app, repository } = appFor("clinical_admin", ADMIN);
    const response = await request(app).get(CARE_REFERRAL_ROUTES.queue);
    expect(response.status).toBe(200);
    expect(repository.listForOperations).toHaveBeenCalled();
    expect(response.body.referrals).toEqual([]);
  });
});

describe("care referral routes: the data boundary at the server", () => {
  it("rejects a clinical field on a write and stores nothing", async () => {
    const { app, repository, rows } = appFor("care_patient", PATIENT, {
      flags: ENABLED_FLAGS,
    });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send({ ...CREATE, diagnosis: "REDACTED" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("care_invalid_request");
    expect(repository.save).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it("never lets the body choose whose referral it is", async () => {
    const { app, rows } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send({ ...CREATE, internalUserId: "someone-else" });
    // A strict body means an identity claim is refused outright.
    expect(response.status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it("refuses the write at the server while the capability flag is off", async () => {
    const { app, rows } = appFor("care_patient", PATIENT);
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send(CREATE);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_referrals_disabled");
    expect(rows).toHaveLength(0);
  });

  it("rejects a concierge message that reads as clinical and stores nothing", async () => {
    const { app, repository, rows } = appFor("care_patient", PATIENT, {
      flags: ENABLED_FLAGS,
    });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.concierge)
      .send({
        ...CREATE,
        contactMethod: "email",
        message: "I need a refill of my medication",
      });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("care_concierge_content_rejected");
    expect(repository.save).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it("does not echo the rejected concierge message back", async () => {
    const { app } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.concierge)
      .send({
        ...CREATE,
        contactMethod: "email",
        message: "my lab results say something distinctive",
      });
    expect(JSON.stringify(response.body)).not.toContain("distinctive");
  });
});

describe("care referral routes: routing and handoff", () => {
  it("creates a referral for a covered state and never claims it is scheduled", async () => {
    const { app, rows } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send(CREATE);
    expect(response.status).toBe(201);
    expect(response.body.referral.status).toBe("draft");
    expect(response.body.referral.appointmentAt).toBeNull();
    expect(response.body.referral.internalUserId).toBe(PATIENT);
    expect(response.body.referral.errorCode).toBe("handoff_not_configured");
    expect(rows).toHaveLength(1);
  });

  it("marks the referral pending handoff once Tebra scheduling is configured", async () => {
    const { app } = appFor("care_patient", PATIENT, {
      flags: ENABLED_FLAGS,
      handoff: {
        mode: "direct_url",
        schedulingUrl: "https://scheduling.example.invalid/book",
        configured: "true",
      } as never,
    });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send(CREATE);
    expect(response.status).toBe(201);
    expect(response.body.referral.status).toBe("handoff_pending");
    expect(response.body.referral.errorCode).toBeNull();
  });

  it("refuses an uncovered state and offers only the truthful alternatives", async () => {
    const { app, rows } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send({ ...CREATE, stateCode: "TX" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("state_not_supported");
    expect(response.body.availableServiceCategories).toEqual([]);
    expect(rows).toHaveLength(0);
  });

  it("refuses a service the covered state does not offer", async () => {
    const { app } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.referrals)
      .send({ ...CREATE, serviceCategory: "hormone_health" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("service_not_available_in_state");
    expect(response.body.availableServiceCategories).toEqual([
      "general_consultation",
      "follow_up_visit",
    ]);
  });

  it("reports the concierge fallback and never a fabricated scheduling url", async () => {
    const { app } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app).get(CARE_REFERRAL_ROUTES.referrals);
    expect(response.status).toBe(200);
    expect(response.body.handoff.mode).toBe("concierge");
    expect(response.body.handoff.schedulingUrl).toBeNull();
  });

  it("records a clean concierge request and reports that nothing was sent", async () => {
    const { app, rows } = appFor("care_patient", PATIENT, { flags: ENABLED_FLAGS });
    const response = await request(app)
      .post(CARE_REFERRAL_ROUTES.concierge)
      .send({
        ...CREATE,
        contactMethod: "email",
        message: "Weekday mornings are best for a call.",
      });
    expect(response.status).toBe(201);
    expect(response.body.dispatched).toBe(false);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("message");
  });

  it("returns a patient only their own referrals", async () => {
    const { app, repository, rows } = appFor("care_patient", PATIENT, {
      flags: ENABLED_FLAGS,
    });
    await request(app).post(CARE_REFERRAL_ROUTES.referrals).send(CREATE);
    const response = await request(app).get(CARE_REFERRAL_ROUTES.referrals);
    expect(repository.listForUser).toHaveBeenCalledWith(PATIENT);
    expect(response.body.referrals).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });
});
