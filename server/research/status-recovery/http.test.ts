import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerStatusRecoveryApi, STATUS_RECOVERY_COOKIE } from "./http";

function appWith(service: any, production = true) {
  const app = express();
  app.use(express.json());
  registerStatusRecoveryApi(app, service, { production, publicClientKey: () => "synthetic-client" });
  return app;
}

describe("status recovery HTTP boundary", () => {
  it("keeps request responses and private headers invariant", async () => {
    const service = { request: vi.fn(async () => ({ ok: true })) };
    const response = await request(appWith(service)).post("/api/research/status-recovery/request").send({ reference: "anything", email: "anything" });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true, message: "If the details match an eligible order, we’ll send a secure status link to the email already associated with it." });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("sets a narrow production cookie only after explicit POST exchange", async () => {
    const service = { exchange: vi.fn(async () => "S".repeat(43)) };
    const get = await request(appWith(service)).get("/api/research/status-recovery/exchange");
    expect(get.status).toBe(404);
    expect(service.exchange).not.toHaveBeenCalled();
    const response = await request(appWith(service)).post("/api/research/status-recovery/exchange").send({ token: "T".repeat(43) });
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"][0]).toContain(`${STATUS_RECOVERY_COOKIE}=`);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(response.headers["set-cookie"][0]).toContain("Path=/api/research/status");
  });

  it("uses only the status cookie for the exact status projection and supports explicit end", async () => {
    const service = {
      status: vi.fn(async () => ({ reference: "XRR-20260927-ABCDEF1234", status: "reviewing" })),
      end: vi.fn(async () => undefined),
    };
    const app = appWith(service, false);
    const status = await request(app).get("/api/research/status").set("Cookie", `${STATUS_RECOVERY_COOKIE}=${"S".repeat(43)}`);
    expect(status.status).toBe(200);
    expect(service.status).toHaveBeenCalledWith("S".repeat(43));
    const ended = await request(app).post("/api/research/status/end").set("Cookie", `${STATUS_RECOVERY_COOKIE}=${"S".repeat(43)}`);
    expect(ended.status).toBe(204);
    expect(ended.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
  });
});
