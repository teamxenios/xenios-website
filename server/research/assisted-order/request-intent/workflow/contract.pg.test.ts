import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { parseRequestWorkflow, parseStaffRequestWorkflow } from "../../../../../shared/research/assisted-order/request-intent-workflow";
import { createDurableJourneyFixture, pg16It, submission, OPERATOR, OTHER_ACTOR } from "../durable-journey.pg.fixture";

/** Real canonical save, constraints, guards, locks and rollback in owned PG16.
 * The notification callback here is an explicitly synthetic transactional port,
 * not Claude4's delivery implementation and not proof of provider/mail readiness.
 * Root must additionally run the composed notification migration tests. */
pg16It("atomically initializes workflow, preserves canonical receipts, authorizes scoped CAS and rolls back a failing notification port", async () => {
  const db = createDurableJourneyFixture();
  const schema = "request_intent_private";
  const env = "ea-workflow-fixture";
  let startAt = "";
  const callback = (fail = "false") => db.sql(`create or replace function ${schema}.enqueue_workflow_notice(
    p_request_id uuid,p_event_id uuid,p_kind text,p_revision bigint,p_environment text)
    returns void language plpgsql set search_path='' as $$ begin
      if ${fail} then raise exception 'fixture_notification_port_refused'; end if;
      insert into request_intent_private.workflow_test_delivery values(p_event_id,p_request_id,p_kind,p_revision,p_environment)
        on conflict(event_id) do nothing;
    end $$; revoke all on function ${schema}.enqueue_workflow_notice(uuid,uuid,text,bigint,text) from public,anon,authenticated,service_role;`);
  const ownerGet = (id: string, hash: string, environment = env) => db.asRole("service_role",
    "select public.request_intent_workflow_owner_get($1::uuid,$2::text,$3::text,$4::timestamptz) as value", [id, hash, environment, startAt]);
  const staffGet = (id: string, actor: string, mfa = true, flag = true) => db.asRole("service_role",
    "select public.request_intent_workflow_staff_get($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::boolean,$6::boolean) as value",
    [id, actor, env, startAt, mfa, flag]);
  const start = (id: string, actor: string, command: string, expected = 1, mfa = true) => db.asRole("service_role",
    "select public.request_intent_start_review($1::uuid,$2::uuid,$3::boolean,$4::bigint,$5::uuid,$6::text,$7::timestamptz) as value",
    [id, actor, mfa, expected, command, env, startAt]);
  try {
    await db.start({ managedCareSchema: true });
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    // A separately approved value in the existing installed role check survives.
    await db.sql(`do $$ declare e text; begin
      select pg_get_expr(conbin,conrelid) into strict e from pg_constraint
        where conrelid='public.care_role_assignments'::regclass and conname='ea_pending_reader_role_check';
      execute 'alter table public.care_role_assignments drop constraint ea_pending_reader_role_check, add constraint ea_pending_reader_role_check check (('||e||') or role=''quote_fixture'')';
    end $$;`);
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    const disabled = (await db.sql(`select enabled from ${schema}.workflow_settings`)).rows;
    expect(disabled).toEqual([{ enabled: false }]);
    expect((await db.sql("select state,approved_by,approved_at from public.care_capabilities where capability_key='request_intent_process'")).rows)
      .toEqual([{ state: "disabled", approved_by: null, approved_at: null }]);
    expect((await db.sql(`select * from ${schema}.workflow_processor_scopes`)).rowCount).toBe(0);

    const app = db.application(db.adapter().client).app;
    expect((await db.post(app, "", submission())).status).toBe(200);
    const legacy = (await db.snapshot())[0];
    expect((await db.sql(`select * from ${schema}.workflow`)).rowCount).toBe(0);
    // No historical acknowledgement is created when settings later activate.
    await db.sql(`create table ${schema}.workflow_test_delivery(event_id uuid primary key,request_id uuid,kind text,revision bigint,environment text)`);
    await callback();
    await db.sql(`create function ${schema}.workflow_customer_notice(uuid,uuid) returns text language sql set search_path='' as $$select 'pending'::text$$;
      revoke all on function ${schema}.workflow_customer_notice(uuid,uuid) from public,anon,authenticated,service_role;`);
    startAt = (await db.sql("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as value")).rows[0].value;
    await db.sql(`update ${schema}.workflow_settings set environment=$1,start_at=$2,enabled=true,
      retention_policy_version='synthetic-policy',recipient_policy_version='synthetic-contact'`, [env, startAt]);

    const fresh = { ...submission(), idempotencyKey: randomUUID() };
    await callback("true");
    expect((await db.post(app, "", fresh)).status).toBe(503);
    expect(await db.snapshot()).toHaveLength(1);
    expect((await db.sql(`select * from ${schema}.workflow_events`)).rowCount).toBe(0);
    await callback();
    const saved = await db.post(app, "", fresh);
    expect(saved.status).toBe(200);
    const receipt = saved.body;
    const requestId = receipt.requestId as string;
    const stored = (await db.snapshot()).find(row => row.id === requestId)!;
    expect(stored.status).toBe("pending_review");
    expect((await db.post(app, "", fresh)).body).toEqual(receipt);
    expect((await db.sql(`select kind from ${schema}.workflow_events where request_id=$1 order by revision`, [requestId])).rows)
      .toEqual([{ kind: "received" }, { kind: "queued" }]);
    expect((await db.sql(`select kind from ${schema}.workflow_test_delivery`)).rows).toEqual([{ kind: "request_received_queued" }]);
    expect((await db.sql(`select event_key from ${schema}.workflow_staff_intents`)).rows)
      .toEqual([{ event_key: `ea-request-submitted-${requestId}` }]);
    const projection = parseRequestWorkflow((await ownerGet(requestId, stored.owner_hash)).rows[0].value);
    expect(projection.state).toBe("queued");
    expect((await ownerGet(requestId, "f".repeat(64))).rows[0].value).toBeNull();
    expect((await ownerGet(legacy.id, legacy.owner_hash)).rows[0].value).toBeNull();
    await expect(ownerGet(requestId, stored.owner_hash, "wrong-environment")).rejects.toMatchObject({ code: "55000" });

    await db.sql("insert into public.care_role_assignments(user_id,role,granted_by) values ($1,'request_intent_reader',$1),($2,'request_intent_reader',$1),($1,'quote_fixture',$1)", [OPERATOR, OTHER_ACTOR]);
    await expect(db.sql("insert into public.care_role_assignments(user_id,role,granted_by) values ($1,'fabricated_role',$1)", [OPERATOR])).rejects.toMatchObject({ code: "23514" });
    expect(parseStaffRequestWorkflow((await staffGet(requestId, OPERATOR)).rows[0].value).canStartReview).toBe(false);
    await expect(start(requestId, OPERATOR, randomUUID())).rejects.toMatchObject({ code: "42501" });
    await db.sql("insert into public.care_role_assignments(user_id,role,granted_by) values ($1,'request_intent_processor',$1),($2,'request_intent_processor',$1)", [OPERATOR, OTHER_ACTOR]);
    await db.sql("update public.care_capabilities set state='enabled',approved_by=$1,approved_at=now() where capability_key='request_intent_process'", [OPERATOR]);
    // Explicit role + approved capability is still insufficient without scope.
    await expect(start(requestId, OPERATOR, randomUUID())).rejects.toMatchObject({ code: "42501" });
    await db.sql(`insert into ${schema}.workflow_processor_scopes(actor_user_id,environment,approved_by,approved_at)
      values ($1,$3,$1,now()),($2,$3,$1,now())`, [OPERATOR, OTHER_ACTOR, env]);
    expect(parseStaffRequestWorkflow((await staffGet(requestId, OPERATOR)).rows[0].value).canStartReview).toBe(true);
    expect(parseStaffRequestWorkflow((await staffGet(requestId, OPERATOR, false)).rows[0].value).canStartReview).toBe(false);
    expect(parseStaffRequestWorkflow((await staffGet(requestId, OPERATOR, true, false)).rows[0].value).canStartReview).toBe(false);
    await expect(start(requestId, OPERATOR, randomUUID(), 1, false)).rejects.toMatchObject({ code: "42501" });
    await callback("p_kind='request_reviewing'");
    await expect(start(requestId, OPERATOR, randomUUID())).rejects.toThrow("fixture_notification_port_refused");
    expect((await db.sql(`select state from ${schema}.workflow where request_id=$1`, [requestId])).rows[0].state).toBe("queued");
    expect((await db.sql(`select * from ${schema}.workflow_commands`)).rowCount).toBe(0);
    await callback();
    const commands = [randomUUID(), randomUUID()];
    const actors = [OPERATOR, OTHER_ACTOR];
    const competing = await Promise.allSettled(actors.map((actor, index) => start(requestId, actor, commands[index])));
    expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter(result => result.status === "rejected")).toHaveLength(1);
    const winner = competing.findIndex(result => result.status === "fulfilled");
    const winnerResult = (competing[winner] as PromiseFulfilledResult<Awaited<ReturnType<typeof start>>>).value.rows[0].value;
    expect(winnerResult.replay).toBe(false);
    expect(parseRequestWorkflow(winnerResult.workflow).events.map(event => event.kind)).toEqual(["received", "queued", "review_started"]);
    expect((await start(requestId, actors[winner], commands[winner])).rows[0].value.replay).toBe(true);
    await expect(start(requestId, actors[1 - winner], commands[winner])).rejects.toMatchObject({ code: "23505" });
    await expect(start(requestId, actors[winner], randomUUID())).rejects.toMatchObject({ code: "40001" });
    expect((await db.sql(`select kind from ${schema}.workflow_test_delivery order by revision`)).rows)
      .toEqual([{ kind: "request_received_queued" }, { kind: "request_reviewing" }]);
    expect(parseStaffRequestWorkflow((await staffGet(requestId, OPERATOR)).rows[0].value).canStartReview).toBe(false);
    expect(JSON.stringify(winnerResult.workflow)).not.toMatch(/synthetic@example|owner_hash|actor_user|processor_user|contact|lines/);
    await db.sql(`update ${schema}.workflow_processor_scopes set revoked_at=now() where actor_user_id=$1`, [actors[winner]]);
    await expect(start(requestId, actors[winner], commands[winner])).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql(`update ${schema}.workflow_events set kind='received'`)).rejects.toThrow();
    await expect(db.sql(`delete from ${schema}.workflow_commands`)).rejects.toThrow();
    await expect(db.sql(`update ${schema}.workflow_settings set start_at=start_at-interval '1 day'`)).rejects.toMatchObject({ code: "22023" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, `select * from ${schema}.workflow`)).rejects.toMatchObject({ code: "42501" });
      if (role !== "service_role") await expect(db.asRole(role,
        "select public.request_intent_start_review($1::uuid,$2::uuid,true,1,$3::uuid,$4::text,$5::timestamptz)",
        [requestId, OPERATOR, randomUUID(), env, startAt])).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.snapshot()).find(row => row.id === requestId)!.status).toBe("pending_review");
  } finally { await db.close(); }
}, 120_000);
