import express from "express";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Umbrella registration test. Wave 2's adversarial review caught a blocker
// where two implemented modules were never registered, so their routes did
// not exist at runtime even though their code and tests were green. This
// suite pins the wiring itself: every member-platform module must be reachable
// through the ONE entry point the integration lane calls.
// ---------------------------------------------------------------------------

vi.mock("./member-auth", () => ({
  requireActiveMember: (_req: any, _res: any, next: any) => next(),
  requireMember: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAdmin: () => {
    throw new Error("not used: this suite inspects registration, not behavior");
  },
  getSupabaseAnon: () => {
    throw new Error("not used");
  },
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { registerMemberPlatformApi } from "./member-platform";
import { registerCapabilityApi } from "./capabilities";
import { registerOverviewApi } from "./overview";
import { registerAgreementsApi } from "./agreements";
import { registerProfileApi } from "./profile";
import { registerAssessmentApi } from "./assessment";
import { registerBlueprintApi } from "./blueprint";
import { registerPlansApi } from "./plans";
import { registerDocumentsApi } from "./documents";
import { registerTrackerApi } from "./tracker";
import { registerMediaApi } from "./media";
import { registerQuestionsApi } from "./questions";
import { registerAdminQueuesApi } from "./admin-queues";
import { registerSlaAdminApi } from "./sla";
import { defaultDeps } from "./member-platform-deps";

function routesOf(register: (app: any, deps?: any) => void): Set<string> {
  const app = express();
  app.use(express.json());
  register(app, defaultDeps());
  const found = new Set<string>();
  for (const layer of (app as any).router?.stack ?? (app as any)._router?.stack ?? []) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (layer.route.methods[method]) found.add(`${method.toUpperCase()} ${layer.route.path}`);
    }
  }
  return found;
}

function registeredRoutes(): Set<string> {
  return routesOf((app) => registerMemberPlatformApi(app));
}

// Every module this lane owns. A module added here but not wired into
// registerMemberPlatformApi fails the coverage test below, which is the
// point: three separate waves shipped a module that was implemented, tested,
// and completely unreachable because the umbrella never called it. A route
// inventory only guards the routes someone remembered to list; this compares
// each module against itself.
const LANE_MODULES: Array<[string, (app: any, deps?: any) => void]> = [
  ["capabilities", (app, deps) => registerCapabilityApi(app, () => deps.clock.now())],
  ["overview", registerOverviewApi],
  ["agreements", registerAgreementsApi],
  ["profile", registerProfileApi],
  ["assessment", registerAssessmentApi],
  ["blueprint", registerBlueprintApi],
  ["plans", registerPlansApi],
  ["documents", registerDocumentsApi],
  ["tracker", registerTrackerApi],
  ["media", registerMediaApi],
  ["questions", registerQuestionsApi],
  ["admin-queues", registerAdminQueuesApi],
  ["sla", registerSlaAdminApi],
];

describe("registerMemberPlatformApi", () => {
  // Every route the frozen contract promises, by wave. A module that exists
  // but is not wired is indistinguishable from a module that does not exist.
  const CONTRACT_ROUTES = [
    // capabilities + overview
    "GET /api/research/capabilities",
    "GET /api/admin/research/capabilities",
    "GET /api/research/member/overview",
    // wave 1
    "GET /api/research/agreements",
    "POST /api/research/agreements",
    "GET /api/research/profile",
    "GET /api/research/profile/sensitive",
    "PUT /api/research/profile",
    "GET /api/research/assessment",
    "POST /api/research/assessment/responses",
    "POST /api/research/assessment/submit",
    // wave 2
    "GET /api/research/blueprint",
    "POST /api/research/blueprint/acknowledge",
    "GET /api/admin/research/blueprints",
    "POST /api/admin/research/blueprints/generate",
    "GET /api/research/plans/xenios30",
    "POST /api/research/plans/early-change",
    "GET /api/research/plans/xenios90",
    // wave 3
    "GET /api/research/documents",
    "POST /api/admin/research/documents",
    // wave 4
    "GET /api/research/tracker",
    "POST /api/research/tracker",
    "GET /api/research/media",
    "POST /api/research/media/intent",
    "PUT /api/research/media/retention-election",
    // wave 5
    "GET /api/research/questions",
    "POST /api/research/questions",
    "GET /api/research/telegram",
    "POST /api/research/telegram/link",
    "DELETE /api/research/telegram/link",
    "POST /api/research/telegram/webhook",
    "POST /api/admin/research/sla/sweep",
  ];

  it("registers every contract route through the one entry point", () => {
    const routes = registeredRoutes();
    const missing = CONTRACT_ROUTES.filter((route) => !routes.has(route));
    expect(missing).toEqual([]);
  });

  // The structural guard: no module can be left unwired, listed or not.
  it.each(LANE_MODULES)("wires every route of the %s module", (_name, register) => {
    const umbrella = registeredRoutes();
    const own = [...routesOf(register)];
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((route) => !umbrella.has(route))).toEqual([]);
  });

  it("registers parameterized member and admin routes", () => {
    const routes = [...registeredRoutes()];
    const hasPattern = (method: string, fragment: string) =>
      routes.some((route) => route.startsWith(`${method} `) && route.includes(fragment));
    expect(hasPattern("POST", "/api/admin/research/blueprints/")).toBe(true);
    expect(hasPattern("POST", "/api/research/plans/xenios30/")).toBe(true);
    expect(hasPattern("POST", "/api/admin/research/plans/")).toBe(true);
    expect(hasPattern("POST", "/api/research/documents/")).toBe(true);
    expect(hasPattern("GET", "/api/research/documents/")).toBe(true);
    expect(hasPattern("POST", "/api/research/media/")).toBe(true);
    expect(hasPattern("DELETE", "/api/research/media/")).toBe(true);
  });

  it("never registers anything on the frozen research index paths", () => {
    // The lane owns /api/research/* additions but must not redefine the
    // merged gateway or catalog endpoints that live in index.ts.
    const routes = registeredRoutes();
    for (const frozen of [
      "GET /api/research/me",
      "POST /api/research/access",
      "GET /api/research/catalog",
      "POST /api/research/orders",
      "GET /api/research/member/catalog",
    ]) {
      expect(routes.has(frozen)).toBe(false);
    }
  });
});
