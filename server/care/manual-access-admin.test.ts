import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareManualAccessRequest } from "@shared/care/manual-access";
import {
  CARE_MANUAL_ACCESS_ADMIN_LIST_PATH,
  type CareManualAccessAdminRecord,
} from "@shared/care/manual-access-admin";
import type { LoiRow } from "../supabase-store";
import {
  projectCareManualAccessAdminRecord,
  registerCareManualAccessAdminApi,
  type CareManualAccessAdminDependencies,
} from "./manual-access-admin";
import { careManualAccessOperationsRecord } from "./manual-access";

function careRow(overrides: Partial<LoiRow> = {}): LoiRow {
  return {
    id: "2a99c6f7-1111-4222-8333-abcdefabcdef",
    name: "Seth Grant",
    email: "se.grant@icloud.com",
    phone: "9704153774",
    business_name: "Xenios Care access request",
    role: "care_access:new_care_request",
    url_or_handle: "preferred_contact:phone",
    client_count: "contact_window:morning",
    why_interested: JSON.stringify({
      schema: "xenios_care_manual_access_v1",
      locationState: "CO",
      careGoal: "new_care_request",
      contactMethod: "phone",
      contactWindow: "morning",
      adultConfirmation: true,
      boundaryAcknowledgement: true,
      medicalFreeTextCollected: false,
    }),
    nonbinding_ack: true,
    source_page: "/care/schedule",
    landing_page: "/care/schedule",
    referrer_url: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    ip: "203.0.113.10",
    status: "New",
    email_status: "sent",
    created_at: "2026-09-03T04:28:51.480Z",
    ...overrides,
  };
}

function unrelatedRow(): LoiRow {
  return {
    ...careRow({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      business_name: "Unrelated early interest",
      role: "coach",
      url_or_handle: null,
      client_count: null,
      why_interested: "Interested in the platform",
      source_page: "/",
      landing_page: "/",
    }),
  };
}

function dependencies(
  rows: LoiRow[],
  overrides: Partial<CareManualAccessAdminDependencies> = {},
): CareManualAccessAdminDependencies {
  return {
    listRequests: vi.fn(async () => rows),
    updateStatus: vi.fn(async (id, status) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) row.status = status;
    }),
    ...overrides,
  };
}

function appFor(
  deps: CareManualAccessAdminDependencies,
  authorized = true,
) {
  const app = express();
  app.use(express.json());
  const guard: RequestHandler = (_req, res, next) => {
    if (!authorized) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    next();
  };
  registerCareManualAccessAdminApi(app, guard, deps);
  return app;
}

