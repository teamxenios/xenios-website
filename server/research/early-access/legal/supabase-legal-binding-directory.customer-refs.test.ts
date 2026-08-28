import { describe, expect, it } from "vitest";
import {
  EarlyAccessPersistenceError,
  type EarlyAccessPersistenceCall,
} from "../persistence/executor";
import { SupabaseEarlyAccessLegalBindingDirectory } from "./supabase-legal-binding-directory";

/**
 * Coverage for `customerRefsFor`, the M67 inverse read.
 *
 * The RPC answers a FLAT ARRAY OF HANDLE STRINGS, not binding rows, so the
 * adapter has no member field to re-check on this path. Its job is narrower:
 * refuse a bad member id before the database is touched, drop anything in the
 * answer that is not exactly an `eac_` handle, dedupe, sort, and let a real
 * persistence failure surface instead of masquerading as an empty history.
 */

const MEMBER = "33333333-3333-4333-8333-333333333333";
const PRIMARY_REF = "eac_d80e62ad2039e515b943d4d7cb6c2e32";
const ALIAS_REF = "eac_11111111111111111111111111111111";
const OTHER_REF = "eac_22222222222222222222222222222222";

type Recorder = { calls: EarlyAccessPersistenceCall[] };

/**
 * A fake database that answers only the bindings-for-member routine and
 * records every call, so a test can prove what was and was not issued.
 */
function directoryWith(answer: unknown | (() => unknown), recorder: Recorder = { calls: [] }) {
  const query = async (call: EarlyAccessPersistenceCall): Promise<unknown> => {
    recorder.calls.push(call);
    if (call.fn !== "research_early_access_legal_bindings_for_member") {
      throw new Error(`unexpected rpc ${call.fn}`);
    }
    return typeof answer === "function" ? (answer as () => unknown)() : answer;
  };
  return { directory: new SupabaseEarlyAccessLegalBindingDirectory(query), recorder };
}

describe("customerRefsFor: the happy path", () => {
  it("returns the member's primary and alias handles, sorted and frozen", async () => {
    const recorder: Recorder = { calls: [] };
    // Unsorted on purpose: two calls against an unchanged database must
    // return an identical list, so the adapter sorts rather than trusting
    // routine ordering.
    const { directory } = directoryWith([PRIMARY_REF, ALIAS_REF, OTHER_REF], recorder);

    const refs = await directory.customerRefsFor(MEMBER);

    expect(refs).toEqual([ALIAS_REF, OTHER_REF, PRIMARY_REF]);
    expect(Object.isFrozen(refs)).toBe(true);
    expect(recorder.calls).toEqual([
      {
        fn: "research_early_access_legal_bindings_for_member",
        args: { p_member_id: MEMBER },
      },
    ]);
  });

  it("does not re-check member identity on the answer, by design", async () => {
    // The routine returns bare handle strings, so there is no member field
    // here to compare. The member filter lives inside the SQL routine, and
    // the order-history caller applies its ownership rule AGAIN on every
    // record it fetches, so this adapter deliberately returns every
    // well-formed handle the routine hands it.
    const { directory } = directoryWith([OTHER_REF]);
    expect(await directory.customerRefsFor(MEMBER)).toEqual([OTHER_REF]);
  });
});

describe("customerRefsFor: a bad member id never reaches the database", () => {
  const invalidIds: readonly unknown[] = [
    "not-a-uuid",
    "",
    // Truncated by one character, so a near miss cannot slip through.
    "33333333-3333-4333-8333-33333333333",
    42,
    null,
    undefined,
    { id: MEMBER },
  ];

  for (const bad of invalidIds) {
    it(`refuses ${JSON.stringify(bad) ?? "undefined"} without issuing a query`, async () => {
      const recorder: Recorder = { calls: [] };
      const { directory } = directoryWith([PRIMARY_REF], recorder);

      const refs = await directory.customerRefsFor(bad as string);

      expect(refs).toEqual([]);
      expect(Object.isFrozen(refs)).toBe(true);
      expect(recorder.calls).toEqual([]);
    });
  }
});

