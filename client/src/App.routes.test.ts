// Static source checks for App.tsx (same idiom as research/routes-parity.test.ts):
// reading the router source directly is cheap, deterministic, and catches
// drift a full render test would not (e.g. a redirect target that is valid
// TypeScript but points at a slug nobody serves).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAREERS_ROLES } from "./lib/careers";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

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
