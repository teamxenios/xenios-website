import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  fileURLToPath(new URL("../../../client/src/research/adapters/partner.ts", import.meta.url)),
  "utf8",
);
const registered = [
  readFileSync(fileURLToPath(new URL("../commerce/routes.ts", import.meta.url)), "utf8"),
  readFileSync(fileURLToPath(new URL("./routes.ts", import.meta.url)), "utf8"),
].join("\n");

const METHODS: Record<string, "get" | "post"> = {
  apply: "post",
  dashboard: "get",
  links: "get",
  conversions: "get",
  leads: "get",
  commissions: "get",
  payouts: "get",
  resources: "get",
  training: "get",
  campaigns: "get",
  campaignRequest: "post",
  events: "get",
  eventRequest: "post",
  organizations: "get",
  organizationRequest: "post",
  compliance: "get",
  complianceSubmissions: "post",
  onboarding: "get",
  securitySessions: "get",
};

describe("partner adapter/server route parity", () => {
  it("registers every enabled partner adapter endpoint with the expected method", () => {
    const entries = Array.from(
      adapter.matchAll(/^\s*(\w+):\s*"([^"]+)"(?:,)?$/gm),
      (match) => ({ key: match[1], path: match[2] }),
    ).filter((entry) => entry.path.startsWith("/api/research/partner/"));

    expect(entries).toHaveLength(19);
    for (const entry of entries) {
      const method = METHODS[entry.key];
      expect(method, `method inventory for ${entry.key}`).toBeDefined();
      const escapedPath = entry.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(
        new RegExp(`app\\.${method}\\(\\s*"${escapedPath}"`).test(registered),
        `${method.toUpperCase()} ${entry.path} must be registered`,
      ).toBe(true);
    }
  });

  it("keeps the 16 Website 4 partner routes literal for generated inventories", () => {
    const website4Paths = Array.from(
      registered.matchAll(/app\.(?:get|post)\("([^"]+)"(?:,|\))/g),
      (match) => match[1],
    ).filter((path) => path.startsWith("/api/research/partner/"));
    expect(new Set(website4Paths).size).toBeGreaterThanOrEqual(16);
  });
});
