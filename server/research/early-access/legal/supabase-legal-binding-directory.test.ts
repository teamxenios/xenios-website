import { describe, expect, it } from "vitest";
import type { EarlyAccessPersistenceCall } from "../persistence/executor";
import {
  FOUNDER_ATTESTATION_CHECKOUT_NUMBER,
  SupabaseEarlyAccessLegalBindingDirectory,
  SupabaseEarlyAccessLegalBindingWriter,
  decodeLegalBinding,
} from "./supabase-legal-binding-directory";

const MEMBER = "33333333-3333-4333-8333-333333333333";
const OTHER_MEMBER = "44444444-4444-4444-8444-444444444444";
const PRIMARY_REF = "eac_d80e62ad2039e515b943d4d7cb6c2e32";
const ALIAS_REF = "eac_11111111111111111111111111111111";
const UNBOUND_REF = "eac_22222222222222222222222222222222";
const CHECKOUT = "XEC-E1703CC63BBE89E6839E24C1";
const OTHER_CHECKOUT = "XEC-0000000000000000000000AA";

/**
 * The exact jsonb `research_early_access_legal_binding_for_customer` builds:
 * timestamptz serializes with a numeric offset, and alias_refs arrives as a
 * JSON array via to_jsonb.
 */
function bindingRow(overrides: Record<string, unknown> = {}) {
  return {
    customerRef: PRIMARY_REF,
    memberId: MEMBER,
    establishedBy: "verified_link",
    verifiedAt: "2026-08-09T00:00:00+00:00",
    attestedBy: null,
    aliasRefs: [ALIAS_REF],
    ...overrides,
  };
}

type Recorder = { calls: EarlyAccessPersistenceCall[] };

/**
 * A fake database that answers only the RPCs M62 grants, and records every call
 * so a test can prove what was and was not issued.
 */
function fakeQuery(
  handlers: {
    bindings?: Record<string, unknown>;
    checkouts?: Record<string, unknown>;
    recordResult?: unknown;
  },
  recorder: Recorder = { calls: [] },
) {
  const query = async (call: EarlyAccessPersistenceCall): Promise<unknown> => {
    recorder.calls.push(call);
    if (call.fn === "research_early_access_legal_binding_for_customer") {
      const ref = call.args.p_customer_ref as string;
      return handlers.bindings?.[ref] ?? null;
    }
    if (call.fn === "research_early_access_cart_checkout_for_number") {
      const number = call.args.p_checkout_number as string;
      return handlers.checkouts?.[number] ?? null;
    }
    if (call.fn === "research_early_access_record_legal_binding") {
      return handlers.recordResult ?? { recorded: true, replayed: false };
    }
    throw new Error(`unexpected rpc ${call.fn}`);
  };
  return { query, recorder };
}

const founderCheckouts = { [FOUNDER_ATTESTATION_CHECKOUT_NUMBER]: { customerRef: PRIMARY_REF } };

describe("forCustomer", () => {
  it("resolves a verified_link binding", async () => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() } });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.binding.memberId).toBe(MEMBER);
    expect(result.binding.establishedBy).toBe("verified_link");
    expect(result.binding.attestedBy).toBeNull();
    // The offset form is normalized to an exact ISO 8601 UTC instant.
    expect(result.binding.verifiedAt).toBe("2026-08-09T00:00:00.000Z");
  });

  it("fails closed when no binding exists", async () => {
    const { query } = fakeQuery({ bindings: {} });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      UNBOUND_REF,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_absent");
  });

  it("fails closed on a malformed handle without touching the database", async () => {
    const recorder: Recorder = { calls: [] };
    const { query } = fakeQuery({ bindings: {} }, recorder);
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      "not-a-handle",
    );
    expect(result.ok).toBe(false);
    expect(recorder.calls).toEqual([]);
  });

  it("never answers one customer's question with another customer's binding", async () => {
    // A row whose own handle differs from the one asked about is refused rather
    // than returned, so a mismatched read can never become an identity.
    const { query } = fakeQuery({
      bindings: { [UNBOUND_REF]: bindingRow({ customerRef: PRIMARY_REF }) },
    });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      UNBOUND_REF,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_absent");
  });

  it("preserves aliases so an earlier checkout is not orphaned", async () => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() } });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.binding.aliasRefs).toEqual([ALIAS_REF]);
  });

  it("refuses a row that carries its own handle as an alias", async () => {
    // M62 constrains customer_ref <> all(alias_refs); a row breaking it did not
    // come from that schema.
    const { query } = fakeQuery({
      bindings: { [PRIMARY_REF]: bindingRow({ aliasRefs: [PRIMARY_REF] }) },
    });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(false);
  });

  it.each([
    ["a non-uuid member", { memberId: "member-1" }],
    ["an unknown provenance", { establishedBy: "email_entry" }],
    ["an unreadable verification time", { verifiedAt: "whenever" }],
    ["a verified_link carrying an attestor", { attestedBy: "Samuel Boadu" }],
    ["a malformed alias", { aliasRefs: ["nope"] }],
  ])("fails closed on %s", async (_label, override) => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow(override) } });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_absent");
  });

  it("issues no write when reading", async () => {
    const recorder: Recorder = { calls: [] };
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() } }, recorder);
    await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(PRIMARY_REF);
    // The record routine is the only way to create a binding, and reading must
    // never reach it.
    expect(recorder.calls.map((c) => c.fn)).toEqual([
      "research_early_access_legal_binding_for_customer",
    ]);
    expect(recorder.calls.some((c) => c.fn.includes("record_legal_binding"))).toBe(false);
  });

  it("has no write method at all on the directory", () => {
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(async () => null);
    expect((directory as unknown as Record<string, unknown>).record).toBeUndefined();
    expect(Object.getOwnPropertyNames(SupabaseEarlyAccessLegalBindingDirectory.prototype)).toEqual(
      expect.not.arrayContaining(["record"]),
    );
  });
});

