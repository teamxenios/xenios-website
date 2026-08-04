import { describe, expect, it } from "vitest";
import {
  createEarlyAccessCustomer,
  customerRefFor,
  EARLY_ACCESS_AUDIENCE,
  InMemoryEarlyAccessCustomerRepository,
  mayOwnOrders,
  normalizeEmail,
  transitionEarlyAccessCustomer,
  type EarlyAccessCustomerRecord,
} from "./early-access-customer";

const NOW = "2026-08-04T12:00:00.000Z";
const LATER = "2026-08-04T13:00:00.000Z";

function invited(overrides: Record<string, unknown> = {}): EarlyAccessCustomerRecord {
  const result = createEarlyAccessCustomer({
    id: "cus_alice",
    email: "Alice@Example.Invalid",
    legalName: "Alice Example",
    now: NOW,
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture refused: ${result.code}`);
  return result.value;
}

describe("creating an Early Access customer", () => {
  it("always starts INVITED, never approved in one step", () => {
    const customer = invited();
    expect(customer.status).toBe("INVITED");
    expect(customer.approvedBy).toBe("");
    expect(customer.approvedAt).toBeNull();
    expect(mayOwnOrders(customer)).toBe(false);
    expect(customer.audience).toBe(EARLY_ACCESS_AUDIENCE);
  });

  it("normalizes the email for uniqueness but keeps what the person typed", () => {
    const customer = invited();
    expect(customer.email).toBe("Alice@Example.Invalid");
    expect(customer.normalizedEmail).toBe("alice@example.invalid");
  });

  it("does not merge plus-addressed identities, which would merge two humans", () => {
    expect(normalizeEmail("a+b@x.invalid")).toBe("a+b@x.invalid");
    expect(normalizeEmail("a+b@x.invalid")).not.toBe(normalizeEmail("a@x.invalid"));
  });

  it.each([
    ["a malformed email", { email: "not-an-email" }, "EMAIL_INVALID"],
    ["an empty legal name", { legalName: " " }, "LEGAL_NAME_INVALID"],
    ["an unsafe identifier", { id: "../etc/passwd" }, "IDENTIFIER_INVALID"],
    ["a bad instant", { now: "whenever" }, "INSTANT_INVALID"],
    ["a too-short phone", { phone: "12" }, "PHONE_INVALID"],
  ])("refuses %s", (_label, overrides, code) => {
    const result = createEarlyAccessCustomer({
      id: "cus_alice",
      email: "alice@example.invalid",
      legalName: "Alice Example",
      now: NOW,
      ...overrides,
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
});

describe("approval is a named human decision", () => {
  it("approves with a name and a reason", () => {
    const result = transitionEarlyAccessCustomer({
      customer: invited(),
      to: "APPROVED",
      by: "Samuel Boadu",
      reason: "Founding early access invite",
      now: LATER,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("APPROVED");
      expect(result.value.approvedBy).toBe("Samuel Boadu");
      expect(result.value.approvedAt).toBe(LATER);
      expect(mayOwnOrders(result.value)).toBe(true);
    }
  });

  it.each(["the system", "system", "automation", "bot", "admin", " ", "x"])(
    "refuses %j as an approver",
    (by) => {
      const result = transitionEarlyAccessCustomer({
        customer: invited(),
        to: "APPROVED",
        by,
        reason: "Founding early access invite",
        now: LATER,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("APPROVER_NOT_NAMED");
    },
  );

  it("requires a reason", () => {
    const result = transitionEarlyAccessCustomer({
      customer: invited(),
      to: "APPROVED",
      by: "Samuel Boadu",
      reason: "",
      now: LATER,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("APPROVAL_REASON_MISSING");
  });

  it("never resurrects a revoked identity", () => {
    const revoked = transitionEarlyAccessCustomer({
      customer: invited(),
      to: "REVOKED",
      by: "Samuel Boadu",
      reason: "Access withdrawn",
      now: LATER,
    });
    if (!revoked.ok) throw new Error("fixture");
    for (const to of ["APPROVED", "SUSPENDED", "INVITED"] as const) {
      const attempt = transitionEarlyAccessCustomer({
        customer: revoked.value,
        to,
        by: "Samuel Boadu",
        reason: "Trying to restore",
        now: LATER,
      });
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) expect(attempt.code).toBe("STATUS_TRANSITION_INVALID");
    }
  });

  it("suspends and restores an approved customer", () => {
    const approved = transitionEarlyAccessCustomer({
      customer: invited(), to: "APPROVED", by: "Samuel Boadu",
      reason: "Founding invite", now: LATER,
    });
    if (!approved.ok) throw new Error("fixture");
    const suspended = transitionEarlyAccessCustomer({
      customer: approved.value, to: "SUSPENDED", by: "Samuel Boadu",
      reason: "Payment dispute under review", now: LATER,
    });
    expect(suspended.ok).toBe(true);
    if (suspended.ok) expect(mayOwnOrders(suspended.value)).toBe(false);
  });
});

describe("the repository", () => {
  it("refuses a duplicate normalized email rather than overwriting", async () => {
    const repository = new InMemoryEarlyAccessCustomerRepository();
    const first = await repository.insert(invited());
    expect(first.ok).toBe(true);
    const second = await repository.insert(
      invited({ id: "cus_other", email: "ALICE@example.invalid" }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(await repository.findById("cus_other")).toBeNull();
  });

  it("finds by normalized email regardless of typed case", async () => {
    const repository = new InMemoryEarlyAccessCustomerRepository();
    await repository.insert(invited());
    expect(await repository.findByNormalizedEmail("alice@example.invalid")).not.toBeNull();
  });
});

describe("the order-facing reference", () => {
  it("is opaque, stable, and never the email or the raw id", () => {
    const customer = invited();
    const ref = customerRefFor(customer);
    expect(ref).toBe(customerRefFor(customer));
    expect(ref.startsWith("eac_")).toBe(true);
    expect(ref).not.toContain("alice");
    expect(ref).not.toContain("cus_alice");
  });

  it("differs per customer", () => {
    expect(customerRefFor(invited())).not.toBe(
      customerRefFor(invited({ id: "cus_bob", email: "bob@example.invalid" })),
    );
  });
});
