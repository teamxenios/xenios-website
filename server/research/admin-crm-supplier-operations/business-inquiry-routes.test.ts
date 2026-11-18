import express, { type Request, type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { BusinessInquiryInput, BusinessInquiryRecord } from "@shared/research/business-inquiry";
import {
  BusinessInquiryRefusal, BusinessInquiryService, type BusinessInquirySubmissionContext,
} from "./business-inquiry";
import { registerBusinessInquiryApi } from "./business-inquiry-routes";

// Real service + injected repository/Root guards. No provider, network auth, or applied-SQL claim.
const actor = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000003";
const assignedTo = "00000000-0000-4000-8000-000000000004";
const commandId = "00000000-0000-4000-8000-000000000005";
const origin = "https://example.test";
const publicPath = "/api/research/business-inquiries";
const staffPath = "/api/admin/research/business-inquiries";
const orgPath = `/api/research/account/organizations/${organizationId}/business-inquiries`;
const enquiry: BusinessInquiryInput = {
  contactName: "Example Operator", contactEmail: "operator@example.test", organizationName: "Example Clinic",
  organizationType: "clinic", location: "Austin", categories: ["research"], selections: [],
  packagingPreference: "not_sure", siteCount: 1, replenishment: "not_sure", services: [],
};
const attemptKey = "synthetic-attempt-key-00000001";
const receipt = {
  reference: `BE-${"A".repeat(24)}`, receivedAt: "2026-11-18T12:00:00.000Z",
  state: "needs_human_review" as const, replayed: false,
};
const record: BusinessInquiryRecord = {
  id, reference: receipt.reference, receivedAt: receipt.receivedAt, provenance: "web", category: "b2b_organization",
  state: "needs_human_review", revision: 1, assignedTo: null, organizationId,
  policyVersion: "business-enquiry-v1", enquiry,
};
const body = { attemptKey, enquiry };
function setup(options: { enabled?: boolean; omitEnabled?: boolean; outerJson?: boolean } = {}) {
  const events: string[] = [];
  const repository = {
    submit: vi.fn(async () => receipt),
    list: vi.fn(async () => ({ items: [record], nextBefore: id })),
    read: vi.fn(async () => record),
    assign: vi.fn(async () => ({ id, revision: 2, assignedTo, replayed: false })),
    listOrganization: vi.fn(async () => ({ items: [record], nextBefore: null })),
  };
  const publicGuard: RequestHandler = (req, res, next) => {
    events.push("public_guard");
    if (req.header("Origin") !== origin) { res.status(403).json({ error: "not_permitted" }); return; }
    if (req.header("X-Test-Rate") === "blocked") { res.status(429).json({ error: "rate_limited" }); return; }
    next();
  };
  const requireStaff: RequestHandler = (req, res, next) => {
    events.push("staff_guard");
    if (req.header("Authorization") !== "Bearer verified-staff") { res.status(403).json({ error: "not_permitted" }); return; }
    next();
  };
  const requireOrganization: RequestHandler = (req, res, next) => {
    events.push("organization_guard");
    if (req.header("Authorization") !== "Bearer verified-organization") { res.status(403).json({ error: "not_permitted" }); return; }
    next();
  };
  const resolveActorId = vi.fn(async (_req: Request): Promise<string | null> => { events.push("actor"); return actor; });
  const resolveSubmissionContext = vi.fn(async (_req: Request): Promise<BusinessInquirySubmissionContext | null> => {
    events.push("context"); return { ownerContext: "synthetic-server-owned-context-0000000000000001" };
  });
  const app = express();
  if (options.outerJson) app.use(express.json({ limit: "1mb" }));
  registerBusinessInquiryApi(app, {
    service: new BusinessInquiryService(repository), publicGuard, requireStaff, requireOrganization,
    resolveActorId, resolveSubmissionContext,
    ...(options.omitEnabled ? {} : { enabled: () => options.enabled ?? true }),
  });
  return { app, repository, events, resolveActorId, resolveSubmissionContext };
}
function expectPrivate(response: { headers: Record<string, string> }): void {
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.headers.pragma).toBe("no-cache");
  expect(response.headers.vary).toContain("Authorization");
  expect(response.headers.vary).toContain("Cookie");
}

