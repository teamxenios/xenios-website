import { describe, expect, it, vi } from "vitest";
import type { SupplementMediaRecord } from "../official-sources/contracts";
import {
  derivativeFilename,
  generateSupplementDerivatives,
  SUPPLEMENT_DERIVATIVE_SPECS,
} from "./derivatives";

const record = {
  brand: "Pure Encapsulations",
  sku: "HYD51",
  variant: "60 capsules",
  packageCount: "60 capsules",
} as SupplementMediaRecord;

describe("supplement derivatives", () => {
  it("uses deterministic normalized filenames", () => {
    expect(derivativeFilename(record, SUPPLEMENT_DERIVATIVE_SPECS[0])).toBe(
      "pure-encapsulations__hyd51__60-capsules__catalog__v1.webp",
    );
  });

  it("does not transform rights-pending media", async () => {
    const runner = vi.fn(async () => undefined);
    await expect(
      generateSupplementDerivatives({
        record: {
          ...record,
          rights: {
            status: "OFFICIAL_SOURCE_RIGHTS_PENDING",
          },
          matchState: "EXACT_MATCH",
        } as SupplementMediaRecord,
        originalPath: "original.png",
        outputDirectory: "output",
        runner,
      }),
    ).rejects.toThrow(/rights/);
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not transform media whose approved status has no evidence", async () => {
    const runner = vi.fn(async () => undefined);
    await expect(
      generateSupplementDerivatives({
        record: {
          ...record,
          rights: {
            status: "SUPPLIER_PROVIDED_APPROVED",
            evidenceReference: null,
            grantedBy: null,
            permissionDate: null,
            expiresAt: null,
            limitations: null,
          },
          matchState: "EXACT_MATCH",
        } as SupplementMediaRecord,
        originalPath: "original.png",
        outputDirectory: "output",
        runner,
      }),
    ).rejects.toThrow(/rights/);
    expect(runner).not.toHaveBeenCalled();
  });
});
