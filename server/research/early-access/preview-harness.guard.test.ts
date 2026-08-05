import { describe, expect, it } from "vitest";

import { refuseInProduction } from "../../../scripts/preview-early-access";

/**
 * The browser-verification harness serves fixture data through the real
 * storefront. That is exactly what makes it useful for verification and exactly
 * what makes it dangerous if it ever answered a customer, so its refusal to run
 * in production is pinned here rather than left to a docblock.
 *
 * It lives under server/ because that is where vitest collects tests from. A
 * copy next to the script in scripts/ was silently never run, which is the same
 * class of gap this file exists to close.
 */
describe("the preview harness cannot activate in production", () => {
  it("refuses when NODE_ENV is production", () => {
    expect(() => refuseInProduction({ NODE_ENV: "production" })).toThrow(/refusing to start/i);
  });

  it("runs in development, test and preview", () => {
    for (const NODE_ENV of ["development", "test", "preview", undefined]) {
      expect(() => refuseInProduction({ NODE_ENV })).not.toThrow();
    }
  });

  it("is never imported by the production entry point", async () => {
    // Checking NODE_ENV alone would still pass if server/index.ts imported and
    // mounted the harness, so the wiring is checked too.
    const { readFile } = await import("node:fs/promises");
    const entry = await readFile(new URL("../../index.ts", import.meta.url), "utf8");
    expect(entry).not.toContain("preview-early-access");
  });
});
