import { describe, expect, it } from "vitest";
import { PARTNER_FORBIDDEN_FIELDS } from "@shared/research/distribution";
import {
  PARTNER_LEDGERS,
  createInMemoryPartnerPortalPort,
  createPartnerPortalService,
  dayOf,
  periodOf,
  type InMemoryPortalData,
  type PartnerPortalPort,
  type PortalPartnerIdentity,
} from "./portal";

// ---------------------------------------------------------------------------
// Fixtures. Two partners in two different organizations, so every scoping claim
// has a real second tenant to be proven against rather than an empty database.
// ---------------------------------------------------------------------------

const ALICE: PortalPartnerIdentity = {
  partnerId: "partner_alice",
  memberId: "member_alice",
  role: "research_rep",
  state: "active",
  identityVerified: true,
  taxStatus: "verified",
  payoutStatus: "verified",
  certifiedAt: "2026-05-01T00:00:00.000Z",
  activatedAt: "2026-05-02T00:00:00.000Z",
};

const BRUNO: PortalPartnerIdentity = {
  partnerId: "partner_bruno",
  memberId: "member_bruno",
  role: "affiliate",
  state: "training_pending",
  identityVerified: false,
  taxStatus: "not_started",
  payoutStatus: "not_started",
  certifiedAt: null,
  activatedAt: null,
};

const FIXTURE: InMemoryPortalData = {
  partners: [ALICE, BRUNO],
  agreements: {
    partner_alice: [
      { agreementKey: "partner_agreement", agreementVersion: "1.0.0", decision: "accepted", decidedAt: "2026-05-01T00:00:00.000Z" },
      { agreementKey: "code_of_conduct", agreementVersion: "0.9.0", decision: "accepted", decidedAt: "2026-04-01T00:00:00.000Z" },
    ],
  },
  training: {
    partner_alice: [
      { moduleKey: "ftc_disclosures", moduleVersion: "1.0.0", completedAt: "2026-05-03T10:00:00.000Z" },
      { moduleKey: "ftc_disclosures", moduleVersion: "1.0.1", completedAt: "2026-06-03T10:00:00.000Z" },
    ],
  },
  links: {
    partner_alice: [
      { linkId: "l1", channel: "signed_link", campaign: "spring", createdAt: "2026-03-01T00:00:00.000Z", revokedAt: null },
      { linkId: "l2", channel: "qr", campaign: "spring", createdAt: "2026-03-08T00:00:00.000Z", revokedAt: "2026-04-01T00:00:00.000Z" },
      { linkId: "l3", channel: "code", campaign: "autumn", createdAt: "2026-09-01T00:00:00.000Z", revokedAt: "2026-09-20T00:00:00.000Z" },
      { linkId: "l4", channel: "code", campaign: null, createdAt: "2026-09-01T00:00:00.000Z", revokedAt: null },
    ],
    partner_bruno: [
      { linkId: "l9", channel: "signed_link", campaign: "bruno-only", createdAt: "2026-03-01T00:00:00.000Z", revokedAt: null },
    ],
  },
  touches: {
    partner_alice: [
      { channel: "signed_link", occurredAt: "2026-05-02T00:00:00.000Z" },
      { channel: "signed_link", occurredAt: "2026-05-19T00:00:00.000Z" },
      { channel: "qr", occurredAt: "2026-05-19T00:00:00.000Z" },
      { channel: "signed_link", occurredAt: "2026-06-01T00:00:00.000Z" },
      { channel: "signed_link", occurredAt: "not-a-date" },
    ],
  },
  conversions: {
    partner_alice: [
      { convertedAt: "2026-05-10T00:00:00.000Z" },
      { convertedAt: "2026-05-28T00:00:00.000Z" },
      { convertedAt: "2026-06-02T00:00:00.000Z" },
    ],
  },
  commissions: {
    partner_alice: [
      { id: "c1", state: "held", amountCents: 1250, reversesLedgerId: null, createdAt: "2026-05-10T00:00:00.000Z" },
      { id: "c2", state: "reversed", amountCents: 1250, reversesLedgerId: "c1", createdAt: "2026-06-01T00:00:00.000Z" },
    ],
  },
  payoutBatches: {
    partner_alice: [
      {
        batchId: "b1",
        totalCents: 4200,
        state: "settled",
        providerName: "stripe_connect",
        builtAt: "2026-06-01T00:00:00.000Z",
        settledAt: "2026-06-03T00:00:00.000Z",
      },
      {
        batchId: "b2",
        totalCents: 900,
        state: "built",
        providerName: "disabled",
        builtAt: "2026-07-01T00:00:00.000Z",
        settledAt: null,
      },
    ],
  },
  organizations: {
    partner_alice: [
      { orgId: "org_a", name: "Northside Strength", state: "active", ownerPartnerId: "partner_alice" },
      { orgId: "org_shared", name: "Shared Clinic", state: "suspended", ownerPartnerId: "partner_zed" },
    ],
    partner_bruno: [{ orgId: "org_b", name: "Bruno Gym", state: "active", ownerPartnerId: "partner_bruno" }],
  },
  organizationEvents: [
    { eventId: "e1", organizationId: "org_a", name: "Launch night", campaign: "spring", startsAt: "2026-06-10T18:00:00.000Z" },
    { eventId: "e2", organizationId: "org_a", name: "Open floor", campaign: null, startsAt: null },
    { eventId: "e_secret", organizationId: "org_b", name: "Bruno private session", campaign: null, startsAt: "2026-06-11T18:00:00.000Z" },
  ],
  contentSubmissions: {
    partner_alice: [
      { assetId: "a1", title: "Intro post", state: "preapproved", createdAt: "2026-05-04T00:00:00.000Z" },
      { assetId: "a2", title: "Story draft", state: "rejected", createdAt: "2026-05-06T00:00:00.000Z" },
    ],
  },
};

