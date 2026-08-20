// The durable customer attribution binding, proven over the real cookie
// helpers and the in-memory store — no mocks of the code under test. The
// prompt-level negatives pinned here: a spoofed or forged partner never
// binds, an invalid cookie creates no attribution, a customer cannot change
// attribution after binding, a self-referral is refused, and a store failure
// never breaks identity resolution.

import { describe, expect, it } from "vitest";
import { DEFAULT_LAUNCH_PROGRAM } from "../../../shared/research/affiliate-program/config";
import { ATTRIBUTION_COOKIE_NAME, mintAttributionToken } from "./attribution-cookie";
import {
  CUSTOMER_BINDING_METHOD,
  bindingRowToBinding,
  bindingToRow,
  createCustomerAttributionBinder,
  createInMemoryAffiliateCustomerBindingStore,
  withCustomerAttributionBinding,
  type AffiliateCustomerBinding,
  type AsyncAffiliateCustomerBindingStore,
  type CustomerAttributionBinderDeps,
} from "./customer-attribution-binding";

const SECRET = "customer-binding-secret";
const NOW = new Date("2026-08-19T12:00:00.000Z");
const CUSTOMER = "eac_0123456789abcdef0123456789abcdef";
const ISSUED_AT = "2026-08-19T10:00:00.000Z";

function cookieHeaderFor(
  partnerId: string,
  overrides: Partial<{
    secret: string;
    code: string;
    subjectKey: string;
    issuedAt: string;
    expiresAt: string;
  }> = {},
): string {
  const token = mintAttributionToken(overrides.secret ?? SECRET, {
    partnerId,
    code: overrides.code ?? "code-1",
    subjectKey: overrides.subjectKey ?? "subject-1",
    issuedAt: overrides.issuedAt ?? ISSUED_AT,
    expiresAt:
      overrides.expiresAt ??
      new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return `${ATTRIBUTION_COOKIE_NAME}=${token}`;
}

function makeBinder(overrides: Partial<CustomerAttributionBinderDeps> = {}) {
  const bindings = overrides.bindings ?? createInMemoryAffiliateCustomerBindingStore();
  const binder = createCustomerAttributionBinder({
    linkSecret: SECRET,
    bindings,
    program: null,
    clock: () => NOW,
    ...overrides,
  });
  return { binder, bindings };
}

describe("bindFromCookieHeader", () => {
  it("binds a customer from a verified cookie, carrying code and subject key", async () => {
    const { binder } = makeBinder();
    const outcome = await binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER);
    expect(outcome).toEqual({
      bound: true,
      created: true,
      binding: {
        customerKey: CUSTOMER,
        partnerId: "partner-1",
        code: "code-1",
        subjectKey: "subject-1",
        capturedAt: ISSUED_AT,
        boundAt: NOW.toISOString(),
        programState: "pending_program",
        method: CUSTOMER_BINDING_METHOD,
      },
    });
  });

  it("stamps active when the program is activated, pending_program when it is not", async () => {
    const active = makeBinder({ program: DEFAULT_LAUNCH_PROGRAM });
    const outcome = await active.binder.bindFromCookieHeader(
      cookieHeaderFor("partner-1"),
      CUSTOMER,
    );
    expect(outcome.bound && outcome.binding.programState).toBe("active");
    // The pending case is the default harness, pinned in the test above.
  });

  it("refuses an absent cookie with no_attribution", async () => {
    const { binder, bindings } = makeBinder();
    await expect(binder.bindFromCookieHeader(undefined, CUSTOMER)).resolves.toEqual({
      bound: false,
      reason: "no_attribution",
    });
    await expect(bindings.findByCustomerKey(CUSTOMER)).resolves.toBeNull();
  });

  it("refuses a forged cookie (wrong secret) with no_attribution", async () => {
    const { binder, bindings } = makeBinder();
    const forged = cookieHeaderFor("partner-1", { secret: "some-other-secret" });
    await expect(binder.bindFromCookieHeader(forged, CUSTOMER)).resolves.toEqual({
      bound: false,
      reason: "no_attribution",
    });
    await expect(bindings.findByCustomerKey(CUSTOMER)).resolves.toBeNull();
  });

  it("refuses a payload-tampered cookie: a swapped partner id invalidates the signature", async () => {
    const { binder, bindings } = makeBinder();
    const genuine = cookieHeaderFor("partner-1").slice(ATTRIBUTION_COOKIE_NAME.length + 1);
    const [version, , signature] = genuine.split(".");
    const swapped = Buffer.from(
      JSON.stringify({
        partnerId: "partner-thief",
        code: "code-1",
        subjectKey: "subject-1",
        issuedAt: ISSUED_AT,
        expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
      }),
      "utf8",
    ).toString("base64url");
    const tampered = `${ATTRIBUTION_COOKIE_NAME}=${version}.${swapped}.${signature}`;
    await expect(binder.bindFromCookieHeader(tampered, CUSTOMER)).resolves.toEqual({
      bound: false,
      reason: "no_attribution",
    });
    await expect(bindings.findByCustomerKey(CUSTOMER)).resolves.toBeNull();
  });

  it("refuses an expired cookie with no_attribution", async () => {
    const { binder } = makeBinder();
    const expired = cookieHeaderFor("partner-1", {
      expiresAt: new Date(NOW.getTime() - 1000).toISOString(),
    });
    await expect(binder.bindFromCookieHeader(expired, CUSTOMER)).resolves.toEqual({
      bound: false,
      reason: "no_attribution",
    });
  });

  it("binds nothing when no link secret is configured", async () => {
    const { binder } = makeBinder({ linkSecret: null });
    await expect(
      binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER),
    ).resolves.toEqual({ bound: false, reason: "no_attribution" });
  });

  it("refuses an address-shaped or whitespace-bearing customer key outright", async () => {
    const { binder } = makeBinder();
    for (const key of ["person@example.com", "two words", " ", ""]) {
      await expect(
        binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), key),
      ).resolves.toEqual({ bound: false, reason: "customer_key_not_opaque" });
    }
  });

  it("keeps the first binding when a second partner's valid cookie arrives later", async () => {
    const { binder, bindings } = makeBinder();
    const first = await binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER);
    expect(first.bound && first.created).toBe(true);

    const second = await binder.bindFromCookieHeader(cookieHeaderFor("partner-2"), CUSTOMER);
    expect(second).toEqual({
      bound: true,
      created: false,
      binding: first.bound ? first.binding : undefined,
    });
    const stored = await bindings.findByCustomerKey(CUSTOMER);
    expect(stored?.partnerId).toBe("partner-1");
  });

  it("replays idempotently for the same cookie", async () => {
    const { binder } = makeBinder();
    const first = await binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER);
    const replay = await binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER);
    expect(replay.bound && !replay.created).toBe(true);
    expect(replay.bound && first.bound && replay.binding).toEqual(first.binding);
  });

  it("refuses a self-referral when the customer's own partner is the attributed one", async () => {
    const { binder, bindings } = makeBinder({
      ownPartnerIdFor: async () => "partner-1",
    });
    await expect(
      binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER),
    ).resolves.toEqual({ bound: false, reason: "self_referral" });
    await expect(bindings.findByCustomerKey(CUSTOMER)).resolves.toBeNull();
  });

  it("binds normally when the customer owns a DIFFERENT partner", async () => {
    const { binder } = makeBinder({ ownPartnerIdFor: async () => "partner-9" });
    const outcome = await binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER);
    expect(outcome.bound).toBe(true);
  });

  it("fails closed when the self-referral check cannot answer", async () => {
    const { binder, bindings } = makeBinder({
      ownPartnerIdFor: async () => {
        throw new Error("directory down");
      },
    });
    await expect(
      binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER),
    ).resolves.toEqual({ bound: false, reason: "store_unavailable" });
    await expect(bindings.findByCustomerKey(CUSTOMER)).resolves.toBeNull();
  });

  it("answers store_unavailable when the store cannot record, claiming nothing", async () => {
    const failing: AsyncAffiliateCustomerBindingStore = {
      async putBindingIfAbsent() {
        throw new Error("insert failed");
      },
      async findByCustomerKey() {
        return null;
      },
    };
    const { binder } = makeBinder({ bindings: failing });
    await expect(
      binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER),
    ).resolves.toEqual({ bound: false, reason: "store_unavailable" });
  });
});

