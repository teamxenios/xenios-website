import { describe, expect, it } from "vitest";

import { refuseInProduction } from "../../../scripts/preview-early-access";
import {
  STEP1_PREVIEW_ENABLE_ENV,
  refuseStep1PreviewInProduction,
} from "../../../scripts/preview-step1-hotfix";

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
    expect(() =>
      refuseStep1PreviewInProduction({
        NODE_ENV: "production",
        [STEP1_PREVIEW_ENABLE_ENV]: "true",
      }),
    ).toThrow(/refusing to start/i);
  });

  it("requires an exact opt-in in every non-production environment", () => {
    for (const NODE_ENV of ["development", "test", "preview", undefined]) {
      expect(() =>
        refuseStep1PreviewInProduction({
          NODE_ENV,
          [STEP1_PREVIEW_ENABLE_ENV]: "true",
        }),
      ).not.toThrow();
      for (const value of [undefined, "", "false", "TRUE", "1"]) {
        expect(() =>
          refuseStep1PreviewInProduction({
            NODE_ENV,
            [STEP1_PREVIEW_ENABLE_ENV]: value,
          }),
        ).toThrow(/explicit local preview opt-in/i);
      }
    }
  });

  it("is never imported by a production server module or build entry", async () => {
    // Scan the full production server tree, not only its root entry: an
    // indirect import would be just as reachable in the bundled server.
    const { readdir, readFile } = await import("node:fs/promises");
    const serverRoot = new URL("../../", import.meta.url);
    const productionSources: URL[] = [];
    const collect = async (directory: URL): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
        if (entry.isDirectory()) {
          await collect(child);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          productionSources.push(child);
        }
      }
    };
    await collect(serverRoot);
    for (const source of productionSources) {
      expect(await readFile(source, "utf8"), source.pathname).not.toContain(
        "preview-step1-hotfix",
      );
    }
    const buildEntry = await readFile(
      new URL("../../../script/build.mjs", import.meta.url),
      "utf8",
    );
    expect(buildEntry).not.toContain("preview-step1-hotfix");
  });
});
