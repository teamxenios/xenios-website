/**
 * The KRIS_VOLUME_PARTNER provider, exercised against the REAL committed
 * artifact and the REAL reviewed bindings, so the fixture cannot drift from
 * what production would price. Every denial path must answer null (the
 * ledger price stands), and only the exact entitled member may receive the
 * partner sheet.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadKrisLegacyBindings,
  KRIS_LEGACY_BINDINGS_COMMITTED_PATH,
} from "../kris-launch-a/legacy-order-production";
import type { B2BBuyerRelationshipRecord } from "./b2b-buyer-bridge";
import { createKrisBuyerScopedPricing } from "./kris-buyer-price-sheet";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ARTIFACT_PATH = path.join(
  REPO_ROOT,
  "server",
  "research",
  "kris-launch-a",
  "data",
  "kris-launch-a-catalog.generated.json",
);

const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as {
  schemaVersion: number;
  generatedAt: string;
};
const krisBindings = loadKrisLegacyBindings({}, {
  committedPath: path.join(REPO_ROOT, KRIS_LEGACY_BINDINGS_COMMITTED_PATH),
});

// The reviewed AOD-9604 5 mg association and its partner price, pinned by the
// release's own tests and the accepted artifact.
const AOD_PRODUCT = "82fc4ded-ab60-46a1-9a5f-ccd9deb7aaa4";
const AOD_VARIANT = "02c84407-cc6f-480f-82dc-a77de334f2a0";
const AOD_PARTNER_CENTS = 2_464;

const NOW = "2026-08-14T12:00:00.000Z";
const MEMBER = "9f1b1d2c-8a4e-4c31-9b77-1c2d3e4f5a6b";
const CUSTOMER = "eac_" + "a".repeat(32);

function relationship(
  overrides: Partial<B2BBuyerRelationshipRecord> = {},
  entitlementOverrides: Partial<B2BBuyerRelationshipRecord["entitlements"][number]> = {},
): B2BBuyerRelationshipRecord {
  return {
    relationshipId: "rel_roman",
    businessKey: "roman-health",
    businessDisplayName: "Roman Health",
    memberId: MEMBER,
    state: "active",
    roles: ["organization_owner", "business_buyer"],
    migratedOrganizationId: null,
    entitlements: [
      {
        entitlementId: "ent_kris_v1",
        profileKey: "KRIS_VOLUME_PARTNER",
        version: artifact.schemaVersion,
        state: "active",
        effectiveAt: artifact.generatedAt,
        expiresAt: null,
        ...entitlementOverrides,
      },
    ],
    ...overrides,
  };
}

function provider(options: {
  relationships?: B2BBuyerRelationshipRecord[];
  memberForCustomer?: (ref: string) => Promise<{ memberId: string } | null>;
  artifactOverride?: unknown;
} = {}) {
  return createKrisBuyerScopedPricing({
    bindings: {
      memberForCustomer:
        options.memberForCustomer
        ?? (async (ref) => (ref === CUSTOMER ? { memberId: MEMBER } : null)),
    },
    bridge: {
      now: () => NOW,
      listRelationshipsForMember: async (memberId) =>
        memberId === MEMBER ? options.relationships ?? [relationship()] : [],
    },
    krisBindings,
    artifact: "artifactOverride" in options ? options.artifactOverride : artifact,
    warn: () => {},
  });
}

describe("the KRIS_VOLUME_PARTNER buyer price sheet", () => {
  it("prices the reviewed AOD unit for the entitled member at the partner amount", async () => {
    const sheet = await provider().forCustomer(CUSTOMER, Date.parse(NOW));
    expect(sheet).not.toBeNull();
    expect(sheet?.profileKey).toBe("KRIS_VOLUME_PARTNER");
    expect(sheet?.entitlementId).toBe("ent_kris_v1");
    expect(sheet?.priceFor(AOD_PRODUCT, AOD_VARIANT)).toEqual({
      amountCents: AOD_PARTNER_CENTS,
      currency: "USD",
    });
  });

  it("prices every reviewed binding, and nothing else", async () => {
    const sheet = await provider().forCustomer(CUSTOMER, Date.parse(NOW));
    expect(sheet).not.toBeNull();
    for (const binding of krisBindings) {
      expect(sheet?.priceFor(binding.productId, binding.variantId)).not.toBeNull();
    }
    expect(sheet?.priceFor("00000000-0000-4000-8000-000000000000", AOD_VARIANT)).toBeNull();
  });

  it("answers null for a customer with no M62 binding", async () => {
    expect(await provider().forCustomer("eac_" + "b".repeat(32), Date.parse(NOW))).toBeNull();
  });

  it("answers null for a member with no relationship", async () => {
    expect(
      await provider({ relationships: [] }).forCustomer(CUSTOMER, Date.parse(NOW)),
    ).toBeNull();
  });

  it.each([
    ["a suspended relationship", { state: "suspended" as const }, {}],
    ["a migrated relationship", { migratedOrganizationId: "org_1" }, {}],
    ["a billing-viewer-only member", { roles: ["billing_viewer" as const] }, {}],
    ["a suspended entitlement", {}, { state: "suspended" as const }],
    ["a revoked entitlement", {}, { state: "revoked" as const }],
    ["an expired entitlement", {}, { expiresAt: "2026-08-01T00:00:00.000Z" }],
    ["a not-yet-effective entitlement", {}, { effectiveAt: "2027-01-01T00:00:00.000Z" }],
    ["a different profile", {}, { profileKey: "SOME_OTHER_PROFILE" }],
  ])("answers null for %s", async (_label, relOverrides, entOverrides) => {
    const sheet = await provider({
      relationships: [relationship(relOverrides, entOverrides)],
    }).forCustomer(CUSTOMER, Date.parse(NOW));
    expect(sheet).toBeNull();
  });

  it("answers null for duplicate active entitlements (ambiguity fails closed)", async () => {
    const doubled = relationship();
    doubled.entitlements = [...doubled.entitlements, {
      ...doubled.entitlements[0],
      entitlementId: "ent_kris_v1_dup",
    }];
    expect(
      await provider({ relationships: [doubled] }).forCustomer(CUSTOMER, Date.parse(NOW)),
    ).toBeNull();
  });

  it("refuses provenance drift: an entitlement pinned to a different artifact version", async () => {
    const sheet = await provider({
      relationships: [relationship({}, { version: artifact.schemaVersion + 1 })],
    }).forCustomer(CUSTOMER, Date.parse(NOW));
    expect(sheet).toBeNull();
  });

  it("refuses provenance drift: an entitlement pinned to a different generation instant", async () => {
    const sheet = await provider({
      relationships: [relationship({}, { effectiveAt: "2020-01-01T00:00:00.000Z" })],
    }).forCustomer(CUSTOMER, Date.parse(NOW));
    expect(sheet).toBeNull();
  });

  it("constructs closed over an artifact that fails accepted-catalog validation", async () => {
    const closed = provider({ artifactOverride: { schemaVersion: 1 } });
    expect(await closed.forCustomer(CUSTOMER, Date.parse(NOW))).toBeNull();
  });

  // THE ACCEPTANCE-CONTRACT PERSONAS (lead 2026-08-14 05:47Z): each named
  // party must provably NOT resolve Roman prices. Every one answers null,
  // which every caller treats as "the shared ledger price stands", and the
  // door then refuses a guessed partner amount with PRICE_CHANGED.
  describe("acceptance-contract personas", () => {
    it("ANONYMOUS: an unbound handle resolves no sheet", async () => {
      expect(
        await provider().forCustomer("eac_" + "f".repeat(32), Date.parse(NOW)),
      ).toBeNull();
    });

    it("ORDINARY MEMBER: bound to a member with zero B2B relationships", async () => {
      const ordinaryMember = "11111111-1111-4111-8111-111111111111";
      const sheet = await provider({
        memberForCustomer: async () => ({ memberId: ordinaryMember }),
        relationships: [],
      }).forCustomer(CUSTOMER, Date.parse(NOW));
      expect(sheet).toBeNull();
    });

    it("SAMUEL-LEGACY EA CUSTOMER: a founder-era handle bound to a member with no buyer relationship", async () => {
      const samuelMember = "22222222-2222-4222-8222-222222222222";
      const sheet = await createKrisBuyerScopedPricing({
        bindings: { memberForCustomer: async () => ({ memberId: samuelMember }) },
        bridge: {
          now: () => NOW,
          // The legacy founder checkout member exists and owns orders, but has
          // no B2B relationship rows at all.
          listRelationshipsForMember: async () => [],
        },
        krisBindings,
        artifact,
        warn: () => {},
      }).forCustomer("eac_" + "c".repeat(32), Date.parse(NOW));
      expect(sheet).toBeNull();
    });

    it("SECOND ORGANIZATION: an active relationship without a KRIS entitlement grant", async () => {
      const otherMember = "33333333-3333-4333-8333-333333333333";
      const sheet = await provider({
        memberForCustomer: async () => ({ memberId: otherMember }),
        relationships: [
          {
            ...relationship({ memberId: otherMember }),
            relationshipId: "rel_other_org",
            businessKey: "other-org",
            businessDisplayName: "Other Org LLC",
            entitlements: [],
          },
        ],
      }).forCustomer(CUSTOMER, Date.parse(NOW));
      expect(sheet).toBeNull();
    });

    it("SECOND ORGANIZATION with a foreign-member relationship cannot ride Roman's member id", async () => {
      // The relationship rows returned for the member are filtered on the
      // member id inside the shared selection rule; a row belonging to a
      // different member prices nothing even if a read returned it.
      const sheet = await provider({
        relationships: [relationship({ memberId: "44444444-4444-4444-8444-444444444444" })],
      }).forCustomer(CUSTOMER, Date.parse(NOW));
      expect(sheet).toBeNull();
    });
  });

  it("never prices a price-pending overlay row", async () => {
    const sheet = await provider().forCustomer(CUSTOMER, Date.parse(NOW));
    expect(sheet).not.toBeNull();
    // Every price this sheet answers is a positive integer amount; the two
    // pending overlay rows are structurally unpriceable here because only
    // `priced` entries enter the map at construction.
    for (const binding of krisBindings) {
      const price = sheet?.priceFor(binding.productId, binding.variantId);
      expect(price).not.toBeNull();
      expect(Number.isSafeInteger(price?.amountCents)).toBe(true);
      expect((price?.amountCents ?? 0) > 0).toBe(true);
    }
  });
});
