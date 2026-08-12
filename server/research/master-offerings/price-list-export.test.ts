import { describe, expect, it } from "vitest";
import {
  MASTER_OFFERING_PRICE_LIST_COLUMNS,
  MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
  formatPriceCents,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";
import {
  MASTER_OFFERING_PRICE_LIST_FORBIDDEN_KEYS,
  assertNoPrivateFields,
  buildMasterOfferingPriceList,
  masterOfferingPriceListFilename,
  toMasterOfferingPriceListCsv,
} from "./price-list-export";
import { offering, variant } from "./test-fixtures";

const GENERATED_AT = "2026-08-12T15:04:05.000Z";

function priced(amountCents: number): MasterOfferingPriceView {
  return {
    state: "priced",
    amountCents,
    currency: "USD",
    display: formatPriceCents(amountCents, "USD") ?? "",
    priceId: "price_1",
    priceVersion: 1,
    effectiveAt: "2026-08-01T00:00:00.000Z",
    expiresAt: null,
  };
}

function build(
  offerings = [offering()],
  prices = new Map<string, MasterOfferingPriceView>(),
) {
  return buildMasterOfferingPriceList({
    offerings,
    prices,
    audience: "member",
    generatedAt: GENERATED_AT,
  });
}

describe("price list export", () => {
  it("emits one row per member-safe variant, with the strength", () => {
    const product = offering({
      variants: [
        variant({ id: "mov_a", label: "5 mg vial" }),
        variant({ id: "mov_b", label: "10 mg vial" }),
      ],
    });
    const document = build([product], new Map([["mov_a", priced(9900)]]));
    expect(document.rowCount).toBe(2);
    expect(document.pricedRowCount).toBe(1);
    expect(document.rows.map((row) => row.variant)).toEqual([
      "5 mg vial",
      "10 mg vial",
    ]);
  });

  it("says price on request rather than zero when nothing is approved", () => {
    const document = build();
    expect(document.rows[0].price).toBe(MASTER_OFFERING_PRICE_ON_REQUEST_LABEL);
    expect(document.rows[0].priceAmountCents).toBe("");
    expect(document.rows[0].priceCurrency).toBe("");
    expect(document.rows[0].priceState).toBe("on_request");
  });

  it("never exports an admin-only offering or an admin-only variant", () => {
    expect(build([offering({ visibility: "admin_only" })]).rowCount).toBe(0);
    const mixed = offering({
      variants: [
        variant({ id: "mov_a" }),
        variant({ id: "mov_hold", visibility: "admin_only" }),
      ],
    });
    const rows = build([mixed]).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].variantId).toBe("mov_a");
  });

  it("carries no supplier, cost, margin, planning price, or source field", () => {
    const document = build([offering()], new Map());
    const keys = new Set(document.rows.flatMap((row) => Object.keys(row)));
    for (const forbidden of MASTER_OFFERING_PRICE_LIST_FORBIDDEN_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }
    const serialized = JSON.stringify(document).toLowerCase();
    for (const term of [
      "supplier",
      "wholesale",
      "margin",
      "markup",
      "canonicalkey",
      "sheetrow",
      "sourcesku",
      "private source note",
    ]) {
      expect(serialized).not.toContain(term);
    }
  });

  it("refuses to render a document that grew a private field", () => {
    const document = build();
    const poisoned = {
      ...document,
      rows: [{ ...document.rows[0], supplier: "Private supplier" }],
    } as never;
    expect(() => assertNoPrivateFields(poisoned)).toThrow(/private field/);
  });

  it("states a manual path to buy and never claims direct checkout", () => {
    const document = build();
    expect(document.rows[0].purchasePath).toBe("Request access");
    expect(JSON.stringify(document)).not.toContain("Add to Cart");
  });

  it("offers the manual Early Access purchase path when that is switched on", () => {
    const document = buildMasterOfferingPriceList({
      offerings: [offering()],
      prices: new Map(),
      audience: "member",
      generatedAt: GENERATED_AT,
      capabilities: { manualEarlyAccessPurchase: true },
    });
    expect(document.rows[0].purchasePath).toBe(
      "Request an Early Access purchase",
    );
  });

  it("carries the authority notice inside the artifact", () => {
    expect(build().notice).toContain("Product Control remains the purchase authority");
  });
});

describe("price list csv", () => {
  it("renders the declared columns in order with CRLF terminators", () => {
    const csv = toMasterOfferingPriceListCsv(build());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      MASTER_OFFERING_PRICE_LIST_COLUMNS.map((column) => column.header).join(
        ",",
      ),
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
  });

  it("quotes and escapes commas, quotes, and newlines", () => {
    const product = offering({
      displayName: 'BPC-157, "research", grade',
      variants: [variant({ label: "10 mg\nvial" })],
    });
    const csv = toMasterOfferingPriceListCsv(build([product]));
    expect(csv).toContain('"BPC-157, ""research"", grade"');
    expect(csv).toContain('"10 mg\nvial"');
  });

  it("neutralizes a spreadsheet formula in catalog text", () => {
    const product = offering({
      displayName: "=cmd|' /c calc'!A1",
      variants: [variant({ label: "+1" })],
    });
    const csv = toMasterOfferingPriceListCsv(build([product]));
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'+1");
  });

  it("names the download by date and never by account identity", () => {
    expect(masterOfferingPriceListFilename(GENERATED_AT, "csv")).toBe(
      "xenios-research-price-list-2026-08-12.csv",
    );
    expect(masterOfferingPriceListFilename("not a date", "json")).toBe(
      "xenios-research-price-list-export.json",
    );
  });
});
