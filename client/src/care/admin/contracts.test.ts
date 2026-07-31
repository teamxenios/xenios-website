// The console's claims about the server, checked against the server.
//
// This is the anti-fabrication test. Every contract the admin console says it
// reads must be a route that really exists, and every gap it reports as
// missing must really be missing. If someone adds an endpoint, this test tells
// them to move the area out of the pending list; if someone deletes one, it
// tells them the console is now lying.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  CARE_ADMIN_AREAS,
  CARE_ADMIN_AREA_KEYS,
  CARE_ADMIN_BASE_PATH,
  CARE_CLINICAL_GATE_NAMES,
  pendingCareAdminAreas,
} from "./contracts";

const SERVER_CARE_DIR = resolve(__dirname, "../../../../server/care");

interface Registration {
  method: string;
  path: string;
  permission: string | null;
}

function serverSources(): string {
  return readdirSync(SERVER_CARE_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(resolve(SERVER_CARE_DIR, file), "utf8"))
    .join("\n");
}

/** Turn a route argument expression into the literal path it registers. */
function resolvePathExpression(expression: string): string | null {
  const trimmed = expression.trim();
  const composed = /^route\(\s*([^,]+),\s*["'`]([^"'`]+)["'`]\s*\)$/s.exec(trimmed);
  if (composed) {
    const base = resolvePathExpression(composed[1]);
    return base === null ? null : `${base}${composed[2]}`;
  }
  const withoutQuotes = trimmed.replace(/^[`"']|[`"']$/g, "");
  const substituted = withoutQuotes
    .replaceAll(/\$\{CARE_ROUTE_CONTRACTS\.(\w+)\}/g, (_match, key: string) =>
      String(CARE_ROUTE_CONTRACTS[key as keyof typeof CARE_ROUTE_CONTRACTS] ?? ""),
    )
    .replace(/^CARE_ROUTE_CONTRACTS\.(\w+)$/, (_match, key: string) =>
      String(CARE_ROUTE_CONTRACTS[key as keyof typeof CARE_ROUTE_CONTRACTS] ?? ""),
    );
  return substituted.startsWith("/api/care") ? substituted : null;
}

function registrations(): Registration[] {
  const source = serverSources();
  const pattern =
    /\bapp\s*\.\s*(get|post|put|patch|delete)\s*\(\s*([\s\S]*?),\s*(requireCarePermission\(\s*"([^"]+)"|async|\()/g;
  const found: Registration[] = [];
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const path = resolvePathExpression(match[2]);
    if (path === null) continue;
    found.push({
      method: match[1].toUpperCase(),
      path,
      permission: match[4] ?? null,
    });
  }
  return found;
}

const REGISTERED = registrations();

function registrationFor(method: string, path: string): Registration | undefined {
  return REGISTERED.find(
    (entry) => entry.method === method && entry.path === path,
  );
}

describe("Care admin contract map", () => {
  it("extracted the real Care route table", () => {
    // A sanity floor so a broken extractor cannot make the assertions vacuous.
    expect(REGISTERED.length).toBeGreaterThanOrEqual(20);
    expect(registrationFor("GET", "/api/care/status")).toBeDefined();
    expect(
      registrationFor("GET", "/api/care/appointments/admin/readiness")?.permission,
    ).toBe("care:administer");
  });

  it("reads only endpoints that exist", () => {
    for (const area of CARE_ADMIN_AREAS) {
      for (const contract of area.reads) {
        const registration = registrationFor(contract.method, contract.path);
        expect(
          registration,
          `${area.key} reads ${contract.method} ${contract.path}`,
        ).toBeDefined();
        if (registration?.permission) {
          expect(registration.permission).toBe(contract.permission);
        }
      }
    }
  });

  it("describes only clinical actions that exist, all under care:administer", () => {
    for (const area of CARE_ADMIN_AREAS) {
      for (const action of area.actions) {
        const registration = registrationFor(action.method, action.path);
        expect(
          registration,
          `${area.key} describes ${action.method} ${action.path}`,
        ).toBeDefined();
        expect(registration?.permission).toBe("care:administer");
        expect(action.blockedBecause.length).toBeGreaterThan(20);
      }
    }
  });

  it("reports a gap only where the endpoint really is absent", () => {
    // Declared in CARE_ROUTE_CONTRACTS with no handler registered anywhere.
    for (const path of [CARE_ROUTE_CONTRACTS.labs, CARE_ROUTE_CONTRACTS.adverseEvents]) {
      expect(REGISTERED.some((entry) => entry.path.startsWith(path))).toBe(false);
    }
    // No admin appointment or prescription queue exists to work from.
    expect(registrationFor("GET", "/api/care/appointments")?.permission).toBe(
      "care:appointments_self",
    );
    expect(registrationFor("GET", "/api/care/prescriptions")?.permission).toBe(
      "care:read_self",
    );
    // The pharmacy order list is not readable by a Care admin.
    expect(registrationFor("GET", "/api/care/pharmacy/orders")?.permission).toBe(
      "care:pharmacy_assigned",
    );
  });

  it("gives every pending area at least one named missing contract", () => {
    const pending = pendingCareAdminAreas();
    expect(pending.length).toBeGreaterThan(0);
    for (const area of pending) {
      expect(area.reads).toHaveLength(0);
      expect(area.actions).toHaveLength(0);
      expect(area.missing.length).toBeGreaterThan(0);
      for (const gap of area.missing) expect(gap.length).toBeGreaterThan(20);
    }
  });

  it("covers every area the Care admin console is expected to carry", () => {
    for (const key of [
      "applications",
      "identity",
      "patients",
      "providers",
      "credentials",
      "licensure",
      "service-areas",
      "scheduling",
      "consents",
      "forms",
      "protocols",
      "formulary",
      "labs",
      "pharmacy",
      "orders",
      "adverse-events",
      "privacy",
      "audit",
      "incidents",
      "access",
      "flags",
    ] as const) {
      expect(CARE_ADMIN_AREA_KEYS).toContain(key);
    }
  });

  it("keeps every area on a unique path under the Care admin base", () => {
    const paths = CARE_ADMIN_AREAS.map((area) => area.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith(CARE_ADMIN_BASE_PATH)).toBe(true);
  });

  it("exposes no clinical gate as a readable server value", () => {
    const source = serverSources();
    for (const gate of CARE_CLINICAL_GATE_NAMES) {
      expect(source).not.toContain(gate);
    }
  });
});
