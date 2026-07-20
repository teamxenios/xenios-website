import type { Express } from "express";
import { defaultDeps, type MemberPlatformDeps } from "./member-platform-deps";
import { registerCapabilityApi } from "./capabilities";
import { registerOverviewApi } from "./overview";
import { registerAgreementsApi } from "./agreements";
import { registerProfileApi } from "./profile";
import { registerAssessmentApi } from "./assessment";

// ---------------------------------------------------------------------------
// xenios research member platform: the ONE registration entry point for the
// Website 2 lane (G2-G5 + G10).
//
// Cross-lane rule (agreed 2026-07-20): NOBODY edits server/research/index.ts.
// The integration coordinator wires exactly one line:
//
//   registerMemberPlatformApi(app);
//
// Contracts: shared/research/member-platform.ts +
// docs/agent-coordination/contracts/MEMBER_PLATFORM_API.md (frozen).
// Registration order is not load-bearing; every route carries its own guard.
// ---------------------------------------------------------------------------

export function registerMemberPlatformApi(app: Express, deps: MemberPlatformDeps = defaultDeps()) {
  registerCapabilityApi(app, () => deps.clock.now());
  registerOverviewApi(app, deps);
  registerAgreementsApi(app, deps);
  registerProfileApi(app, deps);
  registerAssessmentApi(app, deps);
}
