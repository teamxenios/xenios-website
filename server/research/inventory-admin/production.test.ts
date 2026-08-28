import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  LOT_QUALITY_TEST_KEYS,
  type InventoryMovementType,
  type InventorySourceBucket,
  type LotQualityTestKey,
  type LotQualityTestState,
} from "@shared/research/inventory-admin";
import {
  SupabaseInventoryLotAdminRepository,
  SupabaseLotQualityAdminRepository,
  type CreateInventoryLot,
} from "./production";
import {
  assertInventoryMovementCommandSource,
  parseCoaUploadPreparationReceipt,
  parseInventoryLotCreateReceipt,
  parseInventoryMovementRow,
  parseLotQualityDocumentRow,
  parseLotQualityTestRow,
  parseProductCommerceReadinessProjection,
  parseSignedUrl,
} from "./row-parsers";

const PRODUCT_ID = "30000000-0000-4000-8000-000000000001";
const VARIANT_ID = "40000000-0000-4000-8000-000000000001";
const LOT_ID = "50000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "60000000-0000-4000-8000-000000000001";
const MOVEMENT_ID = "70000000-0000-4000-8000-000000000001";

const lotInput: CreateInventoryLot = {
  lotCode: "LOT-RPC-001",
  sku: "EXACT-SKU",
  productId: PRODUCT_ID,
  variantId: VARIANT_ID,
  owner: "xenios",
  storageLocation: "A-01",
  supplierReference: "SUPPLIER-001",
  manufacturedDate: null,
  expiryDate: "2027-07-26",
  retestDate: null,
  shelfLifeSource: "supplier_document",
  idempotencyKey: "create-rpc-001",
};

const acceptedReader = {
  getForVariant: vi.fn(async () => ({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    sku: "EXACT-SKU",
    productApproved: true,
    productActive: true,
    variantApproved: true,
    variantActive: true,
    activePrice: null,
    shippingClass: null,
    exactLotCoaRequired: true,
    productDocumentationRequired: true,
  })),
};

function lotRow() {
  return {
    id: LOT_ID,
    lot_id: lotInput.lotCode,
    sku: lotInput.sku,
    product_id: PRODUCT_ID,
    variant_id: VARIANT_ID,
    owner: "xenios",
    disposition: "quarantined",
    storage_location: "A-01",
    supplier_reference: "SUPPLIER-001",
    manufactured_date: null,
    expiry_date: "2027-07-26",
    retest_date: null,
    quantity_received: 0,
    quantity_available: 0,
    quantity_reserved: 0,
    quantity_quarantined: 0,
    quantity_damaged: 0,
    version: 1,
    updated_at: "2026-07-26T00:00:00.000Z",
  };
}

function lotReadQuery() {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: lotRow(), error: null }));
  return query;
}

function listQuery(data: unknown) {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data, error: null }));
  return query;
}

function movementRow() {
  return {
    id: MOVEMENT_ID,
    lot_id: LOT_ID,
    movement_type: "receipt",
    quantity: 10,
    source_bucket: null,
    available_before: 0,
    available_after: 0,
    reserved_before: 0,
    reserved_after: 0,
    quarantined_before: 0,
    quarantined_after: 10,
    damaged_before: 0,
    damaged_after: 0,
    resulting_version: 2,
    reason: "Synthetic inventory receipt",
    actor_id: "synthetic-operations-admin",
    occurred_at: "2026-07-26T00:00:00.000Z",
  };
}

function canonicalMovementRow(
  movementType: Exclude<InventoryMovementType, "adjust" | "reconcile" | "damage">,
  sourceBucket: InventorySourceBucket | null,
) {
  const common = {
    ...movementRow(),
    movement_type: movementType,
    quantity: 4,
    source_bucket: sourceBucket,
    available_before: 10,
    available_after: 10,
    reserved_before: 6,
    reserved_after: 6,
    quarantined_before: 6,
    quarantined_after: 6,
  };

  switch (movementType) {
    case "receipt":
      return { ...common, quarantined_after: 10 };
    case "reserve":
      return { ...common, available_after: 6, reserved_after: 10 };
    case "release":
      return { ...common, available_after: 14, reserved_after: 2 };
    case "quarantine":
      return { ...common, available_after: 6, quarantined_after: 10 };
    case "quarantine_release":
      return { ...common, available_after: 14, quarantined_after: 2 };
  }
}

