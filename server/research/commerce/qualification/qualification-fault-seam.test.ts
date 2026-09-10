// The fault seam must fail exactly where it says, once, and be unreachable
// from anywhere but the machine running the harness.
import { describe, expect, it } from "vitest";
import type { StripeRequest, StripeResponse } from "../../providers/payment";
import type { OrderRecord } from "../orders";
import {
  createQualificationFaultSeam,
  QualificationSeamRefused,
  QUALIFICATION_CONTROL_PATHS,
  startFaultControlServer,
} from "./qualification-fault-seam";

const order = (state: OrderRecord["state"]): OrderRecord =>
  ({
    orderId: "order-1",
    memberId: "member-1",
    state,
    lines: [],
    totals: { subtotalCents: 1, shippingCents: 0, storeCreditAppliedCents: 0, totalCents: 1 },
    providerReference: null,
    checkoutIdempotencyKey: null,
    lastIdempotencyKey: null,
    reviewTriggers: [],
    createdAt: "2026-09-10T00:00:00Z",
    updatedAt: "2026-09-10T00:00:00Z",
  }) as OrderRecord;

const okResponse: StripeResponse = { status: 200, body: { id: "pi_1" } };

describe("it refuses to exist in a production build", () => {
  it("will not construct a seam", () => {
    expect(() => createQualificationFaultSeam({ NODE_ENV: "production" })).toThrow(QualificationSeamRefused);
  });

  it("will not start a control channel", () => {
    expect(() => startFaultControlServer(createQualificationFaultSeam({}), { env: { NODE_ENV: "production" } })).toThrow(
      QualificationSeamRefused,
    );
  });
});

describe("the transport fault", () => {
  it("drops the response only AFTER the provider processed the request", async () => {
    const seen: StripeRequest[] = [];
    const seam = createQualificationFaultSeam({});
    const transport = seam.wrapTransport(async (request) => {
      seen.push(request);
      return okResponse;
    });

    seam.arm("lost_response");
    await expect(transport({ method: "POST", path: "/v1/payment_intents" })).rejects.toThrow(/after the provider processed/);
    // The effect happened. That is the whole point of this fault.
    expect(seen).toHaveLength(1);
  });

  it("refuses BEFORE the provider sees anything for a server error", async () => {
    const seen: StripeRequest[] = [];
    const seam = createQualificationFaultSeam({});
    const transport = seam.wrapTransport(async (request) => {
      seen.push(request);
      return okResponse;
    });

    seam.arm("server_error");
    await expect(transport({ method: "POST", path: "/v1/payment_intents" })).resolves.toMatchObject({ status: 500 });
    expect(seen).toEqual([]);
  });

  it("is one-shot, so an armed fault cannot leak into the next scenario", async () => {
    const seam = createQualificationFaultSeam({});
    const transport = seam.wrapTransport(async () => okResponse);
    seam.arm("lost_response");
    await expect(transport({ method: "POST", path: "/v1/payment_intents" })).rejects.toThrow();
    await expect(transport({ method: "POST", path: "/v1/payment_intents" })).resolves.toEqual(okResponse);
    expect(seam.pending().transport).toBeNull();
  });

  it("leaves reads alone, so a read-back can still resolve what the lost write did", async () => {
    const seam = createQualificationFaultSeam({});
    const transport = seam.wrapTransport(async () => okResponse);
    seam.arm("lost_response");
    // A GET must not consume the fault: reconciliation reads immediately after.
    await expect(transport({ method: "GET", path: "/v1/payment_intents/pi_1" })).resolves.toEqual(okResponse);
    await expect(transport({ method: "POST", path: "/v1/payment_intents/pi_1/capture" })).rejects.toThrow();
  });

  it("does nothing at all when nothing is armed", async () => {
    const seam = createQualificationFaultSeam({});
    const transport = seam.wrapTransport(async () => okResponse);
    for (const method of ["GET", "POST", "DELETE"] as const) {
      await expect(transport({ method, path: "/v1/payment_intents" })).resolves.toEqual(okResponse);
    }
  });
});

describe("the local commit fault", () => {
  it("fails the save that records a capture, and only that one", async () => {
    const saved: string[] = [];
    const seam = createQualificationFaultSeam({});
    const save = seam.wrapOrderSave(async (o) => {
      saved.push(o.state);
    });

    seam.armLocalCommitFailure();
    // Everything before the capture still saves normally.
    await save(order("checkout_pending"));
    await save(order("payment_authorized"));
    await expect(save(order("payment_captured"))).rejects.toThrow(/after the capture/);
    expect(saved).toEqual(["checkout_pending", "payment_authorized"]);

    // One shot: the retry that reconciliation performs must succeed.
    await save(order("payment_captured"));
    expect(saved).toEqual(["checkout_pending", "payment_authorized", "payment_captured"]);
    expect(seam.pending().localCommit).toBe(false);
  });
});

describe("the control channel", () => {
  it("arms each fault and reports what is pending", async () => {
    const seam = createQualificationFaultSeam({});
    const server = await startFaultControlServer(seam, { env: {} });
    try {
      const post = (path: string, body: unknown) =>
        fetch(`${server.url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

      expect((await post(QUALIFICATION_CONTROL_PATHS.fault, { fault: "lost_response" })).status).toBe(200);
      expect(seam.pending().transport).toBe("lost_response");

      expect((await post(QUALIFICATION_CONTROL_PATHS.failNextCommit, {})).status).toBe(200);
      expect(seam.pending().localCommit).toBe(true);

      const pending = await (await post(QUALIFICATION_CONTROL_PATHS.pending, {})).json();
      expect(pending).toMatchObject({ ok: true, pending: { transport: "lost_response", localCommit: true } });
    } finally {
      await server.close();
    }
  });

  it("refuses a fault it does not know rather than arming something else", async () => {
    const seam = createQualificationFaultSeam({});
    const server = await startFaultControlServer(seam, { env: {} });
    try {
      for (const body of [{ fault: "delete_everything" }, {}, { fault: 1 }]) {
        const response = await fetch(`${server.url}${QUALIFICATION_CONTROL_PATHS.fault}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(400);
      }
      expect(seam.pending().transport).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("binds to loopback only, and answers no unknown path", async () => {
    const seam = createQualificationFaultSeam({});
    const server = await startFaultControlServer(seam, { env: {} });
    try {
      expect(new URL(server.url).hostname).toBe("127.0.0.1");
      expect((await fetch(`${server.url}/anything-else`, { method: "POST" })).status).toBe(404);
      expect((await fetch(`${server.url}${QUALIFICATION_CONTROL_PATHS.fault}`, { method: "GET" })).status).toBe(405);
    } finally {
      await server.close();
    }
  });
});
