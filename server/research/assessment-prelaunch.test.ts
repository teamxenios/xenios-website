import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrelaunchDataContext } from "@shared/research/prelaunch";
import {
  AssessmentPrelaunchSeedIsolationError,
  buildAssessmentPrelaunchProductionRepository,
  registerAssessmentPrelaunchApi,
  requireAssessmentRealDataContext,
  type AssessmentPrelaunchRepository,
  type AssessmentPrelaunchWorkspace,
} from "./assessment-prelaunch";
import type {
  PrelaunchAccessAuditInput,
  PrelaunchDependencies,
  PrelaunchRepository,
} from "./prelaunch";

const workspace: AssessmentPrelaunchWorkspace = {
  assessmentConfiguration: {
    definitionId: "initial-v2",
    definitionVersion: 2,
    targetMinutes: 8,
    sectionCount: 6,
    questionCount: 24,
    consentKey: "XR-MEM-012",
    collectionReady: false,
  },
  assessmentResponses: {
    initialInProgress: 2,
    initialSubmitted: 3,
    monthlyInProgress: 1,
    monthlySubmitted: 4,
  },
  trainerAssignment: {
    source: "plan_review_assignment",
    reviewItems: 5,
    assigned: 4,
    unassigned: 1,
  },
  planReviewOwnership: {
    assigned: 4,
    unassigned: 1,
    byState: {
      preliminary: 0,
      samuel_review: 4,
      more_information_needed: 1,
    },
  },
};

function buildHarness(options?: {
  roles?: string[];
  providerMode?: "disabled" | "capture" | "live";
  seedNamespace?: boolean;
}) {
  const audits: PrelaunchAccessAuditInput[] = [];
  const prelaunchRepository: PrelaunchRepository = {
    getActiveRoles: vi.fn(async () => (options?.roles ?? []) as any),
    getSeedNamespace: vi.fn(async (namespace) =>
      options?.seedNamespace
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
      providerMode: options?.providerMode ?? "disabled",
    })),
    appendAccessAudit: vi.fn(async (input) => {
      audits.push(input);
    }),
    listRoleAssignments: vi.fn(async () => []),
    grantRole: vi.fn(),
    revokeRole: vi.fn(),
  };
  const prelaunchDependencies: PrelaunchDependencies = {
    verifyUser: vi.fn(async (token) =>
      token === "valid" ? { id: "internal-user" } : null,
    ),
    repository: prelaunchRepository,
    now: () => new Date("2026-07-26T00:00:00.000Z"),
    requestId: () => "assessment-request-id",
  };
  const assessmentRepository: AssessmentPrelaunchRepository = {
    getWorkspace: vi.fn(async () => workspace),
  };
  const app = express();
  registerAssessmentPrelaunchApi(
    app,
    assessmentRepository,
    prelaunchDependencies,
  );
  return {
    app,
    audits,
    assessmentRepository,
    prelaunchRepository,
  };
}

describe("assessment private pre-launch application", () => {
  it("requires a verified canonical pre-launch session", async () => {
    const { app, assessmentRepository, prelaunchRepository } = buildHarness({
      roles: ["approved_internal_reviewer"],
    });

    const response = await request(app).get(
      "/api/internal/research/assessment/workspace",
    );

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("sign_in_required");
    expect(prelaunchRepository.getActiveRoles).not.toHaveBeenCalled();
    expect(assessmentRepository.getWorkspace).not.toHaveBeenCalled();
  });

  it("allows only Website 1's canonical role subset", async () => {
    const { app, assessmentRepository, audits } = buildHarness({
      roles: ["product_admin"],
    });

    const response = await request(app)
      .get("/api/internal/research/assessment/workspace")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("prelaunch_role_required");
    expect(assessmentRepository.getWorkspace).not.toHaveBeenCalled();
    expect(audits).toMatchObject([
      {
        role: null,
        decision: "denied",
        reasonCode: "role_required",
      },
    ]);
  });

  it("returns safe aggregate configuration and ownership using the canonical context", async () => {
    const { app, assessmentRepository } = buildHarness({
      roles: ["approved_internal_reviewer"],
      providerMode: "live",
    });

    const response = await request(app)
      .get("/api/internal/research/assessment/workspace")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(200);
    expect(response.body.access).toMatchObject({
      roles: ["approved_internal_reviewer"],
      dataContext: {
        dataOrigin: "real",
        releaseEligible: true,
      },
      providerMode: "live",
      launchStatus: "internal_review",
    });
    expect(response.body.workspace).toEqual(workspace);
    expect(assessmentRepository.getWorkspace).toHaveBeenCalledWith({
      dataOrigin: "real",
      seedNamespace: null,
      seedVersion: null,
      resetGroup: null,
      releaseEligible: true,
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("@example");
    expect(serialized).not.toContain("answers");
    expect(serialized).not.toContain("member_id");
  });

  it("rejects an otherwise authorized seed context before the domain repository is called", async () => {
    const { app, assessmentRepository } = buildHarness({
      roles: ["internal_team"],
      providerMode: "live",
      seedNamespace: true,
    });

    const response = await request(app)
      .get("/api/internal/research/assessment/workspace")
      .set("Authorization", "Bearer valid")
      .set("X-Xenios-Seed-Namespace", "assessment-review");

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(
      "assessment_prelaunch_seed_isolation_not_ready",
    );
    expect(assessmentRepository.getWorkspace).not.toHaveBeenCalled();
  });

  it("does not treat a client header as authorization", async () => {
    const { app, assessmentRepository } = buildHarness({
      roles: ["super_admin"],
    });

    const response = await request(app)
      .get("/api/internal/research/assessment/workspace")
      .set("X-Xenios-Seed-Namespace", "assessment-review");

    expect(response.status).toBe(401);
    expect(assessmentRepository.getWorkspace).not.toHaveBeenCalled();
  });
});

describe("assessment repository origin boundary", () => {
  const seedContext: PrelaunchDataContext = {
    dataOrigin: "internal_seed",
    seedNamespace: "assessment-review",
    seedVersion: 1,
    resetGroup: "assessment",
    releaseEligible: false,
  };

  it("fails seed data before resolving Supabase or querying real member tables", async () => {
    const repository = buildAssessmentPrelaunchProductionRepository();

    await expect(repository.getWorkspace(seedContext)).rejects.toBeInstanceOf(
      AssessmentPrelaunchSeedIsolationError,
    );
  });

  it("exports an assertion that cannot promote seed context to real context", () => {
    expect(() => requireAssessmentRealDataContext(seedContext)).toThrow(
      "Assessment seed reads remain disabled",
    );
  });
});
