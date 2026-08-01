import { describe, expect, it } from "vitest";

import {
  isPurchasableReadinessState,
  type V3ApprovedCustomerPrice,
} from "@shared/research/v3-import";
import { recordedVariantStrengthDisputes } from "../products-diagnostics/variant-strength-dispute";
import { classifyV3AccessIntent, importV3Master } from "./import";
import {
  V3_SHEET_IMAGE_MANIFEST,
  V3_SHEET_OFFER_INDEX,
  V3_SHEET_PEPTIDE_MASTER,
  V3_SHEET_PRICE_BOOK,
  readV3SheetRows,
  V3WorkbookShapeError,
  type V3Cell,
  type V3RawWorkbook,
} from "./workbook";

// ---------------------------------------------------------------------------
// Fixtures. Same shape as the delivered workbook: title, subtitle, header, data.
// ---------------------------------------------------------------------------

const OFFER_HEADER = [
  "Category",
  "ID / SKU",
  "Product / Service",
  "Variant / Format",
  "Partner / Internal Price",
  "Suggested Client Price",
  "Access / Status",
  "Brand / Rail",
  "Explanation / Pricing Basis",
  "Boundary / Notes",
  "Source",
];

const PRICE_HEADER = [
  "Category",
  "Subcategory / Brand",
  "ID / SKU",
  "Product / Service",
  "Variant / Format",
  "Primary Supplier / Delivery Owner",
  "Wholesale / Delivery Cost",
  "Wholesale Status",
  "Recommended Sell Price",
  "Access / Offer State",
  "Rajeev Quote Needed",
  "Explanation / Commercial Basis",
  "Activation Requirement",
  "Source / Notes",
  "Gross Profit",
  "Gross Margin %",
];

const IMAGE_HEADER = [
  "Image ID",
  "Category",
  "SKU",
  "Product / Service",
  "Variant",
  "Required Assets",
  "Source / Rights",
  "Identity Rule",
  "Access State",
  "Current Image State",
  "Priority",
  "File Path",
  "Alt Text",
  "Approver",
  "Status",
];

const PEPTIDE_HEADER = [
  "Product Code",
  "Tier",
  "Website Category",
  "Product",
  "Variant SKU",
  "Type",
  "Strength",
  "Format",
  "Raw Box Cost",
  "Raw Unit Cost",
  "Existing Partner Price",
  "Existing Planning Retail",
  "Recommended Xenios Price",
  "Public Research Website Price",
  "Availability",
  "Price / Source Status",
  "Explanation",
  "Themes",
  "Boundary",
  "Launch / Verification",
];

function sheet(name: string, header: readonly string[], data: V3Cell[][]) {
  return {
    name,
    rows: [["title"], ["subtitle"], Array.from(header), ...data] as V3Cell[][],
  };
}

interface OfferSpec {
  category?: string;
  id?: V3Cell;
  name?: V3Cell;
  variant?: V3Cell;
  access?: V3Cell;
  rail?: V3Cell;
}

interface PriceSpec {
  id?: V3Cell;
  variant?: V3Cell;
  supplier?: V3Cell;
  wholesale?: V3Cell;
  wholesaleStatus?: V3Cell;
  sell?: V3Cell;
  access?: V3Cell;
}

interface ImageSpec {
  sku?: V3Cell;
  variant?: V3Cell;
  filePath?: V3Cell;
  status?: V3Cell;
}

/**
 * `??` would collapse an explicitly null cell into the default, and an
 * explicitly null cell is exactly what several of these tests are about.
 */
function pick<T>(spec: object, key: string, fallback: T): T | V3Cell {
  return key in spec ? (spec as Record<string, V3Cell>)[key] : fallback;
}

function offerRow(spec: OfferSpec): V3Cell[] {
  return [
    spec.category ?? "Peptides & Research",
    pick(spec, "id", "PEP-007"),
    pick(spec, "name", "Tesamorelin Research Material"),
    pick(spec, "variant", "10 mg"),
    null,
    null,
    pick(spec, "access", "Approval required"),
    pick(spec, "rail", "Growth Hormone & Secretagogues"),
    null,
    null,
    null,
  ];
}

