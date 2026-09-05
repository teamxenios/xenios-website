import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createAccessInspectionDependencies } from "./access-admin-production";
import { PARTNER_LIFECYCLE_SCHEMA_VERSION } from "@shared/research/partner-lifecycle";
import { DEFAULT_PARTNER_REQUIREMENTS } from "./partners/partners";

const uid = "00000000-0000-4000-8000-000000000001";
const mid = "00000000-0000-4000-8000-000000000002";
const email = "customer@example.invalid";
type Read = { table: string; fields?: string; filters: Array<[string, unknown]>; limit?: number };
function fixture(options: { pages?: unknown[][]; authError?: boolean; failedTable?: string; records?: Record<string, unknown[]>; partnerAuthority?: unknown } = {}) {
  const reads: Read[] = [];
  const listUsers = vi.fn(async ({ page }: { page: number }) => ({
    data: { users: options.pages?.[page - 1] ?? [] }, error: options.authError ? new Error("PRIVATE") : null,
  }));
  const from = vi.fn((table: string) => {
    const read: Read = { table, filters: [] }; reads.push(read);
    const query = {
      select(fields: string) { read.fields = fields; return query; },
      eq(key: string, value: unknown) { read.filters.push([key, value]); return query; },
      in(key: string, value: unknown) { read.filters.push([key, value]); return query; },
      limit(value: number) { read.limit = value; return query; },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data: options.records?.[table] ?? [], error: options.failedTable === table ? new Error("PRIVATE") : null }).then(resolve);
      },
    };
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({ data: name === "research_partner_lifecycle_authority" ? options.partnerAuthority : null, error: null }));
  const db = { auth: { admin: { listUsers } }, from, rpc } as unknown as SupabaseClient;
  return { reads, from, listUsers, rpc, deps: createAccessInspectionDependencies(() => db, {}) };
}

describe("canonical access inspection production reads", () => {
  it("requires the complete versioned partner authority and reads an exact partner timestamp", async () => {
    const partner = { id: uid, member_id: mid, role: "affiliate", state: "application", identity_verified: false, tax_status: "not_started", payout_status: "not_started", certified_at: null, certified_by_admin_id: null, updated_at: "2026-09-04T00:00:00Z" };
    const f = fixture({ records: { research_partners: [partner] }, partnerAuthority: { schemaVersion: PARTNER_LIFECYCLE_SCHEMA_VERSION, requirements: DEFAULT_PARTNER_REQUIREMENTS } });
    const facts = await f.deps.inspect(email);
    expect(facts.partnerLifecycleReview).toBe(true); expect(facts.partners[0].updatedAt).toBe(partner.updated_at);
    expect(f.reads.find((r) => r.table === "research_partners")?.fields).toContain("updated_at");
    expect((await fixture({ partnerAuthority: { schemaVersion: PARTNER_LIFECYCLE_SCHEMA_VERSION, requirements: { agreements: [], trainingModules: [] } } }).deps.inspect(email)).partnerLifecycleReview).toBe(false);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_approved_customer_access_authority", "research_partner_lifecycle_authority"]);
  });
  it("filters Auth pages in memory and never emits unrelated user metadata", async () => {
    const unrelated = Array.from({ length: 200 }, () => ({ email: "other@example.invalid", user_metadata: "PRIVATE" }));
    const f = fixture({ pages: [unrelated, [{ id: uid, email: email.toUpperCase(), email_confirmed_at: "2026-09-01T00:00:00Z", user_metadata: "PRIVATE", password: "PRIVATE" }]] });
    const result = await f.deps.inspect(email);
    expect(f.listUsers).toHaveBeenCalledTimes(2);
    expect(result.auth).toEqual([{ id: uid, email: email.toUpperCase(), emailVerified: true, signInRecorded: false }]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(f.reads.every((read) => read.fields && !read.fields.includes("*"))).toBe(true);
    expect(f.reads.some((read) => /care|clinical|loi/.test(read.table))).toBe(false);
  });

  it("scopes members and partners by exact canonical identifiers as well as supplied email", async () => {
    const f = fixture({ pages: [[{ id: uid, email }]], records: { research_members: [{ id: mid, email, auth_user_id: uid, status: "active" }] } });
    const result = await f.deps.inspect(email);
    expect(result.members).toHaveLength(1);
    expect(f.reads.filter((r) => r.table === "research_members").map((r) => r.filters))
      .toEqual([[["email", email]], [["auth_user_id", [uid]]]]);
    expect(f.reads.filter((r) => r.table === "research_partners").map((r) => r.filters))
      .toEqual([[["contact_email", email]], [["member_id", [mid]]]]);
    expect(f.reads.find((r) => r.table === "research_organization_users")?.filters).toEqual([["auth_user_id", [uid]]]);
  });

  it("refuses incomplete Auth coverage instead of claiming no account exists", async () => {
    const f = fixture({ pages: Array.from({ length: 25 }, () => Array.from({ length: 200 }, () => ({ email: "other@example.invalid" }))) });
    await expect(f.deps.inspect(email)).rejects.toThrow("incomplete");
    expect(f.from).not.toHaveBeenCalled();
  });

  it("refuses failed Auth or core table reads", async () => {
    const f = fixture({ authError: true });
    await expect(f.deps.inspect(email)).rejects.toThrow("unavailable");
    expect(f.from).not.toHaveBeenCalled();
    await expect(fixture({ failedTable: "research_members" }).deps.inspect(email)).rejects.toThrow("unavailable");
    await expect(fixture({ failedTable: "research_partners" }).deps.inspect(email)).rejects.toThrow("unavailable");
  });

  it("distinguishes an unavailable organization foundation from zero relationships", async () => {
    const f = fixture({ pages: [[{ id: uid, email }]], failedTable: "research_organization_users" });
    expect((await f.deps.inspect(email)).organizations).toEqual({ state: "unavailable", records: [] });
  });

  it("refuses malformed or oversized canonical rows", async () => {
    await expect(fixture({ records: { research_members: [{ id: "invalid", email }] } }).deps.inspect(email)).rejects.toThrow();
    await expect(fixture({ records: { research_applications: Array.from({ length: 26 }, () => ({ id: uid, email, status: "submitted" })) } }).deps.inspect(email)).rejects.toThrow();
  });
});