describe("attributionForCustomer", () => {
  it("returns the durable binding, and null for an unknown customer", async () => {
    const { binder } = makeBinder();
    await binder.bindFromCookieHeader(cookieHeaderFor("partner-1"), CUSTOMER);
    const found = await binder.attributionForCustomer(CUSTOMER);
    expect(found?.partnerId).toBe("partner-1");
    await expect(
      binder.attributionForCustomer("eac_ffffffffffffffffffffffffffffffff"),
    ).resolves.toBeNull();
  });

  it("treats a non-opaque key and an unreadable store as plain misses", async () => {
    const failing: AsyncAffiliateCustomerBindingStore = {
      async putBindingIfAbsent(binding) {
        return { binding, created: true };
      },
      async findByCustomerKey() {
        throw new Error("read failed");
      },
    };
    const { binder } = makeBinder({ bindings: failing });
    await expect(binder.attributionForCustomer("a@b.c")).resolves.toBeNull();
    await expect(binder.attributionForCustomer(CUSTOMER)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The identity-source decorator
// ---------------------------------------------------------------------------

function countingStore(): AsyncAffiliateCustomerBindingStore & { puts: number } {
  const inner = createInMemoryAffiliateCustomerBindingStore();
  const wrapper = {
    puts: 0,
    async putBindingIfAbsent(binding: AffiliateCustomerBinding) {
      wrapper.puts += 1;
      return inner.putBindingIfAbsent(binding);
    },
    async findByCustomerKey(customerKey: string) {
      return inner.findByCustomerKey(customerKey);
    },
  };
  return wrapper;
}

describe("withCustomerAttributionBinding", () => {
  const identity = Object.freeze({ customerRef: CUSTOMER, displayName: "Operator View" });

  it("returns the inner identity unchanged and binds the verified attribution", async () => {
    const store = countingStore();
    const { binder } = makeBinder({ bindings: store });
    const source = withCustomerAttributionBinding(
      { resolve: async () => identity },
      binder,
    );
    const resolved = await source.resolve({ cookieHeader: cookieHeaderFor("partner-1") });
    expect(resolved).toBe(identity);
    expect(store.puts).toBe(1);
    const stored = await store.findByCustomerKey(CUSTOMER);
    expect(stored?.partnerId).toBe("partner-1");
  });

  it("does not touch the store when no identity resolves", async () => {
    const store = countingStore();
    const { binder } = makeBinder({ bindings: store });
    const source = withCustomerAttributionBinding(
      { resolve: async () => null },
      binder,
    );
    await expect(
      source.resolve({ cookieHeader: cookieHeaderFor("partner-1") }),
    ).resolves.toBeNull();
    expect(store.puts).toBe(0);
  });

  it("does not touch the store when the request carries no attribution cookie", async () => {
    const store = countingStore();
    const { binder } = makeBinder({ bindings: store });
    const source = withCustomerAttributionBinding(
      { resolve: async () => identity },
      binder,
    );
    await expect(source.resolve({ cookieHeader: "other=1" })).resolves.toBe(identity);
    await expect(source.resolve({ cookieHeader: undefined })).resolves.toBe(identity);
    await expect(source.resolve({ cookieHeader: ["not", "a", "string"] })).resolves.toBe(
      identity,
    );
    expect(store.puts).toBe(0);
  });

  it("still resolves identity when the bind is refused or the store is down", async () => {
    const failing: AsyncAffiliateCustomerBindingStore = {
      async putBindingIfAbsent() {
        throw new Error("insert failed");
      },
      async findByCustomerKey() {
        return null;
      },
    };
    const { binder } = makeBinder({ bindings: failing });
    const source = withCustomerAttributionBinding(
      { resolve: async () => identity },
      binder,
    );
    await expect(
      source.resolve({ cookieHeader: cookieHeaderFor("partner-1") }),
    ).resolves.toBe(identity);
  });

  it("still resolves identity even when the binder itself throws", async () => {
    const source = withCustomerAttributionBinding(
      { resolve: async () => identity },
      {
        bindFromCookieHeader: async () => {
          throw new Error("binder defect");
        },
      },
    );
    await expect(
      source.resolve({ cookieHeader: cookieHeaderFor("partner-1") }),
    ).resolves.toBe(identity);
  });
});

// ---------------------------------------------------------------------------
// Row mappers (the Supabase store's pure halves)
// ---------------------------------------------------------------------------

describe("binding row mappers", () => {
  const binding: AffiliateCustomerBinding = {
    customerKey: CUSTOMER,
    partnerId: "partner-1",
    code: "code-1",
    subjectKey: "subject-1",
    capturedAt: ISSUED_AT,
    boundAt: NOW.toISOString(),
    programState: "pending_program",
    method: CUSTOMER_BINDING_METHOD,
  };

  it("round-trips a binding through its row shape", () => {
    expect(bindingRowToBinding(bindingToRow(binding))).toEqual(binding);
  });

  it("drops a row with a foreign program state or method rather than trusting it", () => {
    expect(
      bindingRowToBinding({ ...bindingToRow(binding), program_state: "surprise" }),
    ).toBeNull();
    expect(bindingRowToBinding({ ...bindingToRow(binding), method: "manual" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The store: no cross-customer or partner-scoped reads exist
// ---------------------------------------------------------------------------

describe("in-memory binding store", () => {
  it("returns the standing winner on a duplicate put", async () => {
    const store = createInMemoryAffiliateCustomerBindingStore();
    const binding: AffiliateCustomerBinding = {
      customerKey: CUSTOMER,
      partnerId: "partner-1",
      code: "code-1",
      subjectKey: "subject-1",
      capturedAt: ISSUED_AT,
      boundAt: NOW.toISOString(),
      programState: "pending_program",
      method: CUSTOMER_BINDING_METHOD,
    };
    await store.putBindingIfAbsent(binding);
    const second = await store.putBindingIfAbsent({ ...binding, partnerId: "partner-2" });
    expect(second.created).toBe(false);
    expect(second.binding.partnerId).toBe("partner-1");
  });

  it("reads only by the exact customer key — one customer cannot surface another's binding", async () => {
    const store = createInMemoryAffiliateCustomerBindingStore();
    await store.putBindingIfAbsent({
      customerKey: CUSTOMER,
      partnerId: "partner-1",
      code: "code-1",
      subjectKey: "subject-1",
      capturedAt: ISSUED_AT,
      boundAt: NOW.toISOString(),
      programState: "pending_program",
      method: CUSTOMER_BINDING_METHOD,
    });
    await expect(
      store.findByCustomerKey("eac_ffffffffffffffffffffffffffffffff"),
    ).resolves.toBeNull();
    // The seam itself offers no partner-scoped enumeration: a partner cannot
    // list who was bound to them (or to anyone else) through this store.
    expect(
      Object.keys(store).sort(),
    ).toEqual(["findByCustomerKey", "putBindingIfAbsent"]);
  });
});