function service(overrides: InMemoryPortalData = {}) {
  return createPartnerPortalService(createInMemoryPartnerPortalPort({ ...FIXTURE, ...overrides }));
}

describe("period helpers", () => {
  it("buckets an ISO timestamp into a YYYY-MM period and a YYYY-MM-DD day", () => {
    expect(periodOf("2026-05-19T12:00:00.000Z")).toBe("2026-05");
    expect(dayOf("2026-05-19T12:00:00.000Z")).toBe("2026-05-19");
  });

  it("returns null for a value that is not a date, so a bad row is dropped and never guessed into a bucket", () => {
    expect(periodOf("not-a-date")).toBeNull();
    expect(dayOf("")).toBeNull();
  });
});

describe("onboarding", () => {
  it("marks an agreement acknowledged only at the CURRENT version", async () => {
    const payload = await service().onboarding(ALICE);
    const byId = new Map(payload.agreements.map((a) => [a.id, a]));
    expect(byId.get("partner_agreement")?.acknowledged).toBe(true);
    // Accepted at 0.9.0, so the 1.0.0 requirement is still outstanding.
    expect(byId.get("code_of_conduct")?.acknowledged).toBe(false);
    expect(byId.get("privacy_and_data_handling")?.acknowledged).toBe(false);
  });

  it("reports verification from the partner row, with plain-English detail", async () => {
    expect((await service().onboarding(ALICE)).verification).toEqual({
      state: "verified",
      detail: "Your identity check has cleared.",
    });
    const bruno = await service().onboarding(BRUNO);
    expect(bruno.verification.state).toBe("pending");
    expect(bruno.agreements.every((a) => a.acknowledged === false)).toBe(true);
  });
});

describe("training", () => {
  it("reports completion per module and keeps the latest completion of a repeated module", async () => {
    const payload = await service().training(ALICE);
    const disclosures = payload.modules.find((m) => m.id === "ftc_disclosures");
    expect(disclosures?.completed).toBe(true);
    expect(disclosures?.completedAt).toBe("2026-06-03");
    expect(payload.modules.find((m) => m.id === "fraud")?.completed).toBe(false);
    expect(payload.modules).toHaveLength(14);
  });

  it("takes certification from the named admin decision, never from module completion", async () => {
    expect((await service().training(ALICE)).certified).toBe(true);
    // Bruno has completed nothing and is not certified; giving him every module
    // must still not certify him, because certification is an admin decision.
    const everyModule = await service({
      training: {
        partner_bruno: [{ moduleKey: "fraud", moduleVersion: "1.0.0", completedAt: "2026-06-01T00:00:00.000Z" }],
      },
    }).training(BRUNO);
    expect(everyModule.certified).toBe(false);
  });
});

describe("leads and conversions are aggregates, never people", () => {
  it("counts leads by period and channel and drops an unparseable timestamp", async () => {
    const payload = await service().leads("partner_alice");
    expect(payload.rows).toEqual([
      { period: "2026-06", channel: "signed_link", leads: 1 },
      { period: "2026-05", channel: "signed_link", leads: 2 },
      { period: "2026-05", channel: "qr", leads: 1 },
    ]);
  });

  it("counts activations by period and reports renewals as unknown rather than zero", async () => {
    const payload = await service().conversions("partner_alice");
    expect(payload.rows).toEqual([
      { period: "2026-06", activations: 1, renewals: null },
      { period: "2026-05", activations: 2, renewals: null },
    ]);
  });

  it("carries no identity field in any aggregate row", async () => {
    const leads = JSON.stringify(await service().leads("partner_alice"));
    const conversions = JSON.stringify(await service().conversions("partner_alice"));
    ["subject", "member", "email", "orderId", "order_id", "name"].forEach((field) => {
      expect(leads.toLowerCase()).not.toContain(field.toLowerCase());
      expect(conversions.toLowerCase()).not.toContain(field.toLowerCase());
    });
  });
});

