import { describe, expect, it } from "vitest";
import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import {
  ASSISTED_ORDER_DRAFT_KEY,
  attemptOwnsStoredDraft,
  clearAssistedOrderDraft,
  draftSelectionMap,
  probeAssistedOrderDraft,
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

  // Doc96 QL-11: the attempt's frozen acceptedAt and its state travel beside
  // the idempotency key, so a retry or a refresh replays the SAME attempt.
  describe("attempt identity (frozen acceptedAt and attempt state)", () => {
    const stampedSelections = () => addOrUpdateSelection(new Map(), item, 2);

    it("round-trips the frozen acceptedAt and attempt state beside the key", () => {
      const storage = fakeStorage();
      storeAssistedOrderDraft(
        {
          idempotencyKey: "key-1",
          acceptedAt: "2026-10-12T12:00:00.000Z",
          attemptState: "uncertain",
          step: "review",
          selections: stampedSelections(),
          generalNotes: "",
        },
        storage,
      );
      const draft = readAssistedOrderDraft(storage)!;
      expect(draft.idempotencyKey).toBe("key-1");
      expect(draft.acceptedAt).toBe("2026-10-12T12:00:00.000Z");
      expect(draft.attemptState).toBe("uncertain");
      expect(draft.step).toBe("review");
    });

    it("reads a draft written before attempt identity existed as not stamped and none", () => {
      const storage = fakeStorage();
      storage.setItem(
        ASSISTED_ORDER_DRAFT_KEY,
        JSON.stringify({
          idempotencyKey: "k",
          step: "contact",
          selections: [{ item, quantity: 2, notes: "" }],
          generalNotes: "",
          savedAt: "2026-08-20T00:00:00.000Z",
        }),
      );
      const draft = readAssistedOrderDraft(storage)!;
      expect(draft.idempotencyKey).toBe("k");
      expect(draft.acceptedAt).toBeNull();
      expect(draft.attemptState).toBe("none");
    });

    it("stores the not-stamped defaults when a caller omits the attempt identity", () => {
      const storage = fakeStorage();
      storeAssistedOrderDraft(
        { idempotencyKey: "key-1", step: "products", selections: stampedSelections(), generalNotes: "" },
        storage,
      );
      const raw = JSON.parse(storage.getItem(ASSISTED_ORDER_DRAFT_KEY)!) as Record<string, unknown>;
      expect(raw.acceptedAt).toBeNull();
      expect(raw.attemptState).toBe("none");
      expect(readAssistedOrderDraft(storage)).toMatchObject({ acceptedAt: null, attemptState: "none" });
    });

    it("recovers a foreign attempt state and an unusable acceptedAt to the safe values", () => {
      const storage = fakeStorage();
      const base = {
        idempotencyKey: "k",
        step: "review",
        selections: [{ item, quantity: 2, notes: "" }],
        generalNotes: "",
      };
      const corrupt: readonly (readonly [unknown, unknown])[] = [
        ["garbage", 12345],
        ["none", ""],
        [true, null],
        ["UNCERTAIN", "x".repeat(61)],
        ["IN_FLIGHT", 42],
        [null, undefined],
      ];
      for (const [attemptState, acceptedAt] of corrupt) {
        storage.setItem(ASSISTED_ORDER_DRAFT_KEY, JSON.stringify({ ...base, attemptState, acceptedAt }));
        const draft = readAssistedOrderDraft(storage)!;
        expect(draft).not.toBeNull();
        expect(draft.attemptState).toBe("none");
        expect(draft.acceptedAt).toBeNull();
      }
      // Exactly the server's 60-character bound still reads back intact.
      storage.setItem(
        ASSISTED_ORDER_DRAFT_KEY,
        JSON.stringify({ ...base, attemptState: "uncertain", acceptedAt: "t".repeat(60) }),
      );
      expect(readAssistedOrderDraft(storage)).toMatchObject({
        attemptState: "uncertain",
        acceptedAt: "t".repeat(60),
      });
    });

    it("persists no contact fields beside the attempt identity", () => {
      const storage = fakeStorage();
      storeAssistedOrderDraft(
        {
          idempotencyKey: "key-1",
          acceptedAt: "2026-10-12T12:00:00.000Z",
          attemptState: "uncertain",
          step: "review",
          selections: stampedSelections(),
          generalNotes: "",
        },
        storage,
      );
      const raw = storage.getItem(ASSISTED_ORDER_DRAFT_KEY)!;
      for (const field of ["fullLegalName", "email", "mobilePhone", "line1", "postalCode", "billing"]) {
        expect(raw).not.toContain(field);
      }
    });

    it("clears the attempt identity with the draft, on demand and under the sign-out sweep", () => {
      const storage = fakeStorage();
      const stamped = {
        idempotencyKey: "key-1",
        acceptedAt: "2026-10-12T12:00:00.000Z",
        attemptState: "uncertain" as const,
        step: "review" as const,
        selections: stampedSelections(),
        generalNotes: "",
      };
      storeAssistedOrderDraft(stamped, storage);
      clearAssistedOrderDraft(storage);
      expect(readAssistedOrderDraft(storage)).toBeNull();

      storeAssistedOrderDraft(stamped, storage);
      clearAssistedOrderStorage(storage);
      expect(readAssistedOrderDraft(storage)).toBeNull();
      expect(storage.length).toBe(0);
    });

    // Doc99 QL2-1. The wizard writes "in_flight" just before a POST. A page
    // lost while it is set cannot know whether the request committed, so the
    // reader reports the restored attempt as uncertain, never as clean.
    it("stores the in-flight marker and reads it back as uncertain", () => {
      const storage = fakeStorage();
      storeAssistedOrderDraft(
        {
          idempotencyKey: "key-1",
          acceptedAt: "2026-10-12T12:00:00.000Z",
          attemptState: "in_flight",
          step: "review",
          selections: stampedSelections(),
          generalNotes: "",
        },
        storage,
      );
      const raw = JSON.parse(storage.getItem(ASSISTED_ORDER_DRAFT_KEY)!) as Record<string, unknown>;
      expect(raw.attemptState).toBe("in_flight");
      expect(readAssistedOrderDraft(storage)).toMatchObject({
        idempotencyKey: "key-1",
        acceptedAt: "2026-10-12T12:00:00.000Z",
        attemptState: "uncertain",
      });
    });

    it("keeps the frozen stamp beside an in-flight marker, so a restored retry replays the same attempt", () => {
      const storage = fakeStorage();
      storeAssistedOrderDraft(
        {
          idempotencyKey: "key-2",
          acceptedAt: "t".repeat(60),
          attemptState: "in_flight",
          step: "contact",
          selections: stampedSelections(),
          generalNotes: "note",
        },
        storage,
      );
      const draft = readAssistedOrderDraft(storage)!;
      expect(draft.acceptedAt).toBe("t".repeat(60));
      expect(draft.attemptState).toBe("uncertain");
      expect(draft.step).toBe("contact");
      expect(draft.generalNotes).toBe("note");
    });
  });
});

