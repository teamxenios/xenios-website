import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "./access";
import { careCapabilityStatusForState } from "./capability";
import { carePageGate, registerCareApi } from "./index";
import {
  fingerprintTebraAuthorityConfiguration,
  type ReadyTebraSchedulingConfiguration,
  type TebraPublicAuthoritySource,
} from "./tebra-public-authority";

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

const currentReleaseSha = "1111111111111111111111111111111111111111";
const readyScheduling: ReadyTebraSchedulingConfiguration = {
  status: "ready",
  mode: "direct_link",
  url: directEnvironment.TEBRA_SCHEDULING_URL!,
  telehealthEnabled: false,
  requestSemantics: "appointment_request_pending_confirmation",
};

function authoritySource(): TebraPublicAuthoritySource {
  return {
    load: vi.fn(async () => ({
      scheduling: {
        schemaVersion: 1,
        source: "durable_release_attestation",
        scope: "scheduling_public_handoff",
        authorityId: "synthetic-route-authority",
        releaseSha: currentReleaseSha,
        environment: "production",
        configurationFingerprint: fingerprintTebraAuthorityConfiguration(
          "scheduling_public_handoff",
          readyScheduling,
        ),
        stagingResult: "passed",
        stagingVerifiedAt: "2026-08-28T09:00:00.000Z",
        decision: "approved",
        approvedByRef: "synthetic-route-reviewer",
        approvedAt: "2026-08-28T10:00:00.000Z",
        validUntil: "2026-08-29T12:00:00.000Z",
        revokedAt: null,
        providerSchedulingState: "verified_enabled",
      },
    })),
  };
}

describe("Tebra public configuration route", () => {
  it("serves review configuration as non-actionable with privacy headers", async () => {
    const app = express();
    registerCareApi(app, dependencies(), {
      env: directEnvironment,
      tebraAuthoritySource: authoritySource(),
      currentReleaseSha,
      clock: () => new Date("2026-08-28T12:00:00.000Z"),
    });

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
        status: "unconfigured",
        mode: "direct_link",
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
    expect(JSON.stringify(response.body)).not.toContain(
      directEnvironment.TEBRA_SCHEDULING_URL,
    );
  });

  it("requires production plus an exact durable authority for a direct link", async () => {
    const app = express();
    registerCareApi(app, dependencies(), {
      env: { ...directEnvironment, TEBRA_ENVIRONMENT: "production" },
      tebraAuthoritySource: authoritySource(),
      currentReleaseSha,
      clock: () => new Date("2026-08-28T12:00:00.000Z"),
    });

    const response = await request(app).get("/api/care/tebra/configuration");

    expect(response.status).toBe(200);
    expect(response.body.scheduling).toEqual(readyScheduling);
    expect(response.body).not.toHaveProperty("releaseSha");
    expect(JSON.stringify(response.body)).not.toContain("authorityId");
  });

  it("does not let the authority reader self-supply missing release identity", async () => {
    const app = express();
    registerCareApi(app, dependencies(), {
      env: { ...directEnvironment, TEBRA_ENVIRONMENT: "production" },
      tebraAuthoritySource: authoritySource(),
      clock: () => new Date("2026-08-28T12:00:00.000Z"),
    });

    const response = await request(app).get("/api/care/tebra/configuration");

    expect(response.status).toBe(200);
    expect(response.body.scheduling).toMatchObject({ status: "unconfigured" });
    expect(JSON.stringify(response.body)).not.toContain("scheduler.example.test");
  });

  it("does not fall back to retained URLs when durable authority lookup fails", async () => {
    const app = express();
    registerCareApi(app, dependencies(), {
      env: { ...directEnvironment, TEBRA_ENVIRONMENT: "production" },
      tebraAuthoritySource: {
        load: vi.fn(async () => {
          throw new Error("private-authority-dependency-detail");
        }),
      },
      currentReleaseSha,
      clock: () => new Date("2026-08-28T12:00:00.000Z"),
    });

    const response = await request(app).get("/api/care/tebra/configuration");

    expect(response.status).toBe(200);
    expect(response.body.scheduling).toMatchObject({ status: "unconfigured" });
    expect(JSON.stringify(response.body)).not.toContain("scheduler.example.test");
    expect(JSON.stringify(response.body)).not.toContain(
      "private-authority-dependency-detail",
    );
  });

  it("fails closed without leaking configured destinations when capability lookup fails", async () => {
    const app = express();
    const source = authoritySource();
    registerCareApi(
      app,
      dependencies(async () => {
        throw new Error("private-capability-detail");
      }),
      {
        env: directEnvironment,
        tebraAuthoritySource: source,
        currentReleaseSha,
      },
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
    expect(source.load).not.toHaveBeenCalled();
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
