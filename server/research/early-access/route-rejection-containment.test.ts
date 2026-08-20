import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { dispatchEarlyAccessRoute } from "./register";

/**
 * A rejected route handler must fail ONE request, not the process.
 *
 * Every Early Access route dispatches a handler that owns its own response and
 * returns a promise nobody awaits. Under Node's default unhandled-rejection
 * policy an unguarded one of those does not produce a 500: it terminates the
 * process. Conversion QA observed exactly that — a failing persistence call
 * inside the agreements route exited the server — and `placeOrder` and
 * `readOrder` were dispatched the same unguarded way, so a database blip during
 * checkout took the whole site down instead of failing one request.
 *
 * The structural test below is the one that keeps this fixed. A behavioural
 * test through a single route proves almost nothing here, because most handlers
 * catch internally and never reject; the danger is the ONE that does, and which
 * one that is changes as the code changes. So the invariant is enforced over
 * every dispatch site in the file rather than sampled at one of them.
 */

function fakeResponse(headersSent = false) {
  const state: any = { status: 0, body: null, headersSent };
  return {
    state,
    res: {
      get headersSent() { return state.headersSent; },
      status(code: number) { state.status = code; state.headersSent = true; return this; },
      json(body: unknown) { state.body = body; return this; },
    } as any,
  };
}

describe("dispatchEarlyAccessRoute", () => {
  it("swallows a rejection and answers the request instead", async () => {
    const unhandled: unknown[] = [];
    const capture = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", capture);
    const { res, state } = fakeResponse();
    try {
      dispatchEarlyAccessRoute(Promise.reject(new Error("database unavailable")), res);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off("unhandledRejection", capture);
    }
    expect(unhandled).toEqual([]);
    expect(state.status).toBe(500);
    expect(state.body).toMatchObject({ error: "early_access_unavailable" });
  });

  it("does not answer twice when the handler already responded", async () => {
    // A handler that began streaming cannot be given a second status. Trying
    // would throw inside the very guard meant to contain the failure.
    const { res, state } = fakeResponse(true);
    dispatchEarlyAccessRoute(Promise.reject(new Error("late failure")), res);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.status).toBe(0);
    expect(state.body).toBeNull();
  });

  it("leaves a resolving handler entirely alone", async () => {
    const { res, state } = fakeResponse();
    dispatchEarlyAccessRoute(Promise.resolve("fine"), res);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.status).toBe(0);
  });
});

describe("every route dispatch in register.ts is contained", () => {
  it("has no fire-and-forget call that could reach the process", () => {
    const source = fs.readFileSync(
      path.resolve("server/research/early-access/register.ts"),
      "utf8",
    );

    // Every statement-position `void <expr>` must carry its own `.catch`
    // somewhere in that statement. `dispatchEarlyAccessRoute(...)` sites are
    // contained by construction and are not `void` statements at all.
    const offenders: string[] = [];
    const pattern = /\n\s+void (?=[A-Za-z_$])/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const start = match.index + match[0].length;
      // Walk to the end of the statement, tracking nesting so a `;` inside a
      // callback body does not end it early.
      let depth = 0;
      let end = start;
      while (end < source.length) {
        const ch = source[end];
        if (ch === "(" || ch === "[" || ch === "{") depth += 1;
        else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
        else if (ch === ";" && depth === 0) break;
        end += 1;
      }
      const statement = source.slice(start, end);
      if (!statement.includes(".catch")) {
        offenders.push(statement.slice(0, 80).replace(/\s+/g, " "));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("still contains the guarded dispatch helper it relies on", () => {
    const source = fs.readFileSync(
      path.resolve("server/research/early-access/register.ts"),
      "utf8",
    );
    expect(source).toContain("export function dispatchEarlyAccessRoute");
    // The count is not pinned — routes come and go — but the file must actually
    // use the helper rather than merely define it.
    const uses = source.match(/dispatchEarlyAccessRoute\(/g) ?? [];
    expect(uses.length).toBeGreaterThan(20);
  });
});