function priceRow(spec: PriceSpec): V3Cell[] {
  return [
    "Peptides & Research",
    "Growth Hormone & Secretagogues",
    pick(spec, "id", "PEP-007"),
    "Tesamorelin Research Material",
    pick(spec, "variant", "10 mg"),
    pick(spec, "supplier", "Mitch / existing core supplier"),
    pick(spec, "wholesale", null),
    pick(spec, "wholesaleStatus", "Pending"),
    pick(spec, "sell", 290),
    pick(spec, "access", null),
    "Yes",
    "planning basis",
    "activation requirement",
    "source note",
    null,
    null,
  ];
}

function imageRow(spec: ImageSpec): V3Cell[] {
  return [
    "IMG-00001",
    "Peptides & Research",
    pick(spec, "sku", "PEP-007"),
    "Tesamorelin Research Material",
    pick(spec, "variant", "10 mg"),
    "Transparent vial PNG",
    "Xenios rendered vial",
    "Exact product and variant required",
    "Approval required",
    "Blocked if identity/strength/label unresolved",
    "P0",
    pick(spec, "filePath", null),
    "alt text",
    null,
    pick(spec, "status", "Needed"),
  ];
}

function peptideRow(code: string, strength: string, sku: V3Cell): V3Cell[] {
  return [
    code,
    "Core",
    "Growth Hormone & Secretagogues",
    "Tesamorelin Research Material",
    sku,
    "Research peptide",
    strength,
    "Vial",
    null,
    null,
    null,
    null,
    null,
    null,
    "Approval required",
    "quote required",
    "explanation",
    "themes",
    "boundary",
    "launch",
  ];
}

function workbook(input: {
  offers: V3Cell[][];
  prices: V3Cell[][];
  images?: V3Cell[][];
  peptides?: V3Cell[][];
}): V3RawWorkbook {
  return {
    offerIndex: sheet(V3_SHEET_OFFER_INDEX, OFFER_HEADER, input.offers),
    priceBook: sheet(V3_SHEET_PRICE_BOOK, PRICE_HEADER, input.prices),
    imageManifest: sheet(V3_SHEET_IMAGE_MANIFEST, IMAGE_HEADER, input.images ?? []),
    peptideMaster: sheet(
      V3_SHEET_PEPTIDE_MASTER,
      PEPTIDE_HEADER,
      input.peptides ?? [],
    ),
  };
}

const APPROVED: V3ApprovedCustomerPrice = {
  amountCents: 29000,
  currency: "USD",
  approvedBy: "Samuel Boadu",
  approvedAt: "2026-08-01T00:00:00Z",
  effectiveDate: "2026-08-01",
};

/** Everything cleared except the thing under test. */
function clearedWorkbook(offer: OfferSpec = {}, price: PriceSpec = {}) {
  return workbook({
    offers: [
      offerRow({ category: "Supplements", id: "SUP-1", variant: "60 capsules", access: "Planning", ...offer }),
    ],
    prices: [
      priceRow({
        id: "SUP-1",
        variant: "60 capsules",
        wholesale: 10,
        wholesaleStatus: "Known from uploaded wholesale workbook",
        sell: 40,
        ...price,
      }),
    ],
    images: [
      imageRow({
        sku: "SUP-1",
        variant: "60 capsules",
        filePath: "assets/sup-1.webp",
        status: "Approved",
      }),
    ],
  });
}

const ATTACHED_DOCUMENTATION = () =>
  ({ coaState: "attached", lotState: "attached" }) as const;

// ---------------------------------------------------------------------------

describe("reading the workbook", () => {
  it("takes the header from row index 2 and data from row 3", () => {
    const rows = readV3SheetRows(sheet(V3_SHEET_OFFER_INDEX, OFFER_HEADER, [offerRow({})]));
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(4);
    expect(rows[0].cells.get("ID / SKU")).toBe("PEP-007");
  });

  it("refuses a sheet with a repeated header rather than shadowing a column", () => {
    expect(() =>
      readV3SheetRows(
        sheet(V3_SHEET_OFFER_INDEX, ["Category", "Category"], [["a", "b"]]),
      ),
    ).toThrow(V3WorkbookShapeError);
  });

  it("pads a short row instead of dropping it", () => {
    const rows = readV3SheetRows(
      sheet(V3_SHEET_OFFER_INDEX, OFFER_HEADER, [["Supplements", "SUP-1"]]),
    );
    expect(rows[0].cells.get("Product / Service")).toBeNull();
  });
});

