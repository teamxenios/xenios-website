/** Additive native test; not executed by this author on the low-capacity host.
 * Reuses the unchanged owned loopback17.6/17.11 fixture and exact SQL inputs.
 * Three dedicated owned connections prove REAL overlapping RPC execution:
 * first RPC waits in a test-only audit trigger on coordinator's advisory gate;
 * second identical RPC waits on first's real actor/key transaction lock.
 * Only after both blocker relationships are observed is the gate released.
 * No managed URL/client, host credentials, application API or real actor.
 */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { Pool, PoolClient, QueryResult } from "pg";
import { createDurableJourneyFixture, pg16It } from "./assisted-order/request-intent/durable-journey.pg.fixture";

const identity = { offeringId: "mo_abc", offeringVariantId: "mov_def", productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", variantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const mediaId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const actor = "synthetic-publication-concurrency";
const GATE = "724112341234";
const SQL = "supabase/candidates/catalog_publication.sql";
const SQL_SHA = "d965cb8ce9965eee9db472dd4a16c773eb2893b2f2f83beb1ba6c4abd3cc3d45";
const PINNED: Record<string, string> = {
  "supabase/verification/research-pricing-lineage-disposable-bootstrap.sql": "bab1f2a56f773d22254c48cf75db9a1f794ed1ac92acd54afdeea86045ab6ceb",
  "supabase/migrations/20260726143000_research_product_control_center.sql": "b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203",
  "supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql": "2fb96f105fcfb1d6f77bf6e9bcf191b48decbc9206f2045b32cf7595d31551db",
};
function pinned(file: string, sha: string) { const raw = readFileSync(file); expect(createHash("sha256").update(raw).digest("hex")).toBe(sha); return raw.toString("utf8"); }
type Owned = ReturnType<typeof createDurableJourneyFixture>;
type Receipt = { operation: string; revisionId: string | null; generation: number; identity: typeof identity; replayed: boolean };
type Settled = { result: QueryResult } | { error: unknown };
const settle = (promise: Promise<QueryResult>): Promise<Settled> => promise.then(result => ({ result }), error => ({ error }));
function unwrap(value: Settled) { if ("error" in value) throw value.error; return value.result.rows[0].v as Receipt; }

async function waitForBlocker(db: Owned, blocked: number, blocker: number) {
  const deadline = Date.now() + 2500;
  let last: unknown;
  do {
    const row = (await db.sql("select pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1", [blocked])).rows[0];
    last = row ?? null;
    if (row?.state === "active" && row.wait_event_type === "Lock" && row.wait_event === "advisory" && Array.isArray(row.blockers) && row.blockers.includes(blocker)) return row;
    await new Promise(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  throw new Error("SIMULTANEOUS_RPC_BLOCKER_NOT_OBSERVED:" + JSON.stringify({ blocked, blocker, last }));
}

async function overlap(db: Owned, first: PoolClient, second: PoolClient, coordinator: PoolClient,
  name: "research_catalog_publication_seal" | "research_catalog_publication_transition", key: string, intent: object, evidence?: object) {
  let one: Promise<Settled> | undefined, two: Promise<Settled> | undefined;
  let primary: unknown, answer: { first: Receipt; second: Receipt } | undefined;
  const cleanupErrors: unknown[] = [];
  try {
    await coordinator.query("select pg_advisory_lock($1::bigint)", [GATE]);
    for (const c of [first, second]) {
      await c.query("begin");
      await c.query("set local role service_role");
      await c.query("select set_config('request.jwt.claim.sub','',true)");
    }
    const a = Number((await first.query("select pg_backend_pid() as pid")).rows[0].pid);
    const b = Number((await second.query("select pg_backend_pid() as pid")).rows[0].pid);
    const gateOwner = Number((await coordinator.query("select pg_backend_pid() as pid")).rows[0].pid);
    expect(new Set([a,b,gateOwner]).size).toBe(3);
    const args = evidence === undefined ? [actor,key,intent] : [actor,key,intent,evidence];
    const text = `select public.${name}(${args.map((_,i)=>"$"+(i+1)).join(",")}) as v`;
    one = settle(first.query(text,args));
    const firstBlockedOnGate = await waitForBlocker(db,a,gateOwner);
    two = settle(second.query(text,args));
    const secondBlockedOnFirst = await waitForBlocker(db,b,a);
    expect((await coordinator.query("select pg_advisory_unlock($1::bigint) as released",[GATE])).rows[0].released).toBe(true);
    const firstReceipt = unwrap(await one);
    await first.query("commit");
    const secondReceipt = unwrap(await two);
    await second.query("commit");
    expect(firstReceipt.replayed).toBe(false);
    expect(secondReceipt.replayed).toBe(true);
    expect({...secondReceipt,replayed:false}).toEqual(firstReceipt);
    expect(firstReceipt.identity).toEqual(identity);
    console.log("PUBLICATION_CONCURRENT_REPLAY_EVIDENCE",JSON.stringify({key,operation:firstReceipt.operation,firstBlockedOnGate,secondBlockedOnFirst,receipt:firstReceipt,replayReceipt:secondReceipt}));
    answer = {first:firstReceipt,second:secondReceipt};
  } catch (error) { primary = error; }
  finally {
    // Release only this test's gate, then let each owned query settle before
    // rolling back its transaction. Never kill a foreign backend or mask failure.
    try { await coordinator.query("select pg_advisory_unlock_all()"); } catch (error) { cleanupErrors.push(error); coordinator.release(true); }
    try { if (one) await one; await first.query("rollback"); } catch (error) { cleanupErrors.push(error); }
    try { if (two) await two; await second.query("rollback"); } catch (error) { cleanupErrors.push(error); }
  }
  if (primary || cleanupErrors.length) throw new AggregateError([...(primary?[primary]:[]),...cleanupErrors],"OWNED_PUBLICATION_REPLAY_OR_CLEANUP_FAILED");
  if (!answer) throw new Error("NO_CONCURRENT_REPLAY_RECEIPT");
  return answer;
}

async function setup(db: Owned) {
  const bootstrap = pinned(Object.keys(PINNED)[0],Object.values(PINNED)[0]);
  expect(bootstrap.split(/\r?\n/).filter(l=>l.startsWith("\\"))).toEqual(["\\set ON_ERROR_STOP on","\\ir ../migrations/20260726143000_research_product_control_center.sql","\\ir ../migrations/20260726214500_research_product_control_center_privilege_hardening.sql"]);
  await db.sql(bootstrap.split(/\r?\n/).filter(l=>!l.startsWith("\\")).join("\n"));
  for (const [file,sha] of Object.entries(PINNED).slice(1)) await db.sql(pinned(file,sha));
  await db.sql(pinned(SQL,SQL_SHA));
  // Same deliberately minimal synthetic ProductControl rows as the existing
  // historical native test. No managed schema or real approval equivalence.
  await db.sql("insert into public.research_products(id,sku,display_name,canonical_name,admin_status,active_state,visibility_state,version) values($1,'OWNED-PUBLICATION','Owned publication fixture','Owned publication fixture','published',true,'public',1)",[identity.productId]);
  await db.sql("insert into public.research_product_variants(id,product_id,sku,label,created_by,updated_by) values($1,$2,'OWNED-PUBLICATION-ONE','Owned variant','synthetic-fixture','synthetic-fixture')",[identity.variantId,identity.productId]);
  await db.sql("update public.research_product_variants set status='in_review',version=2 where id=$1",[identity.variantId]);
  await db.sql("update public.research_product_variants set status='approved',active=true,version=3 where id=$1",[identity.variantId]);
  await db.sql("insert into public.research_product_content(product_id,section,state,body) values($1,'shortDescription','draft','Owned reviewed summary'),($1,'overview','draft','Owned reviewed overview')",[identity.productId]);
  await db.sql("insert into public.research_product_media(id,product_id,kind,state,storage_key,filename,content_type,size_bytes,alt_text,created_by,updated_by,approved_by,approved_at) values($1,$2,'primary_image','approved','owned-test/private.png','private.png','image/png',12,'Owned reference','fixture','fixture','fixture',now())",[mediaId,identity.productId]);
  await db.sql(`create function public.owned_publication_concurrency_gate() returns trigger language plpgsql set search_path=pg_catalog as $$ begin perform pg_advisory_xact_lock(${GATE}::bigint); return NEW; end $$;
    create trigger owned_publication_concurrency_gate before insert on public.research_product_admin_audit for each row execute function public.owned_publication_concurrency_gate()`);
}

for (const image of ["postgres:17.6","postgres:17.11"] as const) {
  pg16It(`simultaneous identical-key publication seal and publish replay has one receipt/audit effect on owned ${image}`,async()=>{
    const db=createDurableJourneyFixture();
    let workers:Pool|undefined,gate:Pool|undefined,first:PoolClient|undefined,second:PoolClient|undefined,coordinator:PoolClient|undefined;
    let primary:unknown;const cleanupErrors:unknown[]=[];
    try {
      await db.start({dockerOnly:true,managedCareSchema:true,image}); await setup(db);
      const password=randomUUID();
      // Private, ephemeral owned-fixture login only. Exact literal role name,
      // generated UUID password, no caller-provided URL or existing credential.
      await db.sql(`create role owned_publication_race login password '${password}'; grant service_role to owned_publication_race`);
      workers=db.poolForLogin("owned_publication_race",password);gate=db.poolForLogin("owned_publication_race",password);
      first=await workers.connect();second=await workers.connect();coordinator=await gate.connect();
      for(const client of [first,second,coordinator]) await client.query("set statement_timeout='10s'; set lock_timeout='8s'; set idle_in_transaction_session_timeout='15s'");
      const source=(await db.asRole("service_role","select public.research_catalog_publication_source($1,$2) as v",[identity,mediaId])).rows[0].v;
      const evidence={identity,sourceSha256:source.sourceSha256,contentSha256:source.contentSha256,mediaId,mediaVersion:1,contentApprovalSha256:"4".repeat(64),rightsApprovalSha256:"5".repeat(64),mediaSha256:"6".repeat(64),usage:"public_catalog_display",state:"approved",expiresAt:null,width:1,height:1,representation:"catalog_reference",packagingDesign:false};
      const sealed=await overlap(db,first,second,coordinator,"research_catalog_publication_seal","concurrent-seal",{operation:"seal",identity,expectedGeneration:0,mediaId,sourceSha256:source.sourceSha256},evidence);
      expect(sealed.first.generation).toBe(0);
      const assertSingle=async(key:string,action:string,receipt:Receipt)=>{
        const op=(await db.sql("select intent,receipt from public.research_catalog_publication_operations where actor=$1 and operation_key=$2",[actor,key])).rows;
        const audit=(await db.sql("select after_state from public.research_product_admin_audit where actor=$1 and action=$2 and product_id=$3",[actor,action,identity.productId])).rows;
        expect(op).toHaveLength(1);expect(op[0].receipt).toEqual(receipt);expect(audit).toHaveLength(1);expect(audit[0].after_state).toEqual(receipt);
      };
      await assertSingle("concurrent-seal","catalog_revision_sealed",sealed.first);
      expect((await db.sql("select count(*)::int as n from public.research_catalog_publication_revisions")).rows[0].n).toBe(1);
      const published=await overlap(db,first,second,coordinator,"research_catalog_publication_transition","concurrent-publish",{operation:"publish",identity,expectedGeneration:0,revisionId:sealed.first.revisionId});
      expect(published.first.generation).toBe(1);expect(published.first.revisionId).toBe(sealed.first.revisionId);
      await assertSingle("concurrent-publish","catalog_publish",published.first);
      const current=(await db.asRole("service_role","select public.research_catalog_publication_current($1) as v",[identity])).rows[0].v;
      expect(current.generation).toBe(1);expect(current.revision.id).toBe(sealed.first.revisionId);
      expect((await db.sql("select count(*)::int as n from public.research_catalog_publication_operations where actor=$1",[actor])).rows[0].n).toBe(2);
      expect((await db.sql("select count(*)::int as n from public.research_product_admin_audit where actor=$1",[actor])).rows[0].n).toBe(2);
    } catch(error) {primary=error;}
    finally {
      for(const client of [first,second,coordinator]){try{client?.release();}catch(error){cleanupErrors.push(error);}}
      for(const pool of [workers,gate]){try{await pool?.end();}catch(error){cleanupErrors.push(error);}}
      try{await db.close();}catch(error){cleanupErrors.push(error);}
    }
    if(primary||cleanupErrors.length)throw new AggregateError([...(primary?[primary]:[]),...cleanupErrors],"OWNED_PUBLICATION_NATIVE_QUALIFICATION_FAILED");
  },90_000);
}
