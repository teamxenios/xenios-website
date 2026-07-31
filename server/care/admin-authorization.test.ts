// Server-authoritative proof for the Care admin console.
//
// The console's role guard is a presentation nicety. This is the real boundary:
// with Care fully enabled, every care:administer contract must refuse an
// anonymous caller, a member with a patient account, a clinician, a pharmacy
// operator, and the security-audit role, and it must refuse them before the
// repository is touched.

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAppointment } from "@shared/care/appointments";
import type { CarePharmacyOrder, CarePrescription } from "@shared/care/prescriptions";
import type { AnyPlatformRole, CareRecordId } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import type { CarePrescriptionRepository } from "./prescription-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import { registerCarePrescriptionApi } from "./prescription-routes";

const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const APPOINTMENT = "22222222-2222-4222-8222-222222222222" as CareRecordId;
const PRESCRIPTION = "33333333-3333-4333-8333-333333333333" as CareRecordId;
const ORDER = "44444444-4444-4444-8444-444444444444" as CareRecordId;
const PHARMACY = "55555555-5555-4555-8555-555555555555" as CareRecordId;
const CLINICIAN = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-07-31T00:00:00.000Z";

const appointment: CareAppointment = {
  id: APPOINTMENT,
  patientId: PATIENT,
  intakeId: PRESCRIPTION,
  patientLocationId: ORDER,
  patientStateCode: "IL",
  assignedClinicianUserId: null,
  clinicianCoverageId: null,
  status: "requested",
  startsAt: null,
  endsAt: null,
  telehealthReady: false,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const prescription: CarePrescription = {
  id: PRESCRIPTION,
  patientId: PATIENT,
  appointmentId: APPOINTMENT,
  clinicianReviewId: APPOINTMENT,
  prescribingClinicianUserId: CLINICIAN,
  status: "draft",
  formulation: "formulation",
  concentration: "concentration",
  route: "route",
  quantity: "quantity",
  directions: "directions",
  refills: 0,
  verifiedContentSourceId: APPOINTMENT,
  version: 0,
  signedAt: null,
  supersedesPrescriptionId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const order: CarePharmacyOrder = {
  id: ORDER,
  patientId: PATIENT,
  prescriptionId: PRESCRIPTION,
  assignedPharmacyId: PHARMACY,
  patientStateCode: "IL",
  status: "pending_pharmacy",
  clarificationOpen: false,
  trackingReferencePresent: false,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

function appointmentRepository(): CareAppointmentRepository {
  return {
    listPatientAppointments: vi.fn(async () => [appointment]),
    listAssignedReviews: vi.fn(async () => []),
    loadReadiness: vi.fn(async () => ({
      medicalGroupVerified: false,
      clinicianRecordVerified: false,
      clinicianLicenseVerified: false,
      clinicianCredentialsVerified: false,
      clinicianCoverageVerified: false,
      operationalClinicianReady: false,
      supportedStateVerified: false,
      telehealthProviderVerified: false,
      schedulingProviderVerified: false,
      remindersConfigured: false,
      publicActivationApproved: false,
    })),
    requestAppointment: vi.fn(async () => appointment),
    assignClinician: vi.fn(async () => appointment),
    scheduleAppointment: vi.fn(async () => appointment),
    patientAction: vi.fn(async () => appointment),
    clinicianComplete: vi.fn(async () => appointment),
    adminMarkNoShow: vi.fn(async () => appointment),
    applyReviewAction: vi.fn(async () => {
      throw new Error("not_used");
    }),
  };
}

function prescriptionRepository(): CarePrescriptionRepository {
  return {
    listPatientPrescriptions: vi.fn(async () => [prescription]),
    listAssignedPharmacyOrders: vi.fn(async () => [order]),
    loadReadiness: vi.fn(async () => ({
      medicalGroupVerified: false,
      clinicianCoverageVerified: false,
      patientSpecificContentVerified: false,
      pharmacyPartnerVerified: false,
      pharmacyIdentityVerified: false,
      pharmacyLicenseVerified: false,
      pharmacyStateCoverageVerified: false,
      pharmacyAgreementVerified: false,
      pharmacyIntegrationVerified: false,
      pharmacySupportVerified: false,
      publicActivationApproved: false,
    })),
    createDraft: vi.fn(async () => prescription),
    sign: vi.fn(async () => prescription),
    assignPharmacy: vi.fn(async () => order),
    pharmacyAction: vi.fn(async () => order),
    resolveClarification: vi.fn(async () => order),
  };
}

function access(
  roles: readonly AnyPlatformRole[] | null,
  enabled = true,
): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state: enabled ? ("enabled" as const) : ("pending_clinicians" as const),
      enabled,
      publicMessage: enabled ? "Care is available." : "Clinician coverage is being prepared.",
      checkedAt: NOW,
    })),
    resolvePrincipal: vi.fn(async () =>
      roles === null
        ? null
        : {
            subjectId: "actor-1",
            roles,
            ...(roles.includes("care_patient") ? { patientId: PATIENT } : {}),
          },
    ),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function appFor(deps: CareAccessDependencies) {
  const app = express();
  app.use(express.json());
  const appointments = appointmentRepository();
  const prescriptions = prescriptionRepository();
  registerCareAppointmentApi(app, deps, appointments, () => new Date(NOW));
  registerCarePrescriptionApi(app, deps, prescriptions, () => new Date(NOW));
  return { app, appointments, prescriptions };
}