describe("identity", () => {
  it("rejects a placeholder offer id rather than importing a row without identity", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ id: "-" }), offerRow({ id: "  " })],
        prices: [priceRow({})],
      }),
    );
    expect(result.offers).toHaveLength(0);
    expect(result.rejections.map((r) => r.reason)).toEqual([
      "missing_offer_id",
      "missing_offer_id",
    ]);
  });

  it("rejects an unknown category", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ category: "Nootropics" })],
        prices: [priceRow({})],
      }),
    );
    expect(result.rejections[0].reason).toBe("unknown_category");
  });

  it("rejects an offer with no price book row", () => {
    const result = importV3Master(
      workbook({ offers: [offerRow({})], prices: [] }),
    );
    expect(result.rejections[0].reason).toBe("no_price_book_row");
  });

  it("rejects a duplicate offer id and variant", () => {
    const result = importV3Master(
      workbook({ offers: [offerRow({}), offerRow({})], prices: [priceRow({})] }),
    );
    expect(result.offers).toHaveLength(1);
    expect(result.rejections[0].reason).toBe("duplicate_identity");
  });

  it("refuses to choose between two price book presentations", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ variant: null })],
        prices: [priceRow({ variant: "10 mg" }), priceRow({ variant: "20 mg" })],
      }),
    );
    expect(result.rejections[0].reason).toBe("ambiguous_variant_identity");
  });

  it("refuses when the stated variant matches none of several price rows", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ variant: "30 mg" })],
        prices: [priceRow({ variant: "10 mg" }), priceRow({ variant: "20 mg" })],
      }),
    );
    expect(result.rejections[0].reason).toBe("variant_identity_conflict");
  });

  it("takes the price book presentation when the offer index states none", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ variant: null })],
        prices: [priceRow({ variant: "10 mg" })],
      }),
    );
    expect(result.offers[0].record.variantLabel).toBe("10 mg");
    expect(result.offers[0].record.variantLabelOrigin).toBe("price_book");
    expect(result.offers[0].record.variantIdentity).toBe("exact");
  });

  it("records an unstated presentation instead of inventing one", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ variant: null })],
        prices: [priceRow({ variant: null })],
      }),
    );
    const offer = result.offers[0];
    expect(offer.record.variantLabel).toBeNull();
    expect(offer.record.variantIdentity).toBe("unstated");
    expect(offer.readiness.blockingReasons).toContain("variant_identity_unstated");
    expect(isPurchasableReadinessState(offer.readiness.state)).toBe(false);
  });

  it("records a contested label instead of picking one of the two wordings", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ variant: "Membership" })],
        prices: [priceRow({ variant: "Private catalog, member pricing" })],
      }),
    );
    const offer = result.offers[0];
    expect(offer.record.variantLabel).toBe("Membership");
    expect(offer.record.variantIdentity).toBe("contested");
    expect(offer.readiness.blockingReasons).toContain("variant_label_contested");
    expect(isPurchasableReadinessState(offer.readiness.state)).toBe(false);
  });

  it("resolves an exact variant SKU from the peptide master", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({})],
        peptides: [peptideRow("PEP-007", "10 mg", "R360-TESAMORELIN-10MG-VIAL")],
      }),
    );
    expect(result.offers[0].record.variantSku).toBe("R360-TESAMORELIN-10MG-VIAL");
  });

  it("leaves the SKU absent when the peptide master states none", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ id: "RAW-001" })],
        prices: [priceRow({ id: "RAW-001" })],
        peptides: [peptideRow("RAW-001", "10 mg", null)],
      }),
    );
    expect(result.offers[0].record.variantSku).toBeNull();
  });

  it("leaves the SKU absent when the peptide master lists the same unit twice", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({})],
        peptides: [
          peptideRow("PEP-007", "10 mg", "R360-TESAMORELIN-10MG-VIAL"),
          peptideRow("PEP-007", "10 mg", "R360-TESAMORELIN-10MG-VIAL-ALT"),
        ],
      }),
    );
    expect(result.offers[0].record.variantSku).toBeNull();
  });
});

