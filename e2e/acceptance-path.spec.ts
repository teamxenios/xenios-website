// The founder's acceptance path, asserted for EXACTLY-ONCE artifacts.
//
//   full catalog -> retail price -> customer/shipping/order form
//     -> durable XRR request -> customer email + admin email
//     -> founder manually sends payment instructions
//
// Payment automation is deferred, so the whole launch rests on three artifacts
// existing exactly once per accepted submission: one durable request, one
// customer notification, one admin notification.
//
// Two failures matter equally and pull in opposite directions:
//   - NOT TWO. A double-notify emails the customer twice and, worse, tells the
//     founder twice about one order they will manually price and invoice.
//   - NOT ZERO. A silently dropped notification is an order nobody is told
//     about, on a launch where the founder sends payment instructions by hand.
//
// So every assertion here is an exact count, never "at least one".

import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ADMIN_BEARER,
  buildDoor,
  submission,
} from "./harness/assisted-order-door";

const SUBMIT = "/api/research/early-access/assisted-orders";

type Enqueued = Readonly<{
  recipientKind?: string;
  recipientAddress?: string;
  dedupeKey?: string;
  templateKey?: string;
  payload?: Record<string, unknown>;
}>;

function byKind(enqueued: unknown[], kind: string): Enqueued[] {
  return (enqueued as Enqueued[]).filter((message) => message.recipientKind === kind);
}

async function submitAs(app: Parameters<typeof request>[0], body: Record<string, unknown>) {
  return request(app).post(SUBMIT).set("x-test-member", "a").send(body);
}

describe("acceptance path: one submission makes exactly one of each artifact", () => {
  it("creates one durable request, one customer email and one admin email", async () => {
    const { app, enqueued } = buildDoor();

    const response = await submitAs(app, submission());
    expect(response.status).toBe(201);
    expect(response.body.publicReference).toMatch(/^XRR-\d{8}-[A-F0-9]{10}$/);

    const queue = await request(app)
      .get("/api/admin/research/assisted-orders")
      .set("authorization", ADMIN_BEARER);
    expect(queue.status).toBe(200);
    expect(queue.body.total).toBe(1);

    expect(byKind(enqueued, "customer")).toHaveLength(1);
    expect(byKind(enqueued, "admin")).toHaveLength(1);
    expect(enqueued).toHaveLength(2);
  });

  it("addresses the customer email to the customer and the admin email to Xenios", async () => {
    const { app, enqueued } = buildDoor();
    await submitAs(app, submission());

    expect(byKind(enqueued, "customer")[0].recipientAddress).toBe("member@example.com");
    expect(byKind(enqueued, "admin")[0].recipientAddress).toBe(
      "research@xeniostechnology.com",
    );
  });

  it("gives every notification a dedupe key naming the exact request", async () => {
    // The outbox can only protect against a redelivery it can recognise.
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, submission());
    const requestId = response.body.requestId as string;

    for (const message of enqueued as Enqueued[]) {
      expect(message.dedupeKey).toBeTruthy();
      expect(message.dedupeKey).toContain(requestId);
    }
    expect(new Set((enqueued as Enqueued[]).map((m) => m.dedupeKey)).size).toBe(2);
  });
});

describe("acceptance path: a replayed submission must not tell anyone twice", () => {
  it("does not re-notify when the same idempotency key is submitted again", async () => {
    const { app, enqueued } = buildDoor();
    const body = submission({ idempotencyKey: "acceptance-replay" });

    const first = await submitAs(app, body);
    const second = await submitAs(app, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.publicReference).toBe(first.body.publicReference);

    // The founder must be told once about one order they will price by hand.
    expect(byKind(enqueued, "customer")).toHaveLength(1);
    expect(byKind(enqueued, "admin")).toHaveLength(1);
  });

  it("does not re-notify when two identical submissions race", async () => {
    const { app, enqueued } = buildDoor();
    const body = submission({ idempotencyKey: "acceptance-race" });

    const [first, second] = await Promise.all([
      submitAs(app, body),
      submitAs(app, body),
    ]);
    expect(first.body.publicReference).toBe(second.body.publicReference);

    const queue = await request(app)
      .get("/api/admin/research/assisted-orders")
      .set("authorization", ADMIN_BEARER);
    expect(queue.body.total).toBe(1);
    expect(byKind(enqueued, "customer")).toHaveLength(1);
    expect(byKind(enqueued, "admin")).toHaveLength(1);
  });

  it("notifies separately for two genuinely different orders", async () => {
    // The exactly-once rule must not become a never-again rule.
    const { app, enqueued } = buildDoor();
    await submitAs(app, submission({ idempotencyKey: "acceptance-first" }));
    await submitAs(app, submission({ idempotencyKey: "acceptance-second" }));

    expect(byKind(enqueued, "customer")).toHaveLength(2);
    expect(byKind(enqueued, "admin")).toHaveLength(2);
  });
});

describe("acceptance path: the customer is told the truth about what just happened", () => {
  // The founder sends payment instructions manually AFTER reviewing
  // availability. The customer notification must therefore never imply that
  // money has moved, that stock is held, or that anything has shipped.
  const FORBIDDEN = ["paid", "confirmed", "in stock", "shipped", "dispatched"];

  it("never tells the customer the order is paid, confirmed, in stock or shipped", async () => {
    const { app, enqueued } = buildDoor();
    await submitAs(app, submission());

    const customer = byKind(enqueued, "customer")[0];
    const rendered = JSON.stringify(customer.payload ?? {}).toLowerCase();
    for (const claim of FORBIDDEN) {
      expect(rendered).not.toContain(claim);
    }
  });

  it("keeps the status credential out of email while preserving the safe reference", async () => {
    const { app, enqueued } = buildDoor();
    const response = await submitAs(app, submission());
    const customer = byKind(enqueued, "customer")[0];

    expect((customer.payload ?? {}).publicReference).toBe(
      response.body.publicReference,
    );
    expect(customer.payload ?? {}).not.toHaveProperty("statusPath");
    expect(JSON.stringify(customer.payload ?? {})).not.toContain(
      response.body.statusToken,
    );
  });

  it("does not leak internal money data into either notification", async () => {
    const { app, enqueued } = buildDoor();
    await submitAs(app, submission());

    const everything = JSON.stringify(enqueued).toLowerCase();
    for (const term of ["wholesale", "margin", "markup", "suppliercost", "multiplier"]) {
      expect(everything).not.toContain(term);
    }
  });
});

describe("acceptance path: a refused submission tells nobody", () => {
  it("enqueues nothing when the submission is rejected", async () => {
    // A notification for an order that does not exist would put the founder to
    // work pricing something no customer ever successfully asked for.
    const { app, enqueued } = buildDoor();

    const response = await submitAs(app, {
      ...submission(),
      lines: [
        { productId: "pc_unknown", variantId: "pc_unknown_variant", quantity: 1 },
      ],
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(enqueued).toHaveLength(0);
  });
});
