import { readFileSync } from "node:fs";
import ts from "typescript";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ configured: true, list: vi.fn(), review: vi.fn(), saveCase: vi.fn(), saveReview: vi.fn(), audit: vi.fn(), deletion: vi.fn(), moneyStore: vi.fn() }));
vi.mock("../../supabase", () => ({ supabaseConfigured: () => ports.configured, getSupabaseAdmin: () => { throw new Error("No payment or account source may be resolved"); } }));
vi.mock("./persistence/identity-store", () => ({ resolveIdentityStore: () => ({ listCasesWithRawSource: ports.list, getReviewForCase: ports.review, saveCase: ports.saveCase, saveReview: ports.saveReview, appendAuditEvent: ports.audit }) }));
vi.mock("./persistence/obligations-store", () => ({ resolveObligationsStore: ports.moneyStore }));
vi.mock("./identity-retention", () => ({ runRawDeletionSweep: ports.deletion }));
import { runProductionFoundingSchedulerTick } from "./scheduler";
import { registerFoundingActivationApi } from "./routes";
beforeEach(() => {
  vi.clearAllMocks(); ports.configured = true;
  ports.list.mockResolvedValue([{ caseId: "synthetic-case" }]); ports.review.mockResolvedValue({ reviewId: "synthetic-review" });
  ports.deletion.mockResolvedValue({ updatedCases: [{ caseId: "synthetic-case", storagePath: null }], updatedReviews: [{ reviewId: "synthetic-review" }], deletedPaths: ["synthetic-source-path"] });
});
describe("production paid membership retirement", () => {
  it("mounts the production HTTP surface disabled, independently of legacy flags", async () => {
    const source = ts.createSourceFile("index.ts", readFileSync("server/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const calls: ts.CallExpression[] = [];
    function visit(node: ts.Node) { if (ts.isCallExpression(node) && node.expression.getText(source) === "registerFoundingActivationApi") calls.push(node); ts.forEachChild(node, visit); }
    visit(source); expect(calls).toHaveLength(1);
    const expression = calls[0].arguments[1]; expect(ts.isObjectLiteralExpression(expression)).toBe(true);
    if (!ts.isObjectLiteralExpression(expression)) throw new Error("production must explicitly retire activation");
    expect(expression.properties).toHaveLength(1); expect(expression.properties[0].getText(source)).toBe('state: "disabled"');
    const app = express(); const auth = vi.fn((_req, _res, next) => next());
    registerFoundingActivationApi(app, { state: "disabled" }, { requireMember: auth, requireSupabaseAdmin: auth });
    for (const path of ["/api/research/activation/payment/report", "/api/admin/research/activation/queue/old-obligation/verify", "/api/research/activation/esign/native/sign"]) {
      const response = await request(app).post(path).send({ memberId: "foreign", amount: 5000 });
      expect(response.status).toBe(503); expect(response.body.code).toBe("capability_disabled");
    }
    expect(auth).not.toHaveBeenCalled();
  });
  it("continues the same retention policy and persists its results without resolving renewal or account writers", async () => {
    const now = new Date("2026-09-05T00:00:00Z");
    const result = await runProductionFoundingSchedulerTick(now);
    expect(ports.deletion).toHaveBeenCalledWith(expect.objectContaining({ now, cases: [{ caseId: "synthetic-case" }], reviews: [{ reviewId: "synthetic-review" }] }));
    expect(ports.saveCase).toHaveBeenCalledWith({ caseId: "synthetic-case", storagePath: null }); expect(ports.saveReview).toHaveBeenCalledWith({ reviewId: "synthetic-review" });
    expect(result).toMatchObject({ ran: true, identityRawDeletions: 1, scheduleAdvanced: 0, renewalNoticesEnqueued: 0, suspensionEmailsEnqueued: 0 });
    expect(ports.moneyStore).not.toHaveBeenCalled();
  });
  it("touches no store without configured persistence", async () => {
    ports.configured = false; expect((await runProductionFoundingSchedulerTick()).ran).toBe(false); expect(ports.list).not.toHaveBeenCalled();
  });
});
