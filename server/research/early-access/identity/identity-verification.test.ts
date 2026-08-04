import { describe, expect, it } from "vitest";
import {
  createEarlyAccessCustomer,
  customerRefFor,
  InMemoryEarlyAccessCustomerRepository,
  transitionEarlyAccessCustomer,
  type EarlyAccessCustomerRecord,
} from "./early-access-customer";
import {
  EarlyAccessCustomerDirectory,
  InMemoryConsumedTokenStore,
  InMemorySessionBindingStore,
  mintVerificationToken,
  redeemVerificationToken,
} from "./identity-verification";

const SECRET = "early-access-identity-secret-for-tests";
const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const NOW_ISO = "2026-08-04T12:00:00.000Z";

function approvedCustomer(
  id: string,
  email: string,
  name: string,
): EarlyAccessCustomerRecord {
  const created = createEarlyAccessCustomer({ id, email, legalName: name, now: NOW_ISO });
  if (!created.ok) throw new Error(`fixture refused: ${created.code}`);
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Founding early access invite",
    now: NOW_ISO,
  });
  if (!approved.ok) throw new Error(`fixture approval refused: ${approved.code}`);
  return approved.value;
}

async function world() {
  const customers = new InMemoryEarlyAccessCustomerRepository();
  const alice = approvedCustomer("cus_alice", "alice@example.invalid", "Alice Example");
  const bob = approvedCustomer("cus_bob", "bob@example.invalid", "Bob Example");
  await customers.insert(alice);
  await customers.insert(bob);
  return {
    customers,
    alice,
    bob,
    consumed: new InMemoryConsumedTokenStore(),
    bindings: new InMemorySessionBindingStore(),
  };
}

function tokenFor(
  customer: EarlyAccessCustomerRecord,
  sessionId: string,
  overrides: Record<string, unknown> = {},
): string {
  const minted = mintVerificationToken({
    tokenId: `tok_${customer.id}_${sessionId}`,
    customerId: customer.id,
    email: customer.email,
    sessionId,
    nowMs: NOW,
    secret: SECRET,
    ...overrides,
  });
  if (!minted.ok) throw new Error(`mint refused: ${minted.code}`);
  return minted.value;
}