describe("money", () => {
  it("keeps a pending wholesale cost null rather than estimating it", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({ wholesale: null, wholesaleStatus: "Pending brand wholesale" })],
      }),
    );
    const cost = result.offers[0].record.cost;
    expect(cost.state).toBe("pending");
    expect(cost.wholesaleAmountCents).toBeNull();
  });

  it("treats a known status with no amount as pending, because a status is not a number", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({ wholesale: null, wholesaleStatus: "Known - confirm current quote" })],
      }),
    );
    expect(result.offers[0].record.cost.state).toBe("pending");
  });

  it("converts an exact amount to integer cents", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [
          priceRow({ wholesale: 53.8, wholesaleStatus: "Known - Raw box cost / 10", sell: 219 }),
        ],
      }),
    );
    expect(result.offers[0].record.cost.wholesaleAmountCents).toBe(5380);
    expect(result.offers[0].record.planningPrice.proposedAmountCents).toBe(21900);
  });

  it("rejects an amount finer than a cent rather than rounding it into shape", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({ wholesale: 10.005, wholesaleStatus: "Known" })],
      }),
    );
    expect(result.rejections[0].reason).toBe("unparsable_amount");
  });

  it("rejects a text amount rather than coercing it", () => {
    const result = importV3Master(
      workbook({ offers: [offerRow({})], prices: [priceRow({ sell: "TBD" })] }),
    );
    expect(result.rejections[0].reason).toBe("unparsable_amount");
  });

  it("reads a zero planning price as an absent proposal, never as a free offer", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ category: "Care & Telemedicine", id: "CARE-001", access: "Care only" })],
        prices: [priceRow({ id: "CARE-001", sell: 0 })],
      }),
    );
    expect(result.offers[0].record.planningPrice.proposedAmountCents).toBeNull();
  });
});

describe("access wording", () => {
  it("classifies the workbook's vocabulary and holds anything new", () => {
    expect(classifyV3AccessIntent("Request access")).toBe("access_request_required");
    expect(classifyV3AccessIntent("Unavailable")).toBe("unavailable");
    expect(classifyV3AccessIntent("Held")).toBe("held");
    expect(classifyV3AccessIntent("Care only")).toBe("care_only");
    expect(classifyV3AccessIntent("Script ready")).toBe("clinical_provider_pathway");
    expect(classifyV3AccessIntent("Research review")).toBe("under_review");
    expect(classifyV3AccessIntent("Approval required")).toBe("approval_required");
    expect(classifyV3AccessIntent("Ship it")).toBe("unrecognized");
    expect(classifyV3AccessIntent(null)).toBe("unrecognized");
  });

  it("falls back to the price book access value and reports what it cannot read", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ access: null })],
        prices: [priceRow({ access: "Brand new wording" })],
      }),
    );
    expect(result.offers[0].record.accessIntent).toBe("unrecognized");
    expect(result.offers[0].readiness.state).toBe("held");
    expect(result.unrecognizedAccessValues).toEqual(["Brand new wording"]);
  });
});

describe("images", () => {
  it("treats a manifest row that only says an image is needed as pending", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({})],
        images: [imageRow({ status: "Needed", filePath: null })],
      }),
    );
    expect(result.offers[0].record.imageState).toBe("pending");
  });

  it("requires both a file path and an approved status", () => {
    const withPathOnly = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({})],
        images: [imageRow({ filePath: "assets/a.webp", status: "Needed" })],
      }),
    );
    expect(withPathOnly.offers[0].record.imageState).toBe("pending");

    const approved = importV3Master(
      workbook({
        offers: [offerRow({})],
        prices: [priceRow({})],
        images: [imageRow({ filePath: "assets/a.webp", status: "Approved" })],
      }),
    );
    expect(approved.offers[0].record.imageState).toBe("approved");
  });

  it("treats an offer with no manifest row as pending", () => {
    const result = importV3Master(
      workbook({ offers: [offerRow({})], prices: [priceRow({})], images: [] }),
    );
    expect(result.offers[0].record.imageState).toBe("pending");
  });
});

