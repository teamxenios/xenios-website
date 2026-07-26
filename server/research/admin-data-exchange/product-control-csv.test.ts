import { describe, expect, it } from "vitest";
import {
  MEDIA_CSV_SCHEMA,
  PRICE_CSV_SCHEMA,
  PRODUCT_CSV_SCHEMA,
  VARIANT_CSV_SCHEMA,
  type MediaCsvExportSource,
  type PriceCsvExportSource,
  type ProductCsvExportSource,
  type VariantCsvExportSource,
} from "@shared/research/admin-data-exchange/product-control-csv";
import {
  exportMediaCsv,
  exportPriceCsv,
  exportProductCsv,
  exportVariantCsv,
  parseMediaCsv,
  parsePriceCsv,
  parseProductCsv,
  parseVariantCsv,
  validateProductControlCsvRelationships,
} from "./product-control-csv";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_VARIANT_ID = "44444444-4444-4444-8444-444444444444";
const PRICE_ID = "55555555-5555-4555-8555-555555555555";
const MEDIA_ID = "66666666-6666-4666-8666-666666666666";

const productHeader = PRODUCT_CSV_SCHEMA.columns.map((item) => item.header).join(",");
const variantHeader = VARIANT_CSV_SCHEMA.columns.map((item) => item.header).join(",");
const priceHeader = PRICE_CSV_SCHEMA.columns.map((item) => item.header).join(",");
const mediaHeader = MEDIA_CSV_SCHEMA.columns.map((item) => item.header).join(",");

