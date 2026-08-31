import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  CARE_MANUAL_ACCESS_REQUEST_PATH,
  CARE_MANUAL_ACCESS_STATUS_PATH,
  type CareManualAccessRequest,
} from "@shared/care/manual-access";
import {
  careManualAccessOperationsRecord,
  careManualAccessReference,
  registerCareManualAccessApi,
  type CareManualAccessDependencies,
} from "./manual-access";

const validRequest: CareManualAccessRequest = {
  fullName: "Jordan Test",
  email: "jordan@example.com",
  locationState: "TX",
  careGoal: "new_care_request",
  contactMethod: "email",
  contactWindow: "afternoon",
  adultConfirmation: true,
  boundaryAcknowledgement: true,
};

function dependencies(
  overrides: Partial<CareManualAccessDependencies> = {},
): CareManualAccessDependencies {
  return {
    loadReadiness: vi.fn(async () => ({
      persistenceReady: true,
      notificationsReady: true,
    })),
    allowRequest: vi.fn(async () => true),
    verifyHuman: vi.fn(async () => true),
    createRequest: vi.fn(async () => ({
      id: "123e4567-e89b-12d3-a456-426614174000",
    })),
    sendInternalAlert: vi.fn(async () => true),
    sendConfirmation: vi.fn(async () => true),
    setEmailStatus: vi.fn(async () => undefined),
    ...overrides,
  };
}

function appFor(deps: CareManualAccessDependencies) {
  const app = express();
  app.use(express.json());
  registerCareManualAccessApi(app, deps);
  return app;
}

describe("Care manual access API", () => {
  it("reports the durable manual workflow as open only when storage and notifications are ready", async () => {
    const open = await request(appFor(dependencies()))
      .get(CARE_MANUAL_ACCESS_STATUS_PATH)
      .expect(200);

    expect(open.headers["cache-control"]).toBe("no-store");
    expect(open.body).toEqual({
      ok: true,
      acceptingRequests: true,
      workflow: "manual_human_follow_up",
      typicalResponse: "one_business_day",
      clinicalHandoff: "separate_secure_step_after_review",
    });

    const closed = await request(appFor(dependencies({
      loadReadiness: vi.fn(async () => ({
        persistenceReady: true,
        notificationsReady: false,
      })),
    }))).get(CARE_MANUAL_ACCESS_STATUS_PATH).expect(200);
    expect(closed.body.acceptingRequests).toBe(false);
  });

  it("strictly rejects clinical or free-text fields that are outside the public survey", async () => {
    const deps = dependencies();
    const response = await request(appFor(deps))
      .post(CARE_MANUAL_ACCESS_REQUEST_PATH)
      .send({
        ...validRequest,
        symptoms: "This field must never be accepted.",
      })
      .expect(400);

    expect(response.body.code).toBe("invalid_care_access_request");
    expect(deps.createRequest).not.toHaveBeenCalled();
    expect(deps.sendInternalAlert).not.toHaveBeenCalled();
  });

  it("requires a phone number when the requester chooses a call or text", async () => {
    const deps = dependencies();
    const response = await request(appFor(deps))
      .post(CARE_MANUAL_ACCESS_REQUEST_PATH)
      .send({ ...validRequest, contactMethod: "text" })
      .expect(400);

    expect(response.body.fieldErrors.phone).toContain(
      "A phone number is required for calls or text messages.",
    );
    expect(deps.createRequest).not.toHaveBeenCalled();
  });

  it("fails closed when spam verification does not pass", async () => {
    const deps = dependencies({ verifyHuman: vi.fn(async () => false) });
    const response = await request(appFor(deps))
      .post(CARE_MANUAL_ACCESS_REQUEST_PATH)
      .send(validRequest)
      .expect(400);

    expect(response.body.code).toBe("care_access_verification_failed");
    expect(deps.createRequest).not.toHaveBeenCalled();
  });

  it("durably records the request before sending human and requester notifications", async () => {
    const events: string[] = [];
    const deps = dependencies({
      createRequest: vi.fn(async (input) => {
        events.push("saved");
        expect(input).toEqual(validRequest);
        return { id: "123e4567-e89b-12d3-a456-426614174000" };
      }),
      sendInternalAlert: vi.fn(async (_input, reference) => {
        events.push(`internal:${reference}`);
        return true;
      }),
      sendConfirmation: vi.fn(async (_input, reference) => {
        events.push(`confirmation:${reference}`);
        return true;
      }),
    });

    const response = await request(appFor(deps))
      .post(CARE_MANUAL_ACCESS_REQUEST_PATH)
      .send(validRequest)
      .expect(201);

    expect(response.body).toEqual({
      ok: true,
      reference: "CARE-123E4567",
      saved: true,
      confirmationSent: true,
    });
    expect(events[0]).toBe("saved");
    expect(events.slice(1).sort()).toEqual([
      "confirmation:CARE-123E4567",
      "internal:CARE-123E4567",
    ]);
    expect(deps.setEmailStatus).toHaveBeenCalledWith(
      "123e4567-e89b-12d3-a456-426614174000",
      "sent",
    );
  });

  it("keeps a durable request successful when email delivery fails and marks the record", async () => {
    const deps = dependencies({
      sendInternalAlert: vi.fn(async () => false),
      sendConfirmation: vi.fn(async () => false),
    });
    const response = await request(appFor(deps))
      .post(CARE_MANUAL_ACCESS_REQUEST_PATH)
      .send(validRequest)
      .expect(201);

    expect(response.body.saved).toBe(true);
    expect(response.body.confirmationSent).toBe(false);
    expect(deps.setEmailStatus).toHaveBeenCalledWith(
      "123e4567-e89b-12d3-a456-426614174000",
      "failed",
    );
  });

  it("returns an unavailable response without claiming a save when durable storage fails", async () => {
    const deps = dependencies({
      createRequest: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const response = await request(appFor(deps))
      .post(CARE_MANUAL_ACCESS_REQUEST_PATH)
      .send(validRequest)
      .expect(503);

    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("care_access_temporarily_unavailable");
    expect(deps.sendInternalAlert).not.toHaveBeenCalled();
  });
});

describe("Care manual access reference", () => {
  it("creates a short support reference without exposing the full durable id", () => {
    expect(careManualAccessReference("123e4567-e89b-12d3-a456-426614174000"))
      .toBe("CARE-123E4567");
  });

  it("maps only bounded operational fields into the existing durable private record", () => {
    const record = careManualAccessOperationsRecord(validRequest, "203.0.113.4");
    expect(record).toMatchObject({
      name: "Jordan Test",
      email: "jordan@example.com",
      phone: null,
      business_name: "Xenios Care access request",
      role: "care_access:new_care_request",
      url_or_handle: "preferred_contact:email",
      client_count: "contact_window:afternoon",
      nonbinding_ack: true,
      source_page: "/care/schedule",
      landing_page: "/care/schedule",
      referrer_url: null,
      utm_source: null,
      ip: "203.0.113.4",
    });
    expect(JSON.parse(record.why_interested ?? "{}")).toEqual({
      schema: "xenios_care_manual_access_v1",
      locationState: "TX",
      careGoal: "new_care_request",
      contactMethod: "email",
      contactWindow: "afternoon",
      adultConfirmation: true,
      boundaryAcknowledgement: true,
      medicalFreeTextCollected: false,
    });
    expect(JSON.stringify(record)).not.toMatch(/symptom|diagnos|medication|healthHistory/i);
  });
});
