import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission, OPERATOR, OTHER_ACTOR } from "../assisted-order/request-intent/durable-journey.pg.fixture";
import { REQUEST_INTENT_KIND } from "../../../shared/research/assisted-order/request-intent";
import type { AeWorkspaceCommand } from "../../../shared/research/account-executive/workspace";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";
import { createAeCanonicalAdapter } from "./canonical-adapter";
import { createAeWorkspaceService, type AeVerifiedSession } from "./workspace";
import { createAeIdentityBinding, memberOwnerHash, type AeCanonicalRpc } from "./identity-binding";

/** Real owned PostgreSQL16 + real candidate/RPC/adapter/service. Auth users,
 * verified JWT context, members and verified-link rows are synthetic fixtures;
 * this is not managed GoTrue, provider, browser or production-grant evidence. */
pg16It("qualifies canonical AE assignment, identity, scoped reads, races, exact receipts, task custody and atomic rollback", async () => {
  const db = createDurableJourneyFixture();
  const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const supervisor = OPERATOR, actorA = OTHER_ACTOR, actorB = id(3), customer = id(4), otherCustomer = id(5);
  const scope = id(10), otherScope = id(11), memberId = id(14);
  const sid = (n: number) => id(100 + n);
  const session = (user: string, n: number): AeVerifiedSession => ({ authUserId: user, purpose: "ordinary", sessionId: sid(n) });
  const admin = session(supervisor, 1), a = session(actorA, 2), b = session(actorB, 3), customerSession = session(customer, 4), otherCustomerSession = session(otherCustomer, 5);
  const guestRef = "eac_" + "a".repeat(32), guestSessionHash = "b".repeat(64);
  const guestHash = sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session", guestRef, guestSessionHash]);
  const rpcCalls: string[] = [];
  const rpc: AeCanonicalRpc = { async rpc(name, args) {
    rpcCalls.push(name);
    const signatures: Record<string, { text: string; values: unknown[] }> = {
      ae_workspace_read: { text: "select public.ae_workspace_read($1::uuid,$2::uuid,$3::uuid) as value",
        values: [args.p_actor_user_id, args.p_session_id, args.p_scope_id] },
      ae_workspace_authorize: { text: "select public.ae_workspace_authorize($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as value",
        values: [args.p_actor_user_id, args.p_session_id, args.p_scope_id, args.p_customer_auth_user_id, args.p_capability] },
      ae_workspace_command: { text: "select public.ae_workspace_command($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::uuid,$6::bigint) as value",
        values: [args.p_actor_user_id, args.p_session_id, args.p_scope_id, JSON.stringify(args.p_command), args.p_grant_id, args.p_grant_revision] },
      ae_workspace_assign: { text: "select public.ae_workspace_assign($1::uuid,$2::uuid,$3::uuid,$4::jsonb) as value",
        values: [args.p_actor_user_id, args.p_session_id, args.p_scope_id, JSON.stringify(args.p_command)] },
      ae_workspace_guest_ownership: { text: "select public.ae_workspace_guest_ownership($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text) as value",
        values: [args.p_actor_user_id, args.p_session_id, args.p_scope_id, args.p_customer_auth_user_id, args.p_request_id, args.p_owner_hash] },
      ae_workspace_claim: { text: "select public.ae_workspace_claim($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::text,$6::text,$7::timestamptz) as value",
        values: [args.p_actor_user_id, args.p_session_id, args.p_scope_id, JSON.stringify(args.p_command), args.p_guest_ref, args.p_guest_session_hash, args.p_guest_expires_at] },
    };
    const call = signatures[name];
    if (!call) throw new Error("Unexpected AE fixture RPC");
    try { return { data: (await db.asRole("service_role", call.text, call.values)).rows[0].value, error: null }; }
    catch (error) { return { data: null, error: { code: (error as { code?: string }).code, message: "Synthetic private diagnostic" } }; }
  } };
  const service = () => createAeWorkspaceService(createAeCanonicalAdapter(rpc, scope));
  const identity = createAeIdentityBinding(rpc, scope);
  const effectCounts = async () => (await db.sql(`select
    (select count(*)::int from ae_workspace_private.assignments) as assignments,
    (select count(*)::int from ae_workspace_private.followups) as followups,
    (select count(*)::int from ae_workspace_private.audit_events where command_id is not null) as audit,
    (select count(*)::int from ae_workspace_private.command_receipts) as receipts`)).rows[0];
  try {
    await db.start({ managedCareSchema: true });
    const originalApp = db.application(db.adapter().client).app;
    expect((await db.post(originalApp, "", submission())).status).toBe(200);
    const base = (await db.snapshot())[0];
    await db.sql("insert into auth.users(id) values($1),($2),($3) on conflict do nothing", [actorB, customer, otherCustomer]);
    await db.sql(`create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz,aal text);
      create table public.research_members(id uuid primary key,auth_user_id uuid not null unique references auth.users(id),status text not null)`);
    await db.sql("insert into public.research_members values($1,$2,'active'),($3,$4,'active')", [memberId, customer, id(15), otherCustomer]);
    for (const s of [admin, a, b, customerSession, otherCustomerSession]) await db.sql("insert into auth.sessions values($1,$2,clock_timestamp()+interval '1 hour','aal2')", [s.sessionId, s.authUserId]);
    const hardening = readFileSync("supabase/migrations/20260809130000_research_early_access_hardening.sql", "utf8");
    const bindingStart = hardening.indexOf("create table if not exists public.research_early_access_legal_bindings (");
    const bindingEnd = hardening.indexOf("create unique index if not exists research_ea_legal_binding_member_customer_uidx", bindingStart);
    expect(bindingStart).toBeGreaterThan(0); expect(bindingEnd).toBeGreaterThan(bindingStart);
    await db.sql(hardening.slice(bindingStart, bindingEnd));
    await db.sql(`insert into public.research_early_access_legal_bindings(customer_ref,member_id,established_by,verified_at,attested_by)
      values($1,$2,'verified_link',clock_timestamp()-interval '1 minute',null)`, [guestRef, memberId]);
    const originalBindings = (await db.sql("select jsonb_agg(to_jsonb(b) order by id) as value from public.research_early_access_legal_bindings b")).rows[0].value;
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    await db.sql(`create function request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text) returns void language plpgsql set search_path='' as $$begin return; end$$;
      create function request_intent_private.workflow_customer_notice(uuid,uuid) returns text language sql set search_path='' as $$select 'unavailable'::text$$;
      update request_intent_private.workflow_settings set enabled=true,environment='ae-fixture',start_at=clock_timestamp(),retention_policy_version='synthetic',recipient_policy_version='synthetic'`);
    const save = async (owner: string) => {
      const requestId = randomUUID(), detail = { kind: REQUEST_INTENT_KIND, requestId,
        publicReference: "XRI-" + requestId.replaceAll("-", "").toUpperCase(), status: "pending_review", createdAt: new Date().toISOString(),
        contact: base.contact, agreements: base.agreements, lines: base.lines };
      const result = await db.asRole("service_role", "select public.request_intent_create_or_replay($1::text,$2::text,$3::text,$4::jsonb) as value",
        [owner, sha256AssistedOrderHasher.hash(randomUUID()), sha256AssistedOrderHasher.stableHash(detail), JSON.stringify(detail)]);
      const saved = result.rows[0].value as { receipt: { requestId: string } };
      expect(saved.receipt.requestId).toBe(requestId);
      return saved.receipt;
    };
    const memberRequest = await save(memberOwnerHash(customer));
    const guestRequest = await save(guestHash); // Identical contact; different actual owner.
    const candidate = readFileSync("supabase/candidates/ae_workspace_authority.sql", "utf8");
    await db.sql(candidate); await db.sql(candidate);
    expect((await service().read(a))).toEqual({ ok: false, code: "unavailable" });
    expect((await db.sql("select * from ae_workspace_private.grants")).rowCount).toBe(0);
    const leaks = (await db.sql(`select has_table_privilege('service_role','ae_workspace_private.assignments','select') as direct,
      has_function_privilege('anon','public.ae_workspace_read(uuid,uuid,uuid)','execute') as anon,
      has_function_privilege('authenticated','public.ae_workspace_command(uuid,uuid,uuid,jsonb,uuid,bigint)','execute') as authenticated`)).rows[0];
    expect(leaks).toEqual({ direct: false, anon: false, authenticated: false });
    await db.sql(`update ae_workspace_private.settings set enabled=true,approved_by=$1,approved_at=clock_timestamp(),privacy_policy_version='synthetic',retention_policy_version='synthetic'`, [supervisor]);
    const caps = ["workspace:read", "customer:contact", "followup:record", "customer:reassign"];
    for (const [actor, capabilities] of [[supervisor, ["customer:assign"]], [actorA, caps], [actorB, caps]] as const) {
      await db.sql(`insert into ae_workspace_private.grants(actor_user_id,scope_id,capabilities,valid_from,valid_until,approved_by,approved_at)
        values($1,$2,$3,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',$4,clock_timestamp())`, [actor, scope, capabilities, supervisor]);
    }
    expect(await service().read(a)).toMatchObject({ ok: true, value: { customers: [] } });
    const initialCommand = { commandId: randomUUID(), customerAuthUserId: customer, assigneeAuthUserId: actorA };
    expect(await service().assign(a, initialCommand)).toEqual({ ok: false, code: "access_denied" });
    const initial = await service().assign(admin, initialCommand);
    expect(initial).toMatchObject({ ok: true, value: { assignment: { revision: 1, assigneeAuthUserId: actorA }, audit: { kind: "assignment_assigned", actorAuthUserId: supervisor } } });
    if (!initial.ok) throw new Error("Initial assignment failed");
    expect(await service().assign(admin, initialCommand)).toMatchObject({ ok: true, value: { replay: true, audit: initial.value.audit } });
    const firstRead = await service().read(a);
    expect(firstRead).toMatchObject({ ok: true, value: { customers: [{ requests: [{ requestId: memberRequest.requestId, receiptStatus: "pending_review", workflow: { state: "queued" } }] }] } });
    expect(JSON.stringify(firstRead)).not.toContain(guestRequest.requestId);
    expect(await service().read(b)).toMatchObject({ ok: true, value: { customers: [] } });
    expect((await db.sql("select count(*)::int as n from ae_workspace_private.audit_events where kind='contact_read'")).rows[0].n).toBe(1);
    const proof = { customerRef: guestRef, sessionHash: guestSessionHash, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    const claimCommand = { commandId: randomUUID(), requestId: guestRequest.requestId };
    expect(await identity.claim(customerSession, claimCommand, { ...proof, sessionHash: "f".repeat(64) })).toEqual({ ok: false, code: "not_found" });
    expect(await identity.claim(customerSession, claimCommand, { ...proof, expiresAt: new Date(Date.now() - 1).toISOString() })).toEqual({ ok: false, code: "not_found" });
    const claimed = await identity.claim(customerSession, claimCommand, proof);
    expect(claimed.ok).toBe(true);
    expect(await identity.claim(customerSession, claimCommand, null)).toMatchObject({ ok: true, value: { replay: true } });
    expect(await identity.claim(customerSession, { ...claimCommand, commandId: randomUUID() }, proof)).toEqual({ ok: false, code: "revision_conflict" });
    expect(await identity.claim(otherCustomerSession, { ...claimCommand, commandId: randomUUID() }, proof)).toEqual({ ok: false, code: "not_found" });
    const afterClaim = await service().read(a);
    expect(afterClaim.ok && afterClaim.value.customers[0].requests.map(row => row.requestId).sort()).toEqual([memberRequest.requestId, guestRequest.requestId].sort());
    expect(JSON.stringify(afterClaim)).not.toMatch(/guest_owner_hash|ownerHash|sessionHash|claimId/);
    const contactAudits = Number((await db.sql("select count(*) as n from ae_workspace_private.audit_events where kind='contact_read'")).rows[0].n);
    await db.sql("update ae_workspace_private.grants set capabilities=array_remove(capabilities,'customer:contact') where actor_user_id=$1", [actorA]);
    expect(await service().read(a)).toMatchObject({ ok: true, value: { customers: [{ contact: { state: "not_permitted" } }] } });
    expect(Number((await db.sql("select count(*) as n from ae_workspace_private.audit_events where kind='contact_read'")).rows[0].n)).toBe(contactAudits);
    await db.sql("update ae_workspace_private.grants set capabilities=$2 where actor_user_id=$1", [actorA, caps]);
    const assignmentId = initial.value.assignment.id;
    const currentRevision = async () => Number((await db.sql("select revision from ae_workspace_private.assignments where id=$1", [assignmentId])).rows[0].revision);
    const followup = async () => ({ kind: "record_followup" as const, commandId: randomUUID(), assignmentId,
      customerAuthUserId: customer, expectedRevision: await currentRevision(), purpose: "contact_customer" as const,
      dueAt: new Date(Date.now() + 3_600_000).toISOString() });
    const same = await followup(), sameBefore = await effectCounts();
    const duplicate = await Promise.all([service().command(a, same), service().command(a, same)]);
    expect(duplicate.every(result => result.ok)).toBe(true);
    expect(duplicate.map(result => result.ok && result.value.replay).sort()).toEqual([false, true]);
    expect(await effectCounts()).toEqual({ ...sameBefore, followups: sameBefore.followups + 1, audit: sameBefore.audit + 1, receipts: sameBefore.receipts + 1 });
    expect(await service().command(a, { ...same, purpose: "documentation_followup" })).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(await service().command(a, { ...same, expectedRevision: same.expectedRevision + 1 })).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(await service().command(a, { ...same, dueAt: new Date(Date.parse(same.dueAt) + 60_000).toISOString() })).toEqual({ ok: false, code: "idempotency_conflict" });
    const expiryEffects = await effectCounts();
    await db.sql("update ae_workspace_private.grants set valid_until=clock_timestamp()-interval '1 second' where actor_user_id=$1", [actorA]);
    expect(await service().read(a)).toEqual({ ok: false, code: "access_denied" });
    expect(await service().command(a, same)).toEqual({ ok: false, code: "access_denied" });
    expect(await effectCounts()).toEqual(expiryEffects);
    await db.sql("update ae_workspace_private.grants set valid_until=clock_timestamp()+interval '1 hour' where actor_user_id=$1", [actorA]);
    expect(await service().command(b, { ...same, commandId: randomUUID() })).toEqual({ ok: false, code: "not_found" });
    expect(await service().command(b, { ...same, commandId: randomUUID(), customerAuthUserId: randomUUID() })).toEqual({ ok: false, code: "not_found" });
    expect(await service().read({ ...a, sessionId: b.sessionId })).toEqual({ ok: false, code: "access_denied" });
    const left = await followup(), right = { ...left, commandId: randomUUID() };
    const competing = await Promise.all([service().command(a, left), service().command(a, right)]);
    expect(competing.filter(result => result.ok)).toHaveLength(1);
    expect(competing.filter(result => !result.ok && result.code === "revision_conflict")).toHaveLength(1);
    const otherInitial = await service().assign(admin, { commandId: randomUUID(), customerAuthUserId: otherCustomer, assigneeAuthUserId: actorA });
    if (!otherInitial.ok) throw new Error("Second synthetic assignment failed");
    expect(await service().command(a, { ...same, assignmentId: otherInitial.value.assignment.id, customerAuthUserId: otherCustomer }))
      .toEqual({ ok: false, code: "idempotency_conflict" });
    const noContact = await service().read(a);
    expect(noContact.ok && noContact.value.customers.find(row => row.assignment.customerAuthUserId === otherCustomer)?.contact).toEqual({ state: "unavailable" });
    const mixedCommand = { ...(await followup()), assignmentId: otherInitial.value.assignment.id,
      customerAuthUserId: otherCustomer, expectedRevision: 1 };
    const mixedRace = await Promise.all([service().command(a, mixedCommand), service().command(a, {
      kind: "reassign", commandId: randomUUID(), assignmentId: mixedCommand.assignmentId,
      customerAuthUserId: otherCustomer, expectedRevision: 1, nextAssigneeAuthUserId: actorB,
    })]);
    expect(mixedRace.filter(result => result.ok)).toHaveLength(1);
    expect(mixedRace.filter(result => !result.ok && ["revision_conflict", "not_found"].includes(result.code))).toHaveLength(1);
    // A real grant update holds the row before the fresh authority read. Observe
    // PostgreSQL waiting on that lock, then commit revocation: no command effect.
    const probePassword = randomUUID();
    await db.sql("create role ae_lock_probe login superuser password '" + probePassword + "'");
    const probePool = db.poolForLogin("ae_lock_probe", probePassword), probe = await probePool.connect();
    const revokeBefore = await effectCounts();
    try {
      await probe.query("begin");
      await probe.query("update ae_workspace_private.grants set revoked_at=clock_timestamp() where actor_user_id=$1", [actorA]);
      const blocked = service().command(a, await followup());
      let observed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await db.sql("select count(*)::int as n from pg_stat_activity where wait_event_type='Lock' and query like '%public.ae_workspace_authorize%'");
        if (waiting.rows[0].n > 0) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await probe.query("commit");
      expect(observed).toBe(true);
      expect(await blocked).toEqual({ ok: false, code: "access_denied" });
      expect(await effectCounts()).toEqual(revokeBefore);
    } finally {
      await probe.query("rollback"); probe.release(); await probePool.end();
    }
    await db.sql("update ae_workspace_private.grants set revoked_at=null where actor_user_id=$1", [actorA]);
    const unknown = await followup(); let lose = true;
    const lossy: AeCanonicalRpc = { async rpc(name, args) { const response = await rpc.rpc(name, args);
      if (name === "ae_workspace_command" && lose && response.error === null) { lose = false; return { data: null, error: { code: "08006" } }; }
      return response; } };
    const lostService = createAeWorkspaceService(createAeCanonicalAdapter(lossy, scope));
    expect(await lostService.command(a, unknown)).toEqual({ ok: false, code: "unavailable" });
    expect(await service().command(a, unknown)).toMatchObject({ ok: true, value: { replay: true } });
    const rollbackBefore = await effectCounts(), rollbackRevision = await currentRevision();
    await db.sql(`create function ae_workspace_private.fixture_fail_audit() returns trigger language plpgsql as $$begin
      if new.kind='followup_recorded' then raise exception 'synthetic_audit_failure'; end if; return new; end$$;
      create trigger fixture_fail before insert on ae_workspace_private.audit_events for each row execute function ae_workspace_private.fixture_fail_audit()`);
    expect(await service().command(a, await followup())).toEqual({ ok: false, code: "unavailable" });
    expect(await effectCounts()).toEqual(rollbackBefore); expect(await currentRevision()).toBe(rollbackRevision);
    await db.sql("drop trigger fixture_fail on ae_workspace_private.audit_events");
    await db.sql(`create function ae_workspace_private.fixture_corrupt_receipt() returns trigger language plpgsql as $$begin new.receipt:=new.receipt-'commandId'; return new; end$$;
      create trigger fixture_corrupt before insert on ae_workspace_private.command_receipts for each row execute function ae_workspace_private.fixture_corrupt_receipt()`);
    expect(await service().command(a, await followup())).toEqual({ ok: false, code: "unavailable" });
    expect(await effectCounts()).toEqual(rollbackBefore); expect(await currentRevision()).toBe(rollbackRevision);
    await db.sql("drop trigger fixture_corrupt on ae_workspace_private.command_receipts");
    const firstReceipt = duplicate.find(result => result.ok && !result.value.replay);
    if (!firstReceipt?.ok || !firstReceipt.value.followup) throw new Error("Committed followup receipt missing");
    const completed = firstReceipt.value.followup.id;
    await db.sql("update ae_workspace_private.followups set state='completed' where id=$1", [completed]);
    expect(await service().command(a, same)).toEqual({ ok: true, value: { ...firstReceipt.value, replay: true } });
    const reassign = { kind: "reassign" as const, commandId: randomUUID(), assignmentId, customerAuthUserId: customer,
      expectedRevision: await currentRevision(), nextAssigneeAuthUserId: actorB };
    await db.sql("update ae_workspace_private.grants set revoked_at=clock_timestamp() where actor_user_id=$1", [actorB]);
    expect(await service().command(a, reassign)).toEqual({ ok: false, code: "access_denied" });
    await db.sql("update ae_workspace_private.grants set revoked_at=null where actor_user_id=$1", [actorB]);
    lose = true;
    expect(await lostService.command(a, reassign)).toEqual({ ok: false, code: "unavailable" });
    const commandsAfterLoss = rpcCalls.filter(name => name === "ae_workspace_command").length;
    expect(await service().command(a, reassign)).toEqual({ ok: false, code: "not_found" });
    expect(rpcCalls.filter(name => name === "ae_workspace_command")).toHaveLength(commandsAfterLoss);
    const oldOwnerRead = await service().read(a);
    expect(oldOwnerRead.ok).toBe(true);
    expect(oldOwnerRead.ok && oldOwnerRead.value.customers.some(row => row.assignment.customerAuthUserId === customer)).toBe(false);
    const bRead = await service().read(b);
    expect(bRead.ok).toBe(true);
    if (!bRead.ok) throw new Error("New owner read failed");
    expect(bRead.value.customers[0].followups.find(row => row.id === completed)).toMatchObject({ state: "completed", ownerAuthUserId: actorA });
    expect(bRead.value.customers[0].followups.filter(row => row.state === "open").every(row => row.ownerAuthUserId === actorB)).toBe(true);
    expect(bRead.value.customers[0].assignmentHistory.state).toBe("available");
    const otherCurrent = (await db.sql("select assignee_auth_user_id,revision from ae_workspace_private.assignments where customer_auth_user_id=$1", [otherCustomer])).rows[0];
    if (otherCurrent.assignee_auth_user_id === actorA) {
      expect((await service().command(a, { kind: "reassign", commandId: randomUUID(), assignmentId: otherInitial.value.assignment.id,
        customerAuthUserId: otherCustomer, expectedRevision: Number(otherCurrent.revision), nextAssigneeAuthUserId: actorB })).ok).toBe(true);
    }
    // The history dependency can fail without hiding either assigned customer.
    await db.sql("alter table ae_workspace_private.assignment_events rename to fixture_history_unavailable");
    try {
      const degraded = await service().read(b);
      expect(degraded.ok).toBe(true);
      if (!degraded.ok) throw new Error("Optional history blanked workspace");
      expect(degraded.value.customers).toHaveLength(2);
      const affected = degraded.value.customers.find(row => row.assignment.customerAuthUserId === customer)!;
      expect(affected.followupsCompleteness).toBe("historical_unavailable");
      expect(affected.assignmentHistory).toEqual({ state: "unavailable" });
      expect(affected.followups.some(row => row.id === completed)).toBe(false);
      expect(affected.followups.filter(row => row.state === "open").every(row => row.ownerAuthUserId === actorB)).toBe(true);
    } finally { await db.sql("alter table ae_workspace_private.fixture_history_unavailable rename to assignment_events"); }
    // Actual audited reassignments exceed the bounded history projection. The
    // immutable history stays in storage; only that customer's view degrades.
    let currentOwner = b;
    for (let index = 0; index < 100; index++) {
      const target = currentOwner.authUserId === actorB ? a : b;
      expect((await service().command(currentOwner, { kind: "reassign", commandId: randomUUID(), assignmentId,
        customerAuthUserId: customer, expectedRevision: await currentRevision(), nextAssigneeAuthUserId: target.authUserId })).ok).toBe(true);
      currentOwner = target;
    }
    expect(currentOwner.authUserId).toBe(actorB);
    const boundedRead = await service().read(b);
    expect(boundedRead.ok).toBe(true);
    if (!boundedRead.ok) throw new Error("Bounded history blanked workspace");
    expect(boundedRead.value.customers).toHaveLength(2);
    expect(boundedRead.value.customers.find(row => row.assignment.customerAuthUserId === customer)).toMatchObject({
      assignmentHistory: { state: "unavailable" }, followupsCompleteness: "historical_unavailable",
    });
    expect(boundedRead.value.customers.find(row => row.assignment.customerAuthUserId === otherCustomer)?.assignmentHistory.state).toBe("available");
    expect((await db.sql("select jsonb_agg(to_jsonb(b) order by id) as value from public.research_early_access_legal_bindings b")).rows[0].value).toEqual(originalBindings);
    // Fill the second assignment through real commands, then complete its tasks.
    // The readset cap includes these historical rows, even with no open tasks.
    const capacityAssignment = otherInitial.value.assignment.id;
    const capacityState = (await db.sql(`select a.revision,(select count(*)::int from ae_workspace_private.followups f
      where f.assignment_id=a.id) as tasks from ae_workspace_private.assignments a where a.id=$1`, [capacityAssignment])).rows[0];
    let capacityRevision = Number(capacityState.revision);
    const capacityCommand = (expectedRevision: number) => ({ kind: "record_followup" as const, commandId: randomUUID(),
      assignmentId: capacityAssignment, customerAuthUserId: otherCustomer, expectedRevision,
      purpose: "contact_customer" as const, dueAt: new Date(Date.now() + 3_600_000).toISOString() });
    for (let count = Number(capacityState.tasks); count < 99; count++) {
      const recorded = await service().command(b, capacityCommand(capacityRevision));
      expect(recorded.ok).toBe(true);
      if (!recorded.ok) throw new Error("Followup boundary setup failed");
      capacityRevision = recorded.value.assignment.revision;
    }
    await db.sql("update ae_workspace_private.followups set state='completed' where assignment_id=$1", [capacityAssignment]);
    const ninetyNine = await service().read(b);
    expect(ninetyNine.ok).toBe(true);
    if (!ninetyNine.ok) throw new Error("99 completed followups blanked workspace");
    expect(ninetyNine.value.customers).toHaveLength(2);
    expect(ninetyNine.value.customers.find(row => row.assignment.id === capacityAssignment)?.followups).toHaveLength(99);
    expect(ninetyNine.value.customers.find(row => row.assignment.id === capacityAssignment)?.followups.every(row => row.state === "completed")).toBe(true);
    const atCapacity = capacityCommand(capacityRevision), overCapacity = capacityCommand(capacityRevision + 1);
    const capacityEffects = await effectCounts();
    const grant = (await db.sql("select id,revision from ae_workspace_private.grants where actor_user_id=$1 and scope_id=$2", [actorB, scope])).rows[0];
    const commandArgs = (command: typeof atCapacity) => ({ p_actor_user_id: actorB, p_session_id: b.sessionId, p_scope_id: scope,
      p_command: command, p_grant_id: grant.id, p_grant_revision: Number(grant.revision) });
    const capacityPool = db.poolForLogin("ae_lock_probe", probePassword), capacityLock = await capacityPool.connect();
    try {
      await capacityLock.query("begin");
      await capacityLock.query("select id from ae_workspace_private.assignments where id=$1 for update", [capacityAssignment]);
      const waitForCommands = async (count: number) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const waiting = await db.sql("select count(*)::int as n from pg_stat_activity where wait_event_type='Lock' and query like '%select public.ae_workspace_command%'");
          if (waiting.rows[0].n >= count) return true;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return false;
      };
      // Both commands carry the revision they would need to succeed in order.
      // Observe their real PG lock waits, then release the assignment: only the
      // 100th row may commit; the second must recount after the first commit.
      const hundredth = rpc.rpc("ae_workspace_command", commandArgs(atCapacity));
      const firstWaiting = await waitForCommands(1);
      const hundredAndFirst = rpc.rpc("ae_workspace_command", commandArgs(overCapacity));
      const bothWaiting = await waitForCommands(2);
      await capacityLock.query("commit");
      const [accepted, refused] = await Promise.all([hundredth, hundredAndFirst]);
      expect(firstWaiting).toBe(true); expect(bothWaiting).toBe(true);
      expect(accepted.error).toBeNull(); expect(accepted.data).toMatchObject({ receipt: { commandId: atCapacity.commandId, replay: false } });
      expect(refused.error).toMatchObject({ code: "22023" }); expect(refused.data).toBeNull();
    } finally {
      await capacityLock.query("rollback"); capacityLock.release(); await capacityPool.end();
    }
    const fullEffects = { ...capacityEffects, followups: capacityEffects.followups + 1,
      audit: capacityEffects.audit + 1, receipts: capacityEffects.receipts + 1 };
    expect(await effectCounts()).toEqual(fullEffects);
    expect(Number((await db.sql("select revision from ae_workspace_private.assignments where id=$1", [capacityAssignment])).rows[0].revision)).toBe(capacityRevision + 1);
    expect(await service().command(b, atCapacity)).toMatchObject({ ok: true, value: { commandId: atCapacity.commandId, replay: true } });
    expect(await service().command(b, { ...atCapacity, purpose: "documentation_followup" })).toEqual({ ok: false, code: "idempotency_conflict" });
    const furtherAttempts = await Promise.all(Array.from({ length: 3 }, () => service().command(b, capacityCommand(capacityRevision + 1))));
    expect(furtherAttempts).toEqual(Array.from({ length: 3 }, () => ({ ok: false, code: "invalid_input" })));
    expect(await effectCounts()).toEqual(fullEffects);
    expect(Number((await db.sql("select revision from ae_workspace_private.assignments where id=$1", [capacityAssignment])).rows[0].revision)).toBe(capacityRevision + 1);
    const stillReadable = await service().read(b);
    expect(stillReadable.ok).toBe(true);
    if (!stillReadable.ok) throw new Error("Refused 101st followup blanked another customer");
    expect(stillReadable.value.customers).toHaveLength(2);
    expect(stillReadable.value.customers.find(row => row.assignment.id === capacityAssignment)?.followups).toHaveLength(100);
    expect(stillReadable.value.customers.find(row => row.assignment.customerAuthUserId === customer))
      .toEqual(ninetyNine.value.customers.find(row => row.assignment.customerAuthUserId === customer));
    const wrongScopeService = createAeWorkspaceService(createAeCanonicalAdapter(rpc, otherScope));
    expect(await wrongScopeService.read(b)).toEqual({ ok: false, code: "access_denied" });
    for (const [actor, capabilities] of [[supervisor, ["customer:assign"]], [actorB, caps]] as const) await db.sql(`insert into ae_workspace_private.grants(actor_user_id,scope_id,capabilities,valid_from,valid_until,approved_by,approved_at)
      values($1,$2,$3,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',$4,clock_timestamp())`, [actor, otherScope, capabilities, supervisor]);
    expect(await wrongScopeService.read(b)).toMatchObject({ ok: true, value: { customers: [] } });
    expect(await wrongScopeService.command(b, { ...reassign, nextAssigneeAuthUserId: actorA })).toEqual({ ok: false, code: "not_found" });
    expect(await wrongScopeService.assign(admin, { commandId: randomUUID(), customerAuthUserId: customer, assigneeAuthUserId: actorB })).toEqual({ ok: false, code: "not_found" });
    const beforeRecovery = rpcCalls.length;
    expect(await service().read({ ...b, purpose: "recovery" })).toEqual({ ok: false, code: "access_denied" });
    expect(await service().command({ ...b, purpose: "recovery" }, reassign)).toEqual({ ok: false, code: "access_denied" });
    expect(rpcCalls).toHaveLength(beforeRecovery);
    await db.sql("update auth.sessions set aal='aal1' where id=$1", [b.sessionId]);
    expect(await service().read(b)).toEqual({ ok: false, code: "access_denied" });
    await db.sql("update auth.sessions set aal='aal2',not_after=clock_timestamp()-interval '1 second' where id=$1", [b.sessionId]);
    expect(await service().read(b)).toEqual({ ok: false, code: "access_denied" });
    await db.sql("update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1", [b.sessionId]);
    await db.sql("update ae_workspace_private.grants set revoked_at=clock_timestamp() where actor_user_id=$1", [actorB]);
    expect(await service().read(b)).toEqual({ ok: false, code: "access_denied" });
    const recordedReceipts = (await db.sql("select jsonb_agg(receipt order by actor_user_id,command_id) as value from ae_workspace_private.command_receipts")).rows[0].value;
    await db.sql(candidate); // Reapplication must not revalidate old receipts against newer assignments.
    expect((await db.sql("select jsonb_agg(receipt order by actor_user_id,command_id) as value from ae_workspace_private.command_receipts")).rows[0].value).toEqual(recordedReceipts);
    expect(await identity.claim(customerSession, claimCommand, null)).toMatchObject({ ok: true, value: { replay: true } });
    // The proven ordinary pending desk retains both the original unclaimed row
    // and all saved synthetic requests; AE assignment never removes a request.
    await db.sql("insert into public.care_role_assignments(user_id,role,granted_by) values($1,'request_intent_reader',$1)", [supervisor]);
    await expect(db.asRole("service_role", "select public.request_intent_staff_list($1::uuid,1) as value", [supervisor]))
      .rejects.toMatchObject({ code: "42501" }); // Legacy clinical-admin authority stays denied.
    const staff = await db.asRole("service_role", "select public.request_intent_operator_list($1::uuid,1) as value", [supervisor]);
    expect(JSON.stringify(staff.rows[0].value)).toContain(base.id);
    expect((await db.snapshot())).toHaveLength(3);

    // Lifecycle source adoption changes only the two named known CHECKs. Old
    // grant rows and all immutable historical receipts survive exact reapply.
    const unchangedAuthorityRows = async () => ({
      grants: (await db.sql("select jsonb_agg(to_jsonb(g) order by id) as value from ae_workspace_private.grants g")).rows[0].value,
      receipts: (await db.sql("select jsonb_agg(to_jsonb(r) order by actor_user_id,command_id) as value from ae_workspace_private.command_receipts r")).rows[0].value,
    });
    const oldAuthorityRows = await unchangedAuthorityRows();
    await db.sql(`alter table ae_workspace_private.grants drop constraint grants_capabilities_check;
      alter table ae_workspace_private.grants add constraint grants_capabilities_check check(cardinality(capabilities) between 1 and 5
        and capabilities <@ array['workspace:read','customer:contact','followup:record','customer:reassign','customer:assign']::text[]);
      alter table ae_workspace_private.audit_events drop constraint audit_events_kind_check;
      alter table ae_workspace_private.audit_events add constraint audit_events_kind_check
        check(kind in ('workspace_read','contact_read','assignment_assigned','assignment_reassigned','followup_recorded','guest_claimed'))`);
    await db.sql(candidate); await db.sql(candidate);
    expect(await unchangedAuthorityRows()).toEqual(oldAuthorityRows);
    expect((await db.sql("select count(*)::int as n from ae_workspace_private.grants where 'followup:manage'=any(capabilities)")).rows[0].n).toBe(0);
    for (const target of [
      { table: "grants", name: "grants_capabilities_check", bad: "check(cardinality(capabilities)>=0)",
        good: "check(cardinality(capabilities) between 1 and 6 and capabilities <@ array['workspace:read','customer:contact','followup:record','customer:reassign','customer:assign','followup:manage']::text[])" },
      { table: "audit_events", name: "audit_events_kind_check", bad: "check(kind<>'foreign-invalid')",
        good: "check(kind in ('workspace_read','contact_read','assignment_assigned','assignment_reassigned','followup_recorded','guest_claimed','followup_completed','followup_rescheduled'))" },
    ]) {
      await db.sql(`alter table ae_workspace_private.${target.table} drop constraint ${target.name};
        alter table ae_workspace_private.${target.table} add constraint ${target.name} ${target.bad}`);
      const definition = async () => (await db.sql("select pg_get_constraintdef(oid) as value from pg_constraint where conrelid=$1::regclass and conname=$2",
        [`ae_workspace_private.${target.table}`, target.name])).rows[0].value;
      const poisoned = await definition();
      await expect(db.sql(candidate)).rejects.toMatchObject({ code: "55000" });
      expect(await definition()).toBe(poisoned); expect(await unchangedAuthorityRows()).toEqual(oldAuthorityRows);
      // Owned fixture cleanup only; the rejected candidate must not repair it.
      await db.sql(`alter table ae_workspace_private.${target.table} drop constraint ${target.name};
        alter table ae_workspace_private.${target.table} add constraint ${target.name} ${target.good}`);
    }
    await db.sql("create table ae_workspace_private.fixture_grant_child() inherits(ae_workspace_private.grants)");
    await expect(db.sql(candidate)).rejects.toMatchObject({ code: "55000" });
    expect((await db.sql("select to_regclass('ae_workspace_private.fixture_grant_child') is not null as present")).rows[0].present).toBe(true);
    expect(await unchangedAuthorityRows()).toEqual(oldAuthorityRows);
    await db.sql("drop table ae_workspace_private.fixture_grant_child");

    // Start with the existing four-capability grant, not an implicit upgrade.
    await db.sql("update ae_workspace_private.grants set revoked_at=null where actor_user_id=$1 and scope_id=$2", [actorB, scope]);
    const capacityTask = (await db.sql("select to_jsonb(f) as value from ae_workspace_private.followups f where assignment_id=$1 and state='open' order by created_at,id limit 1", [capacityAssignment])).rows[0].value;
    const capacityRevisionNow = async () => Number((await db.sql("select revision from ae_workspace_private.assignments where id=$1", [capacityAssignment])).rows[0].revision);
    const completeAtCapacity = { kind: "complete_followup" as const, commandId: randomUUID(), assignmentId: capacityAssignment,
      customerAuthUserId: otherCustomer, expectedRevision: await capacityRevisionNow(), followupId: capacityTask.id };
    const noManageEffects = await effectCounts();
    expect(await service().command(b, completeAtCapacity)).toEqual({ ok: false, code: "access_denied" });
    expect(await effectCounts()).toEqual(noManageEffects);
    // Explicit synthetic grants only. Installing/reapplying SQL never does this.
    await db.sql(`update ae_workspace_private.grants set capabilities=array_append(capabilities,'followup:manage'),revision=revision+1
      where actor_user_id in ($1,$2) and scope_id=$3`, [actorA, actorB, scope]);
    const reschedule = { kind: "reschedule_followup" as const, commandId: randomUUID(), assignmentId: capacityAssignment,
      customerAuthUserId: otherCustomer, expectedRevision: await capacityRevisionNow(), followupId: capacityTask.id,
      dueAt: new Date(Date.now() + 7_200_000).toISOString() };
    const rescheduled = await service().command(b, reschedule);
    expect(rescheduled).toMatchObject({ ok: true, value: { followup: { id: capacityTask.id, state: "open", dueAt: reschedule.dueAt },
      audit: { kind: "followup_rescheduled" }, followupTransfers: [] } });
    if (!rescheduled.ok) throw new Error("Canonical task reschedule failed");
    expect(await service().command(b, { ...reschedule, commandId: randomUUID(), expectedRevision: rescheduled.value.assignment.revision }))
      .toEqual({ ok: false, code: "invalid_input" });
    expect(await service().command(b, { ...completeAtCapacity, commandId: randomUUID() }))
      .toEqual({ ok: false, code: "revision_conflict" });
    const complete = { ...completeAtCapacity, commandId: randomUUID(), expectedRevision: rescheduled.value.assignment.revision };
    const completedReceipt = await service().command(b, complete);
    expect(completedReceipt).toMatchObject({ ok: true, value: { followup: { id: capacityTask.id, state: "completed" },
      audit: { kind: "followup_completed" }, followupTransfers: [] } });
    if (!completedReceipt.ok) throw new Error("Canonical task completion failed");
    const afterTask = (await db.sql("select to_jsonb(f) as value from ae_workspace_private.followups f where id=$1", [capacityTask.id])).rows[0].value;
    const creation = ({ state: _state, due_at: _due, ...original }: Record<string, unknown>) => original;
    expect(creation(afterTask)).toEqual(creation(capacityTask));
    expect(afterTask.state).toBe("completed"); expect(Date.parse(afterTask.due_at)).toBe(Date.parse(reschedule.dueAt));
    const lifecycleEffects = await effectCounts();
    expect(lifecycleEffects).toEqual({ ...noManageEffects, audit: noManageEffects.audit + 2, receipts: noManageEffects.receipts + 2 });
    // Both immutable receipts replay after current task state is completed.
    expect(await service().command(b, complete)).toEqual({ ok: true, value: { ...completedReceipt.value, replay: true } });
    expect(await service().command(b, reschedule)).toEqual({ ok: true, value: { ...rescheduled.value, replay: true } });
    expect(await service().command(b, { ...complete, followupId: randomUUID() })).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(await service().command(b, { ...reschedule, dueAt: new Date(Date.parse(reschedule.dueAt) + 1).toISOString() }))
      .toEqual({ ok: false, code: "idempotency_conflict" });
    for (const command of [complete, reschedule]) expect(await service().command(b, { ...command,
      commandId: randomUUID(), expectedRevision: await capacityRevisionNow() })).toEqual({ ok: false, code: "invalid_input" });
    expect(await service().command(a, { ...complete, commandId: randomUUID(), expectedRevision: await capacityRevisionNow() }))
      .toEqual({ ok: false, code: "not_found" });
    expect(await service().command(b, { ...complete, commandId: randomUUID(), followupId: completed,
      expectedRevision: await capacityRevisionNow() })).toEqual({ ok: false, code: "not_found" });
    expect(await service().command(b, { ...capacityCommand(await capacityRevisionNow()) })).toEqual({ ok: false, code: "invalid_input" });
    expect(await effectCounts()).toEqual(lifecycleEffects);
    const completedRead = await service().read(b);
    expect(completedRead.ok && completedRead.value.customers).toHaveLength(2);
    expect(completedRead.ok && completedRead.value.customers.find(row => row.assignment.id === capacityAssignment)?.followups)
      .toHaveLength(100);

    const recordMain = async () => {
      const result = await service().command(b, await followup());
      if (!result.ok || !result.value.followup) throw new Error("Lifecycle synthetic task creation failed");
      return result.value.followup;
    };
    const rollbackTask = await recordMain();
    const taskCommand = async (kind: "complete_followup" | "reschedule_followup", followupId: string): Promise<
      Extract<AeWorkspaceCommand, { kind: "complete_followup" | "reschedule_followup" }>> => {
      const command = { commandId: randomUUID(), assignmentId, customerAuthUserId: customer,
        expectedRevision: await currentRevision(), followupId };
      return kind === "complete_followup" ? { ...command, kind }
        : { ...command, kind, dueAt: new Date(Date.now() + 10_800_000).toISOString() };
    };
    const rollbackEffects = await effectCounts(), rollbackRevisionNow = await currentRevision();
    await db.sql(`create function ae_workspace_private.fixture_fail_lifecycle_audit() returns trigger language plpgsql as $$begin
      if new.kind in ('followup_completed','followup_rescheduled') then raise exception 'synthetic_lifecycle_audit_failure'; end if; return new; end$$;
      create trigger fixture_lifecycle_fail before insert on ae_workspace_private.audit_events for each row execute function ae_workspace_private.fixture_fail_lifecycle_audit()`);
    for (const kind of ["complete_followup", "reschedule_followup"] as const) {
      expect(await service().command(b, await taskCommand(kind, rollbackTask.id))).toEqual({ ok: false, code: "unavailable" });
      expect(await effectCounts()).toEqual(rollbackEffects); expect(await currentRevision()).toBe(rollbackRevisionNow);
    }
    await db.sql("drop trigger fixture_lifecycle_fail on ae_workspace_private.audit_events");
    await db.sql(`create trigger fixture_lifecycle_corrupt before insert on ae_workspace_private.command_receipts
      for each row execute function ae_workspace_private.fixture_corrupt_receipt()`);
    for (const kind of ["complete_followup", "reschedule_followup"] as const) {
      expect(await service().command(b, await taskCommand(kind, rollbackTask.id))).toEqual({ ok: false, code: "unavailable" });
      expect(await effectCounts()).toEqual(rollbackEffects); expect(await currentRevision()).toBe(rollbackRevisionNow);
    }
    await db.sql("drop trigger fixture_lifecycle_corrupt on ae_workspace_private.command_receipts");

    // Observe real PG contention, not a serial Promise.all stand-in. Both
    // commands use the same revision; exactly one audited update may commit.
    const waitOn = async (blockerPid: number, count: number) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const waiting = (await db.sql(`with recursive blocked(pid) as (
            select pid from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))
            union select a.pid from pg_stat_activity a join blocked b on b.pid=any(pg_blocking_pids(a.pid))
          ) select count(*)::int as n from pg_stat_activity a where datname=current_database()
            and query like '%select public.ae_workspace_command%' and a.pid in (select pid from blocked)`, [blockerPid])).rows[0].n;
        if (waiting >= count) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return false;
    };
    const race = async (commands: readonly AeWorkspaceCommand[]) => {
      const pool = db.poolForLogin("ae_lock_probe", probePassword), lock = await pool.connect();
      try {
        await lock.query("begin"); await lock.query("select id from ae_workspace_private.assignments where id=$1 for update", [assignmentId]);
        const blockerPid = (await lock.query("select pg_backend_pid() as pid")).rows[0].pid;
        const pending = commands.map(command => service().command(b, command));
        const blocked = await waitOn(blockerPid, commands.length);
        await lock.query("commit");
        const results = await Promise.all(pending);
        expect(blocked).toBe(true); expect(results.filter(result => result.ok)).toHaveLength(1);
        return results;
      } finally { await lock.query("rollback"); lock.release(); await pool.end(); }
    };
    const completeRace = await taskCommand("complete_followup", rollbackTask.id);
    const rescheduleRace = { ...await taskCommand("reschedule_followup", rollbackTask.id), expectedRevision: completeRace.expectedRevision };
    const raceBefore = await effectCounts(), concurrent = await race([completeRace, rescheduleRace]);
    expect(concurrent.find(result => !result.ok)).toEqual({ ok: false, code: "revision_conflict" });
    expect(await currentRevision()).toBe(completeRace.expectedRevision + 1);
    expect(await effectCounts()).toEqual({ ...raceBefore, audit: raceBefore.audit + 1, receipts: raceBefore.receipts + 1 });
    expect(await service().read(b)).toMatchObject({ ok: true, value: { customers: expect.arrayContaining([
      expect.objectContaining({ assignment: expect.objectContaining({ id: assignmentId }),
        assignmentHistory: { state: "unavailable" }, followupsCompleteness: "historical_unavailable" }),
    ]) } });

    // Current grant/session expiry is checked again after a real assignment
    // lock wait. Row SHARE locks serialize explicit revocations separately.
    const expiryTask = await recordMain();
    for (const source of ["grant", "session"] as const) {
      const command = await taskCommand("complete_followup", expiryTask.id), before = await effectCounts();
      const pool = db.poolForLogin("ae_lock_probe", probePassword), lock = await pool.connect();
      try {
        await lock.query("begin"); await lock.query("select id from ae_workspace_private.assignments where id=$1 for update", [assignmentId]);
        if (source === "grant") await db.sql(`update ae_workspace_private.grants set valid_until=clock_timestamp()+interval '4 seconds',revision=revision+1
          where actor_user_id=$1 and scope_id=$2`, [actorB, scope]);
        else await db.sql("update auth.sessions set not_after=clock_timestamp()+interval '4 seconds' where id=$1", [b.sessionId]);
        const blockerPid = (await lock.query("select pg_backend_pid() as pid")).rows[0].pid;
        const pending = service().command(b, command), observed = await waitOn(blockerPid, 1);
        let expired = false;
        for (let attempt = 0; attempt < 500; attempt++) {
          expired = source === "grant"
            ? (await db.sql("select clock_timestamp()>=valid_until as expired from ae_workspace_private.grants where actor_user_id=$1 and scope_id=$2", [actorB, scope])).rows[0].expired
            : (await db.sql("select clock_timestamp()>=not_after as expired from auth.sessions where id=$1", [b.sessionId])).rows[0].expired;
          if (expired) break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        await lock.query("commit");
        const denied = await pending;
        expect(observed).toBe(true); expect(expired).toBe(true);
        expect(denied).toEqual({ ok: false, code: "access_denied" });
        expect(await effectCounts()).toEqual(before); expect(await currentRevision()).toBe(command.expectedRevision);
      } finally {
        await lock.query("rollback"); lock.release(); await pool.end();
        if (source === "grant") await db.sql(`update ae_workspace_private.grants set valid_until=clock_timestamp()+interval '1 hour',revision=revision+1
          where actor_user_id=$1 and scope_id=$2`, [actorB, scope]);
        else await db.sql("update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1", [b.sessionId]);
      }
    }

    const handoffTask = await recordMain(), handoffComplete = await taskCommand("complete_followup", handoffTask.id);
    const handoff = { kind: "reassign" as const, commandId: randomUUID(), assignmentId, customerAuthUserId: customer,
      expectedRevision: handoffComplete.expectedRevision, nextAssigneeAuthUserId: actorA };
    const handoffBefore = await effectCounts(), handed = await race([handoffComplete, handoff]);
    expect(handed.find(result => !result.ok)).toMatchObject({ ok: false,
      code: handed[0].ok ? "revision_conflict" : "not_found" });
    const actualTask = (await db.sql("select state,owner_auth_user_id,created_at from ae_workspace_private.followups where id=$1", [handoffTask.id])).rows[0];
    expect(actualTask).toMatchObject(handed[0].ok ? { state: "completed", owner_auth_user_id: actorB }
      : { state: "open", owner_auth_user_id: actorA });
    expect(new Date(actualTask.created_at).toISOString()).toBe(handoffTask.createdAt);
    expect(await effectCounts()).toEqual({ ...handoffBefore, audit: handoffBefore.audit + 1, receipts: handoffBefore.receipts + 1 });
    expect((await db.sql("select jsonb_agg(to_jsonb(b) order by id) as value from public.research_early_access_legal_bindings b")).rows[0].value)
      .toEqual(originalBindings);
    const lifecycleReceipts = (await db.sql("select jsonb_agg(receipt order by actor_user_id,command_id) as value from ae_workspace_private.command_receipts")).rows[0].value;
    await db.sql(candidate);
    expect((await db.sql("select jsonb_agg(receipt order by actor_user_id,command_id) as value from ae_workspace_private.command_receipts")).rows[0].value)
      .toEqual(lifecycleReceipts);
  } finally { await db.close(); }
}, 120_000);