describe("admin_attested provenance", () => {
  it("accepts an attested binding for the permitted founder checkout", async () => {
    const { query } = fakeQuery({
      bindings: {
        [PRIMARY_REF]: bindingRow({
          establishedBy: "admin_attested",
          attestedBy: "Samuel Boadu",
        }),
      },
      checkouts: founderCheckouts,
    });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.binding.establishedBy).toBe("admin_attested");
    expect(result.binding.attestedBy).toBe("Samuel Boadu");
  });

  it("refuses an attested binding for any other handle", async () => {
    // The founder exception must never widen into a generic bypass: the
    // attested handle has to be the one that owns the founder checkout.
    const { query } = fakeQuery({
      bindings: {
        [ALIAS_REF]: bindingRow({
          customerRef: ALIAS_REF,
          establishedBy: "admin_attested",
          attestedBy: "Samuel Boadu",
          aliasRefs: [],
        }),
      },
      checkouts: founderCheckouts,
    });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(ALIAS_REF);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_unverified");
  });

  it("refuses an attestation with no named human", async () => {
    const { query } = fakeQuery({
      bindings: {
        [PRIMARY_REF]: bindingRow({ establishedBy: "admin_attested", attestedBy: " " }),
      },
      checkouts: founderCheckouts,
    });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an attested binding when the founder checkout is unreadable", async () => {
    const { query } = fakeQuery({
      bindings: {
        [PRIMARY_REF]: bindingRow({
          establishedBy: "admin_attested",
          attestedBy: "Samuel Boadu",
        }),
      },
      checkouts: {},
    });
    const result = await new SupabaseEarlyAccessLegalBindingDirectory(query).forCustomer(
      PRIMARY_REF,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_unverified");
  });
});

describe("ownsCheckout", () => {
  const checkouts = {
    [CHECKOUT]: { customerRef: PRIMARY_REF },
    [OTHER_CHECKOUT]: { customerRef: UNBOUND_REF },
  };

  it("is true for the member bound to the handle that owns the checkout", async () => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts });
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    expect(await directory.ownsCheckout(MEMBER, CHECKOUT)).toBe(true);
  });

  it("cannot be satisfied by another member", async () => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts });
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    // A perfectly valid member who is simply not the one on this order.
    expect(await directory.ownsCheckout(OTHER_MEMBER, CHECKOUT)).toBe(false);
  });

  it("is false when the owning handle has no binding", async () => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts });
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    expect(await directory.ownsCheckout(MEMBER, OTHER_CHECKOUT)).toBe(false);
  });

  it("is false for an unknown checkout", async () => {
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts });
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    expect(await directory.ownsCheckout(MEMBER, "XEC-DOES-NOT-EXIST")).toBe(false);
  });

  it("refuses a malformed member identity without touching the database", async () => {
    // A garbage member id would fail the comparison anyway, so this guard earns
    // its place by refusing before two round trips are spent on a question that
    // cannot have a true answer.
    const recorder: Recorder = { calls: [] };
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts }, recorder);
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    for (const bad of ["", "member-1", MEMBER.slice(0, -1)]) {
      expect(await directory.ownsCheckout(bad, CHECKOUT)).toBe(false);
    }
    expect(recorder.calls).toEqual([]);
  });

  it("reads ownership from the durable checkout record, not from an argument", async () => {
    const recorder: Recorder = { calls: [] };
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts }, recorder);
    await new SupabaseEarlyAccessLegalBindingDirectory(query).ownsCheckout(MEMBER, CHECKOUT);
    expect(recorder.calls.map((c) => c.fn)).toEqual([
      "research_early_access_cart_checkout_for_number",
      "research_early_access_legal_binding_for_customer",
    ]);
  });

  it("does not cache, so every question re-reads the records", async () => {
    const recorder: Recorder = { calls: [] };
    const { query } = fakeQuery({ bindings: { [PRIMARY_REF]: bindingRow() }, checkouts }, recorder);
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    await directory.ownsCheckout(MEMBER, CHECKOUT);
    await directory.ownsCheckout(MEMBER, CHECKOUT);
    expect(recorder.calls).toHaveLength(4);
  });

  it("KNOWN LIMIT: an alias-owned checkout fails closed", async () => {
    // The frozen contract says ownership holds "including through an alias",
    // but the only granted read matches customer_ref alone and the table is
    // unreadable directly, so a checkout placed under an alias handle cannot be
    // proven owned. This pins the mismatch reported to Master rather than
    // hiding it behind a guess.
    const { query } = fakeQuery({
      bindings: { [PRIMARY_REF]: bindingRow() },
      checkouts: { [OTHER_CHECKOUT]: { customerRef: ALIAS_REF } },
    });
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(query);
    expect(await directory.ownsCheckout(MEMBER, OTHER_CHECKOUT)).toBe(false);
  });
});

