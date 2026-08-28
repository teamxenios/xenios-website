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

const VALID_BODY = {  sourcePartner: "vitality_advisors",
  relationshipOwner: "Vitality Advisors relationship owner",
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
      { ...VALID_BODY, rows: [{ name: 1, product: "x" }] },    ]) {
      const res = await request(app)
        .post("/api/admin/research/client-imports/dry-run")
        .set("x-test-admin", "yes")
        .send(bad);
      expect(res.status).toBe(400);
    }
  });

  it("runs a dry run and returns the aggregate report — never names, never raw product text", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/admin/research/client-imports/dry-run")
      .set("x-test-admin", "yes")
      .send({
        ...VALID_BODY,
        rows: [
          ...VALID_BODY.rows,
          { name: "Casey Placeholder", product: "Totally Unknown Product 9000" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.dryRun).toBe(true);
    expect(res.body.data.uniquePeople).toBe(3);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("Alex");
    expect(serialized).not.toContain("Blake");
    expect(serialized).not.toContain("Casey");
    // P1-10/11: the HTTP boundary carries codes, counts, and 12-hex refs only.
    expect(serialized).not.toContain("BPC-157/TB-500 (15/15mg)");
    expect(serialized).not.toContain("Totally Unknown Product 9000");
    expect(res.body.data.unmappedInterests[0].ref).toMatch(/^[0-9a-f]{12}$/);
  });

  it("oversized rows are rejected and COUNTED through the HTTP door, never silently dropped", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/admin/research/client-imports/dry-run")
      .set("x-test-admin", "yes")
      .send({
        ...VALID_BODY,
        rows: [
          { name: "N".repeat(10_000), product: "DSIP" },
          { name: "Alex Fixture", product: "DSIP" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.rejectedRows).toBe(1);
    expect(res.body.data.rejectionCounts.name_too_long).toBe(1);
    expect(res.body.data.processedRows).toBe(1);
  });

  it("production keeps this surface dark: the registrar call is flag-gated at the seam", async () => {
    // Source pin (same style as the account-portal policy tests): the ONLY
    // registration call site must sit inside the RESEARCH_CLIENT_IMPORT_ADMIN_
    // ENABLED === "true" conditional, so with the flag absent no route exists.
    const { readFileSync } = await import("node:fs");
    const indexSource = readFileSync("server/index.ts", "utf8");
    const gate = indexSource.indexOf('process.env.RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED === "true"');
    const call = indexSource.indexOf("registerClientImportAdminApi(", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(gate);
    // No second, ungated call site anywhere in the composition root.
    expect(indexSource.indexOf("registerClientImportAdminApi(", call + 1)).toBe(-1);
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

// P1-G (round 3): ZERO caller text in any response, proven recursively. A
// unique synthetic marker goes into EVERY caller-controlled string field; no
// marker may appear anywhere in the serialized response — success or error.
describe("zero caller-supplied text crosses the response boundary", () => {
  it("markers planted in every caller field are absent from the success response", async () => {
    const app = buildApp();
    const M = "zqzq_marker";
    const res = await request(app)
      .post("/api/admin/research/client-imports/dry-run")
      .set("x-test-admin", "yes")
      .send({
        sourcePartner: `${M}_partner`,
        relationshipOwner: `${M} Owner`,
        extraneousField: `${M}_extraneous`,
        rows: [
          { name: `${M} Person One`, product: `${M} Product Alpha` },
          { name: `${M} Person Two`, product: `Unmappable ${M} Product Beta` },
          { name: `${M} Person Two`, product: `${M} A & ${M} B` },
        ],
      });
    expect(res.status).toBe(201);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(M);
    // and the server-authored identity is what stands in for a label
    expect(res.body.data.sourceType).toBe("partner_client_import");
  });

  it("markers are absent from ERROR responses too", async () => {
    const app = buildApp();
    const M = "zqzq_err_marker";
    const bad = await request(app)
      .post("/api/admin/research/client-imports/dry-run")
      .set("x-test-admin", "yes")
      .send({ sourcePartner: `${M}_p`, relationshipOwner: `${M}_o`, rows: "not-an-array" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toContain(M);
    const missing = await request(app)
      .get(`/api/admin/research/client-imports/${M}-batch`)
      .set("x-test-admin", "yes");
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).not.toContain(M);
  });
});
