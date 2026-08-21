// The supplier adapter's paths, pinned to the fulfillment engine's own route
// table.
//
// WHY THIS FILE EXISTS. The workspace shipped at 09d0c990 hardcoded
// `/api/research/fulfillment/supplier/...`. Those doors were then moved to
// `/api/admin/research/fulfillment/...` because the research wall answered 401
// for operator traffic. Nothing failed: the adapter is a second copy of a
// constant the server owns, and a second copy drifts silently. A supplier
// would have been the one to discover it.
//
// The engine's path constants are the single source of truth. These tests
// import them directly, so the next time a door moves, this fails instead of
// a supplier.

import { describe, expect, it } from "vitest";
import {
  FULFILLMENT_SUPPLIER_QUEUE_PATH,
  FULFILLMENT_SUPPLIER_TRANSITION_PATH,
} from "../../../../server/research/fulfillment/register";
import { SUPPLIER_API, newIdempotencyKey } from "./api";

describe("the supplier adapter points at the engine's real doors", () => {
  it("uses the engine's queue path verbatim", () => {
    expect(SUPPLIER_API.assignments).toBe(FULFILLMENT_SUPPLIER_QUEUE_PATH);
  });

  it("builds the transition path from the engine's own template", () => {
    // The server declares `:assignmentId`; the client fills it. Comparing the
    // built path against the template with the parameter substituted proves
    // the two agree on prefix, ordering and suffix.
    const built = SUPPLIER_API.transition("asg_1");
    const expected = FULFILLMENT_SUPPLIER_TRANSITION_PATH.replace(":assignmentId", "asg_1");
    expect(built).toBe(expected);
  });

  it("keeps operator traffic out of the research namespace", () => {
    // The wall admits exactly one fulfillment path, the customer status read.
    // An operator door under /api/research/ is the defect this file was
    // written for; assert the shape rather than a specific spelling.
    expect(SUPPLIER_API.assignments.startsWith("/api/research/")).toBe(false);
    expect(SUPPLIER_API.transition("asg_1").startsWith("/api/research/")).toBe(false);
  });

  it("escapes an assignment id so a hostile id cannot reshape the path", () => {
    expect(SUPPLIER_API.transition("a/../../admin")).not.toContain("/../");
    expect(SUPPLIER_API.transition("a b")).toContain("a%20b");
  });

  it("derives a per-attempt idempotency key that varies with the action and version", () => {
    expect(newIdempotencyKey("asg_1", "ship", "3")).toBe("sw-asg_1-ship-3");
    expect(newIdempotencyKey("asg_1", "ship", "3")).not.toBe(newIdempotencyKey("asg_1", "ship", "4"));
    expect(newIdempotencyKey("asg_1", "ship", "3")).not.toBe(newIdempotencyKey("asg_1", "pack", "3"));
  });
});
