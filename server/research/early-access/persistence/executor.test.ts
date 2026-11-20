import { describe, expect, it } from "vitest";
import {
  EarlyAccessCapabilityUnavailableError,
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceCall,
  type EarlyAccessUnavailableReason,
} from "./executor";

const RPC = "research_early_access_cart_shipping_commitments_due";
const CALL: EarlyAccessPersistenceCall = Object.freeze({ fn: RPC, args: Object.freeze({ p_now: "2026-08-10T12:00:01.000Z" }) });
const REASON: EarlyAccessUnavailableReason = "shipping_commitments_reader_not_installed";

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

describe("runEarlyAccessCall: the one error seam", () => {
  it("returns the query's own answer, including an actual empty list", async () => {
    expect(await runEarlyAccessCall(async () => [], CALL)).toEqual([]);
    const rows = [{ cartCheckoutNumber: "XEC-0123456789ABCDEF" }];
    expect(await runEarlyAccessCall(async () => rows, CALL)).toBe(rows);
  });

  it("collapses an ordinary driver failure into the opaque error, with no reason and no driver text", async () => {
    const error = await failureOf(runEarlyAccessCall(async () => {
      throw new Error("connect ECONNREFUSED postgres://service:secret@db.internal:5432 p_now=2026-08-10");
    }, CALL));
    expect(error).toBeInstanceOf(EarlyAccessPersistenceError);
    expect((error as EarlyAccessPersistenceError).unavailableReason).toBeNull();
    expect((error as Error).message).toBe(`early-access persistence call failed: ${RPC}`);
    expect((error as Error).message).not.toMatch(/secret|ECONNREFUSED|2026-08-10/);
  });

  it("carries a proven-absent capability as the SAME opaque error type with one fixed reason", async () => {
    const error = await failureOf(runEarlyAccessCall(async () => {
      throw new EarlyAccessCapabilityUnavailableError(RPC, REASON);
    }, CALL));
    // Still a persistence failure: every existing caller that treats it as one
    // keeps doing so.
    expect(error).toBeInstanceOf(EarlyAccessPersistenceError);
    expect(error).not.toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect((error as EarlyAccessPersistenceError).unavailableReason).toBe(REASON);
    expect((error as Error).message).toBe(
      `early-access persistence call failed: ${RPC} (capability unavailable: ${REASON})`,
    );
    expect((error as Error).message).not.toContain("2026-08-10");
  });

  it("ignores a capability signal raised for a DIFFERENT function", async () => {
    const error = await failureOf(runEarlyAccessCall(async () => {
      throw new EarlyAccessCapabilityUnavailableError("research_early_access_some_other_rpc", REASON);
    }, CALL));
    expect(error).toBeInstanceOf(EarlyAccessPersistenceError);
    expect((error as EarlyAccessPersistenceError).unavailableReason).toBeNull();
    expect((error as Error).message).toBe(`early-access persistence call failed: ${RPC}`);
  });

  it("ignores a capability signal whose reason is not one of the fixed reasons", async () => {
    const error = await failureOf(runEarlyAccessCall(async () => {
      throw new EarlyAccessCapabilityUnavailableError(RPC, "relation does not exist" as unknown as EarlyAccessUnavailableReason);
    }, CALL));
    expect((error as EarlyAccessPersistenceError).unavailableReason).toBeNull();
    expect((error as Error).message).not.toContain("relation");
  });

  it("treats a thrown non-Error the same as any other failure", async () => {
    const error = await failureOf(runEarlyAccessCall(async () => {
      throw { code: "PGRST202", message: "Could not find the function" };
    }, CALL));
    expect(error).toBeInstanceOf(EarlyAccessPersistenceError);
    expect((error as EarlyAccessPersistenceError).unavailableReason).toBeNull();
  });

  it("keeps malformed answers as reasonless failures", () => {
    for (const thrower of [() => expectObject(RPC, []), () => expectArray(RPC, {})]) {
      let caught: unknown = null;
      try {
        thrower();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EarlyAccessPersistenceError);
      expect((caught as EarlyAccessPersistenceError).unavailableReason).toBeNull();
    }
  });
});
