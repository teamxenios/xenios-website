// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InventoryLotAdmin,
  LotQualityDocumentAdmin,
  LotQualityTestAdmin,
  LotQualityTestKey,
} from "@shared/research/inventory-admin";

const mocks = vi.hoisted(() => ({
  listLots: vi.fn(),
  listDocuments: vi.fn(),
  review: vi.fn(),
  prepare: vi.fn(),
  upload: vi.fn(),
  confirm: vi.fn(),
  access: vi.fn(),
  digest: vi.fn(),
}));

vi.mock("../../adapters/inventory-admin", () => ({
  listInventoryLots: mocks.listLots,
  listLotQualityDocuments: mocks.listDocuments,
  reviewLotQualityDocument: mocks.review,
  prepareCoaUpload: mocks.prepare,
  putPrivateCoaFile: mocks.upload,
  confirmCoaUpload: mocks.confirm,
  requestCoaReadGrant: mocks.access,
  sha256Hex: mocks.digest,
}));

import { LotCoasBody } from "./LotCoasAdmin";

const TEST_KEYS: LotQualityTestKey[] = [
  "identity",
  "assay",
  "purity",
  "sterility",
  "endotoxin",
  "particulate",
  "residual_solvents",
  "elemental_impurities",
  "chain_of_custody",
];

function tests(prefix: string): LotQualityTestAdmin[] {
  return TEST_KEYS.map((testKey) => ({
    testKey,
    state: testKey === "identity" ? "under_review" : "not_provided",
    method: testKey === "identity" ? `${prefix}-method` : null,
    result: testKey === "identity" ? `${prefix}-result` : null,
    unit: null,
    reviewedBy: null,
    reviewedAt: null,
  }));
}

function qualityDocument(
  id: string,
  lotCode: string,
  prefix: string,
): LotQualityDocumentAdmin {
  return {
    id,
    lotId: `50000000-0000-4000-8000-${id.slice(-12)}`,
    lotCode,
    sku: `${prefix}-SKU`,
    documentState: "pending",
    verificationState: "pending",
    originalFilename: `${prefix}.pdf`,
    contentType: "application/pdf",
    sizeBytes: 100,
    reportIssuer: "Verified Lab",
    reportNumber: `${prefix}-REPORT`,
    reportDate: "2026-07-26",
    reviewedAt: null,
    reviewedBy: null,
    publishedAt: null,
    publishedBy: null,
    version: 2,
    tests: tests(prefix),
  };
}

const documentA = qualityDocument(
  "60000000-0000-4000-8000-000000000001",
  "LOT-A",
  "A",
);
const documentB = qualityDocument(
  "60000000-0000-4000-8000-000000000002",
  "LOT-B",
  "B",
);
const lots: InventoryLotAdmin[] = [documentA, documentB].map((item) => ({
  id: item.lotId,
  lotCode: item.lotCode,
  sku: item.sku,
  productId: "30000000-0000-4000-8000-000000000001",
  variantId: "40000000-0000-4000-8000-000000000001",
  owner: "xenios",
  disposition: "quarantined",
  storageLocation: "A-01",
  supplierReference: "SUPPLIER-001",
  manufacturedDate: null,
  expiryDate: "2027-07-26",
  retestDate: null,
  quantityReceived: 0,
  quantityAvailable: 0,
  quantityReserved: 0,
  quantityQuarantined: 0,
  quantityDamaged: 0,
  version: 1,
  allocatable: false,
  updatedAt: "2026-07-26T00:00:00.000Z",
}));

let host: HTMLDivElement;
let root: Root | null;

async function renderPage() {
  await act(async () => {
    root = createRoot(host);
    root.render(<LotCoasBody token="admin-token" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = null;
  mocks.listLots.mockResolvedValue({
    kind: "ok",
    data: { ok: true, lots: structuredClone(lots) },
  });
  mocks.listDocuments.mockResolvedValue({
    kind: "ok",
    data: {
      ok: true,
      documents: structuredClone([documentA, documentB]),
    },
  });
  mocks.review.mockResolvedValue({
    kind: "ok",
    data: { ok: true, result: { version: 3 } },
  });
  vi.stubGlobal("crypto", {
    ...globalThis.crypto,
    randomUUID: vi.fn(() => "70000000-0000-4000-8000-000000000001"),
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Website 4 exact-lot COA editor isolation", () => {
  it("discards A DOM edits when B is selected and submits only B values", async () => {
    await renderPage();
    const recordButtons = Array.from(host.querySelectorAll<HTMLButtonElement>(
      'button[aria-pressed]',
    ));
    const buttonA = recordButtons.find((button) => button.textContent?.includes("LOT-A"));
    const buttonB = recordButtons.find((button) => button.textContent?.includes("LOT-B"));
    if (!buttonA || !buttonB) throw new Error("quality record controls missing");

    act(() => buttonA.click());
    await flush();
    const aResult = host.querySelector<HTMLInputElement>(
      'input[name="identity.result"]',
    );
    if (!aResult) throw new Error("A identity result missing");
    expect(aResult.value).toBe("A-result");
    aResult.value = "A-edited-in-the-DOM";

    act(() => buttonB.click());
    await flush();
    const bResult = host.querySelector<HTMLInputElement>(
      'input[name="identity.result"]',
    );
    const bMethod = host.querySelector<HTMLInputElement>(
      'input[name="identity.method"]',
    );
    expect(bResult?.value).toBe("B-result");
    expect(bMethod?.value).toBe("B-method");

    const reviewForm = bResult?.closest("form");
    if (!reviewForm) throw new Error("B review form missing");
    const reason = reviewForm.elements.namedItem("reason");
    if (!(reason instanceof HTMLTextAreaElement)) throw new Error("reason missing");
    reason.value = "Review document B only";
    await act(async () => {
      reviewForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.review).toHaveBeenCalledWith(
      "admin-token",
      documentB.id,
      expect.objectContaining({
        expectedVersion: 2,
        reason: "Review document B only",
        tests: expect.arrayContaining([
          expect.objectContaining({
            testKey: "identity",
            method: "B-method",
            result: "B-result",
          }),
        ]),
      }),
    );
    expect(JSON.stringify(mocks.review.mock.calls[0])).not.toContain(
      "A-edited-in-the-DOM",
    );
  });
});
