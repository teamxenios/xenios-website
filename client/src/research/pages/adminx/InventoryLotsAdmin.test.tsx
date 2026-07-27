// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryLotAdmin } from "@shared/research/inventory-admin";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  movement: vi.fn(),
  disposition: vi.fn(),
}));

vi.mock("../../adapters/inventory-admin", () => ({
  listInventoryLots: mocks.list,
  createInventoryLot: mocks.create,
  applyInventoryMovement: mocks.movement,
  setInventoryLotDisposition: mocks.disposition,
}));

import { InventoryLotsBody } from "./InventoryLotsAdmin";

const LOT_ID = "50000000-0000-4000-8000-000000000001";

function lot(overrides: Partial<InventoryLotAdmin> = {}): InventoryLotAdmin {
  return {
    id: LOT_ID,
    lotCode: "LOT-001",
    sku: "SKU-001",
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
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let host: HTMLDivElement;
let root: Root | null;
let lots: InventoryLotAdmin[];

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderPage() {
  await act(async () => {
    root = createRoot(host);
    root.render(<InventoryLotsBody token="admin-token" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  form: HTMLFormElement,
  name: string,
): T {
  const control = form.elements.namedItem(name);
  if (!(control instanceof HTMLElement)) throw new Error(`${name} missing`);
  return control as T;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = null;
  lots = [];
  mocks.list.mockImplementation(async () => ({
    kind: "ok",
    data: { ok: true, lots: structuredClone(lots) },
  }));
  mocks.disposition.mockResolvedValue({
    kind: "ok",
    data: { ok: true, result: {} },
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

describe("Website 4 inventory form completion", () => {
  it("retains the create form across await, resets it, selects the lot, and reloads", async () => {
    const pending = deferred<{
      kind: "ok";
      data: { ok: true; lot: InventoryLotAdmin };
    }>();
    mocks.create.mockReturnValue(pending.promise);
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    await renderPage();

    const createButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Create quarantined lot"),
    );
    const form = createButton?.closest("form");
    if (!form) throw new Error("create form missing");
    field<HTMLInputElement>(form, "lotCode").value = "LOT-001";
    field<HTMLInputElement>(form, "sku").value = "SKU-001";
    field<HTMLInputElement>(form, "productId").value =
      "30000000-0000-4000-8000-000000000001";
    field<HTMLInputElement>(form, "variantId").value =
      "40000000-0000-4000-8000-000000000001";
    field<HTMLInputElement>(form, "storageLocation").value = "A-01";
    field<HTMLInputElement>(form, "supplierReference").value = "SUPPLIER-001";
    field<HTMLInputElement>(form, "expiryDate").value = "2027-07-26";

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    lots = [lot()];
    await act(async () => {
      pending.resolve({ kind: "ok", data: { ok: true, lot: lot() } });
      await pending.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(unhandled).not.toHaveBeenCalled();
    expect(field<HTMLInputElement>(form, "lotCode").value).toBe("");
    expect(host.textContent).toContain("Lot created in quarantine");
    expect(host.textContent).toContain("Selected: LOT-001, version 1.");
    expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
    window.removeEventListener("unhandledrejection", unhandled);
  });

  it("retains the movement form across await, resets it, reports success, and reloads", async () => {
    lots = [lot()];
    const pending = deferred<{
      kind: "ok";
      data: { ok: true; result: Record<string, unknown> };
    }>();
    mocks.movement.mockReturnValue(pending.promise);
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    await renderPage();

    const lotButton = host.querySelector<HTMLButtonElement>('[role="listitem"]');
    if (!lotButton) throw new Error("lot selector missing");
    act(() => lotButton.click());
    await flush();

    const movementButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Record movement"),
    );
    const form = movementButton?.closest("form");
    if (!form) throw new Error("movement form missing");
    field<HTMLInputElement>(form, "quantity").value = "10";
    field<HTMLTextAreaElement>(form, "reason").value = "Verified receipt";

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    lots = [lot({ quantityReceived: 10, quantityQuarantined: 10, version: 2 })];
    await act(async () => {
      pending.resolve({ kind: "ok", data: { ok: true, result: { version: 2 } } });
      await pending.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(unhandled).not.toHaveBeenCalled();
    expect(field<HTMLInputElement>(form, "quantity").value).toBe("");
    expect(field<HTMLTextAreaElement>(form, "reason").value).toBe("");
    expect(host.textContent).toContain("Movement recorded");
    expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
    window.removeEventListener("unhandledrejection", unhandled);
  });
});
