// LOCAL ONLY: node --import tsx --test scripts/evidence/assisted-order-member-history.node-test.mjs
// Starts its own new disposable PostgreSQL. No existing URL/host/credentials accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { startReferralRehearsalDatabase } from "../../server/research/partners/referral-v1-rehearsal.ts";
import { createAssistedMemberHistoryReader } from "../../server/research/assisted-order/member-order-history.ts";

const candidate = readFileSync("supabase/candidates/20260921_research_assisted_order_member_history.sql", "utf8");
const canonical = readFileSync("supabase/migrations/20260815150000_research_assisted_order_bridge.sql", "utf8");

test("canonical M71 member history candidate: ownership, read-only evidence, bounded truth and ACLs", async (t) => {
  const db = await startReferralRehearsalDatabase({ includeLineageSources: false });
  const member = randomUUID(), foreign = randomUUID();
  const rpc = { async rpc(name, args) {
    assert.equal(name, "research_assisted_order_member_history");
    try { return { data: (await db.sql("select public.research_assisted_order_member_history($1::uuid) result", [args.p_member_id], "service_role")).rows[0].result, error: null }; }
    catch (error) { return { data: null, error: { code: error.code } }; }
  } };
  const reader = createAssistedMemberHistoryReader(rpc);
  const address = JSON.stringify({ line1: "Synthetic", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" });
  async function seed(owner, count = 1, status = "submitted", tracking = null) {
    const tag = randomUUID();
    const created = await db.sql(`insert into public.research_assisted_order_requests
      (id,public_reference,idempotency_key_hash,request_fingerprint,actor_member_id,early_access_session_hash,
       normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source,status)
      select gen_random_uuid(),'XRR-20260921-'||upper(substr(md5($1||n::text),1,10)),$1||n::text,$1,$2::uuid,
        case when $2::uuid is null then 'synthetic-session' else null end,
        'same-email@example.invalid','Synthetic private name','private-phone',$3::jsonb,$3::jsonb,true,'early_access_manual_order_bridge',$5
      from generate_series(1,$4::int) n returning id,public_reference`, [tag, owner, address, count, status]);
    await db.sql(`insert into public.research_assisted_order_lines
      (id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,quantity_increment,workflow_mode,
       customer_action_label,catalog_version,authoritative_fingerprint)
      select gen_random_uuid(),id,'synthetic-product','synthetic-variant','Synthetic price request',1,1,1,'request_pricing',
        'Request pricing','synthetic-v1','synthetic-fingerprint'
      from public.research_assisted_order_requests where request_fingerprint=$1`, [tag]);
    if (tracking !== null) {
      await db.sql(`insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,customer_message,internal_note,evidence)
        select id,'shipped','admin','private-admin',null,'private-note',jsonb_build_object('trackingId',$2::text,'paymentVerificationId','private-payment')
        from public.research_assisted_order_requests where request_fingerprint=$1`, [tag, tracking]);
    }
    return created.rows;
  }
  try {
    await t.test("missing RPC is unavailable; missing canonical prerequisite refuses install", async () => {
      assert.deepEqual(await reader.readForMember(member), { requests: [], source: { connected: false, complete: false } });
      await assert.rejects(db.sql(candidate), /requires canonical M71/);
    });
    await db.sql(canonical);
    await t.test("non-bypass installer and drifted status authority refuse before writes", async () => {
      await assert.rejects(db.sql(candidate, [], "authenticated"), /bypass-RLS function owner/);
      await db.sql("grant execute on function public.research_assisted_order_status(text,uuid,text,text) to authenticated");
      await assert.rejects(db.sql(candidate), /status authority and service-only ACL/);
      await db.sql("revoke execute on function public.research_assisted_order_status(text,uuid,text,text) from authenticated");
    });
    await t.test("unexpected direct grants refuse rather than silently heal", async () => {
      await db.sql("grant select on public.research_assisted_order_requests to authenticated");
      await assert.rejects(db.sql(candidate), /direct table grants/);
      assert.equal((await db.sql("select to_regprocedure('public.research_assisted_order_member_history(uuid)') value")).rows[0].value, null);
      await db.sql("revoke select on public.research_assisted_order_requests from authenticated");
    });
    const owned = await seed(member, 1, "shipped", "SYNTHETIC-TRACKING-REFERENCE");
    await seed(foreign);
    const guest = await seed(null, 1, "shipped", "GUEST-TRACKING"); // same email is NEVER ownership; guest requests are not adopted.
    const canonicalStatusBefore = (await db.sql("select pg_get_functiondef('public.research_assisted_order_status(text,uuid,text,text)'::regprocedure) definition")).rows[0].definition;
    const canonicalSource = canonical.replace(/\r\n/g, "\n").match(/create or replace function public\.research_assisted_order_status\([\s\S]*?as \$\$([\s\S]*?)\$\$;/)[1];
    assert.equal(createHash("md5").update(canonicalSource).digest("hex"), "1895ece151ffc91a5495548b25adb3b9");
    await t.test("reproduces the exact source-only legacy NULL authorization defect", async () => {
      const leak = await db.sql("select public.research_assisted_order_status($1,$2,null,null) result", [guest[0].public_reference, member], "service_role");
      assert.equal(leak.rows[0].result.requestId, guest[0].id);
      const inverse = await db.sql("select public.research_assisted_order_status($1,$2,'wrong-session',null) result", [owned[0].public_reference, foreign], "service_role");
      assert.equal(inverse.rows[0].result.requestId, owned[0].id);
    });
    await t.test("full-body drift refuses atomically instead of guessing a correction", async () => {
      await db.sql(canonicalStatusBefore.replace("declare", "declare\n-- deliberate disposable body drift"));
      await assert.rejects(db.sql(candidate), /canonical status body drift/);
      assert.equal((await db.sql("select to_regprocedure('public.research_assisted_order_member_history(uuid)') value")).rows[0].value, null);
      await db.sql(canonicalStatusBefore);
    });
    await db.sql(candidate);
    assert.equal((await db.sql("select pg_get_functiondef('public.research_assisted_order_status(text,uuid,text,text)'::regprocedure) definition")).rows[0].definition,
      canonicalStatusBefore.replace("if not v_authorized then", "if v_authorized is not true then"));
    await t.test("strict guard-member ownership and narrow nullable projection", async () => {
      const result = await reader.readForMember(member);
      assert.deepEqual(result.source, { connected: true, complete: true });
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0].requestId, owned[0].id);
      assert.equal(result.requests[0].estimatedTotalCents, null);
      assert.equal(result.requests[0].lines[0].lineEstimateCents, null);
      assert.equal(result.requests[0].trackingReference, "SYNTHETIC-TRACKING-REFERENCE");
      assert.equal(result.requests[0].kind, "assisted_request");
      assert.doesNotMatch(JSON.stringify(result), /private-|same-email|actorMemberId|paymentVerification|shippingAddress|documents/);
      assert.equal((await reader.readForMember(foreign)).requests.length, 1);
      assert.deepEqual(await reader.readForMember(randomUUID()), { requests: [], source: { connected: true, complete: true } });
      const before = (await db.sql("select (select count(*) from public.research_assisted_order_requests) requests,(select count(*) from public.research_assisted_order_events) events")).rows[0];
      await reader.readForMember(member);
      const after = (await db.sql("select (select count(*) from public.research_assisted_order_requests) requests,(select count(*) from public.research_assisted_order_events) events")).rows[0];
      assert.deepEqual(after, before);
    });
    await t.test("anonymous/authenticated denied, tables remain inaccessible even to service", async () => {
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(db.sql("select public.research_assisted_order_member_history($1)", [member], role), /permission denied/);
        await assert.rejects(db.sql("select public.research_assisted_order_customer_status($1,$2,null,null)", [owned[0].public_reference, member], role), /permission denied/);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        await assert.rejects(db.sql("select * from public.research_assisted_order_requests", [], role), /permission denied/);
      }
      await assert.rejects(db.sql("select public.research_assisted_order_member_history(null)", [], "service_role"), /member identity required/);
    });
    await t.test("status wrapper inherits exact canonical member, session and token authorization", async () => {
      const status = async (reference, owner = null, session = null, token = null) => (await db.sql(
        "select public.research_assisted_order_customer_status($1,$2::uuid,$3,$4) result", [reference, owner, session, token], "service_role")).rows[0].result;
      assert.equal(await status("XRR-20260921-0000000000", member), null);
      for (const target of [owned[0], guest[0]]) {
        for (const [owner, session, token] of [[null,null,null],[foreign,null,null],[null,"wrong-session",null],
          [null,null,"wrong-token"],[foreign,"wrong-session","wrong-token"]]) {
          assert.equal(await status(target.public_reference, owner, session, token), null);
          assert.equal((await db.sql("select public.research_assisted_order_status($1,$2,$3,$4) result",
            [target.public_reference,owner,session,token], "service_role")).rows[0].result, null);
        }
        const token = randomUUID();
        await db.sql("insert into public.research_assisted_order_access_tokens(request_id,token_hash) values($1,$2)", [target.id, token]);
        assert.equal((await status(target.public_reference, foreign, "wrong-session", token)).requestId, target.id);
        await db.sql("update public.research_assisted_order_access_tokens set revoked_at=now() where token_hash=$1", [token]);
        assert.equal(await status(target.public_reference, foreign, "wrong-session", token), null);
        const expired = randomUUID();
        await db.sql("insert into public.research_assisted_order_access_tokens(request_id,token_hash,created_at,expires_at) values($1,$2,now()-interval '2 days',now()-interval '1 day')", [target.id, expired]);
        assert.equal(await status(target.public_reference, foreign, "wrong-session", expired), null);
      }
      assert.equal((await status(owned[0].public_reference, member, "wrong-session", "wrong-token")).trackingReference, "SYNTHETIC-TRACKING-REFERENCE");
      assert.equal((await status(guest[0].public_reference, foreign, "synthetic-session", "wrong-token")).trackingReference, "GUEST-TRACKING");
      const visible = await status(owned[0].public_reference, member);
      assert.doesNotMatch(JSON.stringify(visible), /private-|paymentVerification|actorMemberId|normalizedEmail/);
    });
    await t.test("canonical maximum 200 lines is complete; 201 cannot be silently truncated", async () => {
      const manyLines = randomUUID();
      const [{ id }] = await seed(manyLines);
      const insertLines = async (count) => db.sql(`insert into public.research_assisted_order_lines
        (id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,quantity_increment,workflow_mode,
         customer_action_label,catalog_version,authoritative_fingerprint)
        select gen_random_uuid(),$1,'extra-product-'||n::text,'extra-variant','Synthetic line',1,1,1,'request_pricing',
         'Request pricing','synthetic-v1','synthetic-fingerprint' from generate_series(1,$2::int) n`, [id,count]);
      await insertLines(199);
      assert.equal((await reader.readForMember(manyLines)).requests[0].lines.length, 200);
      await db.sql(`insert into public.research_assisted_order_lines
        (id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,quantity_increment,workflow_mode,
         customer_action_label,catalog_version,authoritative_fingerprint)
        values(gen_random_uuid(),$1,'overflow-product','overflow-variant','Synthetic overflow',1,1,1,'request_pricing','Request pricing','v1','f')`, [id]);
      assert.deepEqual(await reader.readForMember(manyLines), { requests: [], source: { connected: false, complete: false } });
    });
    await t.test("101 records produce 100 records and explicit incomplete truth", async () => {
      const many = randomUUID();
      await seed(many, 101);
      const read = await reader.readForMember(many);
      assert.equal(read.requests.length, 100);
      assert.deepEqual(read.source, { connected: true, complete: false });
      const second = await reader.readForMember(many);
      assert.deepEqual(second.requests.map((r) => r.requestId), read.requests.map((r) => r.requestId));
    });
    await t.test("malformed durable line fails closed, not silently skipped", async () => {
      const malformed = randomUUID();
      const [{ id }] = await seed(malformed);
      await db.sql("update public.research_assisted_order_lines set product_name='' where request_id=$1", [id]);
      assert.deepEqual(await reader.readForMember(malformed), { requests: [], source: { connected: false, complete: false } });
    });
    await t.test("replay refuses atomically without damaging installed read", async () => {
      await assert.rejects(db.sql(candidate), /refuses replay/);
      assert.equal((await reader.readForMember(member)).requests.length, 1);
    });
    console.log(JSON.stringify({ kind: "disposable-xrr-member-history", runtime: db.runtimeEvidence }));
  } finally { await db.stop(); }
});
