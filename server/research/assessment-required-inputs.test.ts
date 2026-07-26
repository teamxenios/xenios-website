import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrelaunchRole } from "@shared/research/prelaunch";
import {
  ASSESSMENT_REQUIRED_INPUT_CANONICAL_ROUTES,
  ASSESSMENT_REQUIRED_INPUT_DEFINITIONS,
  ASSESSMENT_REQUIRED_INPUT_DOMAIN,
  ASSESSMENT_REQUIRED_INPUT_EXPECTED_COUNT,
  registerAssessmentRequiredInputPlanApi,
} from "./assessment-required-inputs";
import type {
  PrelaunchAccessAuditInput,
  PrelaunchDependencies,
  PrelaunchRepository,
} from "./prelaunch";

function buildHarness(options?: {
  roles?: PrelaunchRole[];
  namespaceExists?: boolean;
}) {
  const audits: PrelaunchAccessAuditInput[] = [];
  const repository: PrelaunchRepository = {
    getActiveRoles: vi.fn(async () => options?.roles ?? []),
    getSeedNamespace: vi.fn(async (namespace) =>
      options?.namespaceExists
        ? {
            namespace,
            seed_version: 1,
            reset_group: "assessment",
            release_eligible: false,
            status: "active",
          }
        : null,
    ),
    getSettings: vi.fn(async () => ({
      launchStatus: "internal_review",
      providerMode: "disabled",
    })),
    appendAccessAudit: vi.fn(async (input) => {
      audits.push(input);
    }),
    listRoleAssignments: vi.fn(async () => []),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
  };
  const dependencies: PrelaunchDependencies = {
    verifyUser: vi.fn(async (token) =>
      token === "valid" ? { id: "internal-user" } : null,
    ),
    repository,
    now: () => new Date("2026-07-26T06:00:00.000Z"),
    requestId: () => "assessment-required-input-plan",
  };
  const app = express();
  registerAssessmentRequiredInputPlanApi(app, dependencies);
  return { app, audits, repository };
}

describe("Assessment required-input domain definitions", () => {
  it("uses one canonical domain with unique exact keys and the canonical admin route", () => {
    expect(ASSESSMENT_REQUIRED_INPUT_EXPECTED_COUNT).toBe(12);
    expect(
      new Set(ASSESSMENT_REQUIRED_INPUT_DEFINITIONS.map((item) => item.key))
        .size,
    ).toBe(ASSESSMENT_REQUIRED_INPUT_EXPECTED_COUNT);

    for (const definition of ASSESSMENT_REQUIRED_INPUT_DEFINITIONS) {
      expect(definition.domain).toBe(ASSESSMENT_REQUIRED_INPUT_DOMAIN);
      expect(definition.adminEntryHref).toBe(
        ASSESSMENT_REQUIRED_INPUT_CANONICAL_ROUTES.admin,
      );
      expect(definition.blockingLevel).toBe("blocks_public_launch");
      expect(definition.responsibleRole).toBe("internal_team");
      expect(definition.label).toMatch(/ REQUIRED$/);
      expect(definition.label).not.toMatch(/\b(TBD|TBA|PLACEHOLDER)\b/);
    }
  });

  it("defines only real references and never embeds a secret, seed row, or launch state", () => {
    const serialized = JSON.stringify(ASSESSMENT_REQUIRED_INPUT_DEFINITIONS);
    expect(
      ASSESSMENT_REQUIRED_INPUT_DEFINITIONS.every(
        (definition) =>
          definition.entryMode === "record_reference" &&
          definition.valueSensitivity === "ordinary",
      ),
    ).toBe(true);
    expect(serialized).not.toContain("internal_seed");
    expect(serialized).not.toContain("public_enabled");
    expect(serialized).not.toMatch(/password|private[_ -]?key|api[_ -]?key/i);
  });

  it("maps the queued Assessment, trainer, and reviewer facts without Trust scope", () => {
    const keys = ASSESSMENT_REQUIRED_INPUT_DEFINITIONS.map(
      (definition) => definition.key,
    );
    expect(
      keys.filter((key) => key.startsWith("research_assessment.consent.")),
    ).toHaveLength(3);
    expect(
      keys.filter((key) =>
        key.startsWith("research_assessment.configuration."),
      ),
    ).toHaveLength(1);
    expect(
      keys.filter((key) => key.startsWith("research_assessment.trainer.")),
    ).toHaveLength(4);
    expect(
      keys.filter((key) =>
        key.startsWith("research_assessment.plan_review."),
      ),
    ).toHaveLength(4);
    expect(JSON.stringify(keys)).not.toContain("trust");
  });
});

describe("Assessment required-input review endpoint", () => {
  it("requires a verified persisted pre-launch role before exposing the plan", async () => {
    const { app, repository } = buildHarness({
      roles: ["approved_internal_reviewer"],
    });

    const response = await request(app).get(
      "/api/internal/research/assessment/required-input-plan",
    );

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("sign_in_required");
    expect(repository.getActiveRoles).not.toHaveBeenCalled();
  });

  it("rejects a canonical role outside Website 1's review subset", async () => {
    const { app, audits } = buildHarness({ roles: ["product_admin"] });

    const response = await request(app)
      .get("/api/internal/research/assessment/required-input-plan")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("prelaunch_role_required");
    expect(audits).toMatchObject([
      {
        role: null,
        decision: "denied",
        reasonCode: "role_required",
      },
    ]);
  });

  it("returns the reviewed definitions but authorizes no persistence or launch transition", async () => {
    const { app } = buildHarness({
      roles: ["approved_internal_reviewer"],
    });

    const response = await request(app)
      .get("/api/internal/research/assessment/required-input-plan")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.plan).toMatchObject({
      domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
      expectedInputCount: 12,
      persistenceAuthorized: false,
      launchTransitionAuthorized: false,
      canonicalRoutes: ASSESSMENT_REQUIRED_INPUT_CANONICAL_ROUTES,
    });
    expect(response.body.plan.definitions).toHaveLength(12);
  });

  it("prohibits seed context even when a namespace exists in the guard harness", async () => {
    const { app, audits } = buildHarness({
      roles: ["internal_team"],
      namespaceExists: true,
    });

    const response = await request(app)
      .get("/api/internal/research/assessment/required-input-plan")
      .set("Authorization", "Bearer valid")
      .set("X-Xenios-Seed-Namespace", "assessment-review");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("seed_namespace_unavailable");
    expect(audits).toMatchObject([
      {
        decision: "denied",
        reasonCode: "seed_namespace_unavailable",
      },
    ]);
  });
});