describe("import can never approve or activate", () => {
  it("records no approved price and no active state for a fully cleared row", () => {
    // Everything else is in place: cost sourced, COA and lot attached, image
    // approved, access planning. The only missing piece is the approval, and
    // import supplies none, so the best it can reach is pending_price.
    const result = importV3Master(clearedWorkbook(), {
      documentation: ATTACHED_DOCUMENTATION,
    });
    const offer = result.offers[0];
    expect(offer.record.cost.state).toBe("known");
    expect(offer.record.imageState).toBe("approved");
    expect(offer.readiness.state).toBe("pending_price");
    expect(offer.readiness.blockingReasons).toEqual(["customer_price_not_approved"]);
    expect(isPurchasableReadinessState(offer.readiness.state)).toBe(false);
  });

  it("cannot reach a purchasable state for any row of the workbook shape", () => {
    // Drive every access wording through the importer with everything else
    // cleared. Not one row may come out purchasable, because approval is not an
    // input this call has.
    for (const access of [
      "Planning",
      "Approval required",
      "Request access",
      "Care only",
      "Script ready",
      "Research review",
      "Held",
      "Unavailable",
      "Anything unrecognized",
      null,
    ]) {
      const result = importV3Master(
        clearedWorkbook({ access }, { access: null }),
        { documentation: ATTACHED_DOCUMENTATION },
      );
      for (const offer of result.offers) {
        expect(isPurchasableReadinessState(offer.readiness.state)).toBe(false);
        expect(offer.readiness.blockingReasons).toContain(
          "customer_price_not_approved",
        );
      }
    }
  });

  it("never carries an effective date, because a source row is not an approval", () => {
    const result = importV3Master(clearedWorkbook(), {
      documentation: ATTACHED_DOCUMENTATION,
    });
    expect(result.offers[0].record.effectiveDate).toBeNull();
  });

  it("becomes active only when a separate, explicit approval is supplied", () => {
    const result = importV3Master(clearedWorkbook(), {
      documentation: ATTACHED_DOCUMENTATION,
      approvedPrices: () => APPROVED,
    });
    expect(result.offers[0].readiness.state).toBe("active_public");
    expect(isPurchasableReadinessState(result.offers[0].readiness.state)).toBe(true);
  });

  it("holds an archived offer whatever else is in place", () => {
    const result = importV3Master(clearedWorkbook(), {
      documentation: ATTACHED_DOCUMENTATION,
      approvedPrices: () => APPROVED,
      archivedOfferIds: new Set(["SUP-1"]),
    });
    expect(result.offers[0].readiness.state).toBe("archived");
  });

  it("leaves COA and lot evidence missing by default, because the workbook has none", () => {
    const result = importV3Master(clearedWorkbook());
    expect(result.offers[0].record.documentation).toEqual({
      coaState: "missing",
      lotState: "missing",
    });
  });
});

