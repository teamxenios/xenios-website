import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerClientImportAdminApi } from "./admin-routes";
import { createMemoryClientImportStagingStore } from "./staging-store";

function buildApp() {
  const app = express();
  app.use(express.json());
  let n = 0;
  registerClientImportAdminApi(
    app,
    { store: createMemoryClientImportStagingStore(), newBatchId: () => `imp-fixed-${++n}` },
    {
      requireAdmin: (req, res, next) => {
        if (req.header("x-test-admin") !== "yes") {
          res.status(403).json({ kind: "denied", reason: "admin_required" });
          return;
        }
        next();
      },
    },
  );
  return app;
}

const VALID_BODY = {
  sourceLabel: "synthetic-fixture-file",
  sourcePartner: "vitality_advisors",
  relationshipOwner: "Seth Grant",
  rows: [
    { name: "Alex Fixture", product: "BPC-157/TB-500 (15/15mg)" },
    { name: "Blake Sample", product: "R (20mg)" },
  ],
};

describe("client-import admin routes", () => {
  it("refuses non-admin callers on every route", async () => {
    const app = buildApp();
    expect((await request(app).post("/api/admin/research/client-imports/dry-run").send(VALID_BODY)).status).toBe(403);
    expect((await request(app).get("/api/admin/research/client-imports")).status).toBe(403);
    expect((await request(app).get("/api/admin/research/client-imports/imp-fixed-1")).status).toBe(403);
  });

  it("rejects malformed payloads with 400", async () => {
    const app = buildApp();
    for (const bad of [
      {},
      { ...VALID_BODY, rows: [] },
      { ...VALID_BODY, rows: [{ name: 1, product: "x" }] },
      { ...VALID_BODY, sourceLabel: "" },
    ]) {
      const res = await request(app)
        .post("/api/admin/research/client-imports/dry-run")
        .set("x-test-admin", "yes")
        .send(bad);
      expect(res.status).toBe(400);
    }
  });

  it("runs a dry run and returns the aggregate report, never names", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/admin/research/client-imports/dry-run")
      .set("x-test-admin", "yes")
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.data.dryRun).toBe(true);
    expect(res.body.data.uniquePeople).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain("Alex");
    expect(JSON.stringify(res.body)).not.toContain("Blake");
  });

  it("serves stored reports by batch id and 404s unknown batches", async () => {
    const app = buildApp();
    const created = await request(app)
      .post("/api/admin/research/client-imports/dry-run")
      .set("x-test-admin", "yes")
      .send(VALID_BODY);
    const batchId = created.body.data.batchId;
    const fetched = await request(app)
      .get(`/api/admin/research/client-imports/${batchId}`)
      .set("x-test-admin", "yes");
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.batchId).toBe(batchId);
    const missing = await request(app)
      .get("/api/admin/research/client-imports/imp-nope")
      .set("x-test-admin", "yes");
    expect(missing.status).toBe(404);
  });

  it("has no invitation, send, or activation route at all", async () => {
    const app = buildApp();
    for (const path of [
      "/api/admin/research/client-imports/imp-fixed-1/invite",
      "/api/admin/research/client-imports/imp-fixed-1/activate",
      "/api/admin/research/client-imports/imp-fixed-1/send",
    ]) {
      const res = await request(app).post(path).set("x-test-admin", "yes").send({});
      expect(res.status).toBe(404);
    }
  });
});