const productCsv = (
  overrides: Partial<Record<string, string>> = {},
) => {
  const values = {
    productId: PRODUCT_ID,
    productCode: "ALPHA-1",
    slug: "alpha-one",
    displayName: "Alpha One",
    canonicalName: "Alpha One Canonical",
    aliasesJson: '["Alpha 1","Alpha I"]',
    lane: "research_material",
    category: "Research",
    classification: "Reference material",
    ...overrides,
  };
  return `${productHeader}\r\n${[
    values.productId,
    values.productCode,
    values.slug,
    values.displayName,
    values.canonicalName,
    `"${values.aliasesJson.replaceAll('"', '""')}"`,
    values.lane,
    values.category,
    values.classification,
  ].join(",")}\r\n`;
};

const variantCsv = (
  overrides: Partial<Record<string, string>> = {},
) => {
  const values = {
    variantId: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: "ALPHA-1-10",
    catalogNumber: "CAT-10",
    label: "10 mg reference",
    strength: "10 mg",
    size: "1 unit",
    format: "vial",
    presentation: "Individual",
    shippingClass: "ambient",
    memberEligible: "false",
    sortOrder: "3",
    ...overrides,
  };
  return `${variantHeader}\r\n${Object.values(values).join(",")}\r\n`;
};

const priceCsv = (
  overrides: Partial<Record<string, string>> = {},
) => {
  const values = {
    priceId: PRICE_ID,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
    amountCents: "12900",
    currency: "USD",
    effectiveAt: "2026-08-01T00:00:00Z",
    expiresAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
  return `${priceHeader}\r\n${Object.values(values).join(",")}\r\n`;
};

const mediaCsv = (
  overrides: Partial<Record<string, string>> = {},
) => {
  const values = {
    mediaId: MEDIA_ID,
    productId: PRODUCT_ID,
    storageKey: `${PRODUCT_ID}/${MEDIA_ID}/primary.webp`,
    kind: "primary_image",
    filename: "primary.webp",
    contentType: "image/webp",
    sizeBytes: "2048",
    altText: "Product package on a neutral background",
    sortOrder: "0",
    ...overrides,
  };
  return `${mediaHeader}\r\n${Object.values(values).join(",")}\r\n`;
};

function errorCodes(result: { ok: boolean; errors?: readonly { code: string }[] }) {
  return result.ok ? [] : result.errors?.map((item) => item.code) ?? [];
}

describe("Product Control CSV deterministic draft mappings", () => {
  it("maps products without lifecycle, approval, publication, or persistence commands", () => {
    const result = parseProductCsv(productCsv());
    expect(result).toEqual({
      ok: true,
      byteLength: expect.any(Number),
      commands: [
        {
          kind: "product_draft",
          productId: PRODUCT_ID,
          input: {
            productCode: "ALPHA-1",
            slug: "alpha-one",
            displayName: "Alpha One",
            canonicalName: "Alpha One Canonical",
            aliases: ["Alpha 1", "Alpha I"],
            lane: "research_material",
            category: "Research",
            classification: "Reference material",
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /publish|approve|rpc|insert|upload|verified/i,
    );
  });

  it("maps explicit variant defaults rather than inventing them", () => {
    expect(parseVariantCsv(variantCsv())).toMatchObject({
      ok: true,
      commands: [
        {
          kind: "variant_draft",
          variantId: VARIANT_ID,
          productId: PRODUCT_ID,
          input: {
            sku: "ALPHA-1-10",
            memberEligible: false,
            sortOrder: 3,
          },
        },
      ],
    });
    expect(errorCodes(parseVariantCsv(variantCsv({ sortOrder: "" })))).toEqual([
      "required_value",
    ]);
    expect(
      errorCodes(parseVariantCsv(variantCsv({ memberEligible: "" }))),
    ).toEqual(["required_value"]);
  });

  it("maps exact effective-dated prices and rejects ambiguous dates or ranges", () => {
    expect(parsePriceCsv(priceCsv())).toMatchObject({
      ok: true,
      commands: [
        {
          kind: "price_draft",
          priceId: PRICE_ID,
          productId: PRODUCT_ID,
          input: {
            variantId: VARIANT_ID,
            audience: "member",
            amountCents: 12900,
            currency: "USD",
            effectiveAt: "2026-08-01T00:00:00Z",
            expiresAt: "2026-09-01T00:00:00Z",
          },
        },
      ],
    });
    expect(
      errorCodes(parsePriceCsv(priceCsv({ effectiveAt: "2026-08-01" }))),
    ).toEqual(["invalid_date"]);
    expect(
      errorCodes(
        parsePriceCsv(
          priceCsv({ expiresAt: "2026-07-31T23:59:59Z" }),
        ),
      ),
    ).toEqual(["invalid_date_range"]);
  });

  it.each([
    "2025-02-29T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-08-01T24:00:00Z",
    "2026-08-01T00:00:00+24:00",
    "2026-08-01T00:00:00+12:60",
  ])("rejects RFC-shaped but invalid calendar timestamp %s", (effectiveAt) => {
    expect(errorCodes(parsePriceCsv(priceCsv({ effectiveAt })))).toEqual([
      "invalid_date",
    ]);
  });

  it.each([
    "2024-02-29T23:59:59Z",
    "2026-08-01T00:00:00+05:30",
    "2026-08-01T00:00:00-04:00",
  ])("accepts strict calendar-valid RFC 3339 timestamp %s", (effectiveAt) => {
    expect(parsePriceCsv(priceCsv({ effectiveAt, expiresAt: "" })).ok).toBe(
      true,
    );
  });

  it("maps private-media metadata as a storage-key reference only", () => {
    const result = parseMediaCsv(mediaCsv());
    expect(result).toMatchObject({
      ok: true,
      commands: [
        {
          kind: "media_metadata_draft",
          mediaId: MEDIA_ID,
          productId: PRODUCT_ID,
          storageKey: `${PRODUCT_ID}/${MEDIA_ID}/primary.webp`,
          input: {
            kind: "primary_image",
            filename: "primary.webp",
            contentType: "image/webp",
            sizeBytes: 2048,
            altText: "Product package on a neutral background",
            sortOrder: 0,
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/signedUrl|uploadUrl|publicUrl/i);
    for (const storageKey of [
      `care/${PRODUCT_ID}/${MEDIA_ID}/primary.webp`,
      `${OTHER_PRODUCT_ID}/${MEDIA_ID}/primary.webp`,
      `${PRODUCT_ID}/${PRICE_ID}/primary.webp`,
      `${PRODUCT_ID}/${MEDIA_ID}/other.webp`,
      "../private.webp",
      "/absolute/private.webp",
      "https://invalid.example/private.webp",
      "research-products\\private.webp",
    ]) {
      expect(errorCodes(parseMediaCsv(mediaCsv({ storageKey })))).toEqual([
        "invalid_storage_reference",
      ]);
    }
    expect(
      errorCodes(
        parseMediaCsv(
          mediaCsv({
            filename: "unsafe name.webp",
            storageKey: `${PRODUCT_ID}/${MEDIA_ID}/unsafe name.webp`,
          }),
        ),
      ),
    ).toEqual([
      "invalid_storage_reference",
      "invalid_storage_reference",
    ]);
  });
});

describe("Product Control CSV fail-closed validation", () => {
  it("preserves raw-byte BOM policy, invalid UTF-8, formula-risk, and limits from the kernel", () => {
    const bom = new TextEncoder().encode(`\uFEFF${productCsv()}`);
    expect(parseProductCsv(bom).ok).toBe(true);
    expect(errorCodes(parseProductCsv(bom, { allowBom: false }))).toEqual([
      "bom_not_allowed",
    ]);
    expect(
      errorCodes(parseProductCsv(new Uint8Array([0xc3, 0x28]))),
    ).toEqual(["invalid_utf8"]);
    expect(
      errorCodes(
        parseProductCsv(productCsv({ displayName: " =HYPERLINK(A1)" })),
      ),
    ).toEqual(["formula_risk"]);
    expect(
      errorCodes(
        parseProductCsv(productCsv(), { limits: { maxBytes: 10 } }),
      ),
    ).toEqual(["byte_limit_exceeded"]);
    expect(
      errorCodes(
        parseProductCsv(
          `${productCsv().trimEnd()}\r\n${productCsv()
            .trimEnd()
            .split("\r\n")[1]}\r\n`,
          { limits: { maxRows: 1 } },
        ),
      ),
    ).toContain("row_limit_exceeded");
    expect(
      errorCodes(
        parseProductCsv(productCsv(), { limits: { maxColumns: 8 } }),
      ),
    ).toContain("column_limit_exceeded");
  });

  it.each(['["\\ud800"]', '["\\udc00"]', '["safe\\u0000alias"]'])(
    "rejects JSON-escaped ill-formed or prohibited alias content",
    (aliasesJson) => {
      const result = parseProductCsv(productCsv({ aliasesJson }));
      expect(errorCodes(result)).toEqual(["invalid_json"]);
      if (result.ok) return;
      expect(JSON.stringify(result.errors)).not.toContain(aliasesJson);
    },
  );

  it("caps variant and media sort order at the PostgreSQL integer boundary", () => {
    expect(
      parseVariantCsv(variantCsv({ sortOrder: "2147483647" })).ok,
    ).toBe(true);
    expect(parseMediaCsv(mediaCsv({ sortOrder: "2147483647" })).ok).toBe(
      true,
    );
    expect(
      errorCodes(
        parseVariantCsv(variantCsv({ sortOrder: "2147483648" })),
      ),
    ).toEqual(["invalid_integer"]);
    expect(
      errorCodes(parseMediaCsv(mediaCsv({ sortOrder: "2147483648" }))),
    ).toEqual(["invalid_integer"]);
  });

  it.each([
    ["product ID", productCsv({ productId: "not-a-uuid" }), "invalid_identifier"],
    ["product code", productCsv({ productCode: "alpha 1" }), "invalid_identifier"],
    ["slug", productCsv({ slug: "Alpha-One" }), "invalid_identifier"],
    ["aliases", productCsv({ aliasesJson: '{"alias":"wrong"}' }), "invalid_json"],
    ["lane", productCsv({ lane: "clinical" }), "invalid_enum"],
    ["SKU", variantCsv({ sku: "mixed case" }), "invalid_identifier"],
    ["boolean", variantCsv({ memberEligible: "yes" }), "invalid_boolean"],
    ["integer", variantCsv({ sortOrder: "01" }), "invalid_integer"],
    ["audience", priceCsv({ audience: "customer" }), "invalid_enum"],
    ["currency", priceCsv({ currency: "EUR" }), "invalid_enum"],
    ["content type", mediaCsv({ contentType: "image/svg+xml" }), "invalid_enum"],
    ["media bytes", mediaCsv({ sizeBytes: "10485761" }), "invalid_integer"],
  ] as const)("returns a stable coordinate-only error for invalid %s", (_, csv, code) => {
    const parse = csv.startsWith(productHeader)
      ? parseProductCsv
      : csv.startsWith(variantHeader)
        ? parseVariantCsv
        : csv.startsWith(priceHeader)
          ? parsePriceCsv
          : parseMediaCsv;
    const result = parse(csv as never);
    expect(errorCodes(result)).toEqual([code]);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      code,
      scope: "field",
      row: 2,
      column: expect.any(Number),
      field: expect.any(String),
    });
    expect(JSON.stringify(result.errors)).not.toContain("not-a-uuid");
    expect(JSON.stringify(result.errors)).not.toContain("mixed case");
    expect(JSON.stringify(result.errors)).not.toContain("image/svg+xml");
  });

  it("rejects duplicate IDs and business keys without exposing their values", () => {
    const first = productCsv().trimEnd().split("\r\n")[1];
    const duplicate = `${productHeader}\r\n${first}\r\n${first}\r\n`;
    const result = parseProductCsv(duplicate);
    expect(errorCodes(result)).toEqual([
      "duplicate_identifier",
      "duplicate_business_key",
      "duplicate_business_key",
    ]);
    if (result.ok) return;
    expect(JSON.stringify(result.errors)).not.toContain(PRODUCT_ID);
    expect(JSON.stringify(result.errors)).not.toContain("ALPHA-1");
  });

  it("canonicalizes UUID case and rejects case-only identity aliases", () => {
    const first = productCsv().trimEnd().split("\r\n")[1];
    const second = productCsv({
      productId: PRODUCT_ID.toUpperCase(),
      productCode: "BETA-1",
      slug: "beta-one",
    })
      .trimEnd()
      .split("\r\n")[1];
    const duplicate = parseProductCsv(
      `${productHeader}\r\n${first}\r\n${second}\r\n`,
    );
    expect(errorCodes(duplicate)).toEqual(["duplicate_identifier"]);

    const mixed = parsePriceCsv(
      priceCsv({
        productId: PRODUCT_ID.toUpperCase(),
        variantId: VARIANT_ID.toUpperCase(),
      }),
      {
        bindings: {
          productIds: [PRODUCT_ID.toUpperCase()],
          variantProductIds: {
            [VARIANT_ID.toUpperCase()]: PRODUCT_ID.toUpperCase(),
          },
        },
      },
    );
    expect(mixed).toMatchObject({
      ok: true,
      commands: [
        {
          productId: PRODUCT_ID,
          input: { variantId: VARIANT_ID },
        },
      ],
    });
  });

  it("never includes raw rows, storage keys, notes, or full file content in errors", () => {
    const secret = "private-token-do-not-return";
    const result = parseMediaCsv(
      mediaCsv({
        storageKey: `../${secret}`,
        altText: secret,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const serialized = JSON.stringify(result.errors);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(`../${secret}`);
    expect(result.errors.every((item) => !("value" in item))).toBe(true);
  });
});

describe("Product Control CSV canonical relationship validation", () => {
  it("accepts one exact product-variant-price-media bundle", () => {
    const products = parseProductCsv(productCsv());
    const variants = parseVariantCsv(variantCsv());
    const prices = parsePriceCsv(priceCsv());
    const media = parseMediaCsv(mediaCsv());
    expect(products.ok && variants.ok && prices.ok && media.ok).toBe(true);
    if (!products.ok || !variants.ok || !prices.ok || !media.ok) return;
    expect(
      validateProductControlCsvRelationships({
        products: products.commands,
        variants: variants.commands,
        prices: prices.commands,
        media: media.commands,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects unknown and cross-product variant bindings at exact coordinates", () => {
    const variant = parseVariantCsv(variantCsv());
    const price = parsePriceCsv(priceCsv({ productId: OTHER_PRODUCT_ID }));
    expect(variant.ok && price.ok).toBe(true);
    if (!variant.ok || !price.ok) return;
    const result = validateProductControlCsvRelationships(
      { variants: variant.commands, prices: price.commands },
      { productIds: [PRODUCT_ID, OTHER_PRODUCT_ID] },
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: "variant_product_mismatch",
          profile: "prices",
          scope: "field",
          message: "CSV variant is not bound to the specified product identifier.",
          row: 2,
          column: 2,
          field: "productId",
        },
      ],
    });
  });

  it("validates partial files against caller-supplied canonical bindings", () => {
    expect(
      parsePriceCsv(priceCsv(), {
        bindings: {
          productIds: [PRODUCT_ID],
          variantProductIds: { [VARIANT_ID]: PRODUCT_ID },
        },
      }).ok,
    ).toBe(true);
    expect(
      errorCodes(
        parsePriceCsv(priceCsv({ variantId: OTHER_VARIANT_ID }), {
          bindings: {
            productIds: [PRODUCT_ID],
            variantProductIds: { [VARIANT_ID]: PRODUCT_ID },
          },
        }),
      ),
    ).toEqual(["unknown_variant_binding"]);
  });
});

describe("Product Control CSV redacted deterministic export", () => {
  const product: ProductCsvExportSource = {
    id: PRODUCT_ID,
    productCode: "ALPHA-1",
    slug: "alpha-one",
    displayName: "Alpha One",
    canonicalName: "Alpha One Canonical",
    aliases: ["Alpha 1"],
    lane: "research_material",
    category: "Research",
    classification: "Reference material",
  };
  const variant: VariantCsvExportSource = {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: "ALPHA-1-10",
    catalogNumber: null,
    label: "10 mg reference",
    strength: "10 mg",
    size: null,
    format: "vial",
    presentation: null,
    shippingClass: "ambient",
    memberEligible: false,
    sortOrder: 3,
  };
  const price: PriceCsvExportSource = {
    id: PRICE_ID,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
    amountCents: 12900,
    currency: "USD",
    effectiveAt: "2026-08-01T00:00:00Z",
    expiresAt: null,
  };
  const media: MediaCsvExportSource = {
    id: MEDIA_ID,
    productId: PRODUCT_ID,
    kind: "primary_image",
    storageKey: `${PRODUCT_ID}/${MEDIA_ID}/primary.webp`,
    filename: "primary.webp",
    contentType: "image/webp",
    sizeBytes: 2048,
    altText: "Product package",
    sortOrder: 0,
  };

  it("uses deterministic schemas and omits lifecycle, actor, approval, and URL fields", () => {
    const exports = [
      exportProductCsv([
        {
          ...product,
          status: "published",
          updatedAt: "private",
          publishedAt: "private",
        } as ProductCsvExportSource,
      ]),
      exportVariantCsv([
        { ...variant, status: "approved", createdAt: "private" } as VariantCsvExportSource,
      ]),
      exportPriceCsv([
        {
          ...price,
          approvalNote: "INTERNAL REVIEW vendor terms unresolved",
          status: "approved",
          approvedBy: "private",
          createdBy: "private",
        } as PriceCsvExportSource,
      ]),
      exportMediaCsv([
        { ...media, approvedBy: "private", signedUrl: "private" } as MediaCsvExportSource,
      ]),
    ];
    for (const result of exports) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.csv).not.toMatch(
        /status|published|created by|approved by|approval note|internal review|vendor terms|signed url|private\r?\n/i,
      );
      expect(result.csv.endsWith("\r\n")).toBe(true);
      expect(new TextDecoder().decode(result.bytes)).toBe(result.csv);
    }
  });

  it("round-trips every safe export to the exact draft mapping", () => {
    const productExport = exportProductCsv([product]);
    const variantExport = exportVariantCsv([variant]);
    const priceExport = exportPriceCsv([price]);
    const mediaExport = exportMediaCsv([media]);
    expect(
      productExport.ok && variantExport.ok && priceExport.ok && mediaExport.ok,
    ).toBe(true);
    if (
      !productExport.ok ||
      !variantExport.ok ||
      !priceExport.ok ||
      !mediaExport.ok
    ) {
      return;
    }
    expect(parseProductCsv(productExport.bytes)).toMatchObject({ ok: true });
    expect(parseVariantCsv(variantExport.bytes)).toMatchObject({ ok: true });
    expect(parsePriceCsv(priceExport.bytes)).toMatchObject({ ok: true });
    expect(parseMediaCsv(mediaExport.bytes)).toMatchObject({ ok: true });
  });

  it("neutralizes formula-risk export cells while retaining deterministic coordinates", () => {
    const result = exportProductCsv([
      { ...product, displayName: "  =HYPERLINK(A1)" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.csv).toContain("'  =HYPERLINK(A1)");
    const parsed = parseProductCsv(result.bytes);
    expect(parsed).toMatchObject({
      ok: true,
      commands: [{ input: { displayName: "'  =HYPERLINK(A1)" } }],
    });
  });

  it("rejects missing private storage references without inventing one", () => {
    const result = exportMediaCsv([{ ...media, storageKey: null }]);
    expect(errorCodes(result)).toEqual(["required_value"]);
    expect(JSON.stringify(result)).not.toContain(`${PRODUCT_ID}/`);
  });
});

describe("Product Control CSV bounded generated-property coverage", () => {
  const uuid = (value: number) =>
    `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

  it("round-trips deterministic product, variant, price, and media mappings", () => {
    for (let index = 1; index <= 96; index += 1) {
      const productId = uuid(index);
      const variantId = uuid(index + 1000);
      const productSource: ProductCsvExportSource = {
        productCode: `P-${index}`,
        slug: `product-${index}`,
        displayName: `Product ${index} Δ`,
        canonicalName: `Canonical ${index}`,
        aliases: [`Alias ${index}`, `Unicode 中 ${index}`],
        lane: PRODUCT_LANES_FOR_TEST[index % PRODUCT_LANES_FOR_TEST.length],
        category: `Category ${index % 7}`,
        classification: `Classification ${index % 5}`,
        id: productId,
      };
      const variantSource: VariantCsvExportSource = {
        id: variantId,
        productId,
        sku: `SKU-${index}`,
        catalogNumber: index % 2 ? null : `CAT-${index}`,
        label: `Variant ${index}`,
        strength: null,
        size: `${index} units`,
        format: "reference",
        presentation: null,
        shippingClass: null,
        memberEligible: index % 2 === 0,
        sortOrder: index,
      };
      const priceSource: PriceCsvExportSource = {
        id: uuid(index + 2000),
        productId,
        variantId,
        audience: "member",
        amountCents: index * 100,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00Z",
        expiresAt: null,
  };
      const mediaSource: MediaCsvExportSource = {
        id: uuid(index + 3000),
        productId,
        kind: index % 2 ? "primary_image" : "gallery_image",
        storageKey: `${productId}/${uuid(index + 3000)}/${index}.webp`,
        filename: `${index}.webp`,
        contentType: "image/webp",
        sizeBytes: 1024 + index,
        altText: `Product ${index}, detail "A"`,
        sortOrder: index,
      };
      const productResult = exportProductCsv([productSource]);
      const variantResult = exportVariantCsv([variantSource]);
      const priceResult = exportPriceCsv([priceSource]);
      const mediaResult = exportMediaCsv([mediaSource]);
      expect(
        productResult.ok &&
          variantResult.ok &&
          priceResult.ok &&
          mediaResult.ok,
      ).toBe(true);
      if (
        !productResult.ok ||
        !variantResult.ok ||
        !priceResult.ok ||
        !mediaResult.ok
      ) {
        continue;
      }
      const products = parseProductCsv(productResult.bytes);
      const variants = parseVariantCsv(variantResult.bytes);
      const prices = parsePriceCsv(priceResult.bytes);
      const mediaRows = parseMediaCsv(mediaResult.bytes);
      expect(
        products.ok && variants.ok && prices.ok && mediaRows.ok,
      ).toBe(true);
      if (!products.ok || !variants.ok || !prices.ok || !mediaRows.ok) continue;
      expect(
        validateProductControlCsvRelationships({
          products: products.commands,
          variants: variants.commands,
          prices: prices.commands,
          media: mediaRows.commands,
        }),
      ).toEqual({ ok: true });
    }
  });
});

const PRODUCT_LANES_FOR_TEST = [
  "supplement",
  "research_material",
  "quantum",
  "future_clinical",
  "non_product_program",
] as const;
