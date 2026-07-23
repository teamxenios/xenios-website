import { describe, expect, it } from "vitest";
import {
  createLedgerPartnerStatsSource,
  createMemberPartnerSource,
  toPartnerSelfView,
  type MemberPartnerSource,
} from "./member-linkage";
import {
  PARTNER_STRUCTURE_FORBIDDEN_KEYS,
  createInMemoryPartnerRepository,
  createPartnerService,
  type PartnerRepository,
  type PartnerService,
} from "./partners";
import {
  InMemoryCommissionLedgerRepository,
  type CommissionLedgerEntry,
} from "./commissions";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
} from "./attribution";
import {
  createInMemoryOrganizationRepository,
  createInMemoryPartnerDirectory,
  createOrganizationService,
  type OrganizationService,
} from "./organizations";
import { createInMemoryPartnerLinkStore } from "../commerce/persistence/partners-store";
import type { CommissionState } from "@shared/research/distribution";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-01-02T00:00:00.000Z");

// ---------------------------------------------------------------------------
// Ledger entry builder (append-only facts, written directly for the tests)
// ---------------------------------------------------------------------------

let entrySeq = 0;

function accrual(partnerId: string, orderId: string, amountCents: number): CommissionLedgerEntry {
  const id = `led_${++entrySeq}`;
  return {
    id,
    rootId: id,
    previousEntryId: null,
    kind: "accrual",
    partnerId,
    orderId,
    amountCents,
    eligibleNetCents: amountCents * 10,
    state: "pending",
    actor: "system",
    actorId: null,
    reason: null,
    payoutBatchId: null,
    providerReference: null,
    sourceReference: null,
    createdAt: T0.toISOString(),
  };
}

function transition(root: CommissionLedgerEntry, state: CommissionState): CommissionLedgerEntry {
  return {
    ...root,
    id: `led_${++entrySeq}`,
    rootId: root.rootId,
    previousEntryId: root.id,
    kind: "transition",
    amountCents: 0,
    state,
    createdAt: T1.toISOString(),
  };
}

function reversal(root: CommissionLedgerEntry, amountCents: number, state: CommissionState): CommissionLedgerEntry {
  return {
    ...root,
    id: `led_${++entrySeq}`,
    rootId: root.rootId,
    previousEntryId: root.id,
    kind: "reversal",
    amountCents,
    state,
    createdAt: T1.toISOString(),
  };
}

/** Recursively collects every key name in a JSON-serializable value. */
function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      out.push(key);
      collectKeys((value as Record<string, unknown>)[key], out);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The ledger-backed stats source
// ---------------------------------------------------------------------------

