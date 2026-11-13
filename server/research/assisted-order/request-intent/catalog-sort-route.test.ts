import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "../../../care/access";
import type { AssistedOrderViewer } from "../ports";
import { createRequestIntentRouter } from "./express";
import type { RequestIntentService, RequestIntentStaffReader } from "./service";

// The catalog route passes a known sort to the service and refuses anything else
// before the service is asked.
const root = "/api/research/early-access/request-intents";
const viewer: AssistedOrderViewer = { actorType: "early_access_session", memberId: null, authUserId: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session", normalizedEmail: null,
  capabilities: new Set(["assisted_orders:submit"]) };
const care: CareAccessDependencies = {
  loadCapabilityStatus: async () => ({ rail: "care" as const, state: "disabled" as const, enabled: false, publicMessage: "", checkedAt: new Date().toISOString() }),
  resolvePrincipal: async () => null,
  recordAccessDecision: async () => undefined,
};
function fixture() {
  const list = vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 24, families: [], channels: [], workflowModes: [] }));
  const pass: RequestHandler = (_req, _res, next) => next();
  const app = express(); app.use(express.json());
  app.use(root, createRequestIntentRouter({
    service: { submit: vi.fn(), recover: vi.fn(), list, staffList: vi.fn(), staffRead: vi.fn() } as unknown as RequestIntentService,
    resolveCustomer: async () => viewer, care, staffReadEnabled: () => false, staffReader: {} as RequestIntentStaffReader,
    mutationGuard: pass, readRateLimit: pass, writeRateLimit: pass, enabled: () => true,
  }));
  return { app, list };
}

describe("the catalog route's sort", () => {
  it("passes no sort when none is asked for", async () => {
    const { app, list } = fixture();
    expect((await request(app).get(root + "/catalog")).status).toBe(200);
    expect(list).toHaveBeenCalledWith(viewer, { search: undefined, family: undefined, sort: undefined, page: 1, pageSize: 24 });
  });
  it.each(["name_asc", "name_desc", "best_sellers", "most_requested_research_peptides"])("passes %s to the service", async (sort) => {
    const { app, list } = fixture();
    expect((await request(app).get(root + "/catalog").query({ sort, page: 2 })).status).toBe(200);
    expect(list.mock.calls[0][1]).toMatchObject({ sort, page: 2 });
  });
  it.each(["invented_sort", "popular", "price_asc", "", "NAME_ASC"])("refuses the sort %j before asking the service", async (sort) => {
    const { app, list } = fixture();
    expect((await request(app).get(root + "/catalog").query({ sort })).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
  it("refuses a repeated sort", async () => {
    const { app, list } = fixture();
    expect((await request(app).get(root + "/catalog?sort=name_asc&sort=name_desc")).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
});
