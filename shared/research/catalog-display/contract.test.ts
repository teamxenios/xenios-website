// The display contract's guards, and the two properties that make it safe to
// import into a browser bundle: it holds no catalog data, and its money guard
// has no zero in its domain.

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  CATALOG_DISPLAY_AUDIENCES,
  CATALOG_DISPLAY_ERROR_CODES,
  CATALOG_DISPLAY_LANES,
  CATALOG_VISIBILITY_BREADTHS,
  isCatalogDisplayLane,
  isCatalogVisibilityBreadth,
  isDisplayableAmount,
} from "./contract";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("catalog display contract", () => {
  it("keeps the vocabularies closed", () => {
    expect(CATALOG_DISPLAY_LANES).toEqual(["peptide", "supplement", "quantum"]);
    expect(CATALOG_VISIBILITY_BREADTHS).toEqual(["standard", "full"]);
    expect(CATALOG_DISPLAY_AUDIENCES).toEqual(["member", "admin"]);
    expect(CATALOG_DISPLAY_ERROR_CODES).toEqual([
      "catalog_display_disabled",
      "catalog_display_auth_required",
      "catalog_display_invalid_request",
      "catalog_display_not_found",
      "catalog_display_unavailable",
    ]);
  });

  it("guards lanes and breadths against anything off the enum", () => {
    expect(isCatalogDisplayLane("peptide")).toBe(true);
    expect(isCatalogDisplayLane("Peptide")).toBe(false);
    expect(isCatalogDisplayLane("peptides")).toBe(false);
    expect(isCatalogDisplayLane("")).toBe(false);
    expect(isCatalogDisplayLane(null)).toBe(false);
    expect(isCatalogVisibilityBreadth("full")).toBe(true);
    expect(isCatalogVisibilityBreadth("everything")).toBe(false);
    expect(isCatalogVisibilityBreadth(undefined)).toBe(false);
  });

  it("has no zero in the amount domain", () => {
    expect(isDisplayableAmount({ amountCents: 180000, currency: "USD" })).toBe(true);
    expect(isDisplayableAmount({ amountCents: 1, currency: "USD" })).toBe(true);
    expect(isDisplayableAmount({ amountCents: 0, currency: "USD" })).toBe(false);
    expect(isDisplayableAmount({ amountCents: -1, currency: "USD" })).toBe(false);
    expect(isDisplayableAmount(null)).toBe(false);
  });

  it("refuses a non integer, unsafe, or off allowlist amount", () => {
    const cases = [
      { amountCents: 12.5, currency: "USD" },
      { amountCents: Number.NaN, currency: "USD" },
      { amountCents: Number.POSITIVE_INFINITY, currency: "USD" },
      { amountCents: Number.MAX_SAFE_INTEGER + 2, currency: "USD" },
      { amountCents: 1000, currency: "EUR" },
    ];
    for (const value of cases) {
      expect(isDisplayableAmount(value as never), JSON.stringify(value)).toBe(false);
    }
  });

  it("imports no catalog data, so a client bundle carries none", () => {
    // The one structural property that lets a client component import this
    // module. A value import of any catalog record here would put the whole
    // catalog into the browser bundle, which the security note in
    // server/research/index.ts forbids.
    const source = readFileSync(path.join(HERE, "contract.ts"), "utf8");
    const valueImports = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .filter((line) => !line.includes("import type"));
    expect(valueImports).toEqual([]);
    for (const forbidden of [
      "peptide-catalog",
      "supplement-catalog",
      "quantum-product",
      "peptide-copy",
      "supplement-copy",
    ]) {
      expect(source.includes(`/${forbidden}"`), forbidden).toBe(false);
    }
  });

  it("keeps house style: no em dash in the contract", () => {
    // Built from its code point so this file does not itself carry the character.
    const emDash = String.fromCharCode(0x2014);
    const source = readFileSync(path.join(HERE, "contract.ts"), "utf8");
    expect(source.includes(emDash)).toBe(false);
  });
});
