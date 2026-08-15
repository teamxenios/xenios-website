# M71 rollback notes: the assisted-order intake bridge

M71 is purely additive: five new tables, their indexes and constraints, one
append-only trigger and its trigger function, six internal projection helpers,
and eight SECURITY DEFINER service_role routines. It alters no existing object,
writes no business row, and grants nothing to any browser-facing role.

It creates no order, no payment, no prescription, no supplier release and no
legal acceptance. An assisted order is a REQUEST that a named human works by
hand, so rolling it back cannot strand a paid customer mid-transaction. It can
strand a customer mid-conversation, which is the real consideration below.

## Before rollback, know which case you are in

The bridge is the only writer of these tables, and the application surface is
the only caller of the bridge. So the question is never "is something else
depending on this schema", it is only "has a real person already sent us a
request through it".

**Case A, nothing real has arrived.** `research_assisted_order_requests` is
empty, or holds only the probe row seeded by the rehearsal harness
(`public_reference = 'XRR-20260815-0B0BE00000'`). Rollback is a clean drop with
no customer consequence.

**Case B, real requests exist.** Dropping destroys the request, its lines, its
identity-document references and the entire append-only event trail, which is
the record of what Xenios told that customer and when. Prefer disabling the
surface over dropping the schema: turn the bridge off at the composition root
so it refuses new submissions, leave the tables in place, and work the
outstanding requests to completion by hand. A dormant schema costs nothing.

Check which case you are in before doing anything:

```sql
-- Excludes the rehearsal probe row, so a fresh install reads as 0.
select count(*) as real_requests
  from public.research_assisted_order_requests
 where public_reference <> 'XRR-20260815-0B0BE00000';
```

## Containment without dropping (the preferred path)

The bridge composes fail-closed. `createAssistedOrderProductionComposition`
returns `enabled: false` with a refusal reason when its `enabled` input is
false or any dependency is absent, and the service is then never constructed.
Turning the feature off at that seam stops all new writes immediately, needs no
migration, and preserves every existing record and its event trail.

This is reversible in both directions and should be the first response to
anything wrong in production. Do not reach for SQL first.

## Full rollback procedure (Case A, or an accepted decision to destroy the record)

Dependency order matters: four tables carry `on delete restrict` foreign keys
back to `research_assisted_order_requests`, so the parent cannot be dropped
first. The event log is append-only by trigger, so the trigger must go before
any attempt to remove rows.

Run in one transaction:

```sql
begin;

-- 1. The routines. Dropping these first closes the only door into the data,
--    so nothing can write while the rest of the rollback runs.
drop function if exists public.research_assisted_order_document_get(uuid, uuid);
drop function if exists public.research_assisted_order_document_complete(uuid, uuid, text, timestamptz);
drop function if exists public.research_assisted_order_document_create(jsonb);
drop function if exists public.research_assisted_order_set_status(uuid, text, text, text, text, text, text, jsonb, timestamptz);
drop function if exists public.research_assisted_order_admin_list(text, text, integer, integer);
drop function if exists public.research_assisted_order_admin_get(uuid);
drop function if exists public.research_assisted_order_status(text, uuid, text, text);
drop function if exists public.research_assisted_order_submit(jsonb);

-- 2. The internal helpers.
drop function if exists public.research_assisted_order_admin_json(uuid);
drop function if exists public.research_assisted_order_documents_json(uuid);
drop function if exists public.research_assisted_order_timeline_json(uuid);
drop function if exists public.research_assisted_order_lines_json(uuid);
drop function if exists public.research_assisted_order_line_json(public.research_assisted_order_lines);

-- 3. The append-only guard, before the table it protects.
drop trigger if exists research_assisted_order_events_append_only
  on public.research_assisted_order_events;
drop function if exists public.research_assisted_order_events_block_mutation();

-- 4. The children, then the parent.
drop table if exists public.research_assisted_order_documents;
drop table if exists public.research_assisted_order_access_tokens;
drop table if exists public.research_assisted_order_events;
drop table if exists public.research_assisted_order_lines;
drop table if exists public.research_assisted_order_requests;

commit;
```

`research_assisted_order_line_json` takes the `research_assisted_order_lines`
row type as its argument, so it must be dropped BEFORE that table. It is listed
in step 2 for that reason, not by accident.

## What rollback does NOT clean up

**Stored identity documents.** The `documents` table holds object paths, not
bytes. Dropping it removes the references and leaves the objects in the private
Supabase Storage bucket. If the rollback is because identity data should not
have been collected, the bucket contents must be deleted separately, as a
deliberate act, by a named human. The SQL above will not do it and must not be
mistaken for having done it.

**Queued notifications.** Rows already enqueued in the canonical notification
outbox are not touched. Drain or cancel them at the outbox, before the drop, or
the dispatcher will try to render a request that no longer exists.

**The Google Sheets mirror**, if it was ever enabled. It is a non-authoritative
convenience mirror and is never the system of record, but a stale row there
will outlive the rollback and should be cleared by hand.

## Verifying the rollback

```sql
-- Expect 0.
select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname like 'research_assisted_order%';

-- Expect 0.
select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'research_assisted_order%';
```

## Re-applying afterwards

M71 is idempotent at its own end state and may be re-applied cleanly after a
full rollback. One caveat inherited from its design: the preflight REFUSES to
re-apply if any of the five tables carries a direct grant for PUBLIC, anon,
authenticated or service_role. That refusal is intentional and is not a bug to
work around. If a re-apply is refused for that reason, find out who granted it
before removing the grant, because on this data such a grant is evidence.