describe("createLedgerPartnerStatsSource", () => {
  it("reports zero everything for a partner with no ledger history", async () => {
    const source = createLedgerPartnerStatsSource({ ledger: new InMemoryCommissionLedgerRepository() });
    expect(await source.statsFor("p1")).toEqual({
      leadCount: 0,
      conversionCount: 0,
      totalCommissionCents: 0,
      payableCents: 0,
      conversions: [],
    });
  });

  it("counts a pending accrual in the total but never in the payable balance", async () => {
    const ledger = new InMemoryCommissionLedgerRepository();
    await ledger.append(accrual("p1", "order_1", 500));
    const stats = await createLedgerPartnerStatsSource({ ledger }).statsFor("p1");
    expect(stats.conversionCount).toBe(1);
    expect(stats.totalCommissionCents).toBe(500);
    expect(stats.payableCents).toBe(0);
  });

  it("payable after holds: a held commission is visible but not payable", async () => {
    const ledger = new InMemoryCommissionLedgerRepository();
    const held = accrual("p1", "order_1", 700);
    await ledger.append(held);
    await ledger.append(transition(held, "held"));

    const payable = accrual("p1", "order_2", 300);
    await ledger.append(payable);
    await ledger.append(transition(payable, "approved"));
    await ledger.append(transition(payable, "payable"));

    const stats = await createLedgerPartnerStatsSource({ ledger }).statsFor("p1");
    expect(stats.conversionCount).toBe(2);
    expect(stats.totalCommissionCents).toBe(1000);
    // Only the chain whose HEAD is payable pays; the held 700 is excluded.
    expect(stats.payableCents).toBe(300);
  });

  it("excludes reversed chains and shrinks a partially reversed one", async () => {
    const ledger = new InMemoryCommissionLedgerRepository();
    const gone = accrual("p1", "order_1", 400);
    await ledger.append(gone);
    await ledger.append(reversal(gone, 400, "reversed"));

    const shrunk = accrual("p1", "order_2", 1000);
    await ledger.append(shrunk);
    await ledger.append(reversal(shrunk, 250, "pending"));

    const stats = await createLedgerPartnerStatsSource({ ledger }).statsFor("p1");
    expect(stats.conversionCount).toBe(1);
    expect(stats.totalCommissionCents).toBe(750);
    expect(stats.conversions).toEqual([
      {
        attributedAt: T0.toISOString(),
        eligibleNetCents: 10_000,
        commissionCents: 750,
        state: "pending",
      },
    ]);
  });

  it("reads only the addressed partner's chains (tenant isolation)", async () => {
    const ledger = new InMemoryCommissionLedgerRepository();
    await ledger.append(accrual("p_a", "order_a", 500));
    await ledger.append(accrual("p_b", "order_b", 900));
    const source = createLedgerPartnerStatsSource({ ledger });
    expect((await source.statsFor("p_a")).totalCommissionCents).toBe(500);
    expect((await source.statsFor("p_b")).totalCommissionCents).toBe(900);
  });

  it("each conversion carries aggregate fields only", async () => {
    const ledger = new InMemoryCommissionLedgerRepository();
    await ledger.append(accrual("p1", "order_1", 500));
    const stats = await createLedgerPartnerStatsSource({ ledger }).statsFor("p1");
    expect(Object.keys(stats.conversions[0]).sort()).toEqual(
      ["attributedAt", "commissionCents", "eligibleNetCents", "state"].sort(),
    );
  });

  it("uses the injected lead counter and defaults to zero without one", async () => {
    const ledger = new InMemoryCommissionLedgerRepository();
    const counted = createLedgerPartnerStatsSource({
      ledger,
      countLeads: async (partnerId) => (partnerId === "p1" ? 7 : 0),
    });
    expect((await counted.statsFor("p1")).leadCount).toBe(7);
    expect((await counted.statsFor("p2")).leadCount).toBe(0);
    const bare = createLedgerPartnerStatsSource({ ledger });
    expect((await bare.statsFor("p1")).leadCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The partner self view
// ---------------------------------------------------------------------------

describe("toPartnerSelfView", () => {
  async function makeRecord(service: PartnerService) {
    const created = await service.createPartnerForMember(
      "MARKER_MEMBER_ID",
      {
        partnerId: "p1",
        role: "affiliate",
        legalName: "MARKER_LEGAL_NAME",
        contactEmail: "MARKER_EMAIL",
        internalNotes: "MARKER_INTERNAL_NOTE",
      },
      T0,
    );
    if (!created.ok) throw new Error("create failed");
    return created.partner;
  }

  it("exposes exactly the self fields, nothing administrative", async () => {
    const service = createPartnerService({ repository: createInMemoryPartnerRepository() });
    const record = await makeRecord(service);
    await service.acceptAgreement("p1", "partner_agreement", "1.0.0", "hash", T0);
    await service.completeTraining("p1", "fraud", "1.0.0", T0);

    const view = toPartnerSelfView((await service.findByMemberId("MARKER_MEMBER_ID"))!);
    expect(Object.keys(view).sort()).toEqual(
      ["activatedAt", "agreements", "certifiedAt", "partnerId", "role", "state", "training"].sort(),
    );
    const serialized = JSON.stringify(view);
    ["MARKER_MEMBER_ID", "MARKER_LEGAL_NAME", "MARKER_EMAIL", "MARKER_INTERNAL_NOTE"].forEach(
      (marker) => expect(serialized).not.toContain(marker),
    );
    expect(view.agreements).toEqual([
      { agreementKey: "partner_agreement", agreementVersion: "1.0.0", decidedAt: T0.toISOString() },
    ]);
    expect(view.training).toEqual([
      { moduleKey: "fraud", moduleVersion: "1.0.0", completedAt: T0.toISOString() },
    ]);
    expect(record.memberId).toBe("MARKER_MEMBER_ID");
  });
});

// ---------------------------------------------------------------------------
// The member-scoped partner source
// ---------------------------------------------------------------------------

interface Fixture {
  source: MemberPartnerSource;
  repository: PartnerRepository;
  service: PartnerService;
  organizations: OrganizationService;
}

function fixture(): Fixture {
  const repository = createInMemoryPartnerRepository();
  const ledger = new InMemoryCommissionLedgerRepository();
  const service = createPartnerService({
    repository,
    stats: createLedgerPartnerStatsSource({ ledger }),
  });
  const organizations = createOrganizationService({
    repository: createInMemoryOrganizationRepository(),
    partners: createInMemoryPartnerDirectory([
      { partnerId: "p_a", role: "organization_partner", state: "active" },
      { partnerId: "p_b", role: "organization_partner", state: "active" },
    ]),
    rsvpBaseUrl: "https://research.test",
  });
  let mint = 0;
  const source = createMemberPartnerSource({
    repository,
    service,
    links: createInMemoryPartnerLinkStore(),
    mintCode: (partnerId) => `code_${partnerId}_${++mint}`,
    linkBaseUrl: "https://research.test",
    organizations,
  });
  return { source, repository, service, organizations };
}

async function seedTwoMembers(f: Fixture): Promise<void> {
  const a = await f.source.createPartnerForMember(
    "mem_a",
    { partnerId: "p_a", role: "organization_partner", legalName: "A", contactEmail: "a@x.com" },
    T0,
  );
  const b = await f.source.createPartnerForMember(
    "mem_b",
    { partnerId: "p_b", role: "organization_partner", legalName: "B", contactEmail: "b@x.com" },
    T0,
  );
  if (!a.ok || !b.ok) throw new Error("seed failed");
}

describe("createMemberPartnerSource", () => {
  it("onboards one partner per member and refuses the duplicate", async () => {
    const f = fixture();
    await seedTwoMembers(f);
    const dup = await f.source.createPartnerForMember(
      "mem_a",
      { partnerId: "p_c", role: "affiliate", legalName: "C", contactEmail: "c@x.com" },
      T0,
    );
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.denials.map((d) => d.code)).toEqual(["member_already_partner"]);
  });

  it("resolves each member to their own self view only (tenant isolation)", async () => {
    const f = fixture();
    await seedTwoMembers(f);
    expect((await f.source.findByMemberId("mem_a"))?.partnerId).toBe("p_a");
    expect((await f.source.findByMemberId("mem_b"))?.partnerId).toBe("p_b");
    expect(await f.source.findByMemberId("mem_nobody")).toBeNull();
  });

  it("issues and lists referral links member-scoped, isolated per member", async () => {
    const f = fixture();
    await seedTwoMembers(f);

    const issued = await f.source.issueLinkForMember("mem_a", "signed_link", "spring", T0);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.value).toEqual({
      code: "code_p_a_1",
      url: "https://research.test/r/code_p_a_1",
      channel: "signed_link",
      campaign: "spring",
      qrSvgPath: null,
    });
    await f.source.issueLinkForMember("mem_b", "qr", null, T0);

    const forA = await f.source.listLinksForMember("mem_a");
    expect(forA.ok).toBe(true);
    if (!forA.ok) return;
    expect(forA.value.map((l) => l.code)).toEqual(["code_p_a_1"]);

    // Member A's listing never contains member B's link, and vice versa.
    const forB = await f.source.listLinksForMember("mem_b");
    expect(forB.ok).toBe(true);
    if (!forB.ok) return;
    expect(forB.value.map((l) => l.code)).toEqual(["code_p_b_2"]);

    // The partner-id read (used by routes after resolution) matches.
    expect((await f.source.listLinks("p_a")).map((l) => l.code)).toEqual(["code_p_a_1"]);
  });

  it("refuses link operations for a member with no partner", async () => {
    const f = fixture();
    const issued = await f.source.issueLinkForMember("mem_none", "code", null, T0);
    expect(issued.ok).toBe(false);
    if (!issued.ok) expect(issued.code).toBe("member_has_no_partner");
    const listed = await f.source.listLinksForMember("mem_none");
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.code).toBe("member_has_no_partner");
  });

  it("serves the dashboard from the append-only ledger through the gate service", async () => {
    const repository = createInMemoryPartnerRepository();
    const ledger = new InMemoryCommissionLedgerRepository();
    const service = createPartnerService({
      repository,
      stats: createLedgerPartnerStatsSource({ ledger }),
    });
    const organizations = createOrganizationService({
      repository: createInMemoryOrganizationRepository(),
      partners: createInMemoryPartnerDirectory(),
      rsvpBaseUrl: "https://research.test",
    });
    const source = createMemberPartnerSource({
      repository,
      service,
      links: createInMemoryPartnerLinkStore(),
      mintCode: (p) => `code_${p}`,
      linkBaseUrl: "https://research.test",
      organizations,
    });
    await source.createPartnerForMember(
      "mem_a",
      { partnerId: "p_a", role: "affiliate", legalName: "A", contactEmail: "a@x.com" },
      T0,
    );

    const held = accrual("p_a", "order_1", 700);
    await ledger.append(held);
    await ledger.append(transition(held, "held"));
    const payable = accrual("p_a", "order_2", 300);
    await ledger.append(payable);
    await ledger.append(transition(payable, "approved"));
    await ledger.append(transition(payable, "payable"));
    // Another partner's ledger history must never surface here.
    await ledger.append(accrual("p_other", "order_x", 99_999));

    const resolved = await source.findByMemberId("mem_a");
    const dashboard = await source.dashboardFor(resolved!.partnerId);
    expect(dashboard.ok).toBe(true);
    if (!dashboard.ok) return;
    expect(dashboard.dashboard.conversionCount).toBe(2);
    expect(dashboard.dashboard.totalCommissionCents).toBe(1000);
    // The partner is not active, so nothing is payable to them yet even though a
    // chain sits in the payable state; the dashboard gate zeroes it.
    expect(dashboard.dashboard.payableCents).toBe(0);
    expect(JSON.stringify(dashboard.dashboard)).not.toContain("p_other");
    expect(JSON.stringify(dashboard.dashboard)).not.toContain("99999");
  });

  it("links a member's partner into an organization and scopes the aggregate by viewer", async () => {
    const f = fixture();
    await seedTwoMembers(f);
    const created = f.organizations.createOrganization(
      { displayName: "North Clinic", kind: "clinic", createdByAdminId: "admin_1" },
      T0,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const orgId = created.value.orgId;

    const joined = await f.source.joinOrganizationForMember("mem_a", orgId, T0);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.value.representativePartnerIds).toEqual(["p_a"]);

    const aggregate = await f.source.organizationAggregateForMember("mem_a", orgId);
    expect(aggregate.ok).toBe(true);
    if (!aggregate.ok) return;
    expect(Object.keys(aggregate.value).sort()).toEqual(
      ["conversionCount", "expenseCents", "leadCount", "orgId", "totalCommissionCents"].sort(),
    );

    // Member B's partner does not represent the organization: forbidden, not filtered.
    const forbidden = await f.source.organizationAggregateForMember("mem_b", orgId);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.denials).toContain("organization_forbidden");

    // A member with no partner cannot reach the organizations module at all.
    const nobody = await f.source.joinOrganizationForMember("mem_none", orgId, T0);
    expect(nobody.ok).toBe(false);
    if (!nobody.ok) expect(nobody.denials).toContain("partner_not_found");
  });
});

// ---------------------------------------------------------------------------
// Structural founder rules across the whole linkage surface
// ---------------------------------------------------------------------------

describe("structural rules preserved by the linkage", () => {
  it("no shape carries a parent, sponsor, upline, downline, tier, or level field, attribution included", async () => {
    const f = fixture();
    await seedTwoMembers(f);
    await f.source.issueLinkForMember("mem_a", "signed_link", null, T0);

    // A real attribution flow: touch then conversion. The resolved winner record
    // is the place a parent-partner chain would have to live, and it has no such
    // field to carry one.
    const attribution = createAttributionService({
      repository: createInMemoryAttributionRepository(),
      linkSecret: "test_secret_value",
      linkBaseUrl: "https://research.test",
    });
    attribution.recordTouch("subject_1", "p_a", "signed_link", T0);
    const winner = attribution.recordConversion("subject_1", "order_1", T1);
    expect(winner?.partnerId).toBe("p_a");

    const view = await f.source.findByMemberId("mem_a");
    const dashboard = await f.source.dashboardFor("p_a");
    const links = await f.source.listLinksForMember("mem_a");

    const keys = collectKeys(JSON.parse(JSON.stringify(view)))
      .concat(collectKeys(JSON.parse(JSON.stringify(dashboard))))
      .concat(collectKeys(JSON.parse(JSON.stringify(links))))
      .concat(collectKeys(JSON.parse(JSON.stringify(winner))))
      .map((k) => k.toLowerCase());

    PARTNER_STRUCTURE_FORBIDDEN_KEYS.forEach((forbidden) => {
      expect(keys.filter((k) => k.includes(forbidden))).toEqual([]);
    });
  });

  it("no recruitment compensation: onboarding a partner writes nothing to the ledger", async () => {
    const repository = createInMemoryPartnerRepository();
    const ledger = new InMemoryCommissionLedgerRepository();
    const service = createPartnerService({
      repository,
      stats: createLedgerPartnerStatsSource({ ledger }),
    });
    const source = createMemberPartnerSource({
      repository,
      service,
      links: createInMemoryPartnerLinkStore(),
      mintCode: (p) => `code_${p}`,
      linkBaseUrl: "https://research.test",
      organizations: createOrganizationService({
        repository: createInMemoryOrganizationRepository(),
        partners: createInMemoryPartnerDirectory(),
        rsvpBaseUrl: "https://research.test",
      }),
    });

    await source.createPartnerForMember(
      "mem_a",
      { partnerId: "p_a", role: "member_referral", legalName: "A", contactEmail: "a@x.com" },
      T0,
    );
    // Creating a partner is a state change and only a state change.
    expect(ledger.snapshot()).toEqual([]);
    const dashboard = await source.dashboardFor("p_a");
    expect(dashboard.ok).toBe(true);
    if (!dashboard.ok) return;
    expect(dashboard.dashboard.totalCommissionCents).toBe(0);
    expect(dashboard.dashboard.payableCents).toBe(0);
  });
});
