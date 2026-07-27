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
  cancel: vi.fn(),
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
  cancelCoaUpload: mocks.cancel,
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

function populateUploadForm() {
  const fileInput = host.querySelector<HTMLInputElement>('input[name="file"]');
  const form = fileInput?.closest("form");
  if (!fileInput || !form) throw new Error("upload form missing");
  const file = new File(["%PDF-1.7 retry"], "retry report.pdf", {
    type: "application/pdf",
  });
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [file],
  });
  const values: Record<string, string> = {
    lotId: lots[0].id,
    reportIssuer: "Verified Lab",
    reportNumber: "REPORT-RETRY",
    reportDate: "2026-07-27",
  };
  for (const [name, value] of Object.entries(values)) {
    const control = form.elements.namedItem(name);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      throw new Error(`${name} missing`);
    }
    control.value = value;
  }
  return { form, fileInput };
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
  mocks.digest.mockResolvedValue("a".repeat(64));
  mocks.cancel.mockResolvedValue({
    kind: "ok",
    data: { ok: true, result: { version: 2 } },
  });
  mocks.upload.mockResolvedValue(true);
  mocks.confirm.mockResolvedValue({
    kind: "ok",
    data: { ok: true, result: { version: 2 } },
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

  it("reuses one metadata-bound preparation after grant and PUT failures", async () => {
    vi.mocked(crypto.randomUUID)
      .mockReset()
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000010")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000011")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000012");
    const upload = {
      documentId: "60000000-0000-4000-8000-000000000010",
      documentVersion: 1,
      storageKey: "lots/50000000-0000-4000-8000-000000000001/retry.pdf",
      uploadRequired: true,
      uploadUrl: "https://storage.invalid/retry",
      expiresAt: "2026-07-27T01:00:00.000Z",
    };
    mocks.prepare
      .mockRejectedValueOnce(new Error("grant failed after RPC commit"))
      .mockResolvedValue({
        kind: "ok",
        data: { ok: true, upload },
      });
    mocks.upload
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await renderPage();
    const { form } = populateUploadForm();
    await submit(form);
    expect(host.textContent).toContain("Retry private COA upload");

    await submit(form);
    expect(host.textContent).toContain("Retry private COA upload");

    await submit(form);

    expect(mocks.prepare).toHaveBeenCalledTimes(3);
    const preparationKeys = mocks.prepare.mock.calls.map(
      (call) => call[1].idempotencyKey,
    );
    expect(new Set(preparationKeys)).toEqual(
      new Set(["70000000-0000-4000-8000-000000000010"]),
    );
    expect(mocks.confirm).toHaveBeenCalledWith(
      "admin-token",
      upload.documentId,
      {
        expectedVersion: 1,
        idempotencyKey: "70000000-0000-4000-8000-000000000011",
      },
    );
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Private COA object verified.");
    expect(mocks.listDocuments).toHaveBeenCalledTimes(2);
  });

  it("replays confirmation with the original version and skips a duplicate PUT", async () => {
    vi.mocked(crypto.randomUUID)
      .mockReset()
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000030")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000031")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000032");
    const identity = {
      documentId: "60000000-0000-4000-8000-000000000030",
      storageKey: "lots/50000000-0000-4000-8000-000000000001/confirm-replay.pdf",
    };
    mocks.prepare
      .mockResolvedValueOnce({
        kind: "ok",
        data: {
          ok: true,
          upload: {
            ...identity,
            documentVersion: 1,
            uploadRequired: true,
            uploadUrl: "https://storage.invalid/confirm-replay",
            expiresAt: "2026-07-27T01:00:00.000Z",
          },
        },
      })
      .mockResolvedValueOnce({
        kind: "ok",
        data: {
          ok: true,
          upload: {
            ...identity,
            documentVersion: 2,
            uploadRequired: false,
            uploadUrl: null,
            expiresAt: null,
          },
        },
      });
    mocks.confirm
      .mockResolvedValueOnce({
        kind: "error",
        message: "confirmation response lost after commit",
      })
      .mockResolvedValueOnce({
        kind: "ok",
        data: { ok: true, result: { version: 2, idempotentReplay: true } },
      });

    await renderPage();
    const { form } = populateUploadForm();
    await submit(form);
    expect(host.textContent).toContain("Retry private COA upload");
    await submit(form);

    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.prepare.mock.calls[1]?.[1].idempotencyKey).toBe(
      mocks.prepare.mock.calls[0]?.[1].idempotencyKey,
    );
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    for (const call of mocks.confirm.mock.calls) {
      expect(call).toEqual([
        "admin-token",
        identity.documentId,
        {
          expectedVersion: 1,
          idempotencyKey: "70000000-0000-4000-8000-000000000031",
        },
      ]);
    }
    expect(host.textContent).toContain("Private COA object verified.");
  });

  it("starts a new preparation when normalized upload metadata changes", async () => {
    vi.mocked(crypto.randomUUID)
      .mockReset()
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000020")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000021")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000022")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000023")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000024")
      .mockReturnValueOnce("70000000-0000-4000-8000-000000000025");
    mocks.prepare
      .mockRejectedValueOnce(new Error("grant failed after RPC commit"))
      .mockResolvedValueOnce({
        kind: "ok",
        data: {
          ok: true,
          upload: {
            documentId: "60000000-0000-4000-8000-000000000020",
            documentVersion: 1,
            storageKey: "lots/50000000-0000-4000-8000-000000000001/changed.pdf",
            uploadRequired: true,
            uploadUrl: "https://storage.invalid/changed",
            expiresAt: "2026-07-27T01:00:00.000Z",
          },
        },
      });

    await renderPage();
    const { form } = populateUploadForm();
    await submit(form);

    const reportNumber = form.elements.namedItem("reportNumber");
    if (!(reportNumber instanceof HTMLInputElement)) {
      throw new Error("report number missing");
    }
    reportNumber.value = "REPORT-CHANGED";
    act(() => reportNumber.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    await submit(form);

    expect(mocks.prepare.mock.calls[0]?.[1]).toMatchObject({
      reportNumber: "REPORT-RETRY",
      idempotencyKey: "70000000-0000-4000-8000-000000000020",
    });
    expect(mocks.prepare.mock.calls[1]?.[1]).toMatchObject({
      reportNumber: "REPORT-CHANGED",
      idempotencyKey: "70000000-0000-4000-8000-000000000023",
    });
    expect(mocks.cancel).toHaveBeenCalledWith("admin-token", {
      lotId: lots[0].id,
      filename: "retry_report.pdf",
      contentType: "application/pdf",
      sizeBytes: 14,
      sha256: "a".repeat(64),
      reportIssuer: "Verified Lab",
      reportNumber: "REPORT-RETRY",
      reportDate: "2026-07-27",
      expectedVersion: 1,
      preparationIdempotencyKey: "70000000-0000-4000-8000-000000000020",
      idempotencyKey: "70000000-0000-4000-8000-000000000022",
    });
  });
});
