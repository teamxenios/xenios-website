import type {
  AssessmentDefinition,
  MemberOverview,
  MemberProfileView,
  PlanDocument,
  Xenios30Plan,
} from "@shared/research/member-platform";

// ---------------------------------------------------------------------------
// xenios research member platform: deterministic fixtures for tests and UI
// development. NEVER available in production; every accessor asserts first.
// Fixtures contain obviously synthetic data only.
// ---------------------------------------------------------------------------

export function assertFixturesAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Research fixtures are disabled in production");
  }
}

export function fixtureOverview(): MemberOverview {
  assertFixturesAllowed();
  return {
    memberId: "00000000-0000-4000-8000-00000000f1x1",
    preferredName: "Test Member",
    memberStatus: "active",
    billingState: "active",
    applicationStatus: "active",
    assessment: { required: true, status: "in_progress", dueAt: "2026-01-04T00:00:00.000Z", overdue: false, remindersSent: 1 },
    blueprint: { state: "assessment_due", updatedAt: null },
    currentXenios30: null,
    currentXenios90: null,
    unacknowledgedDocuments: 1,
    openQuestions: 0,
    trackerUnlocked: false,
    nextAction: { key: "complete_assessment", label: "Complete your assessment", dueAt: "2026-01-04T00:00:00.000Z" },
  };
}

export function fixtureProfile(): MemberProfileView {
  assertFixturesAllowed();
  return {
    memberId: "00000000-0000-4000-8000-00000000f1x1",
    sections: [
      {
        key: "goals",
        schemaVersion: 1,
        data: { primaryGoal: "synthetic-goal", secondaryGoals: ["synthetic-a"] },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    completeness: { completedSections: 1, totalSections: 17 },
  };
}

export function fixtureAssessmentDefinition(): AssessmentDefinition {
  assertFixturesAllowed();
  return {
    definitionId: "assessment-fixture",
    version: 1,
    mode: "initial",
    targetMinutes: 10,
    sections: [
      {
        id: "goals",
        title: "Goals",
        order: 1,
        questions: [
          { id: "primary_goal", sectionId: "goals", kind: "single_choice", prompt: "Primary goal?", required: true, options: [{ value: "recovery", label: "Recover faster" }] },
        ],
      },
    ],
  };
}

export function fixtureDocument(): PlanDocument {
  assertFixturesAllowed();
  return {
    documentId: "00000000-0000-4000-8000-00000000d0c1",
    type: "fitness_plan_pdf",
    title: "Synthetic Fitness Plan",
    version: 1,
    templateVersion: "fixture-1",
    checksumSha256: "0".repeat(64),
    status: "current",
    supersedesDocumentId: null,
    reviewedBy: "Samuel Boadu",
    publishedAt: "2026-01-01T00:00:00.000Z",
    acknowledgedAt: null,
  };
}

export function fixtureXenios30(): Xenios30Plan {
  assertFixturesAllowed();
  return {
    planId: "00000000-0000-4000-8000-00000000p3a1",
    monthLabel: "2026-01",
    state: "published",
    version: 1,
    fitnessDocumentId: null,
    nutritionDocumentId: null,
    blueprintActions: ["synthetic action"],
    supplementFoundation: [],
    productGuidance: [],
    adherenceTargets: [{ key: "training_days", label: "Training days", target: "3 per week" }],
    trackerMetricKeys: ["plan_adherence"],
    checkInDueAt: null,
    reviewedBy: "Samuel Boadu",
    publishedAt: "2026-01-01T00:00:00.000Z",
    memberAcknowledgedAt: null,
  };
}
