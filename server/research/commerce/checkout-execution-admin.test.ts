import express, { type Request, type Response } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import {
  adviseOn,
  createCheckoutExecutionAdminService,
  registerCheckoutExecutionAdminApi,
  toAdminView,
  CHECKOUT_EXECUTION_ADMIN_PATH,
} from "./checkout-execution-admin";

const base: CheckoutExecutionRecord = {
  executionId: "exe-1",
  requestKey: "req_admin_0001",
  phase: "committed",
  version: 7,
  providerReference: "pi_0001",
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 33_999,
  currency: "usd",
  paymentMethodReference: "pm_secret_card_reference",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-0001",
  captureKey: "xr-capture-0001",
  cancelKey: "xr-cancel-0001",
  reservationIds: ["res-1"],
  createdAt: "2026-09-09T12:00:00Z",
  authorizationAttemptedAt: "2026-09-09T12:00:01Z",
  settledAt: null,
  committedAt: "2026-09-09T12:00:05Z",
};

describe("what operations is told about a payment", () => {
  it("names the one thing that must never be left alone: money taken with no completed record", () => {
    const stuck = toAdminView({ ...base, phase: "captured", committedAt: null });
    expect(stuck.moneyTaken).toBe(true);
    expect(stuck.advice).toBe("reconcile_captured_payment");
    // The same is true when the local transaction failed and said why.
    const failed = toAdminView({ ...base, phase: "reconciliation_required", committedAt: null, localCommitFailure: "reservations_missing:res-9" });
    expect(failed.moneyTaken).toBe(true);
    expect(failed.advice).toBe("reconcile_captured_payment");
    expect(failed.localCommitFailure).toBe("reservations_missing:res-9");
  });

  it("distinguishes an uncertain payment from a taken one", () => {
    const uncertain = toAdminView({ ...base, phase: "reconciliation_required", committedAt: null });
    expect(uncertain.moneyTaken).toBe(false);
    expect(uncertain.advice).toBe("verify_with_provider");
  });

  it("tells an operator when the customer, not the system, is the one being waited on", () => {
    expect(adviseOn({ ...base, phase: "action_required" })).toBe("waiting_on_customer");
    for (const phase of ["reserved", "authorizing", "authorized", "capturing"] as const) {
      expect(adviseOn({ ...base, phase })).toBe("waiting_on_provider");
    }
  });

  it("separates a provider cancellation from a completed local settlement", () => {
    expect(adviseOn({ ...base, phase: "cancelled", settledAt: null })).toBe("resume_cancellation");
    expect(adviseOn({ ...base, phase: "cancelled", settledAt: "2026-09-09T12:00:09Z" })).toBe("none_settled");
    // A cancellation whose worker died is visible as work to resume, not as done.
    expect(adviseOn({ ...base, phase: "cancelling" })).toBe("resume_cancellation");
  });

  it("reports a settled purchase as needing nothing", () => {
    expect(toAdminView(base).advice).toBe("none_settled");
    expect(toAdminView(base).moneyTaken).toBe(true);
  });

  it("carries no secret, no payment method and no request digest", () => {
    const serialized = JSON.stringify(toAdminView({ ...base, localCommitFailure: "reservations_missing:res-9" }));
    expect(serialized).not.toContain("pm_secret_card_reference");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("xr-auth-0001");
    expect(serialized).not.toContain("quote-1");
  });
});

describe("the operations read over HTTP", () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function serve(findByOrder: (orderId: string) => Promise<CheckoutExecutionRecord | null>) {
    const app = express();
    registerCheckoutExecutionAdminApi(
      app,
      {
        requireAdmin: (req: Request, res: Response, next) => {
          if ((req.get("authorization") ?? "") !== "Bearer admin-token") {
            res.status(401).json({ ok: false, code: "unauthorized" });
            return;
          }
          (req as Request & { adminEmail?: string }).adminEmail = "ops@example.invalid";
          next();
        },
      },
      { service: createCheckoutExecutionAdminService({ findByOrder }) },
    );
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    return async (orderId: string, token?: string) => {
      const response = await fetch(`${origin}${CHECKOUT_EXECUTION_ADMIN_PATH.replace(":orderId", encodeURIComponent(orderId))}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, body: JSON.parse(text) as Record<string, unknown> };
    };
  }

  it("answers an admin privately, and nobody else at all", async () => {
    const call = await serve(async () => ({ ...base, phase: "captured", committedAt: null }));
    expect((await call(base.orderId)).status).toBe(401);
    const ops = await call(base.orderId, "admin-token");
    expect(ops.status).toBe(200);
    expect(ops.headers.get("cache-control")).toBe("private, no-store");
    expect(ops.body).toMatchObject({ ok: true, execution: { orderId: base.orderId, phase: "captured", moneyTaken: true, advice: "reconcile_captured_payment", providerReference: "pi_0001" } });
    expect(ops.text).not.toContain("pm_secret_card_reference");
  });

  it("says plainly that an order has no durable payment rather than inventing one", async () => {
    const call = await serve(async () => null);
    const answer = await call(base.orderId, "admin-token");
    expect(answer.status).toBe(404);
    expect(answer.body).toMatchObject({ ok: false, code: "not_found" });
  });

  it("never echoes a store failure", async () => {
    const call = await serve(async () => {
      throw new Error("pi_0001_secret_fixture leaked in an error");
    });
    const answer = await call(base.orderId, "admin-token");
    expect(answer.status).toBe(503);
    expect(answer.text).not.toContain("secret_fixture");
  });
});
