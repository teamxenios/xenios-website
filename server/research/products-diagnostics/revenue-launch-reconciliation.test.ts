import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { readReconciliationReviewResponse } from "@shared/research/revenue-launch";
import {
  projectRevenueLaunchReconciliation,
  registerRevenueLaunchReconciliationApi,
} from "./revenue-launch-reconciliation";

describe("revenue-launch reconciliation projection", () => {
  it("projects the ten exception rows without prices or release authority", () => {
    const projected = projectRevenueLaunchReconciliation({
      now: new Date("2026-09-05T20:00:00.000Z"),
    });
    expect(projected.status).toBe("AVAILABLE");
    if (projected.status !== "AVAILABLE") return;
    expect(projected.coverage).toEqual({ complete: true, expectedRows: 10, returnedRows: 10 });
    expect(projected.rows.map((row) => row.sourceId)).toEqual([
      "XRUO-007", "XRUO-009", "XRUO-010", "XRUO-013", "XRUO-014",
      "XRUO-024", "XRUO-025", "XRUO-026", "XRUO-035", "XRUO-039",
    ]);
    expect(readReconciliationReviewResponse(projected)).toEqual(projected);
    const wire = JSON.stringify(projected);
    expect(wire).not.toContain("amountCents");
    expect(wire).not.toContain("commerceApproval");
    expect(wire).not.toContain("blockers");
    expect(projected.rows.find((row) => row.sourceId === "XRUO-007")?.exactIdentity).toBeNull();
    expect(projected.rows.find((row) => row.sourceId === "XRUO-001")).toBeUndefined();
  });

  it("can expose complete Phase A coverage while preserving unresolved facts", () => {
    const projected = projectRevenueLaunchReconciliation({
      scope: "phase_a",
      now: new Date("2026-09-05T20:00:00.000Z"),
    });
    expect(projected.status).toBe("AVAILABLE");
    if (projected.status !== "AVAILABLE") return;
    expect(projected.coverage).toEqual({ complete: true, expectedRows: 39, returnedRows: 39 });
    expect(projected.rows.filter((row) => row.exactIdentity !== null)).toHaveLength(34);
    expect(projected.rows.every((row) => row.proposedIdentity === null)).toBe(true);
    expect(projected.rows.every((row) => row.facts.supplier.state === "UNKNOWN")).toBe(true);
    expect(readReconciliationReviewResponse(projected)).toEqual(projected);
  });

  it("fails closed when the immutable source is unavailable or invalid", () => {
    expect(projectRevenueLaunchReconciliation({ cwd: "C:/missing-xenios-source" })).toEqual({
      status: "UNAVAILABLE", schemaVersion: 1, reason: "source_unavailable",
    });
  });
});

describe("revenue-launch reconciliation route", () => {
  function allow(req: express.Request, _res: express.Response, next: express.NextFunction) {
    (req as express.Request & { adminEmail?: string }).adminEmail = "admin@example.invalid";
    next();
  }

  it("uses the canonical admin guard, no-store headers, and exact scope handling", async () => {
    const app = express();
    registerRevenueLaunchReconciliationApi(app, { requireAdmin: allow });
    const response = await request(app)
      .get("/api/admin/research/products/revenue-launch/reconciliation?scope=phase_a")
      .expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.body.status).toBe("AVAILABLE");
    expect(response.body.coverage).toEqual({ complete: true, expectedRows: 39, returnedRows: 39 });
    expect(readReconciliationReviewResponse(response.body)).not.toBeNull();
    await request(app)
      .get("/api/admin/research/products/revenue-launch/reconciliation?scope=unknown")
      .expect(400)
      .expect(({ body }) => expect(body).toEqual({
        ok: false,
        code: "validation_failed",
        message: "scope must be phase_a or phase_a_exceptions",
      }));
  });

  it("does not project for an unauthorized caller and maps unavailable reads honestly", async () => {
    const denied = express();
    registerRevenueLaunchReconciliationApi(denied, {
      requireAdmin: (_req, res) => res.status(403).json({ ok: false, code: "admin_required" }),
    });
    await request(denied)
      .get("/api/admin/research/products/revenue-launch/reconciliation")
      .expect(403);

    const unavailable = express();
    const project = vi.fn(() => ({ status: "UNAVAILABLE", schemaVersion: 1, reason: "projection_unavailable" as const }));
    registerRevenueLaunchReconciliationApi(unavailable, { requireAdmin: allow, project });
    const response = await request(unavailable)
      .get("/api/admin/research/products/revenue-launch/reconciliation")
      .expect(503);
    expect(response.body).toEqual({ status: "UNAVAILABLE", schemaVersion: 1, reason: "projection_unavailable" });
    expect(project).toHaveBeenCalledWith("phase_a_exceptions");
  });
});