/** Every contract the Care admin console reads or describes. */
const ADMIN_CONTRACTS = [
  { method: "get", path: "/api/care/appointments/admin/readiness" },
  { method: "get", path: "/api/care/pharmacy/admin/readiness" },
  { method: "post", path: `/api/care/appointments/${APPOINTMENT}/assign` },
  { method: "post", path: `/api/care/appointments/${APPOINTMENT}/schedule` },
  { method: "post", path: `/api/care/appointments/${APPOINTMENT}/no-show` },
  {
    method: "post",
    path: `/api/care/pharmacy/admin/prescriptions/${PRESCRIPTION}/assign`,
  },
  {
    method: "post",
    path: `/api/care/pharmacy/admin/orders/${ORDER}/clarification/resolve`,
  },
] as const;

const NON_ADMIN_ACTORS = [
  ["an anonymous visitor", null, 401],
  ["a member with a patient account", ["care_patient"], 403],
  ["a provider", ["clinician"], 403],
  ["a pharmacy operator", ["pharmacy_operations"], 403],
  ["a security auditor", ["care_security_admin"], 403],
  ["a research admin", ["research_admin"], 403],
  ["an affiliate", ["affiliate"], 403],
] as const;

describe("Care admin authorization boundary", () => {
  it.each(NON_ADMIN_ACTORS)(
    "refuses every Care admin contract for %s",
    async (_who, roles, expected) => {
      for (const contract of ADMIN_CONTRACTS) {
        const { app, appointments, prescriptions } = appFor(
          access(roles as readonly AnyPlatformRole[] | null),
        );
        const response = await request(app)
          [contract.method](contract.path)
          .send({});
        expect(
          response.status,
          `${contract.method.toUpperCase()} ${contract.path}`,
        ).toBe(expected);
        // Refused before any repository work.
        expect(appointments.assignClinician).not.toHaveBeenCalled();
        expect(appointments.scheduleAppointment).not.toHaveBeenCalled();
        expect(appointments.adminMarkNoShow).not.toHaveBeenCalled();
        expect(appointments.loadReadiness).not.toHaveBeenCalled();
        expect(prescriptions.assignPharmacy).not.toHaveBeenCalled();
        expect(prescriptions.resolveClarification).not.toHaveBeenCalled();
        expect(prescriptions.loadReadiness).not.toHaveBeenCalled();
        expect(JSON.stringify(response.body)).not.toContain(PATIENT);
      }
    },
  );

  it("allows the Care administrator to read readiness and nothing else by default", async () => {
    const { app, appointments } = appFor(access(["clinical_admin"]));
    const response = await request(app).get(
      "/api/care/appointments/admin/readiness",
    );
    expect(response.status).toBe(200);
    expect(response.body.readiness.operationalReady).toBe(false);
    expect(appointments.loadReadiness).toHaveBeenCalledTimes(1);
    // The readiness read exposes no patient, clinician, or appointment record.
    expect(JSON.stringify(response.body)).not.toContain(PATIENT);
    expect(JSON.stringify(response.body)).not.toContain(CLINICIAN);
  });

  it("refuses even the Care administrator while the capability is off", async () => {
    const { app, appointments, prescriptions } = appFor(
      access(["clinical_admin"], false),
    );
    for (const contract of ADMIN_CONTRACTS) {
      const response = await request(app)[contract.method](contract.path).send({});
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("care_disabled");
    }
    expect(appointments.loadReadiness).not.toHaveBeenCalled();
    expect(prescriptions.loadReadiness).not.toHaveBeenCalled();
  });
});
