import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const researchRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(__dirname, "..", "..", "..", "..");
const sectionSource = readFileSync(resolve(researchRoot, "section.tsx"), "utf8");
const serverSource = readFileSync(resolve(repositoryRoot, "server", "index.ts"), "utf8");

describe("B2B protected composition", () => {
  it("mounts the three informational roots without mounting referral capture", () => {
    for (const path of [
      "/research/organizations",
      "/research/partners",
      "/research/affiliates",
    ]) {
      expect(sectionSource.match(new RegExp(`path=${JSON.stringify(path)}`, "gu"))).toHaveLength(1);
    }

    expect(sectionSource).not.toContain("captureReferralFromLocation");
    expect(serverSource).not.toContain('app.get("/api/r/:code"');
    expect(serverSource).not.toContain('app.get("/api/referral/capture"');
    expect(serverSource).not.toContain("referralCaptureExpressHandler");
  });
});
