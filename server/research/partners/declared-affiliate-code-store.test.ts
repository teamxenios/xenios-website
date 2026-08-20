// The declared-code store. The decisive property: a storage fault is reported
// as an absence, never as a throw into the submit path and never as a
// fabricated code.

import { describe, expect, it } from "vitest";
import {
  createInMemoryDeclaredAffiliateCodeStore,
  declaredAffiliateCodeFor,
  declaredCodeRowToEvent,
  recordDeclaredAffiliateCode,
  type AsyncDeclaredAffiliateCodeStore,
} from "./declared-affiliate-code-store";
import type { DeclaredAffiliateCodeEvent } from "./declared-affiliate-code";

const REQUEST = "XRR-20260820-REF00001";
const AT = new Date("2026-08-20T12:00:00.000Z");

const exploding: AsyncDeclaredAffiliateCodeStore = {
  async append() {
    throw new Error("insert failed");
  },
  async eventsFor() {
    throw new Error("read failed");
  },
};

describe("recordDeclaredAffiliateCode", () => {
  it("records a usable claim and projects it for admin", async () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    await expect(
      recordDeclaredAffiliateCode(store, REQUEST, "xen-101", AT),
    ).resolves.toBe(true);
    await expect(declaredAffiliateCodeFor(store, REQUEST)).resolves.toMatchObject({
      state: "captured_unmatched",
      rawCode: "xen-101",
      matchKey: "XEN101",
    });
  });

  it("records nothing for an empty field", async () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    await expect(recordDeclaredAffiliateCode(store, REQUEST, "  ", AT)).resolves.toBe(
      false,
    );
    await expect(declaredAffiliateCodeFor(store, REQUEST)).resolves.toMatchObject({
      state: "not_provided",
    });
  });

  it("never throws when the store is down, and claims nothing", async () => {
    await expect(
      recordDeclaredAffiliateCode(exploding, REQUEST, "xen-101", AT),
    ).resolves.toBe(false);
  });

  it("answers the empty projection when the store cannot be read", async () => {
    await expect(declaredAffiliateCodeFor(exploding, REQUEST)).resolves.toMatchObject({
      state: "not_provided",
      rawCode: null,
    });
  });

  it("keeps the first claim when a submit replays", async () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    await recordDeclaredAffiliateCode(store, REQUEST, "xen-101", AT);
    await recordDeclaredAffiliateCode(store, REQUEST, "someone-else", AT);
    await expect(declaredAffiliateCodeFor(store, REQUEST)).resolves.toMatchObject({
      rawCode: "xen-101",
    });
  });

  it("scopes reads to the exact request", async () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    await recordDeclaredAffiliateCode(store, REQUEST, "xen-101", AT);
    await expect(
      declaredAffiliateCodeFor(store, "XRR-20260820-REF99999"),
    ).resolves.toMatchObject({ state: "not_provided" });
  });

  it("stores no value for an address-shaped entry, only that one arrived", async () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    await expect(
      recordDeclaredAffiliateCode(store, REQUEST, "jane@example.com", AT),
    ).resolves.toBe(true);
    const projection = await declaredAffiliateCodeFor(store, REQUEST);
    expect(projection).toMatchObject({
      state: "invalid_ignored",
      rawCode: null,
      invalidReason: "address_shaped",
    });
    expect(JSON.stringify(projection)).not.toContain("example.com");
  });
});

describe("the store seam", () => {
  it("exposes append and read only — no update or delete path exists", () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    expect(Object.keys(store).sort()).toEqual(["append", "eventsFor"]);
  });

  it("supports the manual match and its correction by appending", async () => {
    const store = createInMemoryDeclaredAffiliateCodeStore();
    await recordDeclaredAffiliateCode(store, REQUEST, "xen-101", AT);
    const matched: DeclaredAffiliateCodeEvent = {
      kind: "matched",
      requestRef: REQUEST,
      partnerId: "partner-1",
      matchedByAdminId: "admin-7",
      note: null,
      occurredAt: "2026-08-21T09:00:00.000Z",
    };
    await store.append(matched);
    await expect(declaredAffiliateCodeFor(store, REQUEST)).resolves.toMatchObject({
      state: "matched_manual",
      matchedPartnerId: "partner-1",
    });

    await store.append({
      kind: "match_cleared",
      requestRef: REQUEST,
      clearedByAdminId: "admin-9",
      note: "wrong partner",
      occurredAt: "2026-08-22T09:00:00.000Z",
    });
    await expect(declaredAffiliateCodeFor(store, REQUEST)).resolves.toMatchObject({
      state: "captured_unmatched",
      matchedPartnerId: null,
    });
  });
});

describe("declaredCodeRowToEvent", () => {
  const capturedRow = {
    request_ref: REQUEST,
    kind: "captured",
    raw_code: "xen-101",
    match_key: "XEN101",
    invalid_reason: null,
    partner_id: null,
    actor_admin_id: null,
    note: null,
    occurred_at: AT.toISOString(),
  };

  it("maps a well-formed capture row", () => {
    expect(declaredCodeRowToEvent(capturedRow)).toMatchObject({
      kind: "captured",
      rawCode: "xen-101",
      matchKey: "XEN101",
    });
  });

  it("drops a row of an unknown kind rather than trusting it", () => {
    expect(declaredCodeRowToEvent({ ...capturedRow, kind: "surprise" })).toBeNull();
  });

  it("drops a capture row that is neither a usable claim nor a clean refusal", () => {
    expect(
      declaredCodeRowToEvent({ ...capturedRow, raw_code: "xen-101", match_key: null }),
    ).toBeNull();
    expect(
      declaredCodeRowToEvent({
        ...capturedRow,
        raw_code: null,
        match_key: null,
        invalid_reason: null,
      }),
    ).toBeNull();
  });

  it("drops a capture row carrying an unknown invalid reason", () => {
    expect(
      declaredCodeRowToEvent({
        ...capturedRow,
        raw_code: null,
        match_key: null,
        invalid_reason: "something_new",
      }),
    ).toBeNull();
  });

  it("drops a match row that does not name both a partner and an admin", () => {
    const matchedRow = { ...capturedRow, kind: "matched", raw_code: null, match_key: null };
    expect(
      declaredCodeRowToEvent({ ...matchedRow, partner_id: "p1", actor_admin_id: null }),
    ).toBeNull();
    expect(
      declaredCodeRowToEvent({ ...matchedRow, partner_id: null, actor_admin_id: "a1" }),
    ).toBeNull();
    expect(
      declaredCodeRowToEvent({ ...matchedRow, partner_id: "p1", actor_admin_id: "a1" }),
    ).toMatchObject({ kind: "matched", partnerId: "p1", matchedByAdminId: "a1" });
  });
});
