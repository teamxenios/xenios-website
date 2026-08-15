import { describe, expect, it, vi } from "vitest";
import {
  AccountIdentityStoreUnavailableError,
  createSupabaseAccountIdentityStore,
} from "./production-store";

type Response = { data: unknown; error: unknown | null };

class Query implements PromiseLike<Response> {
  readonly calls: Array<[string, unknown[]]> = [];

  constructor(private readonly response: Response) {}

  select(...args: unknown[]) { this.calls.push(["select", args]); return this; }
  eq(...args: unknown[]) { this.calls.push(["eq", args]); return this; }
  is(...args: unknown[]) { this.calls.push(["is", args]); return this; }
  gt(...args: unknown[]) { this.calls.push(["gt", args]); return this; }
  in(...args: unknown[]) { this.calls.push(["in", args]); return this; }
  or(...args: unknown[]) { this.calls.push(["or", args]); return this; }
  order(...args: unknown[]) { this.calls.push(["order", args]); return this; }
  insert(...args: unknown[]) { this.calls.push(["insert", args]); return this; }
  update(...args: unknown[]) { this.calls.push(["update", args]); return this; }
  single() { this.calls.push(["single", []]); return this; }
  maybeSingle() { this.calls.push(["maybeSingle", []]); return this; }
  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

function client(responses: Record<string, Response[]>, rpcResponse: Response = { data: "linked", error: null }) {
  const queries: Array<{ table: string; query: Query }> = [];
  const rpc = vi.fn(async () => rpcResponse);
  return {
    client: {
      from(table: string) {
        const query = new Query(responses[table]?.shift() ?? { data: null, error: { message: "missing table secret" } });
        queries.push({ table, query });
        return query;
      },
      rpc,
    },
    queries,
    rpc,
  };
}

const MEMBERSHIP = {
  id: "membership-1",
  organization_id: "org-1",
  roles: ["organization_owner", "business_buyer"],
  password_change_required: false,
  password_change_required_at: null,
};

const ORGANIZATION = {
  id: "org-1",
  slug: "roman-digital",
  legal_name: "Roman Digital",
  display_name: "Roman Digital",
  status: "active",
  purchasing_email: "buyer@example.test",
  billing_email: "billing@example.test",
  phone: null,
  tax_id_last4: null,
  purchase_order_required: false,
  billing_address: null,
  shipping_address: null,
};

describe("Pack02 Supabase AccountIdentityStore", () => {
  it("constrains organization access by auth user, organization and active state", async () => {
    const fake = client({
      research_organization_users: [{ data: MEMBERSHIP, error: null }],
      research_account_organizations: [{ data: ORGANIZATION, error: null }],
    });
    const store = createSupabaseAccountIdentityStore(fake.client as never);
    const access = await store.getOrganizationAccess("auth-user-1", "org-1");

    expect(access?.organization.displayName).toBe("Roman Digital");
    expect(access?.roles).toEqual(["organization_owner", "business_buyer"]);
    expect(fake.queries[0].query.calls).toEqual(expect.arrayContaining([
      ["eq", ["auth_user_id", "auth-user-1"]],
      ["eq", ["organization_id", "org-1"]],
      ["eq", ["state", "active"]],
    ]));
    expect(fake.queries[1].query.calls).toContainEqual(["eq", ["id", "org-1"]]);
  });

  it("returns no access for another tenant without querying its profile", async () => {
    const fake = client({ research_organization_users: [{ data: null, error: null }] });
    const store = createSupabaseAccountIdentityStore(fake.client as never);
    await expect(store.getOrganizationAccess("auth-user-1", "foreign-org")).resolves.toBeNull();
    expect(fake.queries.map(({ table }) => table)).toEqual(["research_organization_users"]);
  });

  it("passes only a validated bytea hash to the atomic claim RPC", async () => {
    const fake = client({}, { data: "linked", error: null });
    const store = createSupabaseAccountIdentityStore(fake.client as never);
    await expect(store.commitCustomerClaimHash({
      claimId: "claim-1",
      tokenHash: "a".repeat(64),
      userId: "auth-user-1",
      email: "Buyer@Example.test",
      subject: { subjectType: "organization", organizationId: "org-1" },
    })).resolves.toBe("linked");
    expect(fake.rpc).toHaveBeenCalledWith("research_account_commit_customer_claim", {
      p_claim_id: "claim-1",
      p_token_hash: `\\x${"a".repeat(64)}`,
      p_auth_user_id: "auth-user-1",
      p_verified_email: "buyer@example.test",
    });
    expect(JSON.stringify(fake.rpc.mock.calls)).not.toContain("tokenHash");
  });

  it("fails closed with a redacted error when candidate schema is absent", async () => {
    const fake = client({
      research_members: [{ data: null, error: { message: "relation research_members leaked-secret does not exist" } }],
    });
    const store = createSupabaseAccountIdentityStore(fake.client as never);
    const failure = await store.findPersonalAccount("auth-user-1").catch((error) => error);
    expect(failure).toBeInstanceOf(AccountIdentityStoreUnavailableError);
    expect(failure.message).toBe("Account identity storage is temporarily unavailable.");
    expect(failure.message).not.toContain("relation");
    expect(failure.message).not.toContain("secret");
  });
});