describe("storage probe and attempt ownership (Doc99 QL2-1 follow-up)", () => {
  const selections = () => addOrUpdateSelection(new Map(), item, 2);

  it("keeps unavailable, absent and present apart", () => {
    expect(probeAssistedOrderDraft(null)).toEqual({ kind: "unavailable" });

    const denied = fakeStorage();
    denied.getItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(probeAssistedOrderDraft(denied)).toEqual({ kind: "unavailable" });

    const empty = fakeStorage();
    expect(probeAssistedOrderDraft(empty)).toEqual({ kind: "absent" });
    empty.setItem(ASSISTED_ORDER_DRAFT_KEY, "{not json");
    expect(probeAssistedOrderDraft(empty)).toEqual({ kind: "absent" });

    const stored = fakeStorage();
    storeAssistedOrderDraft(
      {
        idempotencyKey: "key-1",
        acceptedAt: "2026-10-12T12:00:00.000Z",
        attemptState: "in_flight",
        step: "review",
        selections: selections(),
        generalNotes: "",
      },
      stored,
    );
    const probe = probeAssistedOrderDraft(stored);
    expect(probe.kind).toBe("present");
    if (probe.kind === "present") {
      expect(probe.draft).toMatchObject({
        idempotencyKey: "key-1",
        acceptedAt: "2026-10-12T12:00:00.000Z",
        attemptState: "uncertain",
      });
    }
  });

  it("reports whether a store succeeded", () => {
    const draft = { idempotencyKey: "key-1", step: "products" as const, selections: selections(), generalNotes: "" };
    expect(storeAssistedOrderDraft(draft, fakeStorage())).toBe(true);
    expect(storeAssistedOrderDraft(draft, null)).toBe(false);
    const full = fakeStorage();
    full.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    expect(storeAssistedOrderDraft(draft, full)).toBe(false);
  });

  it("judges ownership by key and stamp, by emptiness after a store, and by reachability", () => {
    const stored = fakeStorage();
    storeAssistedOrderDraft(
      {
        idempotencyKey: "key-1",
        acceptedAt: "stamp-1",
        attemptState: "in_flight",
        step: "review",
        selections: selections(),
        generalNotes: "",
      },
      stored,
    );
    const present = probeAssistedOrderDraft(stored);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: "stamp-1" }, true, present)).toBe(true);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: "stamp-2" }, true, present)).toBe(false);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: null }, true, present)).toBe(false);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-2", acceptedAt: "stamp-1" }, true, present)).toBe(false);

    const absent = probeAssistedOrderDraft(fakeStorage());
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: null }, false, absent)).toBe(true);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: null }, true, absent)).toBe(false);

    const unavailable = probeAssistedOrderDraft(null);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: "stamp-1" }, true, unavailable)).toBe(true);
    expect(attemptOwnsStoredDraft({ idempotencyKey: "key-1", acceptedAt: "stamp-1" }, false, unavailable)).toBe(true);
  });
});