function qualityDocumentRow() {
  return {
    id: DOCUMENT_ID,
    lot_id: LOT_ID,
    research_inventory_lots: {
      lot_id: lotInput.lotCode,
      sku: lotInput.sku,
    },
    document_state: "pending",
    verification_state: "pending",
    coa_on_file: false,
    bucket_id: "research-coa-production",
    private_storage_key: `lots/${LOT_ID}/${DOCUMENT_ID}-synthetic-exact-lot.pdf`,
    original_filename: "synthetic-exact-lot.pdf",
    content_type: "application/pdf",
    size_bytes: 100,
    sha256: "f".repeat(64),
    report_issuer: "Synthetic Verification Lab",
    report_number: "SYNTHETIC-REPORT-001",
    report_date: "2026-07-26",
    reviewed_at: null,
    reviewed_by: null,
    published_at: null,
    published_by: null,
    version: 1,
  };
}

function qualityTest(
  testKey: LotQualityTestKey,
  state: LotQualityTestState,
) {
  const reviewed = state === "passed";
  return parseLotQualityTestRow({
    test_key: testKey,
    state,
    method: reviewed ? "Synthetic validated method" : null,
    result: reviewed ? "Synthetic passing result" : null,
    unit: null,
    reviewed_by: reviewed ? "synthetic-quality-reviewer" : null,
    reviewed_at: reviewed ? "2026-07-26T00:00:00.000Z" : null,
  });
}

function readyQualityTests() {
  const mustPass = new Set<LotQualityTestKey>([
    "identity",
    "assay",
    "purity",
    "chain_of_custody",
  ]);
  return LOT_QUALITY_TEST_KEYS.map((testKey) =>
    qualityTest(testKey, mustPass.has(testKey) ? "passed" : "not_applicable")
  );
}

function availableQualityDocumentRow() {
  return {
    ...qualityDocumentRow(),
    document_state: "available",
    verification_state: "document_on_file",
    coa_on_file: true,
    reviewed_at: "2026-07-26T01:00:00.000Z",
    reviewed_by: "synthetic-quality-reviewer",
    version: 3,
  };
}

const malformedLotCases: Array<[string, Record<string, unknown>]> = [
  ["missing quantity", { quantity_received: undefined }],
  ["numeric-string quantity", { quantity_available: "0" }],
  ["non-finite quantity", { quantity_reserved: Number.NaN }],
  ["unknown disposition", { disposition: "mystery" }],
  ["invalid version", { version: 0 }],
  ["bucket total above received", { quantity_received: 0, quantity_available: 1 }],
];

