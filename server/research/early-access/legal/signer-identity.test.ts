import { describe, expect, it } from "vitest";
import {
  NoEarlyAccessSignerBindingStore,
  handlesFor,
  isSigningGradeProvenance,
  resolveSigner,
  resolveSignerForCheckout,
  type EarlyAccessSignerBinding,
  type EarlyAccessSignerBindingStore,
} from "./signer-identity";

const ROSTER_REF = "eac_d80e62ad2039e515b943d4d7cb6c2e32";
const CONTINUITY_REF = "eac_11111111111111111111111111111111";
const OTHER_REF = "eac_22222222222222222222222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OTHER_MEMBER = "44444444-4444-4444-8444-444444444444";

function binding(overrides: Partial<EarlyAccessSignerBinding> = {}): EarlyAccessSignerBinding {
  return {
    customerRef: ROSTER_REF,
    coveredRefs: [ROSTER_REF, CONTINUITY_REF],
    memberId: MEMBER,
    authUserId: "auth-user-1",
    memberEmail: "member@example.test",
    verification: { method: "member_claim_token", tokenPurpose: "account_claim" },
    boundAt: "2026-08-09T00:00:00.000Z",
    supersededAt: null,
    ...overrides,
  };
}

/** A store backed by an explicit ref-to-binding table, so each test states its world. */
function storeOf(table: Record<string, EarlyAccessSignerBinding>): EarlyAccessSignerBindingStore {
  return {
    async findByCustomerRef(ref) {
      return table[ref] ?? null;
    },
    async findByMemberId(memberId) {
      return Object.values(table).find((entry) => entry.memberId === memberId) ?? null;
    },
  };
}

describe("Early Access handles", () => {
  it("lists the primary first and de-duplicates aliases", () => {
    expect(
      handlesFor({ customerRef: ROSTER_REF, aliasRefs: [CONTINUITY_REF, ROSTER_REF] }),
    ).toEqual([ROSTER_REF, CONTINUITY_REF]);
  });

  it("treats only redeemed provenance as signing grade", () => {
    expect(isSigningGradeProvenance("verified_link")).toBe(true);
    expect(isSigningGradeProvenance("session_code")).toBe(true);
    // Typing an address is a claim about a mailbox, not proof of one.
    expect(isSigningGradeProvenance("email_entry")).toBe(false);
    expect(isSigningGradeProvenance(undefined)).toBe(false);
  });
});

describe("resolveSigner", () => {
  it("refuses when no binding exists, so an eac_ handle alone never signs", async () => {
    const result = await resolveSigner(
      { customerRef: ROSTER_REF, boundBy: "verified_link" },
      new NoEarlyAccessSignerBindingStore(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_required");
  });

  it("resolves a bound handle to the member behind it", async () => {
    const result = await resolveSigner(
      { customerRef: ROSTER_REF, aliasRefs: [CONTINUITY_REF], boundBy: "verified_link" },
      storeOf({ [ROSTER_REF]: binding() }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.memberId).toBe(MEMBER);
    expect(result.memberEmail).toBe("member@example.test");
  });

  it("resolves through an alias when the binding is keyed on the other handle", async () => {
    // A customer who unlocked in a new browser carries the continuity handle
    // as an alias; the binding may be keyed on the roster handle.
    const result = await resolveSigner(
      { customerRef: CONTINUITY_REF, aliasRefs: [ROSTER_REF], boundBy: "session_code" },
      storeOf({ [ROSTER_REF]: binding() }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.memberId).toBe(MEMBER);
  });

  it("refuses weak provenance even when a binding exists", async () => {
    const result = await resolveSigner(
      { customerRef: ROSTER_REF, boundBy: "email_entry" },
      storeOf({ [ROSTER_REF]: binding() }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_unverified");
  });

  it("refuses rather than choosing when two handles name different members", async () => {
    const result = await resolveSigner(
      { customerRef: ROSTER_REF, aliasRefs: [CONTINUITY_REF], boundBy: "verified_link" },
      storeOf({
        [ROSTER_REF]: binding(),
        [CONTINUITY_REF]: binding({ customerRef: CONTINUITY_REF, memberId: OTHER_MEMBER }),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_conflict");
  });

  it("refuses a superseded binding instead of falling back to it", async () => {
    const result = await resolveSigner(
      { customerRef: ROSTER_REF, boundBy: "verified_link" },
      storeOf({ [ROSTER_REF]: binding({ supersededAt: "2026-08-09T01:00:00.000Z" }) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_superseded");
  });
});

describe("resolveSignerForCheckout", () => {
  it("refuses a checkout the customer does not hold a handle for", async () => {
    const result = await resolveSignerForCheckout(
      { customerRef: ROSTER_REF, boundBy: "verified_link" },
      OTHER_REF,
      storeOf({ [ROSTER_REF]: binding() }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("checkout_not_owned");
  });

  it("refuses when the owning handle belongs to a different member", async () => {
    // The signer is verified and holds the handle, but that handle is bound to
    // someone else. A valid member must not be able to satisfy another
    // person's order.
    const result = await resolveSignerForCheckout(
      { customerRef: ROSTER_REF, aliasRefs: [CONTINUITY_REF], boundBy: "verified_link" },
      CONTINUITY_REF,
      {
        async findByCustomerRef(ref) {
          if (ref === ROSTER_REF) return binding();
          if (ref === CONTINUITY_REF) {
            return binding({ customerRef: CONTINUITY_REF, memberId: OTHER_MEMBER });
          }
          return null;
        },
        async findByMemberId() {
          return null;
        },
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // The conflict is caught before ownership even resolves, because holding
    // two handles that name two members is itself unsafe.
    expect(["binding_conflict", "foreign_member"]).toContain(result.code);
  });

  it("resolves the founder checkout handle to its bound member", async () => {
    const result = await resolveSignerForCheckout(
      { customerRef: ROSTER_REF, boundBy: "verified_link" },
      ROSTER_REF,
      storeOf({ [ROSTER_REF]: binding() }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.memberId).toBe(MEMBER);
    // The existing checkout keeps its handle; nothing here mints a new one.
    expect(result.customerRef).toBe(ROSTER_REF);
  });
});