describe("commissions", () => {
  it("tags every entry as the affiliate commission ledger and never as wholesale", async () => {
    const payload = await service().commissions("partner_alice");
    expect(payload.entries).toHaveLength(2);
    payload.entries.forEach((entry) => {
      expect(entry.ledger).toBe(PARTNER_LEDGERS.affiliateCommission);
      expect(entry.ledger).not.toBe(PARTNER_LEDGERS.whiteLabelWholesale);
    });
    expect(JSON.stringify(payload)).not.toContain(PARTNER_LEDGERS.whiteLabelWholesale);
  });

  it("describes a reversal as a reversal and never names an order", async () => {
    const payload = await service().commissions("partner_alice");
    const reversal = payload.entries.find((e) => e.id === "c2");
    expect(reversal?.description).toBe("Reversal of a referred order commission");
    expect(reversal?.state).toBe("reversed");
    expect(JSON.stringify(payload)).not.toContain("order_");
  });
});

describe("payouts are read-only status", () => {
  it("reports the method from the partner row, never a credential", async () => {
    const alice = await service().payouts(ALICE);
    expect(alice.method).toEqual({ configured: true, label: "Payout method on file" });
    const bruno = await service().payouts(BRUNO);
    expect(bruno.method).toEqual({ configured: false, label: "No payout method on file" });
    expect(JSON.stringify(alice)).not.toMatch(/account|routing|iban|token|secret/i);
  });

  it("says a provider is not configured instead of implying a method is on file", async () => {
    const payload = await service().payouts(ALICE);
    const unconfigured = payload.payouts.find((p) => p.id === "b2");
    expect(unconfigured?.method).toBe("No provider configured");
    expect(unconfigured?.status).toBe("built");
    const settled = payload.payouts.find((p) => p.id === "b1");
    expect(settled?.status).toBe("completed");
    expect(settled?.amountCents).toBe(4200);
  });

  it("computes no payable total and invents no scheduled payout", async () => {
    const empty = await service({ payoutBatches: {} }).payouts(ALICE);
    expect(empty.payouts).toEqual([]);
    expect(JSON.stringify(empty)).not.toContain("payable");
  });
});

