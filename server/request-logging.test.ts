import { describe, expect, it } from "vitest";
import express from "express";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";
import request from "supertest";
import {
  REQUEST_ID_HEADER,
  apiLogPath,
  formatWithRequestId,
  getRequestId,
  httpErrorLogLine,
  publicHttpErrorMessage,
  requestId,
  safeHttpErrorStatus,
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

function logPathRequest(path: string, routePath?: unknown): Pick<Request, "path" | "route"> {
  return {
    path,
    route: routePath === undefined ? undefined : { path: routePath },
  } as Pick<Request, "path" | "route">;
}

describe("API request path logging policy", () => {
  it("uses a declared API route template instead of the member's record id", () => {
    const recordId = "8f14e45f-ceea-467a-9575-1f1f1f1f1f1f";
    const logged = apiLogPath(
      logPathRequest(`/api/care/appointments/${recordId}`, "/api/care/appointments/:appointmentId"),
    );

    expect(logged).toBe("/api/care/appointments/:appointmentId");
    expect(logged).not.toContain(recordId);
  });

  it("coarsens sensitive and unknown paths when no safe full template is available", () => {
    expect(apiLogPath(logPathRequest("/api/care/appointments/patient-record-7"))).toBe(
      "/api/care/[redacted]",
    );
    expect(apiLogPath(logPathRequest("/api/tebra/schedule/patient-record-7"))).toBe(
      "/api/care/[redacted]",
    );
    expect(apiLogPath(logPathRequest("/api/admin/research/orders/private-record-7"))).toBe(
      "/api/admin/[redacted]",
    );
    expect(apiLogPath(logPathRequest("/api/research/orders/private-record-7"))).toBe(
      "/api/research/[redacted]",
    );
    expect(apiLogPath(logPathRequest("/api/future/private-record-7"))).toBe("/api/[redacted]");
  });

  it("rejects unsafe or nested route strings and never mistakes /apiary for the API", () => {
    expect(apiLogPath(logPathRequest("/api/care/private-record-7", "/:recordId"))).toBe(
      "/api/care/[redacted]",
    );
    expect(apiLogPath(logPathRequest("/api/research/private-record-7", "/api/research/(.*)"))).toBe(
      "/api/research/[redacted]",
    );
    expect(apiLogPath(logPathRequest("/apiary/private-record-7"))).toBeNull();
  });

  it("keeps only the exact approved diagnostic labels without a route template", () => {
    expect(apiLogPath(logPathRequest("/api/health"))).toBe("/api/health");
    expect(apiLogPath(logPathRequest("/api/waitlist/count"))).toBe("/api/waitlist/count");
  });
});

describe("HTTP error disclosure policy", () => {
  it("accepts only real HTTP error statuses and publishes generic messages", () => {
    expect(safeHttpErrorStatus({ status: 422, message: "private@example.test" })).toBe(422);
    expect(safeHttpErrorStatus({ statusCode: 503 })).toBe(503);
    expect(safeHttpErrorStatus({ status: 200 })).toBe(500);
    expect(safeHttpErrorStatus({ status: "404" })).toBe(500);
    expect(safeHttpErrorStatus(new Error("private@example.test"))).toBe(500);
    expect(
      safeHttpErrorStatus({
        get status() {
          throw new Error("private@example.test");
        },
      }),
    ).toBe(500);
    expect(publicHttpErrorMessage(422)).toBe("Request failed");
    expect(publicHttpErrorMessage(500)).toBe("Internal Server Error");
  });

  it("logs only a bounded category, safe route label, status, and server request id", () => {
    const req = logPathRequest(
      "/api/care/appointments/private-record-7",
      "/api/care/appointments/:appointmentId",
    ) as Request;
    (req as any).headers = { "x-request-id": "customer-selected-id" };
    const headers: Record<string, unknown> = {};
    const res = { setHeader: (key: string, value: unknown) => (headers[key] = value) } as Response;
    requestId()(req, res, () => {});

    const line = httpErrorLogLine(req, 500);
    expect(line).toMatch(/^\[rid:[0-9a-f-]{36}\] request_error /);
    expect(line).toContain("category=server_failure");
    expect(line).toContain("route=/api/care/appointments/:appointmentId");
    expect(line).toContain("status=500");
    expect(line).not.toContain("private-record-7");
    expect(line).not.toContain("customer-selected-id");
  });

  it("keeps the global logger wired to the bounded helpers", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("const logPath = apiLogPath(req)");
    expect(source).toContain("if (mayLogResponseBody) capturedJsonResponse = bodyJson");
    expect(source).toContain("console.error(httpErrorLogLine(req, status))");
    expect(source).not.toContain('console.error("Internal Server Error:", err)');
    expect(source).not.toContain('const message = err.message');
    expect(source).not.toContain('`${req.method} ${path} ${res.statusCode}');
    expect(source).not.toContain("assisted-order audit ${JSON.stringify(event)}");
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

  it("replaces even a syntactically safe inbound id with a fresh server UUID", async () => {
    const res = await request(buildApp()).get("/probe").set("x-request-id", "client-id_123");
    const echoed = res.headers[REQUEST_ID_HEADER.toLowerCase()];
    expect(echoed).toMatch(UUID_RE);
    expect(echoed).not.toBe("client-id_123");
    expect(res.body.rid).toBe(echoed);
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
    const assigned = headers[REQUEST_ID_HEADER];
    expect(assigned).toMatch(UUID_RE);
    expect(assigned).not.toBe("known-id-1");
    expect(formatWithRequestId("GET /api/health 200 in 1ms", req)).toBe(
      `[rid:${assigned}] GET /api/health 200 in 1ms`,
    );
  });

  it("leaves the line unchanged when no id was assigned", () => {
    const req = {} as Request;
    expect(formatWithRequestId("GET /api/health 200 in 1ms", req)).toBe(
      "GET /api/health 200 in 1ms",
    );
  });
});