describe("Care manual access admin API", () => {
  it("lists Seth's durable Care request through a dedicated admin projection", async () => {
    const response = await request(appFor(dependencies([careRow(), unrelatedRow()])))
      .get(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.summary).toEqual({
      total: 1,
      newCount: 1,
      notificationFailureCount: 0,
      notificationUnknownCount: 0,
      dataQualityIssueCount: 0,
      attentionRequiredCount: 1,
    });
    expect(response.body.requests).toHaveLength(1);
    expect(response.body.requests[0]).toMatchObject({
      reference: "CARE-2A99C6F7",
      fullName: "Seth Grant",
      email: "se.grant@icloud.com",
      phone: "9704153774",
      locationState: "CO",
      locationStateLabel: "Colorado",
      careGoalLabel: "I want to start a new Care request",
      contactMethodLabel: "Phone call",
      contactWindowLabel: "Morning",
      status: "New",
      dataQuality: "valid",
      attentionRequired: true,
      attentionReasons: ["new_request"],
    });
  });

  it("never returns raw storage payloads, attribution, IP, or clinical fields", async () => {
    const response = await request(appFor(dependencies([careRow()])))
      .get(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH)
      .expect(200);

    const json = JSON.stringify(response.body);
    expect(json).not.toMatch(/why_interested|nonbinding_ack|referrer_url|utm_|203\.0\.113\.10/i);
    expect(json).not.toMatch(/symptom|diagnos|medication|medicalFreeTextCollected/i);
  });

  it("keeps malformed Care rows visible and raises a data-quality alert", async () => {
    const malformed = careRow({
      id: "bbbbbbbb-1111-4222-8333-abcdefabcdef",
      why_interested: "{not-json",
      email_status: null,
    });
    const response = await request(appFor(dependencies([malformed])))
      .get(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH)
      .expect(200);

    expect(response.body.summary).toMatchObject({
      total: 1,
      notificationUnknownCount: 1,
      dataQualityIssueCount: 1,
      attentionRequiredCount: 1,
    });
    expect(response.body.requests[0]).toMatchObject({
      reference: "CARE-BBBBBBBB",
      dataQuality: "malformed",
      attentionRequired: true,
    });
    expect(response.body.requests[0].attentionReasons).toEqual(
      expect.arrayContaining([
        "new_request",
        "notification_state_unknown",
        "malformed_operational_payload",
      ]),
    );
  });

  it("surfaces failed notification delivery without hiding the saved request", async () => {
    const response = await request(
      appFor(dependencies([careRow({ email_status: "failed" })])),
    )
      .get(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH)
      .expect(200);

    expect(response.body.summary.notificationFailureCount).toBe(1);
    expect(response.body.requests[0].attentionReasons).toContain(
      "notification_failed",
    );
  });

  it("requires the canonical admin guard", async () => {
    await request(appFor(dependencies([careRow()]), false))
      .get(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH)
      .expect(401);
  });

  it("loads a request by public reference without exposing the full durable payload", async () => {
    const response = await request(appFor(dependencies([careRow()])))
      .get(`${CARE_MANUAL_ACCESS_ADMIN_LIST_PATH}/CARE-2A99C6F7`)
      .expect(200);

    expect(response.body.request.reference).toBe("CARE-2A99C6F7");
    expect(response.body.request.fullName).toBe("Seth Grant");
    expect(response.body.request.why_interested).toBeUndefined();
  });

  it("rejects an unapproved status and never mutates the record", async () => {
    const deps = dependencies([careRow()]);
    const response = await request(appFor(deps))
      .patch(`${CARE_MANUAL_ACCESS_ADMIN_LIST_PATH}/CARE-2A99C6F7/status`)
      .send({ status: "Approved for treatment" })
      .expect(400);

    expect(response.body.code).toBe("invalid_care_access_status");
    expect(deps.updateStatus).not.toHaveBeenCalled();
  });

  it("updates only a verified Care row and returns the revised projection", async () => {
    const rows = [careRow(), unrelatedRow()];
    const deps = dependencies(rows);
    const response = await request(appFor(deps))
      .patch(`${CARE_MANUAL_ACCESS_ADMIN_LIST_PATH}/CARE-2A99C6F7/status`)
      .send({ status: "Contacted" })
      .expect(200);

    expect(deps.updateStatus).toHaveBeenCalledWith(
      "2a99c6f7-1111-4222-8333-abcdefabcdef",
      "Contacted",
    );
    expect(response.body.request.status).toBe("Contacted");
  });

  it("cannot mutate a generic early-interest record through the Care API", async () => {
    const unrelated = unrelatedRow();
    const deps = dependencies([unrelated]);
    await request(appFor(deps))
      .patch(`${CARE_MANUAL_ACCESS_ADMIN_LIST_PATH}/${unrelated.id}/status`)
      .send({ status: "Contacted" })
      .expect(404);

    expect(deps.updateStatus).not.toHaveBeenCalled();
  });

  it("fails honestly when the durable queue cannot be read", async () => {
    const deps = dependencies([], {
      listRequests: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const response = await request(appFor(deps))
      .get(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH)
      .expect(503);

    expect(response.body.code).toBe("care_access_admin_unavailable");
  });
});

describe("Care manual access admin projection", () => {
  it("projects the exact durable record emitted by the public Care writer", () => {
    const publicRequest: CareManualAccessRequest = {
      fullName: "Seth Grant",
      email: "se.grant@icloud.com",
      phone: "9704153774",
      locationState: "CO",
      careGoal: "new_care_request",
      contactMethod: "phone",
      contactWindow: "morning",
      adultConfirmation: true,
      boundaryAcknowledgement: true,
    };
    const stored = careManualAccessOperationsRecord(
      publicRequest,
      "203.0.113.10",
    );
    const projected = projectCareManualAccessAdminRecord({
      ...stored,
      id: "2a99c6f7-1111-4222-8333-abcdefabcdef",
      status: "New",
      email_status: "sent",
      created_at: "2026-09-03T04:28:51.480Z",
    });

    expect(projected).toMatchObject({
      reference: "CARE-2A99C6F7",
      fullName: "Seth Grant",
      locationStateLabel: "Colorado",
      contactMethodLabel: "Phone call",
      dataQuality: "valid",
    });
  });

  it("projects the public reference deterministically", () => {
    const projected: CareManualAccessAdminRecord =
      projectCareManualAccessAdminRecord(careRow());
    expect(projected.reference).toBe("CARE-2A99C6F7");
  });
});
