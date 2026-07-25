import { beforeEach, describe, expect, it } from "vitest";
import { AffiliateService, type AffiliateAccount, type AffiliateLink } from "./affiliate-service";
import type { OperationsActor } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const admin: OperationsActor = { id: "samuel", role: "admin" };
const system: OperationsActor = { id: "system", role: "system" };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("affiliate application, claim, login, links, and attribution", () => {
  let service: AffiliateService;
  let claimToken: string;

  beforeEach(() => {
    service = new AffiliateService("test-link-secret", "https://xenios.test");
    claimToken = unwrap(
      service.invite({
        id: "aff-1",
        email: "partner@example.com",
        displayName: "Partner",
        actor: admin,
        idempotencyKey: "invite-1",
        occurredAt: NOW,
      }),
    ).claimToken;
  });

  function apply(): AffiliateAccount {
    return unwrap(
      service.apply({
        claimToken,
        displayName: "Partner One",
        agreementVersion: "affiliate-v2",
        idempotencyKey: "apply-1",
        occurredAt: NOW,
      }),
    );
  }

  function activate(): AffiliateAccount {
    let account = apply();
    account = unwrap(
      service.claim({
        claimToken,
        authUserId: "auth-aff-1",
        idempotencyKey: "claim-1",
        occurredAt: NOW,
      }),
    );
    account = unwrap(
      service.review({
        affiliateId: account.id,
        to: "under_review",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "review-1",
        occurredAt: NOW,
      }),
    );
    account = unwrap(
      service.review({
        affiliateId: account.id,
        to: "approved",
        expectedVersion: account.version,
        customCode: "PARTNER1",
        actor: admin,
        idempotencyKey: "approve-1",
        occurredAt: NOW,
      }),
    );
    return unwrap(
      service.review({
        affiliateId: account.id,
        to: "active",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "activate-1",
        occurredAt: NOW,
      }),
    );
  }

  function link(): AffiliateLink {
    activate();
    return unwrap(
      service.issueLink({
        affiliateId: "aff-1",
        campaign: "launch",
        actor: { id: "aff-1", role: "affiliate" },
        idempotencyKey: "link-1",
        occurredAt: NOW,
      }),
    );
  }

  it("runs invited → applied → under review → approved → active with claim-based login", () => {
    const active = activate();
    expect(active.state).toBe("active");
    const login = unwrap(service.login("auth-aff-1"));
    expect(login).toMatchObject({ id: "aff-1", state: "active", code: "PARTNER1" });
  });

  it("invalidates the invitation after claim and refuses a second account claim", () => {
    apply();
    unwrap(
      service.claim({
        claimToken,
        authUserId: "auth-aff-1",
        idempotencyKey: "claim-once",
        occurredAt: NOW,
      }),
    );
    expect(
      service.claim({
        claimToken,
        authUserId: "auth-aff-2",
        idempotencyKey: "claim-twice",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "invalid_invitation" });
  });

  it("does not activate before a claimed login and agreement exist", () => {
    let account = apply();
    account = unwrap(
      service.review({
        affiliateId: account.id,
        to: "under_review",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "review-no-claim",
        occurredAt: NOW,
      }),
    );
    account = unwrap(
      service.review({
        affiliateId: account.id,
        to: "approved",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "approve-no-claim",
        occurredAt: NOW,
      }),
    );
    expect(
      service.review({
        affiliateId: account.id,
        to: "active",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "active-no-claim",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("issues signed links only for the owning active affiliate", () => {
    const issued = link();
    expect(issued.url).toContain(encodeURIComponent(issued.code));
    expect(
      service.issueLink({
        affiliateId: "aff-1",
        campaign: null,
        actor: { id: "aff-2", role: "affiliate" },
        idempotencyKey: "impersonate",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("records clicks, unique visitors, qualified signups, orders, conversion, refunds, and chargebacks without PII", () => {
    const issued = link();
    const visitor = "visitor_key_123456789";
    unwrap(service.recordClick({ code: issued.code, visitorKey: visitor, idempotencyKey: "click-1", occurredAt: NOW }));
    unwrap(service.recordClick({ code: issued.code, visitorKey: visitor, idempotencyKey: "click-2", occurredAt: NOW }));
    unwrap(service.recordSignup({ code: issued.code, visitorKey: visitor, idempotencyKey: "signup-1", occurredAt: NOW }));
    unwrap(
      service.attributeOrder({
        code: issued.code,
        visitorKey: visitor,
        orderId: "ord-1",
        eligibleRevenueCents: 20_000,
        actor: system,
        idempotencyKey: "order-1",
        occurredAt: NOW,
      }),
    );
    unwrap(
      service.recordRevenueAdjustment({
        affiliateId: "aff-1",
        kind: "refund",
        amountCents: 2_000,
        actor: system,
        idempotencyKey: "refund-1",
        occurredAt: NOW,
      }),
    );
    unwrap(
      service.recordRevenueAdjustment({
        affiliateId: "aff-1",
        kind: "chargeback",
        amountCents: 500,
        actor: system,
        idempotencyKey: "chargeback-1",
        occurredAt: NOW,
      }),
    );
    const dashboard = unwrap(service.login("auth-aff-1"));
    expect(dashboard.metrics).toEqual({
      clicks: 2,
      uniqueVisitors: 1,
      qualifiedSignups: 1,
      orders: 1,
      conversionRate: 1,
      eligibleRevenueCents: 20_000,
      refundsCents: 2_000,
      chargebacksCents: 500,
    });
    const json = JSON.stringify(dashboard).toLowerCase();
    for (const forbidden of ["email", "displayname", visitor, "customer", "member"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("locks one immutable winner per order and rejects client overrides", () => {
    const issued = link();
    const command = {
      code: issued.code,
      visitorKey: "visitor_key_123456789",
      orderId: "ord-1",
      eligibleRevenueCents: 20_000,
      actor: system,
      idempotencyKey: "attribute-1",
      occurredAt: NOW,
    };
    expect(service.attributeOrder(command)).toMatchObject({ ok: true, idempotent: false });
    expect(service.attributeOrder(command)).toMatchObject({ ok: true, idempotent: true });
    expect(service.attributeOrder({ ...command, idempotencyKey: "another-command" })).toMatchObject({
      ok: false,
      code: "attribution_locked",
    });
    expect(
      service.attributeOrder({
        ...command,
        orderId: "ord-2",
        actor: { id: "aff-1", role: "affiliate" },
        idempotencyKey: "client-override",
      }),
    ).toMatchObject({ ok: false, code: "override_rejected" });
  });

  it("rejects identity-bearing visitor keys and tampered codes", () => {
    const issued = link();
    expect(
      service.recordClick({
        code: issued.code,
        visitorKey: "person@example.com",
        idempotencyKey: "pii-click",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "subject_not_opaque" });
    expect(
      service.recordClick({
        code: `${issued.code}tampered`,
        visitorKey: "visitor_key_123456789",
        idempotencyKey: "bad-code",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "invalid_code" });
  });

  it("records fraud flags for admin review but exposes none on the affiliate dashboard", () => {
    activate();
    unwrap(
      service.flagFraud({
        affiliateId: "aff-1",
        reason: "click_spike",
        severity: "hold",
        detail: "Unusual velocity.",
        actor: admin,
        idempotencyKey: "fraud-1",
        occurredAt: NOW,
      }),
    );
    expect(unwrap(service.listFraud(admin))).toHaveLength(1);
    expect(JSON.stringify(unwrap(service.login("auth-aff-1")))).not.toContain("click_spike");
  });
});