describe("the merged strength guard, not a copy of it", () => {
  it("fails closed on a variant the repository already records as contested", () => {
    const dispute = recordedVariantStrengthDisputes()[0];
    expect(dispute).toBeDefined();

    const result = importV3Master(
      workbook({
        offers: [offerRow({ id: dispute.productCode, variant: dispute.founderLocked.presentation })],
        prices: [
          priceRow({
            id: dispute.productCode,
            variant: dispute.founderLocked.presentation,
            wholesale: 10,
            wholesaleStatus: "Known - founder supplied",
          }),
        ],
        images: [
          imageRow({
            sku: dispute.productCode,
            variant: dispute.founderLocked.presentation,
            filePath: "assets/a.webp",
            status: "Approved",
          }),
        ],
        peptides: [
          peptideRow(dispute.productCode, dispute.founderLocked.presentation, dispute.sku),
        ],
      }),
      {
        documentation: ATTACHED_DOCUMENTATION,
        // Even with an approved price, a contested unit may not be sold.
        approvedPrices: () => APPROVED,
      },
    );

    const offer = result.offers[0];
    expect(offer.record.strengthDisputed).toBe(true);
    expect(offer.strengthDispute?.sku).toBe(dispute.sku);
    expect(offer.readiness.state).toBe("held");
    expect(isPurchasableReadinessState(offer.readiness.state)).toBe(false);
  });

  it("holds every variant the repository records as contested", () => {
    const disputes = recordedVariantStrengthDisputes();
    expect(disputes.length).toBeGreaterThan(0);
    for (const dispute of disputes) {
      const result = importV3Master(
        workbook({
          offers: [
            offerRow({ id: dispute.productCode, variant: dispute.founderLocked.presentation }),
          ],
          prices: [
            priceRow({
              id: dispute.productCode,
              variant: dispute.founderLocked.presentation,
              wholesale: 10,
              wholesaleStatus: "Known - founder supplied",
            }),
          ],
          peptides: [
            peptideRow(dispute.productCode, dispute.founderLocked.presentation, dispute.sku),
          ],
        }),
        {
          documentation: ATTACHED_DOCUMENTATION,
          approvedPrices: () => APPROVED,
        },
      );
      expect(result.offers[0].readiness.state).toBe("held");
    }
  });

  it("leaves an uncontested variant undisputed", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ id: "PEX-002", variant: "10 mg" })],
        prices: [priceRow({ id: "PEX-002", variant: "10 mg" })],
        peptides: [peptideRow("PEX-002", "10 mg", "R360-TB500-10MG-VIAL")],
      }),
    );
    expect(result.offers[0].record.strengthDisputed).toBe(false);
    expect(result.offers[0].strengthDispute).toBeNull();
  });
});

describe("idempotence", () => {
  it("produces the same records, ids, and order on a second run", () => {
    const input = workbook({
      offers: [
        offerRow({ id: "PEP-007", variant: "10 mg" }),
        offerRow({ id: "PEP-007", variant: "20 mg" }),
        offerRow({ category: "Supplements", id: "SUP-1", variant: "60 capsules" }),
      ],
      prices: [
        priceRow({ id: "PEP-007", variant: "10 mg" }),
        priceRow({ id: "PEP-007", variant: "20 mg" }),
        priceRow({ id: "SUP-1", variant: "60 capsules" }),
      ],
    });
    const first = importV3Master(input);
    const second = importV3Master(input);
    expect(second).toEqual(first);
    expect(first.offers.map((offer) => offer.record.recordId)).toEqual([
      "v3:PEP-007:10 MG",
      "v3:PEP-007:20 MG",
      "v3:SUP-1:60 CAPSULES",
    ]);
    expect(new Set(first.offers.map((offer) => offer.record.recordId)).size).toBe(3);
  });

  it("gives the same record id whatever the case and spacing of the cell", () => {
    const a = importV3Master(
      workbook({ offers: [offerRow({ id: "pep-007", variant: "10  mg" })], prices: [priceRow({ id: "PEP-007", variant: "10 mg" })] }),
    );
    expect(a.offers[0].record.recordId).toBe("v3:PEP-007:10 MG");
  });
});

describe("coverage reporting", () => {
  it("counts price book rows that no offer covers rather than importing them", () => {
    const result = importV3Master(
      workbook({
        offers: [offerRow({ id: "PEP-007" })],
        prices: [priceRow({ id: "PEP-007" }), priceRow({ id: "PEP-999" })],
      }),
    );
    expect(result.offers).toHaveLength(1);
    expect(result.priceBookRowsWithoutOffer).toBe(1);
  });

  it("reports the source row count before any acceptance decision", () => {
    const result = importV3Master(
      workbook({ offers: [offerRow({}), offerRow({ id: "-" })], prices: [priceRow({})] }),
    );
    expect(result.sourceRowCount).toBe(2);
    expect(result.offers.length + result.rejections.length).toBe(2);
  });
});
