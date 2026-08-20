import { describe, expect, it } from "vitest";
import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import {
  ASSISTED_ORDER_DRAFT_KEY,
  clearAssistedOrderDraft,
  draftSelectionMap,
  readAssistedOrderDraft,
  storeAssistedOrderDraft,
} from "./draft-store";
import { clearAssistedOrderStorage } from "./storage";
import { addOrUpdateSelection, catalogItemKey } from "./wizard-state";

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

const item: AssistedOrderCatalogItem = {
  productId: "p1",
  variantId: "v1",
  productName: "Product",
  family: "Family",
  channel: "RUO",
  specification: "10 mg",
  format: "Vial",
  packBasis: "Per vial",
  minimumQuantity: 2,
  maximumQuantity: 100,
  quantityIncrement: 2,
  unitPriceCents: 2500,
  currency: "USD",
  workflowMode: "direct_order_request",
  actionLabel: "Add",
  accessNotice: null,
  researchUseOnly: true,
  catalogVersion: "c1",
  priceVersion: "p1",
};

describe("assisted order draft store", () => {
  it("round-trips selections, notes, step and the idempotency key", () => {
    const storage = fakeStorage();
    const selections = addOrUpdateSelection(new Map(), item, 4, "keep cold");
    storeAssistedOrderDraft(
      { idempotencyKey: "key-1", step: "contact", selections, generalNotes: "hello" },
      storage,
    );
    const draft = readAssistedOrderDraft(storage);
    expect(draft).not.toBeNull();
    expect(draft!.idempotencyKey).toBe("key-1");
    expect(draft!.step).toBe("contact");
    expect(draft!.generalNotes).toBe("hello");
    const restored = draftSelectionMap(draft!);
    const selection = restored.get(catalogItemKey(item));
    expect(selection).toMatchObject({ quantity: 4, notes: "keep cold" });
    expect(selection!.item.unitPriceCents).toBe(2500);
  });

  it("persists no contact fields at all", () => {
    const storage = fakeStorage();
    const selections = addOrUpdateSelection(new Map(), item, 2);
    storeAssistedOrderDraft(
      { idempotencyKey: "key-1", step: "review", selections, generalNotes: "" },
      storage,
    );
    const raw = storage.getItem(ASSISTED_ORDER_DRAFT_KEY)!;
    for (const field of ["fullLegalName", "email", "mobilePhone", "line1", "postalCode", "billing"]) {
      expect(raw).not.toContain(field);
    }
  });

  it("reads malformed content as no draft", () => {
    const storage = fakeStorage();
    storage.setItem(ASSISTED_ORDER_DRAFT_KEY, "{not json");
    expect(readAssistedOrderDraft(storage)).toBeNull();
    storage.setItem(ASSISTED_ORDER_DRAFT_KEY, JSON.stringify({ selections: "nope" }));
    expect(readAssistedOrderDraft(storage)).toBeNull();
    storage.setItem(
      ASSISTED_ORDER_DRAFT_KEY,
      JSON.stringify({ idempotencyKey: "k", selections: [{ item: { productId: "" } }] }),
    );
    expect(readAssistedOrderDraft(storage)).toBeNull();
  });

  it("recovers an unknown step and a broken quantity to safe values", () => {
    const storage = fakeStorage();
    storage.setItem(
      ASSISTED_ORDER_DRAFT_KEY,
      JSON.stringify({
        idempotencyKey: "k",
        step: "checkout",
        selections: [{ item, quantity: -3, notes: 7 }],
        generalNotes: 42,
      }),
    );
    const draft = readAssistedOrderDraft(storage)!;
    expect(draft.step).toBe("products");
    expect(draft.generalNotes).toBe("");
    expect(draft.selections[0]).toMatchObject({
      quantity: item.minimumQuantity,
      notes: "",
    });
  });

  it("clears on demand and under the sign-out sweep", () => {
    const storage = fakeStorage();
    const selections = addOrUpdateSelection(new Map(), item, 2);
    storeAssistedOrderDraft(
      { idempotencyKey: "key-1", step: "products", selections, generalNotes: "" },
      storage,
    );
    clearAssistedOrderDraft(storage);
    expect(readAssistedOrderDraft(storage)).toBeNull();

    storeAssistedOrderDraft(
      { idempotencyKey: "key-2", step: "products", selections, generalNotes: "" },
      storage,
    );
    // The draft key lives under the shared assisted-order prefix, so the
    // sign-out sweep removes it along with receipts and status tokens.
    clearAssistedOrderStorage(storage);
    expect(readAssistedOrderDraft(storage)).toBeNull();
    expect(storage.length).toBe(0);
  });
});
