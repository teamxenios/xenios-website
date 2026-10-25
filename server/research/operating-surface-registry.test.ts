import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE,
  OPERATING_DENIED_CAPABILITIES,
  OPERATING_LIVE_PERMISSIONS,
  OPERATING_PERMISSIONS,
  OPERATING_PLANNED_PERMISSIONS,
  OPERATING_PLANNED_SURFACES,
  OPERATING_SURFACE_POLICY,
} from "@shared/research/operating-role";

// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// shared/research/operating-role.ts is a security artifact: it says what the
// operating and growth role may reach and what it may never reach. Its first
// version listed six surfaces that do not exist in this repository, under a
// comment claiming every entry mapped to a real one. That is worse than a stale
// comment. A role whose allow list describes imaginary routes cannot be
// reasoned about, and the first real implementation of one of those names
// inherits a permission nobody reviewed.
//
// A comment cannot hold that line and neither can review. This test does: it
// reads the server sources, builds the set of routes express actually
// registers, and fails if any entry in the decision-bearing policy table does
// not resolve to one. It fails in the other direction too: a surface listed as
// PLANNED that quietly becomes real fails here, so the permission is promoted
// under review rather than by accident.
//
// SCANNER HONESTY. The registry is built by source scan, not by booting the
// app, because the route modules need database and provider dependencies this
// test must not construct. A scan can under-report, so the failure direction
// matters: an unresolvable path form makes a policy entry look MISSING and the
// test FAILS. It never turns a missing route into a present one. The self-check
// block below asserts the scanner still finds routes it is known to find, so a
// scanner that silently stops working cannot pass this file.
// ---------------------------------------------------------------------------

const SERVER_ROOT = resolve(__dirname, "..");

/** Route path tables the scanner can resolve by name, keyed by identifier. */
const KNOWN_PATH_TABLES: Record<string, Record<string, string>> = {
  CARE_ROUTE_CONTRACTS: { ...CARE_ROUTE_CONTRACTS },
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!path.endsWith(".ts")) continue;
    if (path.endsWith(".test.ts")) continue;
    found.push(path);
  }
  return found;
}

/**
 * Resolves the in-file `const NAME = { key: "/path" } as const` tables and the
 * in-file `const NAME = "/path"` route constants, so a module that names its
 * paths once and registers them by reference is still readable.
 */
function localPathTables(source: string): Record<string, Record<string, string>> {
  const tables: Record<string, Record<string, string>> = {};
  const objectRe = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([^}]*)\}\s*as const/gs;
  let match: RegExpExecArray | null;
  while ((match = objectRe.exec(source))) {
    const entries: Record<string, string> = {};
    const memberRe = /([A-Za-z0-9_]+)\s*:\s*"(\/[^"]*)"/g;
    let member: RegExpExecArray | null;
    while ((member = memberRe.exec(match[2]))) entries[member[1]] = member[2];
    if (Object.keys(entries).length > 0) tables[match[1]] = entries;
  }
  return tables;
}

function localPathConstants(source: string): Record<string, string> {
  const constants: Record<string, string> = {};
  const literalRe = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"(\/[^"]*)"\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = literalRe.exec(source))) constants[match[1]] = match[2];
  return constants;
}

/**
 * Resolves one route path expression to a literal path, or null when the form
 * is not one this scanner understands. Null makes a policy entry look missing,
 * which fails the test. It never invents a route.
 */
