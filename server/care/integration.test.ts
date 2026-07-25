import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { carePageGate, registerCareApi } from "./index";

const savedState = process.env.CARE_CAPABILITY_STATE;
const savedApproval = process.env.CARE_ENABLE_APPROVED;

afterEach(() => {
  if (savedState === undefined) delete process.env.CARE_CAPABILITY_STATE;
  else process.env.CARE_CAPABILITY_STATE = savedState;
  if (savedApproval === undefined) delete process.env.CARE_ENABLE_APPROVED;
  else process.env.CARE_ENABLE_APPROVED = savedApproval;
});

function app() {
  const instance = express();
  instance.use(carePageGate);
  registerCareApi(instance);
  instance.get("/care", (_req, res) => res.send("shell"));
  return instance;
}

describe("Care route integration", () => {
  it("publishes only truthful disabled status by default", async () => {
    delete process.env.CARE_CAPABILITY_STATE;
    delete process.env.CARE_ENABLE_APPROVED;
    const response = await request(app()).get("/api/care/status");
    expect(response.status).toBe(200);
    expect(response.body.capability).toMatchObject({
      rail: "care",
      state: "disabled",
      enabled: false,
      publicMessage: "Care is being prepared.",
    });
  });

  it("fails operational access closed before authentication", async () => {
    const response = await request(app()).get("/api/care/audit/access");
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("care_disabled");
  });

  it("protects the Care page from cache, indexing, and referrer leakage", async () => {
    const response = await request(app()).get("/care");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});

describe("Care isolation in production wiring", () => {
  const source = readSource();

  it("redacts all Care API response bodies from logs", () => {
    expect(source).toContain('"/api/care"');
    expect(source).toContain("PII_PATHS");
  });

  it("mounts Care as its own server module", () => {
    expect(source).toContain('from "./care"');
    expect(source).toContain("registerCareApi(app)");
  });
});

function readSource(): string {
  return readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
}
