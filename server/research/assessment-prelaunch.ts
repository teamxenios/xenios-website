import type { Express, Request, Response } from "express";
import type {
  PrelaunchAccessStatus,
  PrelaunchDataContext,
  PrelaunchRole,
} from "@shared/research/prelaunch";
import { getSupabaseAdmin } from "../supabase";
import {
  INITIAL_ASSESSMENT_DEFINITION,
  listAssessmentQuestions,
} from "./assessment";
import { healthAssessmentCollectionReady } from "./agreements";
import {
  BLUEPRINT_REVIEW_STATES,
  BLUEPRINTS_TABLE,
} from "./blueprint";
import {
  buildPrelaunchGuard,
  type PrelaunchDependencies,
} from "./prelaunch";

const ASSESSMENT_RESPONSES_TABLE = "research_assessment_responses";

// Website 1 consumes a narrow subset of the canonical roles. These are not a
// second role vocabulary: the type and values come directly from the frozen
// pre-launch contract.
export const ASSESSMENT_PRELAUNCH_ALLOWED_ROLES = [
  "super_admin",
  "internal_team",
  "approved_internal_reviewer",
] as const satisfies readonly PrelaunchRole[];

type AssessmentResponseSummaryRow = {
  mode: string;
  status: string;
};

type BlueprintOwnershipSummaryRow = {
  state: string;
  assigned_reviewer_email: string | null;
};

export type AssessmentPrelaunchWorkspace = {
  assessmentConfiguration: {
    definitionId: string;
    definitionVersion: number;
    targetMinutes: number;
    sectionCount: number;
    questionCount: number;
    consentKey: "XR-MEM-012";
    collectionReady: boolean;
  };
  assessmentResponses: {
    initialInProgress: number;
    initialSubmitted: number;
    monthlyInProgress: number;
    monthlySubmitted: number;
  };
  trainerAssignment: {
    source: "plan_review_assignment";
    reviewItems: number;
    assigned: number;
    unassigned: number;
  };
  planReviewOwnership: {
    assigned: number;
    unassigned: number;
    byState: Record<string, number>;
  };
};

export interface AssessmentPrelaunchRepository {
  getWorkspace(
    dataContext: PrelaunchDataContext,
  ): Promise<AssessmentPrelaunchWorkspace>;
}

export class AssessmentPrelaunchSeedIsolationError extends Error {
  readonly code = "assessment_prelaunch_seed_isolation_not_ready";

  constructor() {
    super(
      "Assessment seed reads remain disabled until the domain isolation and reset unit is approved.",
    );
  }
}

export function requireAssessmentRealDataContext(
  dataContext: PrelaunchDataContext,
): asserts dataContext is Extract<PrelaunchDataContext, { dataOrigin: "real" }> {
  if (dataContext.dataOrigin !== "real") {
    throw new AssessmentPrelaunchSeedIsolationError();
  }
}

function countByState(rows: BlueprintOwnershipSummaryRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const reviewStates = new Set<string>(BLUEPRINT_REVIEW_STATES);
  for (const state of BLUEPRINT_REVIEW_STATES) counts[state] = 0;
  for (const row of rows) {
    if (reviewStates.has(row.state)) {
      counts[row.state] = (counts[row.state] ?? 0) + 1;
    }
  }
  return counts;
}