function resolvePathExpression(
  expression: string,
  tables: Record<string, Record<string, string>>,
  constants: Record<string, string>,
): string | null {
  const text = expression.trim();

  const literal = /^"(\/[^"]*)"$/.exec(text);
  if (literal) return literal[1];

  const member = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)$/.exec(text);
  if (member) return tables[member[1]]?.[member[2]] ?? null;

  const constant = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(text);
  if (constant) return constants[constant[1]] ?? null;

  // `${TABLE.key}/suffix` and `${CONSTANT}/suffix`.
  const template = /^`\$\{([A-Za-z_][A-Za-z0-9_.]*)\}([^`$]*)`$/.exec(text);
  if (template) {
    const base = resolvePathExpression(template[1], tables, constants);
    return base === null ? null : `${base}${template[2]}`;
  }

  // `route(TABLE.key, "/suffix")`, the Care appointment helper.
  const helper = /^route\(\s*([^,]+?)\s*,\s*"([^"]*)"\s*\)$/s.exec(text);
  if (helper) {
    const base = resolvePathExpression(helper[1], tables, constants);
    return base === null ? null : `${base}${helper[2]}`;
  }

  return null;
}

function buildRegistry(): Set<string> {
  const registry = new Set<string>();
  for (const file of sourceFiles(SERVER_ROOT)) {
    const source = readFileSync(file, "utf8");
    const tables = { ...KNOWN_PATH_TABLES, ...localPathTables(source) };
    const constants = localPathConstants(source);
    const registrationRe =
      /\b(?:app|router|api)\.(get|post|patch|put|delete)\(\s*((?:`[^`]*`)|(?:"[^"]*")|(?:route\([^)]*\))|(?:[A-Za-z_][A-Za-z0-9_.]*))\s*,/g;
    let match: RegExpExecArray | null;
    while ((match = registrationRe.exec(source))) {
      const path = resolvePathExpression(match[2], tables, constants);
      if (path === null) continue;
      registry.add(`${match[1].toUpperCase()} ${path}`);
    }
  }
  return registry;
}

const REGISTRY = buildRegistry();

// ---------------------------------------------------------------------------
// Scanner self-check. A scanner that stops finding routes would make every
// entry look missing, which fails loudly, but a scanner that stops finding SOME
// routes could make the planned-surface assertions pass for the wrong reason.
// ---------------------------------------------------------------------------

describe("the route registry scanner still works", () => {
  it("finds a plausible number of registered routes", () => {
    expect(REGISTRY.size).toBeGreaterThan(200);
  });

  it("resolves a plain string literal registration", () => {
    expect(REGISTRY).toContain(
      "POST /api/admin/research/products/:productId/prices/:priceId/approve",
    );
  });

  it("resolves a bare route contract member registration", () => {
    // server/care/intake-routes.ts registers CARE_ROUTE_CONTRACTS.intake.
    expect(REGISTRY).toContain("GET /api/care/intake");
  });

  it("resolves a template literal over a route contract member", () => {
    // server/care/index.ts registers `${CARE_ROUTE_CONTRACTS.audit}/access`.
    expect(REGISTRY).toContain("GET /api/care/audit/access");
  });

  it("resolves a local path table member registration", () => {
    // server/research/partners/portal-routes.ts registers PARTNER_PORTAL_PATHS.
    expect(REGISTRY).toContain("GET /api/research/partner/leads");
  });

  it("does not invent a route that was never registered", () => {
    expect(REGISTRY).not.toContain("GET /api/definitely-not-a-route");
    // The audit contract path is declared in shared/care/contracts.ts but no
    // module registers it bare, only its /access probe. Declaring is not
    // registering, and the scanner must not confuse the two.
    expect(REGISTRY).not.toContain("GET /api/care/audit");
  });
});

// ---------------------------------------------------------------------------
// The deliverable: no entry in the decision-bearing table may be fictional.
// ---------------------------------------------------------------------------

describe("every entry in the operating surface policy is a real registered route", () => {
  for (const entry of OPERATING_SURFACE_POLICY) {
    const kind = entry.decision.kind;
    it(`${kind}s ${entry.method} ${entry.surface}, which is registered`, () => {
      expect(
        REGISTRY.has(`${entry.method} ${entry.surface}`),
        `${entry.method} ${entry.surface} is in OPERATING_SURFACE_POLICY but no route in server/** registers it. ` +
          `Either correct the method and path, or move it to OPERATING_PLANNED_SURFACES, which carries no decision.`,
      ).toBe(true);
    });
  }

  it("reports the whole set at once so a reviewer sees every drift together", () => {
    const missing = OPERATING_SURFACE_POLICY.filter(
      (entry) => !REGISTRY.has(`${entry.method} ${entry.surface}`),
    ).map((entry) => `${entry.method} ${entry.surface}`);
    expect(missing).toEqual([]);
  });
});