describe("organization scoping", () => {
  it("lists only the organizations the partner owns or represents", async () => {
    const alice = await service().organizations("partner_alice");
    expect(alice.organizations.map((o) => o.id).sort()).toEqual(["org_a", "org_shared"]);
    expect(alice.organizations.find((o) => o.id === "org_a")?.role).toBe("Owner");
    expect(alice.organizations.find((o) => o.id === "org_shared")?.role).toBe("Representative");
    expect(JSON.stringify(alice)).not.toContain("Bruno Gym");
  });

  it("NEGATIVE: a partner cannot read another organization's events", async () => {
    const alice = await service().events("partner_alice");
    expect(alice.events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    // Bruno's org event exists in the same store and is never returned to Alice.
    expect(JSON.stringify(alice)).not.toContain("e_secret");
    expect(JSON.stringify(alice)).not.toContain("Bruno private session");

    const bruno = await service().events("partner_bruno");
    expect(bruno.events.map((e) => e.id)).toEqual(["e_secret"]);
    expect(JSON.stringify(bruno)).not.toContain("Launch night");
  });

  it("NEGATIVE: the events read never asks the store for an organization the partner does not hold", async () => {
    const asked: string[][] = [];
    const base = createInMemoryPartnerPortalPort(FIXTURE);
    const spy: PartnerPortalPort = {
      ...base,
      async eventsForOrganizations(orgIds) {
        asked.push(orgIds.slice() as string[]);
        return base.eventsForOrganizations(orgIds);
      },
    };
    await createPartnerPortalService(spy).events("partner_bruno");
    expect(asked).toEqual([["org_b"]]);
    expect(asked.flat()).not.toContain("org_a");
    expect(asked.flat()).not.toContain("org_shared");
  });

  it("a partner with no organization reads an empty event list without touching the event store", async () => {
    let called = false;
    const base = createInMemoryPartnerPortalPort(FIXTURE);
    const spy: PartnerPortalPort = {
      ...base,
      async eventsForOrganizations(orgIds) {
        called = true;
        return base.eventsForOrganizations(orgIds);
      },
    };
    const payload = await createPartnerPortalService(spy).events("partner_nobody");
    expect(payload.events).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("campaigns", () => {
  it("reports the campaign codes carried by the partner's own links, with a truthful status", async () => {
    const payload = await service().campaigns("partner_alice");
    expect(payload.campaigns.map((c) => c.name).sort()).toEqual(["autumn", "spring"]);
    // spring has one live link and one revoked link, so it is still issued.
    expect(payload.campaigns.find((c) => c.name === "spring")?.status).toBe("link issued");
    // autumn has only a revoked link.
    expect(payload.campaigns.find((c) => c.name === "autumn")?.status).toBe("link revoked");
    // A link with no campaign code is not a campaign.
    expect(payload.campaigns).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain("bruno-only");
  });

  it("never claims a campaign was approved", async () => {
    const payload = await service().campaigns("partner_alice");
    payload.campaigns.forEach((campaign) => {
      expect(campaign.status).not.toBe("approved");
      expect(campaign.status).not.toBe("active");
    });
  });
});

describe("compliance submissions", () => {
  it("lists the partner's own submissions and translates the state into the page's vocabulary", async () => {
    const payload = await service().compliance("partner_alice");
    expect(payload.submissions).toEqual([
      { id: "a2", title: "Story draft", submittedAt: "2026-05-06", status: "declined" },
      { id: "a1", title: "Intro post", submittedAt: "2026-05-04", status: "approved" },
    ]);
    expect(await service().compliance("partner_bruno")).toEqual({ submissions: [] });
  });

  it("refuses an empty submission before it reaches storage", async () => {
    const result = await service({ writesEnabled: true }).submitCompliance("partner_alice", {
      title: "   ",
      link: null,
      description: "something",
    });
    expect(result).toEqual({ ok: false, code: "invalid", message: "A submission needs a title and a description." });
  });

  it("records a submission and shows it back on the partner's own list only", async () => {
    const live = service({ writesEnabled: true, contentSubmissions: {} });
    const result = await live.submitCompliance("partner_alice", {
      title: "New reel",
      link: " https://example.test/draft ",
      description: " A short reel about the program. ",
    });
    expect(result.ok).toBe(true);
    expect((await live.compliance("partner_alice")).submissions.map((s) => s.title)).toEqual(["New reel"]);
    expect((await live.compliance("partner_bruno")).submissions).toEqual([]);
  });

  it("refuses a duplicate title rather than creating a confusing second row", async () => {
    const live = service({ writesEnabled: true, contentSubmissions: {} });
    await live.submitCompliance("partner_alice", { title: "Same", link: null, description: "one" });
    const second = await live.submitCompliance("partner_alice", { title: "Same", link: null, description: "two" });
    expect(second).toEqual({
      ok: false,
      code: "duplicate_title",
      message: "You already submitted content with that title.",
    });
  });

  it("refuses honestly when there is nowhere durable to record the submission", async () => {
    const result = await service().submitCompliance("partner_alice", {
      title: "New reel",
      link: null,
      description: "A short reel.",
    });
    expect(result).toEqual({
      ok: false,
      code: "capability_disabled",
      message: "Content submissions are not being accepted yet.",
    });
  });
});

describe("surfaces with no table behind them answer honestly", () => {
  it("returns an empty approved library rather than an invented asset or URL", async () => {
    expect(await service().resources()).toEqual({ assets: [] });
  });

  it("never fabricates a download URL for a library asset", async () => {
    const payload = await service({
      library: [
        { assetId: "lib1", title: "One pager", kind: "pdf", version: "1.0", updatedAt: "2026-05-01T00:00:00.000Z", signedUrl: null },
      ],
    }).resources();
    expect(payload.assets[0].signedUrl).toBeNull();
  });

  it("returns an empty session history rather than an invented sign-in", async () => {
    expect(await service().sessions("partner_alice")).toEqual({ sessions: [] });
  });
});

describe("no partner payload leaks commercial or member-private data", () => {
  const FORBIDDEN_SUBSTRINGS = [
    "suppliercost",
    "supplier_cost",
    "multiplier",
    "margin",
    "wholesale",
    "costcents",
    "cost_cents",
    "internalnote",
    "internal_notes",
    "legalname",
    "legal_name",
    "contactemail",
    "contact_email",
    "subjectkey",
    "subject_key",
  ];

  it("emits none of the forbidden commercial or administrative fields on any surface", async () => {
    const svc = service();
    const payloads = await Promise.all([
      svc.onboarding(ALICE),
      svc.training(ALICE),
      svc.leads("partner_alice"),
      svc.conversions("partner_alice"),
      svc.commissions("partner_alice"),
      svc.payouts(ALICE),
      svc.resources(),
      svc.campaigns("partner_alice"),
      svc.events("partner_alice"),
      svc.organizations("partner_alice"),
      svc.compliance("partner_alice"),
      svc.sessions("partner_alice"),
    ]);
    const serialized = JSON.stringify(payloads).toLowerCase();
    FORBIDDEN_SUBSTRINGS.forEach((field) => {
      expect(serialized).not.toContain(field);
    });
    PARTNER_FORBIDDEN_FIELDS.forEach((field) => {
      expect(serialized).not.toContain(field.toLowerCase());
    });
  });
});