export function buildAssessmentPrelaunchProductionRepository(): AssessmentPrelaunchRepository {
  return {
    async getWorkspace(dataContext) {
      // The current assessment/blueprint tables predate the canonical
      // data-origin columns. Never let an authorized seed namespace silently
      // fall through to real member rows. This assertion deliberately occurs
      // before the Supabase client is resolved or any domain query is made.
      requireAssessmentRealDataContext(dataContext);

      const admin = getSupabaseAdmin();
      const [assessmentRead, blueprintRead] = await Promise.all([
        admin
          .from(ASSESSMENT_RESPONSES_TABLE)
          .select("mode,status"),
        admin
          .from(BLUEPRINTS_TABLE)
          .select("state,assigned_reviewer_email")
          .in("state", [...BLUEPRINT_REVIEW_STATES]),
      ]);
      if (assessmentRead.error) throw assessmentRead.error;
      if (blueprintRead.error) throw blueprintRead.error;

      const assessmentRows =
        (assessmentRead.data as AssessmentResponseSummaryRow[] | null) ?? [];
      const blueprintRows =
        (blueprintRead.data as BlueprintOwnershipSummaryRow[] | null) ?? [];
      const assigned = blueprintRows.filter(
        (row) =>
          typeof row.assigned_reviewer_email === "string" &&
          row.assigned_reviewer_email.trim().length > 0,
      ).length;
      const unassigned = blueprintRows.length - assigned;

      return {
        assessmentConfiguration: {
          definitionId: INITIAL_ASSESSMENT_DEFINITION.definitionId,
          definitionVersion: INITIAL_ASSESSMENT_DEFINITION.version,
          targetMinutes: INITIAL_ASSESSMENT_DEFINITION.targetMinutes,
          sectionCount: INITIAL_ASSESSMENT_DEFINITION.sections.length,
          questionCount: listAssessmentQuestions(
            INITIAL_ASSESSMENT_DEFINITION,
          ).length,
          consentKey: "XR-MEM-012",
          collectionReady: healthAssessmentCollectionReady(),
        },
        assessmentResponses: {
          initialInProgress: assessmentRows.filter(
            (row) => row.mode === "initial" && row.status === "in_progress",
          ).length,
          initialSubmitted: assessmentRows.filter(
            (row) => row.mode === "initial" && row.status === "submitted",
          ).length,
          monthlyInProgress: assessmentRows.filter(
            (row) =>
              row.mode === "monthly_check_in" && row.status === "in_progress",
          ).length,
          monthlySubmitted: assessmentRows.filter(
            (row) =>
              row.mode === "monthly_check_in" && row.status === "submitted",
          ).length,
        },
        trainerAssignment: {
          // The current production model assigns the human plan reviewer.
          // It does not contain a separate trainer identity, so this response
          // does not invent one or expose the stored reviewer email.
          source: "plan_review_assignment",
          reviewItems: blueprintRows.length,
          assigned,
          unassigned,
        },
        planReviewOwnership: {
          assigned,
          unassigned,
          byState: countByState(blueprintRows),
        },
      };
    },
  };
}

function noStore(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

type AssessmentPrelaunchRequest = Request & {
  prelaunchAccess?: PrelaunchAccessStatus;
};

export function registerAssessmentPrelaunchApi(
  app: Express,
  repository: AssessmentPrelaunchRepository,
  prelaunchDependencies: PrelaunchDependencies,
) {
  const requireAssessmentPrelaunch = buildPrelaunchGuard(
    prelaunchDependencies,
    ASSESSMENT_PRELAUNCH_ALLOWED_ROLES,
  );

  app.get(
    "/api/internal/research/assessment/workspace",
    requireAssessmentPrelaunch,
    async (req, res) => {
      noStore(res);
      const access = (req as AssessmentPrelaunchRequest).prelaunchAccess;
      if (!access) {
        return res
          .status(503)
          .json({ ok: false, code: "prelaunch_access_unavailable" });
      }
      try {
        // The route and repository both enforce this boundary. The duplicated
        // assertion is intentional defense in depth for future non-HTTP use.
        requireAssessmentRealDataContext(access.dataContext);
        const workspace = await repository.getWorkspace(access.dataContext);
        return res.json({ ok: true, access, workspace });
      } catch (error) {
        if (error instanceof AssessmentPrelaunchSeedIsolationError) {
          return res.status(409).json({
            ok: false,
            code: error.code,
          });
        }
        return res.status(503).json({
          ok: false,
          code: "assessment_prelaunch_repository_unavailable",
        });
      }
    },
  );
}
