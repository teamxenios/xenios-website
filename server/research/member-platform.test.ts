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

function registeredRoutes(): Set<string> {
  const app = express();
  app.use(express.json());
  registerMemberPlatformApi(app);
  const found = new Set<string>();
  for (const layer of (app as any).router?.stack ?? (app as any)._router?.stack ?? []) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (layer.route.methods[method]) found.add(`${method.toUpperCase()} ${layer.route.path}`);
    }
  }
  return found;
}

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
  ];

  it("registers every contract route through the one entry point", () => {
    const routes = registeredRoutes();
    const missing = CONTRACT_ROUTES.filter((route) => !routes.has(route));
    expect(missing).toEqual([]);
  });

  it("registers parameterized member and admin routes", () => {
    const routes = [...registeredRoutes()];
    const hasPattern = (method: string, fragment: string) =>
      routes.some((route) => route.startsWith(`${method} `) && route.includes(fragment));
    expect(hasPattern("POST", "/api/admin/research/blueprints/")).toBe(true);
    expect(hasPattern("POST", "/api/research/plans/xenios30/")).toBe(true);
    expect(hasPattern("POST", "/api/admin/research/plans/")).toBe(true);
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