describe("customerRefsFor: a malformed answer is narrowed, never repaired", () => {
  it("drops entries that are not strings", async () => {
    const { directory } = directoryWith([
      PRIMARY_REF,
      42,
      null,
      { customerRef: ALIAS_REF },
      [ALIAS_REF],
    ]);
    expect(await directory.customerRefsFor(MEMBER)).toEqual([PRIMARY_REF]);
  });

  it("drops strings that are not exactly an eac_ handle", async () => {
    const { directory } = directoryWith([
      PRIMARY_REF,
      // Wrong prefix, wrong length, uppercase hex, and surrounding noise:
      // each fails the exact handle shape and a repaired handle here would
      // attach one person's orders to another person's account.
      "XEA-1",
      "eac_short",
      "eac_D80E62AD2039E515B943D4D7CB6C2E32",
      ` ${ALIAS_REF} `,
      "eac_d80e62ad2039e515b943d4d7cb6c2e32ff",
    ]);
    expect(await directory.customerRefsFor(MEMBER)).toEqual([PRIMARY_REF]);
  });

  it("dedupes a handle that appears twice", async () => {
    const { directory } = directoryWith([PRIMARY_REF, ALIAS_REF, PRIMARY_REF]);
    expect(await directory.customerRefsFor(MEMBER)).toEqual([ALIAS_REF, PRIMARY_REF]);
  });

  it("answers an empty list for a non-array payload", async () => {
    for (const answer of [null, undefined, "eac_list", { refs: [PRIMARY_REF] }]) {
      const { directory } = directoryWith(answer);
      expect(await directory.customerRefsFor(MEMBER)).toEqual([]);
    }
  });
});

describe("customerRefsForHistory: lossless completeness evidence", () => {
  it("marks a clean durable answer complete", async () => {
    const { directory } = directoryWith([PRIMARY_REF, ALIAS_REF]);

    await expect(directory.customerRefsForHistory(MEMBER)).resolves.toEqual({
      refs: [ALIAS_REF, PRIMARY_REF],
      complete: true,
    });
  });

  it.each([
    ["non-array", null],
    ["malformed row", [PRIMARY_REF, null]],
    ["invalid handle", [PRIMARY_REF, " eac_not_exact "]],
    ["duplicate", [PRIMARY_REF, PRIMARY_REF]],
  ])("marks a %s durable answer incomplete without exposing unsafe refs", async (_label, answer) => {
    const { directory } = directoryWith(answer);

    const read = await directory.customerRefsForHistory(MEMBER);

    expect(read.complete).toBe(false);
    expect(read.refs).toEqual(answer === null ? [] : [PRIMARY_REF]);
    expect(Object.isFrozen(read)).toBe(true);
    expect(Object.isFrozen(read.refs)).toBe(true);
  });

  it("marks an invalid member read incomplete without touching persistence", async () => {
    const recorder: Recorder = { calls: [] };
    const { directory } = directoryWith([PRIMARY_REF], recorder);

    await expect(directory.customerRefsForHistory("not-a-member")).resolves.toEqual({
      refs: [],
      complete: false,
    });
    expect(recorder.calls).toEqual([]);
  });
});

describe("customerRefsFor: an infrastructure failure is not an empty history", () => {
  it("re-throws the persistence error instead of swallowing it into []", async () => {
    // An empty answer means "you have no orders". A database that is down
    // must instead surface as "unavailable", so the wrapped error propagates.
    const { directory } = directoryWith(() => {
      throw new Error("connection refused");
    });

    await expect(directory.customerRefsFor(MEMBER)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceError,
    );
  });

  it("names only the routine in the propagated error, never the driver detail", async () => {
    const { directory } = directoryWith(() => {
      throw new Error("postgres://user:secret@host/db exploded");
    });

    // Captured and inspected rather than matched with toThrow(substring):
    // a containment matcher passes even when the driver detail rides along
    // after the expected prefix, which is exactly the leak this test exists
    // to refuse. The message must equal the redacted form and carry no
    // fragment of the driver error.
    const thrown = await directory.customerRefsFor(MEMBER).then(
      () => {
        throw new Error("the persistence failure was swallowed");
      },
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(EarlyAccessPersistenceError);
    const message = (thrown as Error).message;
    expect(message).toBe(
      "early-access persistence call failed: research_early_access_legal_bindings_for_member",
    );
    expect(message).not.toContain("secret");
    expect(message).not.toContain("postgres://");
    expect(message).not.toContain("exploded");
  });
});