describe("unmounted business enquiry routes", () => {
  it.each(["omitted", "false"])("defaults closed when enabled is %s, before any guard or context", async (mode) => {
    const { app, events, repository } = setup(mode === "omitted" ? { omitEnabled: true } : { enabled: false });
    const publicResponse = await request(app).post(publicPath).set("Origin", origin).send(body);
    const staffResponse = await request(app).get(staffPath).set("Authorization", "Bearer verified-staff");
    const orgResponse = await request(app).get(orgPath).set("Authorization", "Bearer verified-organization");
    for (const response of [publicResponse, staffResponse, orgResponse]) {
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "not_ready" });
      expectPrivate(response);
    }
    expect(events).toEqual([]);
    expect(repository.submit).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.listOrganization).not.toHaveBeenCalled();
  });
  it("runs same-origin rejection before malformed JSON parsing and server-context creation", async () => {
    const { app, events, repository, resolveSubmissionContext } = setup();
    const response = await request(app).post(publicPath).set("Origin", "https://foreign.test")
      .set("Content-Type", "application/json").send('{"contactEmail":"private@example.test"');
    expect(response.status).toBe(403);
    expect(events).toEqual(["public_guard"]);
    expect(resolveSubmissionContext).not.toHaveBeenCalled();
    expect(repository.submit).not.toHaveBeenCalled();
    expectPrivate(response);
  });
  it("honors the Root rate guard before resolving context", async () => {
    const { app, events, repository } = setup();
    const response = await request(app).post(publicPath).set("Origin", origin).set("X-Test-Rate", "blocked").send(body);
    expect(response.status).toBe(429);
    expect(events).toEqual(["public_guard"]);
    expect(repository.submit).not.toHaveBeenCalled();
  });
  it("creates a 201 receipt through the real service and sends only domain-separated hashes to storage", async () => {
    const { app, events, repository } = setup();
    const response = await request(app).post(publicPath).set("Origin", origin).send({
      ...body, enquiry: { ...enquiry, contactEmail: " OPERATOR@EXAMPLE.TEST ", referral: "unverified-attribution" },
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual(receipt);
    expect(events).toEqual(["public_guard", "context"]);
    expect(repository.submit).toHaveBeenCalledTimes(1);
    expect(repository.submit.mock.calls[0]).toEqual([{
      ownerHash: expect.stringMatching(/^[a-f0-9]{64}$/), attemptHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      enquiry: { ...enquiry, referral: "unverified-attribution" }, actorId: null, organizationId: null,
    }]);
    expect(JSON.stringify(repository.submit.mock.calls)).not.toContain(attemptKey);
    expect(JSON.stringify(response.body)).not.toContain(enquiry.contactEmail);
    expectPrivate(response);
  });
  it("returns exact committed same-attempt replay as 200, preserving the original reference and time", async () => {
    const { app, repository } = setup();
    repository.submit.mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, replayed: true });
    const first = await request(app).post(publicPath).set("Origin", origin).send(body);
    const retry = await request(app).post(publicPath).set("Origin", origin).send(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ ...first.body, replayed: true });
    expect(repository.submit.mock.calls[1]).toEqual(repository.submit.mock.calls[0]);
  });
  it.each([
    { ...body, actorId: actor },
    { ...body, organizationId },
    { ...body, enquiry: { ...enquiry, state: "approved" } },
  ])("rejects unknown or authority-bearing JSON fields before context: %j", async (payload) => {
    const { app, repository, resolveSubmissionContext } = setup();
    const response = await request(app).post(publicPath).set("Origin", origin).send(payload);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_request" });
    expect(repository.submit).not.toHaveBeenCalled();
    expect(resolveSubmissionContext).not.toHaveBeenCalled();
  });
  it("uses authenticated Root context rather than submission contact or referral as membership", async () => {
    const { app, repository, resolveSubmissionContext } = setup();
    resolveSubmissionContext.mockResolvedValueOnce({ ownerContext: "server-bound-organization-context-000000001", actorId: actor, organizationId });
    const response = await request(app).post(publicPath).set("Origin", origin).send(body);
    expect(response.status).toBe(201);
    expect(repository.submit.mock.calls[0]).toEqual([expect.objectContaining({ actorId: actor, organizationId })]);
  });
  it("refuses an absent secure owner context", async () => {
    const { app, repository, resolveSubmissionContext } = setup();
    resolveSubmissionContext.mockResolvedValueOnce(null);
    const response = await request(app).post(publicPath).set("Origin", origin).send(body);
    expect(response.status).toBe(403);
    expect(repository.submit).not.toHaveBeenCalled();
  });
  it("sanitizes malformed JSON without echoing contact data", async () => {
    const { app, resolveSubmissionContext } = setup();
    const response = await request(app).post(publicPath).set("Origin", origin).set("Content-Type", "application/json")
      .send('{"contactEmail":"private@example.test"');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_request" });
    expect(response.text).not.toContain("private@example.test");
    expect(resolveSubmissionContext).not.toHaveBeenCalled();
    expectPrivate(response);
  });
  it.each([false, true])("bounds JSON before context with an outer JSON parser=%s", async (outerJson) => {
    const { app, resolveSubmissionContext, repository } = setup({ outerJson });
    const response = await request(app).post(publicPath).set("Origin", origin)
      .send({ ...body, enquiry: { ...enquiry, context: "x".repeat(70_000) } });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: "invalid_request" });
    expect(resolveSubmissionContext).not.toHaveBeenCalled();
    expect(repository.submit).not.toHaveBeenCalled();
    expectPrivate(response);
  });
  it.each([
    ["not_ready", 503], ["conflict", 409], ["not_permitted", 403], ["not_found", 404], ["invalid_request", 400],
  ] as const)("maps %s to %i without implying a successful save", async (code, status) => {
    const { app, repository } = setup();
    repository.submit.mockRejectedValueOnce(new BusinessInquiryRefusal(code));
    const response = await request(app).post(publicPath).set("Origin", origin).send(body);
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: code });
    expectPrivate(response);
  });
  it("redacts unexpected repository and context failures", async () => {
    const { app, repository, resolveSubmissionContext } = setup();
    repository.submit.mockRejectedValueOnce(new Error("private@example.test provider-secret"));
    const storageFailure = await request(app).post(publicPath).set("Origin", origin).send(body);
    resolveSubmissionContext.mockRejectedValueOnce(new Error("private-session-token"));
    const contextFailure = await request(app).post(publicPath).set("Origin", origin).send(body);
    for (const response of [storageFailure, contextFailure]) {
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "unavailable" });
      expectPrivate(response);
    }
  });
  it("requires the dedicated staff guard for list, detail and assignment", async () => {
    const { app, repository, resolveActorId } = setup();
    const list = await request(app).get(staffPath).set("Authorization", "Bearer verified-organization");
    const detail = await request(app).get(`${staffPath}/${id}`);
    const assignment = await request(app).post(`${staffPath}/${id}/assign`).set("Origin", origin)
      .send({ commandId, expectedRevision: 1, assignedTo });
    expect([list.status, detail.status, assignment.status]).toEqual([403, 403, 403]);
    expect(resolveActorId).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.assign).not.toHaveBeenCalled();
  });
  it("passes the UUID keyset cursor and authenticated actor without inventing an empty queue", async () => {
    const { app, repository, events } = setup();
    const response = await request(app).get(`${staffPath}?before=${id}`).set("Authorization", "Bearer verified-staff");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [record], nextBefore: id });
    expect(repository.list).toHaveBeenCalledExactlyOnceWith(actor, id);
    expect(events).toEqual(["staff_guard", "actor"]);
    expectPrivate(response);
  });
  it.each(["before=bad", `before=${id}&before=${actor}`, `actorId=${actor}`, `organizationId=${organizationId}`])(
    "rejects malformed pagination or client scope overrides: %s", async (query) => {
      const { app, repository } = setup();
      const response = await request(app).get(`${staffPath}?${query}`).set("Authorization", "Bearer verified-staff");
      expect(response.status).toBe(400);
      expect(repository.list).not.toHaveBeenCalled();
    },
  );
  it("resolves a staff detail UUID through the real service", async () => {
    const { app, repository } = setup();
    const response = await request(app).get(`${staffPath}/${id}`).set("Authorization", "Bearer verified-staff");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(record);
    expect(repository.read).toHaveBeenCalledExactlyOnceWith(actor, id);
    expectPrivate(response);
  });
  it("refuses a malformed detail UUID before persistence", async () => {
    const { app, repository } = setup();
    const response = await request(app).get(`${staffPath}/not-a-uuid`).set("Authorization", "Bearer verified-staff");
    expect(response.status).toBe(400);
    expect(repository.read).not.toHaveBeenCalled();
  });
  it("keeps assignment behind both mutation and staff guards and delegates revision/command identity", async () => {
    const { app, repository, events } = setup();
    const assignment = { commandId, expectedRevision: 1, assignedTo };
    const response = await request(app).post(`${staffPath}/${id}/assign`).set("Origin", origin)
      .set("Authorization", "Bearer verified-staff").send(assignment);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id, revision: 2, assignedTo, replayed: false });
    expect(repository.assign).toHaveBeenCalledExactlyOnceWith(actor, id, assignment);
    expect(events).toEqual(["public_guard", "staff_guard", "actor"]);
    expectPrivate(response);
  });
  it("refuses foreign-origin assignment and browser-supplied assignment actor", async () => {
    const { app, repository } = setup();
    const foreign = await request(app).post(`${staffPath}/${id}/assign`).set("Origin", "https://foreign.test")
      .set("Authorization", "Bearer verified-staff").send({ commandId, expectedRevision: 1, assignedTo });
    const injected = await request(app).post(`${staffPath}/${id}/assign`).set("Origin", origin)
      .set("Authorization", "Bearer verified-staff").send({ commandId, expectedRevision: 1, assignedTo, actorId: actor });
    expect([foreign.status, injected.status]).toEqual([403, 400]);
    expect(repository.assign).not.toHaveBeenCalled();
  });
  it("does not treat staff authority, referral or email as organization membership", async () => {
    const { app, repository, resolveActorId } = setup();
    const response = await request(app).get(orgPath).set("Authorization", "Bearer verified-staff")
      .set("X-Email", enquiry.contactEmail).set("X-Referral", "organization-owner");
    expect(response.status).toBe(403);
    expect(resolveActorId).not.toHaveBeenCalled();
    expect(repository.listOrganization).not.toHaveBeenCalled();
  });
  it("passes only verified actor, path organization and bounded cursor to the organization service", async () => {
    const { app, repository, events } = setup();
    const response = await request(app).get(`${orgPath}?before=${id}`).set("Authorization", "Bearer verified-organization");
    expect(response.status).toBe(200);
    expect(repository.listOrganization).toHaveBeenCalledExactlyOnceWith(actor, organizationId, id);
    expect(events).toEqual(["organization_guard", "actor"]);
    expectPrivate(response);
  });
  it("refuses a missing authenticated actor even after an injected guard permits the request", async () => {
    const { app, repository, resolveActorId } = setup();
    resolveActorId.mockResolvedValueOnce(null);
    const response = await request(app).get(staffPath).set("Authorization", "Bearer verified-staff");
    expect(response.status).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });
  it("keeps persistence outages distinct from a successful empty staff page", async () => {
    const { app, repository } = setup();
    repository.list.mockRejectedValueOnce(new BusinessInquiryRefusal("unavailable"));
    const response = await request(app).get(staffPath).set("Authorization", "Bearer verified-staff");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "unavailable" });
    expectPrivate(response);
  });
});
