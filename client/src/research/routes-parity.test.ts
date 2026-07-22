import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_MANIFEST_ROUTES } from "./lib/routes";

// The route manifest is the single source of truth; this parity test fails
// the build the moment a manifest route is missing from the routers.

const here = resolve(__dirname);
const sources =
  readFileSync(resolve(here, "section.tsx"), "utf8") +
  readFileSync(resolve(here, "adminx-section.tsx"), "utf8");

describe("route manifest parity", () => {
  it("registers every manifest route in a router", () => {
    const missing = ALL_MANIFEST_ROUTES.filter((route) => !sources.includes(`"${route}"`));
    expect(missing).toEqual([]);
  });

  it("keeps the emailed status-link path registered alongside the manifest alias", () => {
    // Emailed links use /research/apply/status; the manifest's canonical form
    // is /research/application-status. Both must stay routed.
    expect(sources).toContain('"/research/apply/status"');
    expect(sources).toContain('"/research/application-status"');
  });
});