describe("every permission the policy grants is backed by a registered route", () => {
  it("allows only live permissions, and every live permission has a surface", () => {
    const granted = new Set(
      OPERATING_SURFACE_POLICY.flatMap((entry) =>
        entry.decision.kind === "allow" ? [entry.decision.permission] : [],
      ),
    );
    expect([...granted].sort()).toEqual([...OPERATING_LIVE_PERMISSIONS].sort());
  });

  it("keeps the live and planned permission sets disjoint and exhaustive", () => {
    const live = new Set<string>(OPERATING_LIVE_PERMISSIONS);
    const planned = new Set<string>(OPERATING_PLANNED_PERMISSIONS);
    for (const permission of live) expect(planned.has(permission)).toBe(false);
    expect([...live, ...planned].sort()).toEqual([...OPERATING_PERMISSIONS].sort());
  });

  it("grants no surface to a planned permission", () => {
    const granted = new Set(
      OPERATING_SURFACE_POLICY.flatMap((entry) =>
        entry.decision.kind === "allow" ? [entry.decision.permission as string] : [],
      ),
    );
    for (const permission of OPERATING_PLANNED_PERMISSIONS) {
      expect(granted.has(permission), `${permission} is planned but reaches a surface`).toBe(
        false,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The other direction: a planned surface that becomes real must be promoted.
// ---------------------------------------------------------------------------

describe("planned surfaces are still unbuilt, and carry no authorization", () => {
  for (const planned of OPERATING_PLANNED_SURFACES) {
    it(`${planned.method} ${planned.surface} does not exist yet`, () => {
      expect(
        REGISTRY.has(`${planned.method} ${planned.surface}`),
        `${planned.method} ${planned.surface} is now registered. Move it into OPERATING_SURFACE_POLICY ` +
          `with an explicit allow or deny decision, and if it is an allow, move its permission from ` +
          `OPERATING_PLANNED_PERMISSIONS into OPERATING_LIVE_PERMISSIONS. Do not leave it planned.`,
      ).toBe(false);
    });
  }

  it("carries no field that could be read as a grant or a refusal", () => {
    for (const planned of OPERATING_PLANNED_SURFACES) {
      expect(Object.keys(planned).sort()).toEqual(["method", "note", "surface"]);
      expect(planned).not.toHaveProperty("decision");
      expect(planned).not.toHaveProperty("permission");
      expect(planned).not.toHaveProperty("capability");
      expect(planned.note.length).toBeGreaterThan(20);
    }
  });

  it("never names a surface that the decision-bearing table also names", () => {
    const decided = new Set(
      OPERATING_SURFACE_POLICY.map((entry) => `${entry.method} ${entry.surface}`),
    );
    for (const planned of OPERATING_PLANNED_SURFACES) {
      expect(decided.has(`${planned.method} ${planned.surface}`)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Refusal coverage, stated honestly rather than assumed.
// ---------------------------------------------------------------------------

describe("refusal coverage is stated for what it is", () => {
  it("lists exactly the capabilities no registered route demonstrates", () => {
    const demonstrated = new Set(
      OPERATING_SURFACE_POLICY.flatMap((entry) =>
        entry.decision.kind === "deny" ? [entry.decision.capability as string] : [],
      ),
    );
    const undemonstrated = OPERATING_DENIED_CAPABILITIES.filter(
      (capability) => !demonstrated.has(capability),
    );
    expect([...undemonstrated].sort()).toEqual(
      [...OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE].sort(),
    );
  });

  it("covers every other refused capability against a route that exists", () => {
    const preCommitted = new Set<string>(
      OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE,
    );
    for (const capability of OPERATING_DENIED_CAPABILITIES) {
      if (preCommitted.has(capability)) continue;
      const covered = OPERATING_SURFACE_POLICY.some(
        (entry) =>
          entry.decision.kind === "deny" &&
          entry.decision.capability === capability &&
          REGISTRY.has(`${entry.method} ${entry.surface}`),
      );
      expect(covered, `no registered route covers ${capability}`).toBe(true);
    }
  });
});