describe("Website 4 production repository command wiring", () => {
  it("creates lots only through the atomic RPC and returns the quarantined zero/version-1 row", async () => {
    const query = lotReadQuery();
    const db = {
      from: vi.fn((table: string) => {
        expect(table).toBe("research_inventory_lots");
        return query;
      }),
      rpc: vi.fn(async (name: string) => {
        if (name === "research_lot_is_allocatable") {
          return { data: false, error: null };
        }
        expect(name).toBe("research_create_inventory_lot");
        return {
          data: { lotId: LOT_ID, version: 1, idempotentReplay: false },
          error: null,
        };
      }),
    };
    const repository = new SupabaseInventoryLotAdminRepository(
      db as never,
      acceptedReader,
    );

    const result = await repository.createLot(lotInput, "operations-admin");

    expect(db.rpc).toHaveBeenCalledWith(
      "research_create_inventory_lot",
      expect.objectContaining({
        p_lot_code: "LOT-RPC-001",
        p_product_id: PRODUCT_ID,
        p_variant_id: VARIANT_ID,
        p_sku: "EXACT-SKU",
        p_idempotency_key: "create-rpc-001",
        p_actor_id: "operations-admin",
      }),
    );
    expect(result).toMatchObject({
      id: LOT_ID,
      disposition: "quarantined",
      quantityReceived: 0,
      quantityAvailable: 0,
      quantityReserved: 0,
      quantityQuarantined: 0,
      quantityDamaged: 0,
      version: 1,
    });
    expect(query.insert).toBeUndefined();
  });

  it.each(malformedLotCases)("fails the whole lot read for %s evidence", async (_label, replacement) => {
    const query = listQuery([{ ...lotRow(), ...replacement }]);
    const rpc = vi.fn();
    const repository = new SupabaseInventoryLotAdminRepository({
      from: vi.fn(() => query),
      rpc,
    } as never);

    await expect(repository.listLots()).rejects.toMatchObject({
      code: "inventory_lot_evidence_invalid",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("distinguishes authoritative empty lots from missing list evidence", async () => {
    const empty = new SupabaseInventoryLotAdminRepository({
      from: vi.fn(() => listQuery([])),
      rpc: vi.fn(),
    } as never);
    await expect(empty.listLots()).resolves.toEqual([]);

    const unavailable = new SupabaseInventoryLotAdminRepository({
      from: vi.fn(() => listQuery(null)),
      rpc: vi.fn(),
    } as never);
    await expect(unavailable.listLots()).rejects.toMatchObject({
      code: "inventory_lot_evidence_invalid",
    });
  });

  it("requires an exact boolean readiness result", async () => {
    const query = listQuery([lotRow()]);
    const repository = new SupabaseInventoryLotAdminRepository({
      from: vi.fn(() => query),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as never);

    await expect(repository.listLots()).rejects.toMatchObject({
      code: "inventory_lot_readiness_evidence_invalid",
    });
  });

  it("rejects malformed movement rows instead of coercing quantities", async () => {
    const repository = new SupabaseInventoryLotAdminRepository({
      from: vi.fn(() => listQuery([{ ...movementRow(), quantity: "10" }])),
      rpc: vi.fn(),
    } as never);

    await expect(repository.listMovements()).rejects.toMatchObject({
      code: "inventory_movement_evidence_invalid",
    });
  });

  it("rejects movement evidence whose exact bucket deltas contradict its action", () => {
    expect(() => parseInventoryMovementRow({
      ...movementRow(),
      quarantined_after: 9,
    })).toThrowError(expect.objectContaining({
      code: "inventory_movement_evidence_invalid",
    }));
  });

  it("accepts the canonical reservation producer's available source bucket", () => {
    expect(parseInventoryMovementRow({
      ...movementRow(),
      movement_type: "reserve",
      source_bucket: "available",
      available_before: 10,
      available_after: 6,
      reserved_before: 0,
      reserved_after: 4,
      quarantined_before: 0,
      quarantined_after: 0,
      quantity: 4,
    })).toMatchObject({
      movementType: "reserve",
      sourceBucket: "available",
      quantity: 4,
    });
  });

  it("requires canonical source-bucket labels on stored movement evidence", () => {
    const canonical = [
      ["receipt", null],
      ["reserve", "available"],
      ["release", "reserved"],
      ["quarantine", "available"],
      ["quarantine_release", "quarantined"],
    ] as const;

    for (const [movementType, sourceBucket] of canonical) {
      expect(parseInventoryMovementRow(
        canonicalMovementRow(movementType, sourceBucket),
      )).toMatchObject({ movementType, sourceBucket });
    }

    const mislabeled = [
      ["receipt", "available"],
      ["reserve", "reserved"],
      ["release", "available"],
      ["quarantine", "reserved"],
      ["quarantine_release", "available"],
    ] as const;

    for (const [movementType, sourceBucket] of mislabeled) {
      expect(() => parseInventoryMovementRow(
        canonicalMovementRow(movementType, sourceBucket),
      )).toThrowError(expect.objectContaining({
        code: "inventory_movement_evidence_invalid",
      }));
    }
  });

  it("accepts a current-version create replay but keeps fresh creates at version one", () => {
    expect(parseInventoryLotCreateReceipt({
      lotId: LOT_ID,
      version: 4,
      idempotentReplay: true,
    })).toMatchObject({ version: 4, idempotentReplay: true });

    expect(() => parseInventoryLotCreateReceipt({
      lotId: LOT_ID,
      version: 2,
      idempotentReplay: false,
    })).toThrowError(expect.objectContaining({
      code: "inventory_lot_create_receipt_invalid",
    }));
  });

  it("rejects impossible timestamps and impossible confirmed-upload versions", () => {
    expect(() => parseProductCommerceReadinessProjection({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      sku: "EXACT-SKU",
      productApproved: true,
      productActive: true,
      variantApproved: true,
      variantActive: true,
      shippingClass: null,
      exactLotCoaRequired: true,
      productDocumentationRequired: true,
      activePrice: {
        amountCents: 14_900,
        currency: "USD",
        effectiveAt: "2026-02-30T00:00:00Z",
        version: 1,
      },
    })).toThrowError(expect.objectContaining({
      code: "inventory_product_projection_evidence_invalid",
    }));

    expect(() => parseCoaUploadPreparationReceipt({
      documentId: DOCUMENT_ID,
      documentVersion: 1,
      storageKey: `lots/${LOT_ID}/${DOCUMENT_ID}-confirmed.pdf`,
      objectConfirmed: true,
      idempotentReplay: true,
    }, LOT_ID)).toThrowError(expect.objectContaining({
      code: "coa_upload_receipt_invalid",
    }));
  });

  it("requires complete reviewed test evidence and coherent private-file metadata", () => {
    expect(() => parseLotQualityTestRow({
      test_key: "identity",
      state: "passed",
      method: null,
      result: "confirmed",
      unit: null,
      reviewed_by: "synthetic-quality-reviewer",
      reviewed_at: "2026-07-26T00:00:00.000Z",
    })).toThrowError(expect.objectContaining({
      code: "lot_quality_test_evidence_invalid",
    }));

    expect(() => parseLotQualityDocumentRow({
      ...qualityDocumentRow(),
      sha256: null,
    }, [])).toThrowError(expect.objectContaining({
      code: "lot_quality_document_evidence_invalid",
    }));
  });

  it("accepts available quality evidence only when the checked-in SQL readiness matrix is complete", () => {
    expect(() => parseLotQualityDocumentRow(
      availableQualityDocumentRow(),
      readyQualityTests(),
    )).not.toThrow();

    const missingCanonicalTest = readyQualityTests().slice(0, -1);
    expect(() => parseLotQualityDocumentRow(
      availableQualityDocumentRow(),
      missingCanonicalTest,
    )).toThrowError(expect.objectContaining({
      code: "lot_quality_document_evidence_invalid",
    }));

    const duplicateCanonicalTest = readyQualityTests();
    duplicateCanonicalTest[duplicateCanonicalTest.length - 1] = duplicateCanonicalTest[0];
    expect(() => parseLotQualityDocumentRow(
      availableQualityDocumentRow(),
      duplicateCanonicalTest,
    )).toThrowError(expect.objectContaining({
      code: "lot_quality_document_evidence_invalid",
    }));

    const requiredTestNotPassed = readyQualityTests().map((test) =>
      test.testKey === "identity" ? qualityTest("identity", "not_applicable") : test
    );
    expect(() => parseLotQualityDocumentRow(
      availableQualityDocumentRow(),
      requiredTestNotPassed,
    )).toThrowError(expect.objectContaining({
      code: "lot_quality_document_evidence_invalid",
    }));

    const optionalTestNotReady = readyQualityTests().map((test) =>
      test.testKey === "sterility" ? qualityTest("sterility", "not_tested") : test
    );
    expect(() => parseLotQualityDocumentRow(
      availableQualityDocumentRow(),
      optionalTestNotReady,
    )).toThrowError(expect.objectContaining({
      code: "lot_quality_document_evidence_invalid",
    }));
  });

  it("rejects available quality evidence without confirmed file, report, and review evidence", () => {
    const tests = readyQualityTests();
    for (const malformed of [
      { coa_on_file: false },
      { private_storage_key: null },
      { report_number: null },
      { reviewed_at: null, reviewed_by: null },
    ]) {
      expect(() => parseLotQualityDocumentRow({
        ...availableQualityDocumentRow(),
        ...malformed,
      }, tests)).toThrowError(expect.objectContaining({
        code: "lot_quality_document_evidence_invalid",
      }));
    }
  });

  it("enforces canonical source-bucket semantics for every movement command", () => {
    for (const [movementType, sourceBucket] of [
      ["receipt", null],
      ["reserve", "available"],
      ["release", "reserved"],
      ["quarantine", "available"],
      ["quarantine_release", "quarantined"],
      ["adjust", "available"],
      ["reconcile", "available"],
      ["damage", "available"],
      ["damage", "reserved"],
      ["damage", "quarantined"],
    ] as const) {
      expect(() => assertInventoryMovementCommandSource({
        movementType,
        sourceBucket,
      })).not.toThrow();
    }

    for (const [movementType, sourceBucket] of [
      ["receipt", "available"],
      ["reserve", null],
      ["release", "available"],
      ["quarantine", "reserved"],
      ["quarantine_release", "available"],
      ["adjust", "reserved"],
      ["reconcile", "quarantined"],
      ["damage", null],
    ] as const) {
      expect(() => assertInventoryMovementCommandSource({
        movementType,
        sourceBucket,
      })).toThrowError(expect.objectContaining({
        code: "inventory_movement_rejected",
      }));
    }
  });

  it("rejects contradictory movement evidence before a readiness read or RPC", async () => {
    const db = { from: vi.fn(), rpc: vi.fn() };
    const repository = new SupabaseInventoryLotAdminRepository(db as never);

    await expect(repository.applyMovement(LOT_ID, {
      movementType: "reserve",
      quantity: 1,
      sourceBucket: "reserved",
      expectedVersion: 1,
      idempotencyKey: "contradictory-reserve-source-001",
      reason: "Synthetic contradictory source regression",
    }, "synthetic-operations-admin")).rejects.toMatchObject({
      code: "inventory_movement_rejected",
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("validates movement command receipts before returning success", async () => {
    const repository = new SupabaseInventoryLotAdminRepository({
      rpc: vi.fn(async () => ({
        data: {
          movementId: MOVEMENT_ID,
          lotId: LOT_ID,
          version: "2",
          idempotentReplay: false,
          quantityAvailable: 0,
          quantityReserved: 0,
          quantityQuarantined: 10,
          quantityDamaged: 0,
        },
        error: null,
      })),
    } as never);

    await expect(repository.applyMovement(LOT_ID, {
      movementType: "receipt",
      quantity: 10,
      sourceBucket: null,
      expectedVersion: 1,
      idempotencyKey: "receipt-command-001",
      reason: "Synthetic inventory receipt",
    }, "synthetic-operations-admin")).rejects.toMatchObject({
      code: "inventory_movement_receipt_invalid",
    });
  });

  it("rejects a structurally valid receipt with the wrong resulting version", async () => {
    const repository = new SupabaseInventoryLotAdminRepository({
      rpc: vi.fn(async () => ({
        data: {
          movementId: MOVEMENT_ID,
          lotId: LOT_ID,
          version: 3,
          idempotentReplay: false,
          quantityAvailable: 0,
          quantityReserved: 0,
          quantityQuarantined: 10,
          quantityDamaged: 0,
        },
        error: null,
      })),
    } as never);

    await expect(repository.applyMovement(LOT_ID, {
      movementType: "receipt",
      quantity: 10,
      sourceBucket: null,
      expectedVersion: 1,
      idempotencyKey: "receipt-version-001",
      reason: "Synthetic inventory receipt",
    }, "synthetic-operations-admin")).rejects.toMatchObject({
      code: "inventory_movement_receipt_invalid",
    });
  });

  it("fails create closed before the RPC when Product Control identity is mismatched", async () => {
    const db = { from: vi.fn(), rpc: vi.fn() };
    const repository = new SupabaseInventoryLotAdminRepository(
      db as never,
      {
        getForVariant: vi.fn(async () => ({
          ...(await acceptedReader.getForVariant(VARIANT_ID)),
          variantId: "40000000-0000-4000-8000-000000000999",
        })),
      },
    );

    await expect(
      repository.createLot(lotInput, "operations-admin"),
    ).rejects.toMatchObject({ code: "inventory_product_binding_rejected" });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed create receipt before reading a claimed lot", async () => {
    const db = {
      from: vi.fn(),
      rpc: vi.fn(async () => ({
        data: { lotId: LOT_ID, version: "1", idempotentReplay: false },
        error: null,
      })),
    };
    const repository = new SupabaseInventoryLotAdminRepository(
      db as never,
      acceptedReader,
    );

    await expect(repository.createLot(lotInput, "synthetic-operations-admin"))
      .rejects.toMatchObject({ code: "inventory_lot_create_receipt_invalid" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects malformed quality-document joins before reporting an empty queue", async () => {
    const malformed = {
      ...qualityDocumentRow(),
      research_inventory_lots: { lot_id: lotInput.lotCode, sku: "" },
    };
    const repository = new SupabaseLotQualityAdminRepository({
      from: vi.fn(() => listQuery([malformed])),
    } as never);

    await expect(repository.listDocuments()).rejects.toMatchObject({
      code: "lot_quality_document_evidence_invalid",
    });
  });

  it("accepts only exact-origin HTTPS Supabase Storage signed capabilities", () => {
    const origin = "https://storage.invalid";
    const valid = [
      "https://storage.invalid/storage/v1/object/upload/sign/research-coa/lots/exact.pdf?token=upload-token",
      "https://storage.invalid/storage/v1/object/sign/research-coa/lots/exact.pdf?token=read-token",
    ];
    for (const value of valid) {
      expect(parseSignedUrl(value, "signed_url_invalid", origin)).toBe(value);
    }
    for (const value of [
      "javascript:alert(1)",
      "http://storage.invalid/storage/v1/object/sign/x?token=read-token",
      "https://other.invalid/storage/v1/object/sign/x?token=read-token",
      "https://user:secret@storage.invalid/storage/v1/object/sign/x?token=read-token",
      "https://storage.invalid/storage/v1/object/sign/x#token=fragment",
      "https://storage.invalid/storage/v1/object/sign/x",
      "https://storage.invalid/not-storage/signed?token=read-token",
      " https://storage.invalid/storage/v1/object/sign/x?token=read-token",
    ]) {
      expect(() => parseSignedUrl(value, "signed_url_invalid", origin)).toThrow(
        "signed_url_invalid",
      );
    }
    for (const invalidOrigin of [
      "",
      "http://storage.invalid",
      "https://storage.invalid/path",
      "https://user:secret@storage.invalid",
    ]) {
      expect(() => parseSignedUrl(valid[0], "signed_url_invalid", invalidOrigin)).toThrow(
        "signed_url_invalid",
      );
    }
  });

  it("binds private read grants to the configured Storage origin", async () => {
    const storageKey = `lots/${LOT_ID}/${DOCUMENT_ID}-exact.pdf`;
    const createSignedUrl = vi.fn(async () => ({
      data: {
        signedUrl: `https://storage.invalid/storage/v1/object/sign/research-coa-production/${storageKey}?token=synthetic-read-token`,
      },
      error: null,
    }));
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: {
        accessEventId: args.p_access_id,
        bucketId: "research-coa-production",
        storageKey,
        documentVersion: 1,
      },
      error: null,
    }));
    const repository = new SupabaseLotQualityAdminRepository(
      {
        rpc,
        storage: { from: vi.fn(() => ({ createSignedUrl })) },
      } as never,
      "research-coa-production",
      "https://storage.invalid",
    );
    const grant = await repository.createReadGrant(
      DOCUMENT_ID,
      "synthetic-reviewer",
      "quality_review",
    );
    expect(grant.signedUrl).toContain("https://storage.invalid/storage/v1/object/sign/");
    expect(grant.signedUrl).toContain("token=synthetic-read-token");
  });

  it.each([
    ["javascript:alert(1)", "https://storage.invalid"],
    [
      "https://other.invalid/storage/v1/object/sign/research-coa/x?token=synthetic",
      "https://storage.invalid",
    ],
    [
      "https://storage.invalid/storage/v1/object/sign/research-coa/x?token=synthetic",
      "",
    ],
  ])("refuses an untrusted read grant URL %s", async (signedUrl, configuredOrigin) => {
    const storageKey = `lots/${LOT_ID}/${DOCUMENT_ID}-exact.pdf`;
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: {
        accessEventId: args.p_access_id,
        bucketId: "research-coa-production",
        storageKey,
        documentVersion: 1,
      },
      error: null,
    }));
    const repository = new SupabaseLotQualityAdminRepository(
      {
        rpc,
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn(async () => ({ data: { signedUrl }, error: null })),
          })),
        },
      } as never,
      "research-coa-production",
      configuredOrigin,
    );
    await expect(
      repository.createReadGrant(DOCUMENT_ID, "synthetic-reviewer", "quality_review"),
    ).rejects.toMatchObject({ code: "coa_access_grant_invalid" });
  });

  it("prepares every upload through the replayable RPC and signs its persisted identity", async () => {
    const query = lotReadQuery();
    const createSignedUploadUrl = vi.fn(async (storageKey: string) => ({
      data: {
        signedUrl: `https://storage.invalid/storage/v1/object/upload/sign/research-coa-production/${storageKey}?token=synthetic-upload-token`,
      },
      error: null,
    }));
    const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));
    const rpc = vi.fn(async (name: string) => {
      expect(name).toBe("research_prepare_lot_quality_upload");
      return {
        data: {
          documentId: DOCUMENT_ID,
          documentVersion: 1,
          storageKey: `lots/${LOT_ID}/${DOCUMENT_ID}-exact.pdf`,
          objectConfirmed: false,
          idempotentReplay: rpc.mock.calls.length > 1,
        },
        error: null,
      };
    });
    const db = {
      from: vi.fn(() => query),
      rpc,
      storage: { from: storageFrom },
    };
    const repository = new SupabaseLotQualityAdminRepository(
      db as never,
      "research-coa-production",
      "https://storage.invalid",
    );
    const input = {
      lotId: LOT_ID,
      filename: "exact.pdf",
      contentType: "application/pdf" as const,
      sizeBytes: 100,
      sha256: "a".repeat(64),
      reportIssuer: "Verified Lab",
      reportNumber: "REPORT-001",
      reportDate: "2026-07-26",
      idempotencyKey: "prepare-upload-001",
    };

    const first = await repository.prepareUpload(input, "quality-reviewer");
    const replay = await repository.prepareUpload(input, "quality-reviewer");

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "research_prepare_lot_quality_upload",
      expect.objectContaining({
        p_lot_id: LOT_ID,
        p_idempotency_key: "prepare-upload-001",
        p_actor_id: "quality-reviewer",
        p_upload: expect.objectContaining({
          bucketId: "research-coa-production",
          originalFilename: "exact.pdf",
          reportNumber: "REPORT-001",
        }),
      }),
    );
    expect(first.documentId).toBe(DOCUMENT_ID);
    expect(replay.documentId).toBe(DOCUMENT_ID);
    expect(replay.storageKey).toBe(first.storageKey);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(1, first.storageKey);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(2, first.storageKey);
    expect(query.insert).toBeUndefined();
  });

  it("does not sign a write grant for a malformed preparation receipt", async () => {
    const query = lotReadQuery();
    const createSignedUploadUrl = vi.fn();
    const repository = new SupabaseLotQualityAdminRepository({
      from: vi.fn(() => query),
      rpc: vi.fn(async () => ({
        data: {
          documentId: DOCUMENT_ID,
          documentVersion: 1,
          storageKey: `lots/${LOT_ID}/${DOCUMENT_ID}-synthetic.pdf`,
          objectConfirmed: "false",
          idempotentReplay: false,
        },
        error: null,
      })),
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    } as never);

    await expect(repository.prepareUpload({
      lotId: LOT_ID,
      filename: "synthetic.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      sha256: "e".repeat(64),
      reportIssuer: "Synthetic Verification Lab",
      reportNumber: "SYNTHETIC-REPORT-002",
      reportDate: "2026-07-27",
      idempotencyKey: "prepare-synthetic-002",
    }, "synthetic-quality-reviewer")).rejects.toMatchObject({
      code: "coa_upload_receipt_invalid",
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("does not reissue a write grant for a canceled preparation replay", async () => {
    const query = lotReadQuery();
    const createSignedUploadUrl = vi.fn();
    const repository = new SupabaseLotQualityAdminRepository({
      from: vi.fn(() => query),
      rpc: vi.fn(async () => ({
        data: {
          documentId: DOCUMENT_ID,
          documentVersion: 2,
          storageKey: `lots/${LOT_ID}/${DOCUMENT_ID}-canceled.pdf`,
          objectConfirmed: false,
          idempotentReplay: true,
        },
        error: null,
      })),
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    } as never);

    await expect(repository.prepareUpload({
      lotId: LOT_ID,
      filename: "canceled.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      sha256: "f".repeat(64),
      reportIssuer: "Synthetic Verification Lab",
      reportNumber: "SYNTHETIC-CANCELED-001",
      reportDate: "2026-07-27",
      idempotencyKey: "prepare-canceled-001",
    }, "synthetic-quality-reviewer")).rejects.toMatchObject({
      code: "coa_upload_receipt_invalid",
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("recovers a signed-grant failure by replaying the same prepared document identity", async () => {
    const query = lotReadQuery();
    const storageKey = `lots/${LOT_ID}/${DOCUMENT_ID}-retry.pdf`;
    const createSignedUploadUrl = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "temporary signing failure" },
      })
      .mockResolvedValueOnce({
        data: {
          signedUrl: `https://storage.invalid/storage/v1/object/upload/sign/research-coa-production/${storageKey}?token=synthetic-upload-token`,
        },
        error: null,
      });
    const rpc = vi.fn(async () => ({
      data: {
        documentId: DOCUMENT_ID,
        documentVersion: 1,
        storageKey,
        objectConfirmed: false,
        idempotentReplay: rpc.mock.calls.length > 1,
      },
      error: null,
    }));
    const db = {
      from: vi.fn(() => query),
      rpc,
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    };
    const repository = new SupabaseLotQualityAdminRepository(
      db as never,
      "research-coa-production",
      "https://storage.invalid",
    );
    const input = {
      lotId: LOT_ID,
      filename: "retry.pdf",
      contentType: "application/pdf" as const,
      sizeBytes: 100,
      sha256: "b".repeat(64),
      reportIssuer: "Verified Lab",
      reportNumber: "REPORT-RETRY",
      reportDate: "2026-07-27",
      idempotencyKey: "prepare-upload-retry",
    };

    await expect(
      repository.prepareUpload(input, "quality-reviewer"),
    ).rejects.toMatchObject({ code: "coa_upload_grant_failed" });
    const replay = await repository.prepareUpload(input, "quality-reviewer");

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_idempotency_key: "prepare-upload-retry",
    });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_lot_id: rpc.mock.calls[0]?.[1].p_lot_id,
      p_upload: rpc.mock.calls[0]?.[1].p_upload,
      p_idempotency_key: rpc.mock.calls[0]?.[1].p_idempotency_key,
      p_reason: rpc.mock.calls[0]?.[1].p_reason,
      p_actor_id: rpc.mock.calls[0]?.[1].p_actor_id,
    });
    expect(replay).toMatchObject({
      documentId: DOCUMENT_ID,
      documentVersion: 1,
      storageKey,
    });
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(1, storageKey);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(2, storageKey);
    expect(query.insert).toBeUndefined();
  });

  it("does not mint a second write grant when preparation replays an already-confirmed object", async () => {
    const query = lotReadQuery();
    const storageKey = `lots/${LOT_ID}/${DOCUMENT_ID}-confirmed.pdf`;
    const createSignedUploadUrl = vi.fn();
    const db = {
      from: vi.fn(() => query),
      rpc: vi.fn(async () => ({
        data: {
          documentId: DOCUMENT_ID,
          documentVersion: 2,
          storageKey,
          objectConfirmed: true,
          idempotentReplay: true,
        },
        error: null,
      })),
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    };
    const repository = new SupabaseLotQualityAdminRepository(db as never);

    const replay = await repository.prepareUpload({
      lotId: LOT_ID,
      filename: "confirmed.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      sha256: "d".repeat(64),
      reportIssuer: "Verified Lab",
      reportNumber: "REPORT-CONFIRMED",
      reportDate: "2026-07-27",
      idempotencyKey: "prepare-upload-confirmed",
    }, "quality-reviewer");

    expect(replay).toEqual({
      documentId: DOCUMENT_ID,
      documentVersion: 2,
      uploadRequired: false,
      uploadUrl: null,
      storageKey,
      expiresAt: null,
    });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("cancels an unconfirmed preparation only through the metadata-bound audited RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        documentId: DOCUMENT_ID,
        documentState: "withdrawn",
        verificationState: "withdrawn",
        version: 2,
        idempotentReplay: false,
      },
      error: null,
    }));
    const repository = new SupabaseLotQualityAdminRepository({ rpc } as never);

    const result = await repository.cancelUpload({
      lotId: LOT_ID,
      filename: "retry report.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      sha256: "c".repeat(64),
      reportIssuer: " Verified Lab ",
      reportNumber: " REPORT-CANCEL ",
      reportDate: "2026-07-27",
      expectedVersion: 1,
      preparationIdempotencyKey: "prepare-upload-cancel",
      idempotencyKey: "cancel-upload-001",
    }, "operations-admin");

    expect(rpc).toHaveBeenCalledWith(
      "research_cancel_lot_quality_upload",
      expect.objectContaining({
        p_lot_id: LOT_ID,
        p_expected_version: 1,
        p_preparation_idempotency_key: "prepare-upload-cancel",
        p_idempotency_key: "cancel-upload-001",
        p_actor_id: "operations-admin",
        p_upload: expect.objectContaining({
          bucketId: "research-coa-production",
          originalFilename: "retry_report.pdf",
          reportIssuer: "Verified Lab",
          reportNumber: "REPORT-CANCEL",
        }),
      }),
    );
    expect(result).toMatchObject({ version: 2, documentState: "withdrawn" });
  });

  it("replays confirmation with the original version and command key after a lost response", async () => {
    const bytes = new TextEncoder().encode("%PDF-confirm-replay");
    const storageKey = `lots/${LOT_ID}/${DOCUMENT_ID}-confirm-replay.pdf`;
    const documentQuery: any = {};
    documentQuery.select = vi.fn(() => documentQuery);
    documentQuery.eq = vi.fn(() => documentQuery);
    documentQuery.maybeSingle = vi.fn(async () => ({
      data: {
        id: DOCUMENT_ID,
        private_storage_key: storageKey,
        size_bytes: bytes.byteLength,
        content_type: "application/pdf",
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      error: null,
    }));
    const info = vi.fn(async () => ({
      data: { contentType: "application/pdf", size: bytes.byteLength },
      error: null,
    }));
    const download = vi.fn(async () => ({
      data: new Blob([bytes], { type: "application/pdf" }),
      error: null,
    }));
    const remove = vi.fn();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "confirmation response lost after commit" },
      })
      .mockResolvedValueOnce({
        data: {
          documentId: DOCUMENT_ID,
          documentState: "pending",
          verificationState: "pending",
          version: 2,
          idempotentReplay: true,
        },
        error: null,
      });
    const db = {
      from: vi.fn(() => documentQuery),
      rpc,
      storage: { from: vi.fn(() => ({ info, download, remove })) },
    };
    const repository = new SupabaseLotQualityAdminRepository(db as never);

    await expect(
      repository.confirmUpload(
        DOCUMENT_ID,
        1,
        "confirm-upload-replay-001",
        "quality-reviewer",
      ),
    ).rejects.toMatchObject({ code: "coa_upload_confirmation_rejected" });
    const replay = await repository.confirmUpload(
      DOCUMENT_ID,
      1,
      "confirm-upload-replay-001",
      "quality-reviewer",
    );

    expect(rpc).toHaveBeenCalledTimes(2);
    for (const call of rpc.mock.calls) {
      expect(call[0]).toBe("research_manage_lot_quality_document");
      expect(call[1]).toMatchObject({
        p_document_id: DOCUMENT_ID,
        p_action: "confirm_upload",
        p_tests: [],
        p_expected_version: 1,
        p_idempotency_key: "confirm-upload-replay-001",
        p_actor_id: "quality-reviewer",
      });
    }
    expect(replay).toMatchObject({ version: 2, idempotentReplay: true });
    expect(info).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
  });
});
