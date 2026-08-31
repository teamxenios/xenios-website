// Static source checks for App.tsx (same idiom as research/routes-parity.test.ts):
// reading the router source directly is cheap, deterministic, and catches
// drift a full render test would not (e.g. a redirect target that is valid
// TypeScript but points at a slug nobody serves).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAREERS_ROLES } from "./lib/careers";
import { menuGroups, primaryNav } from "./lib/nav";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const gatewaySource = readFileSync(
  resolve(__dirname, "research/pages/Gateway.tsx"),
  "utf8",
);

describe("the retired /careers/innovative-product-builder redirect", () => {
  it("targets a slug that exists in the live careers.ts CAREERS_ROLES", () => {
    const match = appSource.match(
      /"\/careers\/innovative-product-builder"><Redirect to="\/careers\/([^"]+)"/,
    );
    expect(match).not.toBeNull();
    const target = match![1];
    const liveSlugs = CAREERS_ROLES.map((role) => role.slug);
    expect(liveSlugs).toContain(target);
  });
});

describe("the Admin dashboard bundle", () => {
  it("is lazy-loaded, not shipped eagerly in the main bundle", () => {
    expect(appSource).toContain('const Admin = lazy(() => import("@/pages/Admin"));');
    expect(appSource).not.toMatch(/^import Admin from "@\/pages\/Admin";/m);
  });

  it("mounts through a Suspense-wrapped route, same pattern as the research/care sections", () => {
    expect(appSource).toContain('<Route path="/admin" component={AdminRoutes} />');
    expect(appSource).toMatch(/function AdminRoutes\(\) \{\s*return \(\s*<Suspense[^]*?<Admin \/>/);
  });
});

describe("the canonical /health Care + Research gateway", () => {
  it("mounts the existing gateway in its own lazy route while preserving /care and /research", () => {
    expect(appSource).toContain(
      'const HealthGateway = lazy(() => import("@/research/pages/Gateway"));',
    );
    expect(appSource).toContain('<Route path="/health" component={HealthRoutes} />');
    expect(appSource).toContain('<Route path="/research" component={ResearchRoutes} />');
    expect(appSource).toContain('<Route path="/care" component={CareRoutes} />');
  });

  it("uses /health as the gateway canonical and brand-home identity", () => {
    expect(gatewaySource).toContain('path="/health"');
    expect(gatewaySource.match(/href="\/health"/gu)).toHaveLength(2);
    expect(gatewaySource).not.toContain('href="/research" className="rg-brand"');
  });

  it("changes the main-site navigation label and target without removing the legacy route", () => {
    expect(primaryNav).toContainEqual({ label: "Health", href: "/health" });
    expect(primaryNav).not.toContainEqual({ label: "Research", href: "/research" });
    expect(menuGroups.flatMap((group) => group.items)).toContainEqual({
      label: "Health",
      href: "/health",
    });
  });
});
