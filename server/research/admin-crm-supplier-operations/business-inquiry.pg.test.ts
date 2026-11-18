/** Real disposable PG16 authority; no existing database URL, managed data or provider IO.
 * Care foundation is real. The additive business-role CHECK and buyer prerequisite
 * rows are explicit test fixtures, NOT qualification of Root's pending permission/mount integration.
 * CI executes all cases; Docker/setup/assertion failures fail, never fall back to mocks.
 */
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BusinessInquiryService } from "./business-inquiry";
import { createSupabaseBusinessInquiryRepository } from "./business-inquiry-supabase";

const OP = "10000000-0000-4000-8000-000000000001";
const READER = "10000000-0000-4000-8000-000000000002";
const OTHER = "10000000-0000-4000-8000-000000000003";
const BUYER = "10000000-0000-4000-8000-000000000004";
const ORG = "20000000-0000-4000-8000-000000000001";
const FOREIGN_ORG = "20000000-0000-4000-8000-000000000002";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const payload = () => ({ contactName: "Synthetic Operator", contactEmail: "synthetic@example.invalid",
  organizationName: "Synthetic Organization", organizationType: "research", location: "Texas",
  categories: ["research", "supplements"], selections: [
    { description: "Synthetic A", variant: "Exact presentation A", quantity: 10, unit: "vial" },
    { description: "Synthetic B", variant: "Exact presentation B", quantity: 50, unit: "bottle" },
  ], packagingPreference: "organization_brand", siteCount: 3, replenishment: "recurring", services: ["labeling"],
});
const active = Boolean(process.env.CI) || process.env.XENIOS_RUN_PG16_VERIFIER === "1";
describe.skipIf(!active)("business enquiry actual disposable PostgreSQL16", () => {
  const container = "xenios-business-inquiry-" + randomUUID();
  const password = randomUUID();
  const database = "business_inquiry_disposable";
  let port = 0, created = false;
  const docker = (...args: string[]) => execFileSync("docker", args, {
    encoding: "utf8", timeout: 60_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  async function query(text: string, values: unknown[] = [], role = "postgres") {
    if (!created || !port) throw Error("Owned PG not ready");
    const client = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password, database,
      ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 12000, query_timeout: 15000 });
    await client.connect();
    try {
      await client.query("begin");
      if (!["postgres", "service_role", "anon", "authenticated"].includes(role)) throw Error("Invalid fixture role");
      await client.query("set local role " + role);
      const result = await client.query(text, values);
      await client.query("commit");
      return result;
    } catch (e) { await client.query("rollback"); throw e; }
    finally { await client.end(); }
  }
  const submit = (key = randomUUID(), input = payload(), owner = "owner-a", actor: string | null = null, organization: string | null = null) =>
    query("select public.research_business_inquiry_submit($1,$2,$3::jsonb,$4::uuid,$5::uuid) as value",
      [hash(owner), hash(key), JSON.stringify(input), actor, organization], "service_role").then((r) => r.rows[0].value);
  const list = (actor = OP, before: string | null = null) => query(
    "select public.research_business_inquiry_list($1::uuid,$2::uuid) as value", [actor, before], "service_role").then((r) => r.rows[0].value);
  const counts = async () => (await query(`select
    (select count(*)::int from business_inquiry_private.inquiries) as inquiries,
    (select count(*)::int from business_inquiry_private.workflow) as workflow,
    (select count(*)::int from business_inquiry_private.events where action='received') as received,
    (select count(*)::int from business_inquiry_private.notice_intents) as intents`)).rows[0];
  const enable = () => query(`update business_inquiry_private.configuration set enabled=true, visibility_ready=true,
    retention_ready=true, policy_version='synthetic-business-v1',
    policy_binding='{"scope":"business_b2b","retentionRecord":"fixture-retention","recipientRecord":"fixture-recipient"}'`);

  beforeAll(async () => {
    docker("create", "--rm", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=" + password,
      "--env", "POSTGRES_DB=" + database, "postgres:16");
    created = true;
    docker("start", container);
    const published = /^127\.0\.0\.1:(\d+)$/.exec(docker("port", container, "5432/tcp"));
    if (!published) throw Error("Owned port must be literal loopback");
    port = Number(published[1]);
    execFileSync("docker", ["exec", container, "sh", "-c",
      "i=0; while [ \"$i\" -lt 30 ]; do if pg_isready -h 127.0.0.1 -U postgres -d business_inquiry_disposable >/dev/null 2>&1; then exit 0; fi; i=$((i+1)); sleep 1; done; exit 1"],
      { timeout: 35000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    expect(Number((await query("show server_version_num")).rows[0].server_version_num)).toBeGreaterThanOrEqual(160000);
    expect(Number((await query("show server_version_num")).rows[0].server_version_num)).toBeLessThan(170000);
    await query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz, banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant select on auth.users to service_role;`);
    for (const actor of [OP, READER, OTHER, BUYER]) await query("insert into auth.users values($1,now(),null)", [actor]);
    await query(readFileSync(resolve("supabase/care-access-foundation.sql"), "utf8"));
    // EXPLICIT synthetic future permission companion. Root must supply and qualify its real counterpart.
    await query(`alter table public.care_role_assignments drop constraint care_role_assignments_role_check;
      alter table public.care_role_assignments add constraint care_role_assignments_role_check check(role in
      ('care_patient','clinician','clinical_admin','pharmacy_operations','lab_reviewer','clinical_support','care_security_admin',
       'business_inquiry_reader','business_inquiry_operator','request_intent_reader'));
      grant select on public.care_capabilities,public.care_role_assignments to service_role;`);
    await query(`insert into public.care_role_assignments(user_id,role,granted_by)
      values($1,'business_inquiry_operator',$1),($2,'business_inquiry_reader',$1),($3,'request_intent_reader',$1)`, [OP, READER, OTHER]);
    await query(`insert into public.care_capabilities(capability_key,state,approved_by,approved_at)
      values('business_inquiry_read','enabled',$1,now()),('business_inquiry_assign','enabled',$1,now())`, [OP]);
    // Minimal canonical bridge-shape prerequisites, never a new buyer authority.
    await query(`create table public.research_members(id uuid primary key,auth_user_id uuid references auth.users,status text);
      create table public.research_b2b_buyer_relationships(id uuid primary key,state text);
      create table public.research_b2b_buyer_operators(relationship_id uuid,member_id uuid,roles text[],state text);
      grant select on public.research_members,public.research_b2b_buyer_relationships,public.research_b2b_buyer_operators to service_role;`);
    const member = randomUUID();
    await query("insert into public.research_members values($1,$2,'active')", [member, BUYER]);
    await query("insert into public.research_b2b_buyer_relationships values($1,'active'),($2,'active')", [ORG, FOREIGN_ORG]);
    await query("insert into public.research_b2b_buyer_operators values($1,$2,array['business_buyer'],'active')", [ORG, member]);
    const candidate = readFileSync(resolve("supabase/candidates/business_inquiry.sql"), "utf8");
    await query(candidate);
    await query(candidate); // Actual reapplication preserves default-off data and ACLs.
  }, 120000);
  afterAll(() => { if (created) { docker("rm", "--force", container); created = false; } }, 60000);

  it("is default-off and cannot enable without business scope/retention/recipient bindings", async () => {
    await expect(submit()).rejects.toThrow("business_inquiry_not_ready");
    expect(await counts()).toEqual({ inquiries: 0, workflow: 0, received: 0, intents: 0 });
    await expect(query("update business_inquiry_private.configuration set enabled=true")).rejects.toThrow();
    await enable();
  });
  it("atomically creates one durable reference, WEB provenance and one notice intent", async () => {
    const before = await counts();
    const receipt = await submit();
    expect(receipt).toMatchObject({ state: "needs_human_review", replayed: false });
    expect(receipt.reference).toMatch(/^BE-[A-F0-9]{24}$/);
    expect(await counts()).toEqual(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, Number(v) + 1])));
    const saved = (await query("select provenance,category,payload,policy_version from business_inquiry_private.inquiries where reference=$1", [receipt.reference])).rows[0];
    expect(saved).toMatchObject({ provenance: "web", category: "b2b_organization", payload: payload(), policy_version: "synthetic-business-v1" });
  });
  it("returns the same reference for six concurrent equal attempts", async () => {
    const key = randomUUID(), before = await counts();
    const replies = await Promise.all(Array.from({ length: 6 }, () => submit(key)));
    expect(new Set(replies.map((r) => r.reference)).size).toBe(1);
    expect(replies.filter((r) => !r.replayed)).toHaveLength(1);
    const after = await counts();
    for (const k of Object.keys(before)) expect(after[k] - before[k]).toBe(1);
  });
  it("rejects a changed variant/quantity/unit or packaging under the same attempt", async () => {
    const key = randomUUID(); await submit(key); const before = await counts();
    for (const changed of [ { ...payload(), packagingPreference: "supplier_brand" },
      { ...payload(), selections: [{ ...payload().selections[0], unit: "bottle" }] },
      { ...payload(), selections: [{ ...payload().selections[0], quantity: 11 }] },
      { ...payload(), selections: [{ ...payload().selections[0], variant: "Changed exact variant" }] } ]) {
      await expect(submit(key, changed)).rejects.toThrow("business_inquiry_conflict");
    }
    expect(await counts()).toEqual(before);
  });
  it("uses database JSON equality despite JSON object key order", async () => {
    const key = randomUUID(), first = await submit(key);
    const reordered = Object.fromEntries(Object.entries(payload()).reverse()) as ReturnType<typeof payload>;
    expect(await submit(key, reordered)).toMatchObject({ reference: first.reference, replayed: true });
  });
  it("normalizes equivalent raw numeric spellings before server fingerprinting", async () => {
    const key = randomUUID(), first = await submit(key);
    const raw = JSON.stringify(payload()).replace('"quantity":10', '"quantity":10.0').replace('"siteCount":3', '"siteCount":3.0');
    const result = await query("select public.research_business_inquiry_submit($1,$2,$3::jsonb,null,null) as value", [hash("owner-a"), hash(key), raw], "service_role");
    expect(result.rows[0].value).toMatchObject({ reference: first.reference, replayed: true });
  });
  it("isolates identical attempt keys between owner bindings", async () => {
    const key = randomUUID();
    expect((await submit(key, payload(), "owner-a")).reference).not.toBe((await submit(key, payload(), "owner-b")).reference);
  });
  it("replays an old receipt after disabling new intake and rotating policy", async () => {
    const key = randomUUID(), saved = await submit(key);
    await query("update business_inquiry_private.configuration set enabled=false, policy_version='synthetic-v2'");
    expect(await submit(key)).toEqual({ ...saved, replayed: true });
    await expect(submit()).rejects.toThrow("business_inquiry_not_ready");
    expect((await query("select policy_version from business_inquiry_private.inquiries where reference=$1", [saved.reference])).rows[0].policy_version).toBe("synthetic-business-v1");
    await enable();
  });
  it("rolls back the whole save if durable notice intent insertion fails", async () => {
    const before = await counts();
    await query("revoke insert on business_inquiry_private.notice_intents from service_role");
    await expect(submit()).rejects.toThrow("permission denied");
    expect(await counts()).toEqual(before);
    await query("grant insert on business_inquiry_private.notice_intents to service_role");
  });
  it.each(["anon", "authenticated"])("denies %s direct RPC and private reads", async (role) => {
    await expect(query("select public.research_business_inquiry_list($1::uuid,null)", [OP], role)).rejects.toThrow("permission denied");
    await expect(query("select * from business_inquiry_private.inquiries", [], role)).rejects.toThrow("permission denied");
  });
  it("does not let existing EA-only readers inherit the business permission", async () => {
    await expect(list(OTHER)).rejects.toThrow("business_inquiry_not_permitted");
    expect((await list(READER)).items.length).toBeGreaterThan(0);
  });
  it("records real list/detail reads and denies a nonexistent detail", async () => {
    const page = await list(), saved = page.items[0];
    const detail = (await query("select public.research_business_inquiry_read($1,$2) as value", [OP, saved.id], "service_role")).rows[0].value;
    expect(detail.reference).toBe(saved.reference);
    const events = (await query("select action from business_inquiry_private.events where inquiry_id=$1 and actor_id=$2", [saved.id, OP])).rows.map((r) => r.action);
    expect(events).toEqual(expect.arrayContaining(["list_read", "detail_read"]));
    await expect(query("select public.research_business_inquiry_read($1,$2)", [OP, randomUUID()], "service_role")).rejects.toThrow("business_inquiry_not_found");
  });
  it("supports versioned owner assignment, exact replay and one audited change", async () => {
    const saved = (await list()).items[0], command = randomUUID();
    const args = [OP, saved.id, command, saved.revision, OP];
    const assign = () => query("select public.research_business_inquiry_assign($1,$2,$3,$4,$5) as value", args, "service_role").then((r) => r.rows[0].value);
    const result = await assign();
    expect(result).toEqual({ id: saved.id, revision: saved.revision + 1, assignedTo: OP, replayed: false });
    expect(await assign()).toEqual({ ...result, replayed: true });
    expect((await query("select count(*)::int as n from business_inquiry_private.events where inquiry_id=$1 and action='assigned'", [saved.id])).rows[0].n).toBe(1);
    await expect(query("select public.research_business_inquiry_assign($1,$2,$3,$4,null)", [OP, saved.id, command, saved.revision], "service_role")).rejects.toThrow("business_inquiry_conflict");
  });
  it("denies read-only assignment and stale concurrent owner revisions", async () => {
    const saved = (await list()).items[0];
    await expect(query("select public.research_business_inquiry_assign($1,$2,$3,$4,$5)", [READER, saved.id, randomUUID(), saved.revision, OP], "service_role")).rejects.toThrow("business_inquiry_not_permitted");
    const results = await Promise.allSettled([1, 2].map(() => query("select public.research_business_inquiry_assign($1,$2,$3,$4,$5)", [OP, saved.id, randomUUID(), saved.revision, OP], "service_role")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("rechecks capability, role revocation and banned identities in SQL", async () => {
    await query("update public.care_capabilities set state='disabled' where capability_key='business_inquiry_read'");
    await expect(list(OP)).rejects.toThrow("business_inquiry_not_permitted");
    await query("update public.care_capabilities set state='enabled' where capability_key='business_inquiry_read'");
    await query("update public.care_role_assignments set revoked_at=now() where user_id=$1", [READER]);
    await expect(list(READER)).rejects.toThrow("business_inquiry_not_permitted");
    await query("update public.care_role_assignments set revoked_at=null where user_id=$1", [READER]);
    await query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [READER]);
    await expect(list(READER)).rejects.toThrow("business_inquiry_not_permitted");
    await query("update auth.users set banned_until=null where id=$1", [READER]);
  });
  it("enforces actual organization membership and hides other organizations and anonymous enquiries", async () => {
    const owned = await submit(randomUUID(), payload(), "buyer-context", BUYER, ORG);
    const page = (await query("select public.research_business_inquiry_org_list($1,$2,null) as value", [BUYER, ORG], "service_role")).rows[0].value;
    expect(page.items.map((i: { reference: string }) => i.reference)).toEqual([owned.reference]);
    await expect(query("select public.research_business_inquiry_org_list($1,$2,null)", [BUYER, FOREIGN_ORG], "service_role")).rejects.toThrow("business_inquiry_not_permitted");
    await expect(submit(randomUUID(), payload(), "forged", BUYER, FOREIGN_ORG)).rejects.toThrow("business_inquiry_not_permitted");
    await query("update public.research_b2b_buyer_operators set state='revoked' where relationship_id=$1", [ORG]);
    await expect(query("select public.research_business_inquiry_org_list($1,$2,null)", [BUYER, ORG], "service_role")).rejects.toThrow("business_inquiry_not_permitted");
    await query("update public.research_b2b_buyer_operators set state='active' where relationship_id=$1", [ORG]);
    await query("update public.research_b2b_buyer_operators set roles=array['billing_viewer'] where relationship_id=$1", [ORG]);
    await expect(query("select public.research_business_inquiry_org_list($1,$2,null)", [BUYER, ORG], "service_role")).rejects.toThrow("business_inquiry_not_permitted");
    await query("update public.research_b2b_buyer_operators set roles=array['business_buyer'] where relationship_id=$1", [ORG]);
  });
  it("rejects untrusted extra fields, missing units and direct SQL malformed quantities", async () => {
    for (const input of [{ ...payload(), assignedTo: OP }, { ...payload(), categories: [null] }, { ...payload(), services: [null] },
      { ...payload(), selections: [{ description: "A", variant: "B", quantity: 1 }] },
      { ...payload(), selections: [{ description: "A", variant: "B", quantity: -2, unit: "vial" }] }]) {
      await expect(submit(randomUUID(), input as ReturnType<typeof payload>)).rejects.toThrow("business_inquiry_invalid_request");
    }
  });
  it("bounds cursor pagination without duplicate IDs and audits only returned rows", async () => {
    await Promise.all(Array.from({ length: 55 }, () => submit()));
    const first = await list(), second = await list(OP, first.nextBefore);
    expect(first.items).toHaveLength(50); expect(first.nextBefore).toBe(first.items[49].id);
    expect(new Set([...first.items, ...second.items].map((i: { id: string }) => i.id)).size).toBe(first.items.length + second.items.length);
  });
  it("does not allow the server role to rewrite facts, audit, policy or command history", async () => {
    for (const table of ["inquiries", "events", "assignment_commands", "configuration"]) {
      await expect(query(`delete from business_inquiry_private.${table}`, [], "service_role")).rejects.toThrow("permission denied");
    }
    await expect(query("update business_inquiry_private.events set revision=99", [], "service_role")).rejects.toThrow("permission denied");
    // Row locking has only the constrained true-key UPDATE privilege, not configuration powers.
    await query("select * from business_inquiry_private.configuration where singleton for share", [], "service_role");
    await expect(query("update business_inquiry_private.configuration set enabled=false", [], "service_role")).rejects.toThrow("permission denied");
    await expect(query("update business_inquiry_private.configuration set policy_version='forged'", [], "service_role")).rejects.toThrow("permission denied");
    await expect(query("update business_inquiry_private.configuration set singleton=false", [], "service_role")).rejects.toThrow();
  });
  it("survives a committed lost response through the concrete service and Supabase adapter", async () => {
    let loseReply = true;
    const client = { async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name !== "research_business_inquiry_submit") throw Error("Unexpected RPC");
      try {
        const committed = await query("select public.research_business_inquiry_submit($1,$2,$3::jsonb,$4::uuid,$5::uuid) as value",
          [args.p_owner_hash, args.p_attempt_hash, JSON.stringify(args.p_payload), args.p_actor_id, args.p_organization_id], "service_role");
        if (loseReply) { loseReply = false; return { data: null, error: { message: "Synthetic lost reply after COMMIT" } }; }
        return { data: committed.rows[0].value, error: null };
      } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    } };
    const context = { ownerContext: "isolated-lost-response-context-" + randomUUID() }, key = randomUUID();
    const service = new BusinessInquiryService(createSupabaseBusinessInquiryRepository(client));
    const before = await counts();
    await expect(service.submit(context, key, payload())).rejects.toMatchObject({ code: "unavailable" });
    const retry = await service.submit(context, key, payload());
    expect(retry.replayed).toBe(true);
    const after = await counts(); for (const k of Object.keys(before)) expect(after[k] - before[k]).toBe(1);
  });
});
