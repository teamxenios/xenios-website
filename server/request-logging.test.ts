import { describe, expect, it } from "vitest";
import express from "express";
import type { Request, Response } from "express";
import request from "supertest";
import {
  REQUEST_ID_HEADER,
  formatWithRequestId,
  getRequestId,
  requestId,
  sanitizeRequestId,
  shouldLogApiResponseBody,
} from "./request-logging";

describe("API response logging policy", () => {
  it("allows only the explicit non-sensitive diagnostic bodies", () => {
    expect(shouldLogApiResponseBody("/api/health")).toBe(true);
    expect(shouldLogApiResponseBody("/api/counter")).toBe(true);
    expect(shouldLogApiResponseBody("/api/waitlist/count")).toBe(true);
  });

  it("keeps config, member, admin, contact, and unknown response bodies private", () => {
    expect(shouldLogApiResponseBody("/api/config")).toBe(false);
    expect(shouldLogApiResponseBody("/api/research/me")).toBe(false);
    expect(shouldLogApiResponseBody("/api/admin/waitlist")).toBe(false);
    expect(shouldLogApiResponseBody("/api/contact")).toBe(false);
    expect(shouldLogApiResponseBody("/api/future-route")).toBe(false);
  });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function buildApp() {
  const app = express();
  app.use(requestId());
  app.get("/probe", (req, res) => {
    res.json({ rid: getRequestId(req) ?? null });
  });
  return app;
}

describe("sanitizeRequestId", () => {
  it("accepts a bounded id made of safe characters", () => {
    expect(sanitizeRequestId("abc-123_XYZ")).toBe("abc-123_XYZ");
    expect(sanitizeRequestId("a")).toBe("a");
    expect(sanitizeRequestId("x".repeat(64))).toBe("x".repeat(64));
  });

  it("rejects overlong values", () => {
    expect(sanitizeRequestId("x".repeat(65))).toBeNull();
  });

  it("rejects injection characters and whitespace", () => {
    expect(sanitizeRequestId("abc def")).toBeNull();
    expect(sanitizeRequestId("abc\ndef")).toBeNull();
    expect(sanitizeRequestId("abc\r\ndef")).toBeNull();
    expect(sanitizeRequestId('a"b')).toBeNull();
    expect(sanitizeRequestId("a;b")).toBeNull();
    expect(sanitizeRequestId("<script>")).toBeNull();
    expect(sanitizeRequestId("a:b")).toBeNull();
  });

  it("rejects empty, non-string, and repeated-header (array) values", () => {
    expect(sanitizeRequestId("")).toBeNull();
    expect(sanitizeRequestId(undefined)).toBeNull();
    expect(sanitizeRequestId(42)).toBeNull();
    expect(sanitizeRequestId(["a", "b"])).toBeNull();
  });
});

describe("requestId middleware", () => {
  it("generates a UUID and echoes it on the response when no header is sent", async () => {
    const res = await request(buildApp()).get("/probe");
    expect(res.status).toBe(200);
    const echoed = res.headers[REQUEST_ID_HEADER.toLowerCase()];
    expect(echoed).toMatch(UUID_RE);
    expect(res.body.rid).toBe(echoed);
  });

  it("reuses a safe inbound x-request-id", async () => {
    const res = await request(buildApp()).get("/probe").set("x-request-id", "client-id_123");
    expect(res.headers[REQUEST_ID_HEADER.toLowerCase()]).toBe("client-id_123");
    expect(res.body.rid).toBe("client-id_123");
  });

  it("replaces an unsafe inbound id with a fresh UUID and never echoes the raw value", async () => {
    const res = await request(buildApp()).get("/probe").set("x-request-id", "evil injection");
    const echoed = res.headers[REQUEST_ID_HEADER.toLowerCase()];
    expect(echoed).toMatch(UUID_RE);
    expect(echoed).not.toContain("evil");
    expect(res.body.rid).toBe(echoed);
  });

  it("replaces an overlong inbound id with a fresh UUID", async () => {
    const res = await request(buildApp()).get("/probe").set("x-request-id", "x".repeat(65));
    expect(res.headers[REQUEST_ID_HEADER.toLowerCase()]).toMatch(UUID_RE);
  });

  it("assigns a distinct id per request", async () => {
    const app = buildApp();
    const a = await request(app).get("/probe");
    const b = await request(app).get("/probe");
    expect(a.body.rid).not.toBe(b.body.rid);
  });
});

describe("formatWithRequestId", () => {
  it("prefixes the id when the middleware assigned one", () => {
    const req = {} as Request;
    const headers: Record<string, unknown> = {};
    const res = { setHeader: (k: string, v: unknown) => (headers[k] = v) } as unknown as Response;
    (req as any).headers = { "x-request-id": "known-id-1" };
    requestId()(req, res, () => {});
    expect(formatWithRequestId("GET /api/health 200 in 1ms", req)).toBe(
      "[rid:known-id-1] GET /api/health 200 in 1ms",
    );
    expect(headers[REQUEST_ID_HEADER]).toBe("known-id-1");
  });

  it("leaves the line unchanged when no id was assigned", () => {
    const req = {} as Request;
    expect(formatWithRequestId("GET /api/health 200 in 1ms", req)).toBe(
      "GET /api/health 200 in 1ms",
    );
  });
});
