import { describe, expect, it } from "vitest";
import {
  assertNoSyntheticDataInProduction,
  findSyntheticMarker,
  isProductionLike,
  scanForSyntheticMarkers,
  SyntheticDataInProductionError,
} from "./production-guards";

const DEV_ENV = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
const PROD_ENV = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const FLAGGED_ENV = {
  NODE_ENV: "test",
  RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
} as NodeJS.ProcessEnv;

// A representative synthetic sandbox profile, shaped like the Mitch fixture.
const SANDBOX_PROFILE = {
  source: "synthetic_test_fixture",
  supplierId: "MITCH_TEST_SUPPLIER",
  warehouse: "MITCH_TEST_WAREHOUSE",
  endpoint: "https://example.invalid/mitch-fulfillment",
  lots: [{ lotId: "MITCH_TEST_LOT_001", coa: "TEST_COA_001" }],
};

describe("findSyntheticMarker", () => {
  it("detects every canonical marker, case-insensitively", () => {
    expect(findSyntheticMarker("source: synthetic_test_fixture")).toBe("synthetic_test_fixture");
    expect(findSyntheticMarker("https://example.invalid/x")).toBe("example.invalid");
    expect(findSyntheticMarker("mitch_test_supplier")).toBe("MITCH_TEST_");
    expect(findSyntheticMarker("test_coa_001")).toBe("TEST_COA_");
    expect(findSyntheticMarker("TEST_LOT_9")).toBe("TEST_LOT_");
  });

  it("passes clean real-shaped values", () => {
    expect(findSyntheticMarker("https://api.mitchfulfillment.com/v1")).toBeNull();
    expect(findSyntheticMarker("COA-P003-LOT-0824D")).toBeNull();
  });
});

describe("scanForSyntheticMarkers", () => {
  it("finds nested markers with their exact paths", () => {
    const violations = scanForSyntheticMarkers(SANDBOX_PROFILE, "mitch");
    const paths = violations.map((v) => v.path);
    expect(paths).toContain("mitch.source");
    expect(paths).toContain("mitch.endpoint");
    expect(paths).toContain("mitch.lots[0].lotId");
    expect(paths).toContain("mitch.lots[0].coa");
  });

  it("returns nothing for a clean object", () => {
    expect(scanForSyntheticMarkers({ endpoint: "https://real.example-partner.com", key: "x" })).toEqual([]);
  });
});

describe("isProductionLike", () => {
  it("is true for NODE_ENV=production and for any enabled production flag", () => {
    expect(isProductionLike(PROD_ENV)).toBe(true);
    expect(isProductionLike(FLAGGED_ENV)).toBe(true);
    expect(isProductionLike(DEV_ENV)).toBe(false);
  });
});

describe("assertNoSyntheticDataInProduction", () => {
  it("allows synthetic fixtures freely outside production (demo and sandbox exist for this)", () => {
    expect(() => assertNoSyntheticDataInProduction({ mitch: SANDBOX_PROFILE }, DEV_ENV)).not.toThrow();
  });

  it("refuses synthetic data under NODE_ENV=production, naming every violating path", () => {
    let caught: SyntheticDataInProductionError | null = null;
    try {
      assertNoSyntheticDataInProduction({ mitch: SANDBOX_PROFILE }, PROD_ENV);
    } catch (err) {
      caught = err as SyntheticDataInProductionError;
    }
    expect(caught).toBeInstanceOf(SyntheticDataInProductionError);
    expect(caught!.violations.length).toBeGreaterThanOrEqual(4);
    expect(caught!.message).toContain("mitch.endpoint");
    expect(caught!.message).toContain("MITCH_LIVE_CONFIGURATION_WORKSHEET");
  });

  it("refuses synthetic data when a production capability flag is on, even in a dev NODE_ENV", () => {
    expect(() => assertNoSyntheticDataInProduction({ mitch: SANDBOX_PROFILE }, FLAGGED_ENV)).toThrow(
      SyntheticDataInProductionError,
    );
  });

  it("passes real-shaped configuration in production", () => {
    expect(() =>
      assertNoSyntheticDataInProduction(
        { mitch: { endpoint: "https://api.partner.com/v1", warehouse: "Austin-1" } },
        PROD_ENV,
      ),
    ).not.toThrow();
  });

  it("never echoes a full value in the error, only a short excerpt", () => {
    const long = "prefix-".repeat(20) + "MITCH_TEST_SUPPLIER" + "-suffix".repeat(20);
    try {
      assertNoSyntheticDataInProduction({ cfg: { v: long } }, PROD_ENV);
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as SyntheticDataInProductionError;
      expect(e.violations[0]!.excerpt.length).toBeLessThan(60);
    }
  });
});