describe("the write path", () => {
  it("is a separate class from the directory", () => {
    const writer = new SupabaseEarlyAccessLegalBindingWriter(async () => null);
    const directory = new SupabaseEarlyAccessLegalBindingDirectory(async () => null);
    expect(writer).not.toBeInstanceOf(SupabaseEarlyAccessLegalBindingDirectory);
    expect(directory).not.toBeInstanceOf(SupabaseEarlyAccessLegalBindingWriter);
  });

  it("reports a refused rebind rather than succeeding", async () => {
    // M62 returns binding_conflict for a differing member on an existing
    // handle. A handle bound to member A can never come to point at member B.
    const { query } = fakeQuery({
      recordResult: { recorded: false, replayed: false, reason: "binding_conflict", binding: null },
    });
    const result = await new SupabaseEarlyAccessLegalBindingWriter(query).record({
      customerRef: PRIMARY_REF,
      memberId: OTHER_MEMBER,
      establishedBy: "verified_link",
      verifiedAt: "2026-08-09T00:00:00.000Z",
      attestedBy: null,
      aliasRefs: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("binding_conflict");
  });

  it("reports a refused attestation rather than succeeding", async () => {
    const { query } = fakeQuery({
      recordResult: {
        recorded: false,
        replayed: false,
        reason: "admin_attestation_not_allowed",
        binding: null,
      },
    });
    const result = await new SupabaseEarlyAccessLegalBindingWriter(query).record({
      customerRef: ALIAS_REF,
      memberId: MEMBER,
      establishedBy: "admin_attested",
      verifiedAt: "2026-08-09T00:00:00.000Z",
      attestedBy: "Samuel Boadu",
      aliasRefs: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("admin_attestation_not_allowed");
  });

  it("treats a byte-identical resubmission as a harmless replay", async () => {
    const { query } = fakeQuery({ recordResult: { recorded: false, replayed: true } });
    const result = await new SupabaseEarlyAccessLegalBindingWriter(query).record({
      customerRef: PRIMARY_REF,
      memberId: MEMBER,
      establishedBy: "verified_link",
      verifiedAt: "2026-08-09T00:00:00.000Z",
      attestedBy: null,
      aliasRefs: [ALIAS_REF],
    });
    expect(result).toEqual({ ok: true, recorded: false, replayed: true });
  });

  it("throws rather than inventing an outcome for an unknown answer", async () => {
    const { query } = fakeQuery({
      recordResult: { recorded: false, replayed: false, reason: "something_new" },
    });
    await expect(
      new SupabaseEarlyAccessLegalBindingWriter(query).record({
        customerRef: PRIMARY_REF,
        memberId: MEMBER,
        establishedBy: "verified_link",
        verifiedAt: "2026-08-09T00:00:00.000Z",
        attestedBy: null,
        aliasRefs: [],
      }),
    ).rejects.toThrow(/research_early_access_record_legal_binding/);
  });
});

describe("decodeLegalBinding", () => {
  it("returns null for a null row", () => {
    expect(decodeLegalBinding(null, PRIMARY_REF)).toBeNull();
  });

  it("returns null for a non-object", () => {
    expect(decodeLegalBinding("binding", PRIMARY_REF)).toBeNull();
    expect(decodeLegalBinding([bindingRow()], PRIMARY_REF)).toBeNull();
  });

  it("freezes what it returns", () => {
    const binding = decodeLegalBinding(bindingRow(), PRIMARY_REF);
    expect(binding).not.toBeNull();
    expect(Object.isFrozen(binding)).toBe(true);
  });
});
