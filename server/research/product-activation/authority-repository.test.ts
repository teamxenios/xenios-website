import { describe, expect, it, vi } from "vitest";

import {
  canonicalProductVariantActivationFingerprint,
  canonicalProductVariantActivationPayload,
  isResolvedCurrentLiveProductVariantActivationAuthority,
  resolveCurrentProductVariantActivationBinding,
  resolveCurrentProductVariantActivationAuthority,
  resolveProductVariantActivationAuthorityForTest,
  type ProductVariantActivationBinding,
  type ProductVariantActivationBindingRepository,
  type ProductVariantActivationLedgerRecord,
  type ProductVariantActivationLedgerRepository,
} from "./authority-repository";

const AT = "2026-08-28T04:00:00.000Z";
const EXACT = {
  productId: "product-a",
  variantId: "variant-a",
  sku: "SKU-A",
  evaluatedAt: AT,
} as const;

function record(
  overrides: Partial<Omit<ProductVariantActivationLedgerRecord, "evidenceFingerprint">> = {},
): ProductVariantActivationLedgerRecord {
  const unsigned = {
    schemaVersion: 1 as const,
    ledgerRevision: 42,
    productId: EXACT.productId,
    variantId: EXACT.variantId,
    sku: EXACT.sku,
    productState: "live" as const,
    variantState: "live" as const,
    approvalId: "11111111-1111-4111-8111-111111111111",
    approvedByActorId: "22222222-2222-4222-8222-222222222222",
    approvedByRole: "founder" as const,
    approvedAt: "2026-08-20T00:00:00.000Z",
    reviewedAt: "2026-08-21T00:00:00.000Z",
    validFrom: "2026-08-22T00:00:00.000Z",
    validThrough: "2026-09-22T00:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
  return {
    ...unsigned,
    evidenceFingerprint: canonicalProductVariantActivationFingerprint(unsigned),
  };
}

describe("durable product+variant activation authority", () => {
  it("recomputes a canonical revision-bound fingerprint and seals only its own live result", () => {
    const row = record();
    expect(canonicalProductVariantActivationPayload(row)).toContain('"SKU-A"');
    const evidence = resolveProductVariantActivationAuthorityForTest(
      { readCurrentCandidates: () => [row] },
      EXACT,
    );
    expect(evidence).toMatchObject({
      state: "live",
      productId: EXACT.productId,
      variantId: EXACT.variantId,
      sku: EXACT.sku,
      ledgerRevision: 42,
      evidenceFingerprint: row.evidenceFingerprint,
    });
    expect(
      isResolvedCurrentLiveProductVariantActivationAuthority(evidence, EXACT),
    ).toBe(true);

    // A copied/deserialized certificate has identical fields but no resolver
    // provenance. Shape alone can never recreate authority.
    const copied = { ...evidence };
    expect(
      isResolvedCurrentLiveProductVariantActivationAuthority(copied, EXACT),
    ).toBe(false);

    const nextRevision = record({ ledgerRevision: 43 });
    expect(nextRevision.evidenceFingerprint).not.toBe(row.evidenceFingerprint);
  });

  it("fails closed for every non-live, stale, revoked, ambiguous, mismatched, and conflicting case", () => {
    const cases = [
      { label: "missing", rows: [], state: "unavailable" },
      {
        label: "held product",
        rows: [record({ productState: "held" })],
        state: "held",
      },
      {
        label: "pending variant",
        rows: [record({ variantState: "pending" })],
        state: "pending",
      },
      {
        label: "retired variant",
        rows: [record({ variantState: "retired" })],
        state: "retired",
      },
      {
        label: "revoked",
        rows: [record({ revokedAt: "2026-08-27T00:00:00.000Z" })],
        state: "revoked",
      },
      {
        label: "stale",
        rows: [record({ validThrough: AT })],
        state: "stale",
      },
      {
        label: "ambiguous",
        rows: [record(), record({ ledgerRevision: 43 })],
        state: "ambiguous",
      },
      {
        label: "identity mismatch",
        rows: [record({ variantId: "variant-other" })],
        state: "conflicting",
      },
      {
        label: "fingerprint conflict",
        rows: [{ ...record(), evidenceFingerprint: `sha256:${"0".repeat(64)}` }],
        state: "conflicting",
      },
    ] as const;

    for (const testCase of cases) {
      expect(
        resolveProductVariantActivationAuthorityForTest(
          { readCurrentCandidates: () => testCase.rows },
          EXACT,
        ).state,
        testCase.label,
      ).toBe(testCase.state);
    }
  });

  it("performs a fresh repository read every time and turns read failures into unavailable", async () => {
    let rows: readonly ProductVariantActivationLedgerRecord[] = [record()];
    const repository: ProductVariantActivationLedgerRepository = {
      readCurrentCandidates: vi.fn(async () => rows),
    };
    expect(
      (await resolveCurrentProductVariantActivationAuthority(repository, EXACT)).state,
    ).toBe("live");
    rows = [record({ revokedAt: "2026-08-27T00:00:00.000Z" })];
    expect(
      (await resolveCurrentProductVariantActivationAuthority(repository, EXACT)).state,
    ).toBe("revoked");
    expect(repository.readCurrentCandidates).toHaveBeenCalledTimes(2);

    const throwing: ProductVariantActivationLedgerRepository = {
      readCurrentCandidates: async () => {
        throw new Error("ledger unavailable");
      },
    };
    expect(
      (await resolveCurrentProductVariantActivationAuthority(throwing, EXACT)).state,
    ).toBe("unavailable");
  });
});

describe("durable SKU to exact product+variant binding", () => {
  const exactBinding: ProductVariantActivationBinding = {
    productId: EXACT.productId,
    variantId: EXACT.variantId,
    sku: EXACT.sku,
  };

  it("returns only an exact-one current binding from a fresh repository read", async () => {
    const repository: ProductVariantActivationBindingRepository = {
      readCurrentBindings: vi.fn(async () => [exactBinding]),
    };
    await expect(
      resolveCurrentProductVariantActivationBinding(repository, {
        sku: EXACT.sku,
        evaluatedAt: EXACT.evaluatedAt,
      }),
    ).resolves.toEqual(exactBinding);
    expect(repository.readCurrentBindings).toHaveBeenCalledWith({
      sku: EXACT.sku,
      evaluatedAt: EXACT.evaluatedAt,
    });
  });

  it("rejects missing, duplicate, malformed, mismatched, and failed binding reads", async () => {
    const cases: Array<{
      label: string;
      rows: readonly ProductVariantActivationBinding[];
    }> = [
      { label: "missing", rows: [] },
      { label: "duplicate", rows: [exactBinding, { ...exactBinding }] },
      {
        label: "blank product",
        rows: [{ ...exactBinding, productId: " " }],
      },
      {
        label: "blank variant",
        rows: [{ ...exactBinding, variantId: "" }],
      },
      {
        label: "SKU mismatch",
        rows: [{ ...exactBinding, sku: "SKU-OTHER" }],
      },
    ];
    for (const testCase of cases) {
      await expect(
        resolveCurrentProductVariantActivationBinding(
          { readCurrentBindings: async () => testCase.rows },
          { sku: EXACT.sku, evaluatedAt: EXACT.evaluatedAt },
        ),
        testCase.label,
      ).resolves.toBeNull();
    }

    await expect(
      resolveCurrentProductVariantActivationBinding(
        {
          readCurrentBindings: async () => {
            throw new Error("binding repository unavailable");
          },
        },
        { sku: EXACT.sku, evaluatedAt: EXACT.evaluatedAt },
      ),
    ).resolves.toBeNull();
  });
});
