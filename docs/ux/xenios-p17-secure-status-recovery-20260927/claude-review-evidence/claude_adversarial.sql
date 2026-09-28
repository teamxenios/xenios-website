-- Claude independent adversarial checks for 20260927203000_research_status_recovery.sql
-- Runs as postgres against a disposable local Supabase Postgres 17.6 container.
\set ON_ERROR_STOP off
create or replace function pg_temp.chk(p_name text, p_ok boolean) returns void language plpgsql as $$
begin raise notice '% %', case when p_ok then 'PASS' else 'FAIL' end, p_name; end $$;

-- Fixtures: one member-owned order, one early-access order (different from the Codex fixture).
insert into public.research_assisted_order_requests(
  id, public_reference, idempotency_key_hash, request_fingerprint, actor_member_id,
  early_access_session_hash, normalized_email, full_legal_name, mobile_phone,
  shipping_address, billing_address, age_confirmed, source, created_at, updated_at)
values
 ('22222222-2222-4222-8222-222222222222','XRR-20260927-00000000AA', repeat('3',64), repeat('4',64),
  '99999999-9999-4999-8999-999999999999', null, 'member@example.invalid','M','0',
  '{"line1":"1","city":"c","region":"IL","postalCode":"0","countryCode":"US"}','{"line1":"1","city":"c","region":"IL","postalCode":"0","countryCode":"US"}',
  true,'early_access_manual_order_bridge','2026-09-27T20:00:00Z','2026-09-27T20:00:00Z'),
 ('33333333-3333-4333-8333-333333333333','XRR-20260927-00000000BB', repeat('5',64), repeat('6',64),
  null, repeat('d',64), 'ea@example.invalid','E','0',
  '{"line1":"1","city":"c","region":"IL","postalCode":"0","countryCode":"US"}','{"line1":"1","city":"c","region":"IL","postalCode":"0","countryCode":"US"}',
  true,'early_access_manual_order_bridge','2026-09-27T20:00:00Z','2026-09-27T20:00:00Z');

-- T1 table privileges (incl. PG17 MAINTAIN) for browser roles and service_role
select pg_temp.chk('T1 no table privilege for '||r||' on '||t||' ('||p||')',
  not has_table_privilege(r, 'public.'||t, p))
from unnest(array['anon','authenticated','service_role']) r,
     unnest(array['research_status_recovery_tokens','research_status_recovery_sessions']) t,
     unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p;