describe("verification token redemption", () => {
  it("binds a session to exactly the customer the token was minted for", async () => {
    const w = await world();
    const result = await redeemVerificationToken({
      token: tokenFor(w.alice, "sess_alice"),
      sessionId: "sess_alice",
      secret: SECRET,
      nowMs: NOW + 1_000,
      customers: w.customers,
      consumed: w.consumed,
      bindings: w.bindings,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("cus_alice");
    expect(await w.bindings.get("sess_alice")).toBe("cus_alice");
  });

  it("REFUSES one customer's token presented by another customer's session", async () => {
    // The required negative test. Alice's link, however Bob obtained it (a
    // forwarded email, a shared screenshot, a leaked inbox), must never attach
    // Alice's identity to Bob's session.
    const w = await world();
    const result = await redeemVerificationToken({
      token: tokenFor(w.alice, "sess_alice"),
      sessionId: "sess_bob",
      secret: SECRET,
      nowMs: NOW + 1_000,
      customers: w.customers,
      consumed: w.consumed,
      bindings: w.bindings,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TOKEN_SESSION_MISMATCH");
    expect(await w.bindings.get("sess_bob")).toBeNull();
    expect(await w.bindings.get("sess_alice")).toBeNull();
  });

  it("does not burn a token that the wrong session presented", async () => {
    // A refusal must not become a denial of service against the rightful owner.
    const w = await world();
    const token = tokenFor(w.alice, "sess_alice");
    const stolen = await redeemVerificationToken({
      token,
      sessionId: "sess_bob",
      secret: SECRET,
      nowMs: NOW + 1_000,
      customers: w.customers,
      consumed: w.consumed,
      bindings: w.bindings,
    });
    expect(stolen.ok).toBe(false);
    const rightful = await redeemVerificationToken({
      token,
      sessionId: "sess_alice",
      secret: SECRET,
      nowMs: NOW + 2_000,
      customers: w.customers,
      consumed: w.consumed,
      bindings: w.bindings,
    });
    expect(rightful.ok).toBe(true);
  });

  it("is single use", async () => {
    const w = await world();
    const token = tokenFor(w.alice, "sess_alice");
    const first = await redeemVerificationToken({
      token, sessionId: "sess_alice", secret: SECRET, nowMs: NOW + 1_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(first.ok).toBe(true);
    const second = await redeemVerificationToken({
      token, sessionId: "sess_alice", secret: SECRET, nowMs: NOW + 2_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("TOKEN_ALREADY_USED");
  });

  it("expires", async () => {
    const w = await world();
    const result = await redeemVerificationToken({
      token: tokenFor(w.alice, "sess_alice", { ttlSeconds: 60 }),
      sessionId: "sess_alice",
      secret: SECRET,
      nowMs: NOW + 61_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TOKEN_EXPIRED");
  });

  it("refuses a forged or re-signed token", async () => {
    const w = await world();
    const token = tokenFor(w.alice, "sess_alice");
    const [encoded] = token.split(".");
    for (const forged of [
      `${encoded}.${Buffer.from("not-a-signature").toString("base64url")}`,
      token.slice(0, -2),
      encoded,
    ]) {
      const result = await redeemVerificationToken({
        token: forged, sessionId: "sess_alice", secret: SECRET, nowMs: NOW + 1_000,
        customers: w.customers, consumed: w.consumed, bindings: w.bindings,
      });
      expect(result.ok).toBe(false);
    }
    // A token signed with a different secret must not verify here either.
    const otherSecret = tokenFor(w.alice, "sess_alice");
    const wrongSecret = await redeemVerificationToken({
      token: otherSecret, sessionId: "sess_alice", secret: "a-different-secret",
      nowMs: NOW + 1_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(wrongSecret.ok).toBe(false);
    if (!wrongSecret.ok) expect(wrongSecret.code).toBe("TOKEN_SIGNATURE_INVALID");
  });

  it("refuses a session already bound to a different customer", async () => {
    const w = await world();
    await w.bindings.bind("sess_shared", "cus_bob");
    const result = await redeemVerificationToken({
      token: tokenFor(w.alice, "sess_shared"),
      sessionId: "sess_shared", secret: SECRET, nowMs: NOW + 1_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SESSION_ALREADY_BOUND");
  });

  it("refuses a customer who is not APPROVED", async () => {
    const w = await world();
    const invited = createEarlyAccessCustomer({
      id: "cus_invited", email: "invited@example.invalid",
      legalName: "Invited Person", now: NOW_ISO,
    });
    if (!invited.ok) throw new Error("fixture");
    await w.customers.insert(invited.value);
    const result = await redeemVerificationToken({
      token: tokenFor(invited.value, "sess_invited"),
      sessionId: "sess_invited", secret: SECRET, nowMs: NOW + 1_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CUSTOMER_NOT_APPROVED");
  });

  it("refuses a token whose email no longer matches the customer", async () => {
    const w = await world();
    const token = tokenFor(w.alice, "sess_alice");
    await w.customers.update({
      ...w.alice,
      email: "alice+new@example.invalid",
      normalizedEmail: "alice+new@example.invalid",
    });
    const result = await redeemVerificationToken({
      token, sessionId: "sess_alice", secret: SECRET, nowMs: NOW + 1_000,
      customers: w.customers, consumed: w.consumed, bindings: w.bindings,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TOKEN_EMAIL_MISMATCH");
  });

  it("mints opaque tokens, never a sequential id", async () => {
    const w = await world();
    const token = tokenFor(w.alice, "sess_alice");
    expect(token).not.toContain("cus_alice");
    expect(token).not.toContain("alice@example.invalid");
    expect(/^\d+$/.test(token)).toBe(false);
    expect(token.split(".")).toHaveLength(2);
  });
});

describe("the identity directory", () => {
  const directoryFor = (w: Awaited<ReturnType<typeof world>>, sessionId: string | null) =>
    new EarlyAccessCustomerDirectory({
      readSessionId: () => sessionId,
      bindings: w.bindings,
      customers: w.customers,
    });

  it("resolves only a session that was bound through a door", async () => {
    const w = await world();
    await w.bindings.bind("sess_alice", "cus_alice");
    const resolved = await directoryFor(w, "sess_alice").resolve({ cookieHeader: "x" });
    expect(resolved).not.toBeNull();
    expect(resolved?.customerRef).toBe(customerRefFor(w.alice));
    expect(resolved?.displayName).toBe("Alice Example");
  });

  it("resolves nobody for an unbound session, which is the password-only case", async () => {
    // Entering the shared password creates a session but binds no customer, so
    // the buyer is nobody and the order routes refuse.
    const w = await world();
    expect(await directoryFor(w, "sess_unbound").resolve({ cookieHeader: "x" })).toBeNull();
  });

  it("resolves nobody when there is no session at all", async () => {
    const w = await world();
    expect(await directoryFor(w, null).resolve({ cookieHeader: undefined })).toBeNull();
  });

  it("stops resolving once a customer is revoked", async () => {
    const w = await world();
    await w.bindings.bind("sess_alice", "cus_alice");
    const revoked = transitionEarlyAccessCustomer({
      customer: w.alice, to: "REVOKED", by: "Samuel Boadu",
      reason: "Access withdrawn", now: NOW_ISO,
    });
    if (!revoked.ok) throw new Error("fixture");
    await w.customers.update(revoked.value);
    expect(await directoryFor(w, "sess_alice").resolve({ cookieHeader: "x" })).toBeNull();
  });

  it("never exposes an email as the order-facing reference", async () => {
    const w = await world();
    await w.bindings.bind("sess_alice", "cus_alice");
    const resolved = await directoryFor(w, "sess_alice").resolve({ cookieHeader: "x" });
    expect(resolved?.customerRef).not.toContain("alice@example.invalid");
    expect(resolved?.customerRef.startsWith("eac_")).toBe(true);
  });
});
