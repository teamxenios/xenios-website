import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "./access";
import { careCapabilityStatusForState } from "./capability";
import { carePageGate, registerCareApi } from "./index";

function dependencies(
  loadCapabilityStatus: CareAccessDependencies["loadCapabilityStatus"] = vi.fn(
    async () => careCapabilityStatusForState("enabled"),
  ),
): CareAccessDependencies {
  return {
    loadCapabilityStatus,
    resolvePrincipal: vi.fn(async () => null),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

const directEnvironment: NodeJS.ProcessEnv = {
  TEBRA_SCHEDULING_ENABLED: "true",
  TEBRA_SCHEDULING_MODE: "direct_link",
  TEBRA_SCHEDULING_URL: "https://scheduler.example.test/request?practice=review",
  TEBRA_ALLOWED_ORIGINS: "https://scheduler.example.test",
  TEBRA_TELEHEALTH_ENABLED: "false",
  TEBRA_ENVIRONMENT: "review",
};

describe("Tebra public configuration route", () => {
  it("serves only the validated public projection with privacy headers", async () => {
    const app = express();
    registerCareApi(app, dependencies(), { env: directEnvironment });

    const response = await request(app).get("/api/care/tebra/configuration");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.body).toMatchObject({
      schemaVersion: 1,
      authority: "tebra",
      careAvailable: true,
      scheduling: {
        status: "ready",
        mode: "direct_link",
        url: directEnvironment.TEBRA_SCHEDULING_URL,
        telehealthEnabled: false,
        requestSemantics: "appointment_request_pending_confirmation",
      },
      portal: { status: "unconfigured" },
    });
    expect(Object.keys(response.body).sort()).toEqual([
      "authority",
      "careAvailable",
      "portal",
      "scheduling",
      "schemaVersion",
    ]);
  });

  it("fails closed without leaking configured destinations when capability lookup fails", async () => {
    const app = express();
    registerCareApi(
      app,
      dependencies(async () => {
        throw new Error("private-capability-detail");
      }),
      { env: directEnvironment },
    );

    const response = await request(app).get("/api/care/tebra/configuration");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      careAvailable: false,
      scheduling: { status: "care_unavailable" },
      portal: { status: "care_unavailable" },
    });
    expect(JSON.stringify(response.body)).not.toContain("scheduler.example.test");
    expect(JSON.stringify(response.body)).not.toContain("private-capability-detail");
  });
});

describe("Care page privacy gate", () => {
  function gatedApp() {
    const app = express();
    app.use(carePageGate);
    app.use((_req, res) => res.json({ ok: true }));
    return app;
  }

  it.each(["/care", "/CARE/", "/c%61re/schedule", "/care/portal?from=nav"])(
    "applies the Care privacy boundary to %s",
    async (path) => {
      const response = await request(gatedApp()).get(path);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    },
  );

  it.each(["/careers", "/care%2Fschedule", "/research"])(
    "does not misclassify %s as a Care route",
    async (path) => {
      const response = await request(gatedApp()).get(path);
      expect(response.headers).not.toHaveProperty("x-robots-tag");
      expect(response.headers).not.toHaveProperty("referrer-policy");
    },
  );
});