-- T2 function ACL/definition
select pg_temp.chk('T2 '||p.proname||' secdef+owner postgres+search_path+no PUBLIC/anon/authenticated exec',
  p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
  and p.proconfig = array['search_path=pg_catalog, public']
  and not has_function_privilege('anon', p.oid, 'EXECUTE')
  and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and has_function_privilege('service_role', p.oid, 'EXECUTE')
  and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'research_status_recovery_%';

-- T3 pg_temp shadowing: service_role creates a temp table with the same name and a fake row
set role service_role;
create temp table research_assisted_order_requests(id uuid, public_reference text, normalized_email text, actor_member_id uuid, source text);
insert into pg_temp.research_assisted_order_requests values ('44444444-4444-4444-8444-444444444444','XRR-20260927-FAKEFAKE00','attacker@example.invalid',null,'early_access_manual_order_bridge');
select pg_temp.chk('T3 temp-table shadow ignored by match', public.research_status_recovery_match('XRR-20260927-FAKEFAKE00','attacker@example.invalid') is null);
drop table pg_temp.research_assisted_order_requests;

-- T4 normalization + wrong owner + member binding
select pg_temp.chk('T4a match normalizes case/whitespace', (public.research_status_recovery_match('  xrr-20260927-00000000aa ', ' MEMBER@Example.Invalid ') ->> 'subjectId') = '22222222-2222-4222-8222-222222222222');
select pg_temp.chk('T4b fullwidth-confusable reference not matched', public.research_status_recovery_match('ＸRR-20260927-00000000AA','member@example.invalid') is null);
select pg_temp.chk('T4c member order refuses prepare with null owner', public.research_status_recovery_prepare_delivery('assisted_order','22222222-2222-4222-8222-222222222222',null,repeat('7',64),repeat('8',64),'2026-09-27T21:00:00Z','2026-09-27T21:30:00Z','public_status_recovery') is null);
select pg_temp.chk('T4d member order refuses prepare with other owner', public.research_status_recovery_prepare_delivery('assisted_order','22222222-2222-4222-8222-222222222222','88888888-8888-4888-8888-888888888888',repeat('7',64),repeat('8',64),'2026-09-27T21:00:00Z','2026-09-27T21:30:00Z','public_status_recovery') is null);
select pg_temp.chk('T4e member order prepare with correct owner', public.research_status_recovery_prepare_delivery('assisted_order','22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999999',repeat('7',64),repeat('8',64),'2026-09-27T21:00:00Z','2026-09-27T21:30:00Z','public_status_recovery') is not null);

-- T5 expiry bounds on issue
select pg_temp.chk('T5a 31-minute token refused', public.research_status_recovery_prepare_delivery('assisted_order','33333333-3333-4333-8333-333333333333',null,repeat('9',64),repeat('a',64),'2026-09-27T21:00:00Z','2026-09-27T21:31:00Z','public_status_recovery') is null);
select pg_temp.chk('T5b wrong source refused', public.research_status_recovery_prepare_delivery('assisted_order','33333333-3333-4333-8333-333333333333',null,repeat('9',64),repeat('a',64),'2026-09-27T21:00:00Z','2026-09-27T21:30:00Z','admin') is null);
select pg_temp.chk('T5c EA token issued', public.research_status_recovery_prepare_delivery('assisted_order','33333333-3333-4333-8333-333333333333',null,repeat('9',64),repeat('a',64),'2026-09-27T21:00:00Z','2026-09-27T21:30:00Z','public_status_recovery') is not null);

-- T6 idempotency hijack: same key, different digest
select pg_temp.chk('T6 same idempotency key with different digest refused', public.research_status_recovery_prepare_delivery('assisted_order','33333333-3333-4333-8333-333333333333',null,repeat('9',64),repeat('b',64),'2026-09-27T21:01:00Z','2026-09-27T21:31:00Z','public_status_recovery') is null);

-- T7 exchange boundaries
select pg_temp.chk('T7a exchange exactly at expiry refused', not public.research_status_recovery_exchange(repeat('a',64),repeat('c',64),'2026-09-27T21:30:00Z','2026-09-28T21:30:00Z'));
select pg_temp.chk('T7b session >24h refused', not public.research_status_recovery_exchange(repeat('a',64),repeat('c',64),'2026-09-27T21:05:00Z','2026-09-28T21:05:01Z'));
select pg_temp.chk('T7c member token cannot be exchanged by digest of EA token', not public.research_status_recovery_exchange(repeat('0',64),repeat('c',64),'2026-09-27T21:05:00Z','2026-09-28T21:05:00Z'));
reset role;

-- T8 owner-binding tamper between issue and exchange (EA session hash rotated)
update public.research_assisted_order_requests set early_access_session_hash = repeat('e',64) where id='33333333-3333-4333-8333-333333333333';
set role service_role;
select pg_temp.chk('T8 exchange refused after owner binding changed', not public.research_status_recovery_exchange(repeat('a',64),repeat('c',64),'2026-09-27T21:05:00Z','2026-09-28T21:05:00Z'));
-- replay after consumption: exchange the member token, then retry prepare with the same idempotency key
select pg_temp.chk('T9a member token exchange ok', public.research_status_recovery_exchange(repeat('8',64),repeat('f',64),'2026-09-27T21:05:00Z','2026-09-28T21:05:00Z'));
select pg_temp.chk('T9b second session from same token refused', not public.research_status_recovery_exchange(repeat('8',64),repeat('1',64),'2026-09-27T21:05:01Z','2026-09-28T21:05:01Z'));
select pg_temp.chk('T9c outbox retry after consumption does not re-issue', public.research_status_recovery_prepare_delivery('assisted_order','22222222-2222-4222-8222-222222222222','99999999-9999-4999-8999-999999999999',repeat('7',64),repeat('8',64),'2026-09-27T21:06:00Z','2026-09-27T21:36:00Z','public_status_recovery') is null);
select pg_temp.chk('T9d status scoped to member order only', (public.research_status_recovery_status(repeat('f',64),'2026-09-27T21:10:00Z') ->> 'publicReference') = 'XRR-20260927-00000000AA');
select pg_temp.chk('T9e status projection has only allowed keys', (select array_agg(k order by k) from jsonb_object_keys(public.research_status_recovery_status(repeat('f',64),'2026-09-27T21:10:00Z')) k) = array['publicReference','status','timeline','updatedAt']);
reset role;
update public.research_assisted_order_requests set actor_member_id = '88888888-8888-4888-8888-888888888888' where id='22222222-2222-4222-8222-222222222222';
set role service_role;
select pg_temp.chk('T10 session dies when order owner changes', public.research_status_recovery_status(repeat('f',64),'2026-09-27T21:11:00Z') is null);
select pg_temp.chk('T11 end unknown session returns false', not public.research_status_recovery_end(repeat('2',64),'2026-09-27T21:12:00Z'));
select pg_temp.chk('T12 malformed digest status returns null', public.research_status_recovery_status('not-hex','2026-09-27T21:12:00Z') is null);
-- T13 direct table access attempts as service_role / anon (expect permission denied)
do $$ begin perform 1 from public.research_status_recovery_tokens limit 1; raise notice 'FAIL T13a service_role read tokens'; exception when insufficient_privilege then raise notice 'PASS T13a service_role cannot read tokens'; end $$;
reset role;
set role anon;
do $$ begin perform public.research_status_recovery_match('x','y'); raise notice 'FAIL T13b anon executed match'; exception when insufficient_privilege then raise notice 'PASS T13b anon cannot execute match'; end $$;
do $$ begin perform 1 from public.research_status_recovery_sessions limit 1; raise notice 'FAIL T13c anon read sessions'; exception when insufficient_privilege then raise notice 'PASS T13c anon cannot read sessions'; end $$;
reset role;
set role authenticated;
do $$ begin perform public.research_status_recovery_status(repeat('f',64), now()); raise notice 'FAIL T13d authenticated executed status'; exception when insufficient_privilege then raise notice 'PASS T13d authenticated cannot execute status'; end $$;
reset role;
-- T14 digest-only persistence: no column holds a 43-char base64url token
select pg_temp.chk('T14 no raw-token-shaped values persisted', not exists (
  select 1 from public.research_status_recovery_tokens t
  where t.token_digest ~ '^[A-Za-z0-9_-]{43}$' or t.idempotency_key ~ '^[A-Za-z0-9_-]{43}$'));
-- T15 FK restrict: deleting an order with recovery rows is blocked (documented behaviour, not a defect by itself)
do $$ begin delete from public.research_assisted_order_requests where id='33333333-3333-4333-8333-333333333333'; raise notice 'INFO T15 delete succeeded'; exception when foreign_key_violation then raise notice 'INFO T15 order delete blocked by recovery token FK (on delete restrict)'; when others then raise notice 'INFO T15 delete blocked: %', sqlerrm; end $$;
