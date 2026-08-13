import { describe, expect, it, vi } from "vitest";
import { createSupabaseB2BBuyerBridgeDeps } from "./b2b-buyer-bridge-supabase";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const ENTITLEMENT_ID = "44444444-4444-4444-8444-444444444444";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private single = false;

  constructor(private readonly rows: Row[]) {}
  select(): this { return this; }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  maybeSingle(): this { this.single = true; return this; }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const filtered = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    const value = { data: this.single ? (filtered[0] ?? null) : filtered, error: null };
    return Promise.resolve(onfulfilled ? onfulfilled(value) : (value as TResult1));
  }
}

function fakeAdmin() {
  const tables: Record<string, Row[]> = {
    research_members: [{ id: MEMBER_ID, auth_user_id: AUTH_USER_ID, status: "active" }],
    research_b2b_buyer_operators: [{
      id: "66666666-6666-4666-8666-666666666666",
      relationship_id: RELATIONSHIP_ID,
      member_id: MEMBER_ID,
      roles: ["organization_owner"],
      state: "active",
    }],
    research_b2b_buyer_relationships: [{
      id: RELATIONSHIP_ID,
      business_key: "roman-health-marketplace",
      business_display_name: "Roman Health Marketplace",
      state: "active",
      migrated_organization_id: null,
    }],
    research_b2b_buyer_entitlements: [{
      id: ENTITLEMENT_ID,
      relationship_id: RELATIONSHIP_ID,
      profile_key: "KRIS_VOLUME_PARTNER",
      version: 1,
      state: "active",
      effective_at: "2026-08-13T00:00:00.000Z",
      expires_at: null,
    }],
    research_orders: [{ id: ORDER_ID, member_id: MEMBER_ID }],
  };
  const rpc = vi.fn(async () => ({ data: "linked", error: null }));
  return {
    client: {
      from(table: string) { return new FakeQuery(tables[table] ?? []); },
      rpc,
    } as any,
    rpc,
    tables,
  };
}

const auth = {
  verifyAccessToken: vi.fn(async () => ({
    userId: AUTH_USER_ID,
    email: "changed-address@example.com",
    emailConfirmedAt: "2026-08-13T00:00:00.000Z",
  })),
};

describe("Supabase B2B buyer bridge adapter", () => {
  it("resolves bearer auth through the exact canonical member id without email authority", async () => {
    const { client } = fakeAdmin();
    const bridge = createSupabaseB2BBuyerBridgeDeps(client, auth);
    await expect(bridge.resolveAuthenticatedMember({
      headers: { authorization: "Bearer signed.normal.session" },
    })).resolves.toEqual({
      authUserId: AUTH_USER_ID,
      memberId: MEMBER_ID,
      emailVerified: true,
      memberStatus: "active",
    });

    const rows = await bridge.listRelationshipsForMember(MEMBER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      relationshipId: RELATIONSHIP_ID,
      memberId: MEMBER_ID,
      businessKey: "roman-health-marketplace",
      roles: ["organization_owner"],
    });
    expect(JSON.stringify(rows)).not.toContain("changed-address@example.com");
  });

  it("rejects malformed and recovery-purpose bearer sessions before database identity lookup", async () => {
    const { client } = fakeAdmin();
    const verifier = {
      verifyAccessToken: vi.fn(async () => ({
        userId: AUTH_USER_ID,
        email: "changed-address@example.com",
        emailConfirmedAt: "2026-08-13T00:00:00.000Z",
      })),
    };
    const bridge = createSupabaseB2BBuyerBridgeDeps(client, verifier);

    await expect(bridge.resolveAuthenticatedMember({
      headers: { authorization: "Bearer token with spaces" },
    })).resolves.toBeNull();

    const payload = Buffer.from(JSON.stringify({ amr: [{ method: "recovery" }] })).toString("base64url");
    await expect(bridge.resolveAuthenticatedMember({
      headers: { authorization: `Bearer header.${payload}.signature` },
    })).resolves.toBeNull();
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it("scopes canonical order lookup by both order and member", async () => {
    const { client } = fakeAdmin();
    const bridge = createSupabaseB2BBuyerBridgeDeps(client, auth);
    await expect(bridge.findCanonicalOrderForMember({
      orderId: ORDER_ID,
      memberId: MEMBER_ID,
    })).resolves.toEqual({ orderId: ORDER_ID, memberId: MEMBER_ID });
    await expect(bridge.findCanonicalOrderForMember({
      orderId: ORDER_ID,
      memberId: "99999999-9999-4999-8999-999999999999",
    })).resolves.toBeNull();
  });

  it("passes only server-resolved relationship/profile evidence to the protected RPC", async () => {
    const { client, rpc } = fakeAdmin();
    const bridge = createSupabaseB2BBuyerBridgeDeps(client, auth);
    await expect(bridge.commitOrderOwnership({
      orderId: ORDER_ID,
      relationshipId: RELATIONSHIP_ID,
      memberId: MEMBER_ID,
      entitlementId: ENTITLEMENT_ID,
      pricingProfileKey: "KRIS_VOLUME_PARTNER",
      pricingProfileVersion: 1,
    })).resolves.toBe("linked");
    expect(rpc).toHaveBeenCalledWith("research_claim_b2b_order_ownership", {
      p_order_id: ORDER_ID,
      p_relationship_id: RELATIONSHIP_ID,
      p_member_id: MEMBER_ID,
      p_entitlement_id: ENTITLEMENT_ID,
      p_profile_key: "KRIS_VOLUME_PARTNER",
      p_profile_version: 1,
    });
  });

  it("refuses an off-profile ownership claim before RPC IO", async () => {
    const { client, rpc } = fakeAdmin();
    const bridge = createSupabaseB2BBuyerBridgeDeps(client, auth);
    await expect(bridge.commitOrderOwnership({
      orderId: ORDER_ID,
      relationshipId: RELATIONSHIP_ID,
      memberId: MEMBER_ID,
      entitlementId: ENTITLEMENT_ID,
      pricingProfileKey: "ordinary_member" as "KRIS_VOLUME_PARTNER",
      pricingProfileVersion: 1,
    })).resolves.toBe("conflict");
    expect(rpc).not.toHaveBeenCalled();
  });
});
