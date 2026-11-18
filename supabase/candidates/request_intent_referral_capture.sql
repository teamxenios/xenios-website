-- SOURCE CANDIDATE ONLY. Requires postal admission, optional context, pending
-- staff reader and prospective policy capture. No config, policy, role, cron,
-- account, referral binding, assignment or provider is enabled by this file.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- A child avoids changing positional inserts in the original admission writer.
-- Its identity changes for each successful new (not replayed) admission instance.
create table if not exists request_intent_private.catalog_referral_admission (
  owner_binding text not null, policy_revision text not null,
  revision uuid not null default gen_random_uuid(), admission_expires_at timestamptz not null,
  referral_name text, referral_code text,
  primary key(owner_binding,policy_revision),
  foreign key(owner_binding,policy_revision) references request_intent_private.catalog_contact_admission(owner_binding,policy_revision) on delete cascade
);
create table if not exists request_intent_private.reported_referral_snapshots (
  request_id uuid primary key references request_intent_private.requests(id) on delete cascade,
  mode text not null check(mode in ('use_saved','replace','omit')),
  referral_name text, referral_code text,
  captured_at timestamptz not null default clock_timestamp(),
  check(mode<>'omit' or (referral_name is null and referral_code is null))
);
alter table request_intent_private.catalog_referral_admission enable row level security;
alter table request_intent_private.reported_referral_snapshots enable row level security;
revoke all on table request_intent_private.catalog_referral_admission,
  request_intent_private.reported_referral_snapshots from public,anon,authenticated,service_role;

-- JSON inputs have already been normalized by the shared parser. Recheck the
-- stored format here; never interpret a name as a code, account or partner.
create or replace function request_intent_private.valid_reported_referral(p jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p)='object'
   and request_intent_private.only_keys(p,array['referralName','referralCode'])
   and (not(p ? 'referralName') or (jsonb_typeof(p->'referralName')='string'
     and length(p->>'referralName') between 1 and 80
     and (p->>'referralName')=normalize(p->>'referralName',NFC)
     and (p->>'referralName')=btrim(p->>'referralName')
     and (p->>'referralName') !~ '[[:cntrl:]]'
     and (p->>'referralName') !~ U&'[\200B\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'))
   and (not(p ? 'referralCode') or (jsonb_typeof(p->'referralCode')='string'
     and (p->>'referralCode') collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9-]{1,23}$'));
$$;

create or replace function request_intent_private.catalog_referral_status(p_owner_binding text,p_policy_revision text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare revision uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='private_custody_required';end if;
 select r.revision into revision from request_intent_private.catalog_contact_admission a
   join request_intent_private.catalog_referral_admission r using(owner_binding,policy_revision)
   where a.owner_binding=p_owner_binding and a.policy_revision=p_policy_revision
     and a.postal_address is not null and a.expires_at>statement_timestamp() and r.admission_expires_at=a.expires_at;
 return case when revision is null then jsonb_build_object('admitted',false)
   else jsonb_build_object('admitted',true,'referralRevision',revision) end;
end; $$;

create or replace function request_intent_private.catalog_referral_put(
 p_owner_binding text,p_policy_revision text,p_full_legal_name text,p_email text,
 p_postal_address jsonb,p_ttl_seconds integer,p_referral jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare outcome text; expires timestamptz; existing request_intent_private.catalog_referral_admission;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='private_custody_required';end if;
 if request_intent_private.valid_reported_referral(p_referral) is distinct from true then
   raise exception using errcode='22023',message='invalid_reported_referral';end if;
 -- Same lock as the original writer. Contact, address and referral commit once.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_binding||':'||p_policy_revision,0));
 outcome:=request_intent_private.catalog_address_put(p_owner_binding,p_policy_revision,p_full_legal_name,p_email,p_postal_address,p_ttl_seconds);
 if outcome='different_contact' then return outcome;end if;
 select expires_at into strict expires from request_intent_private.catalog_contact_admission
   where owner_binding=p_owner_binding and policy_revision=p_policy_revision for update;
 if outcome='already_same' then
   select * into existing from request_intent_private.catalog_referral_admission
     where owner_binding=p_owner_binding and policy_revision=p_policy_revision for update;
   -- Missing/erased child is never reconstructed by an apparent replay.
   if not found or existing.admission_expires_at is distinct from expires
     or existing.referral_name is distinct from p_referral->>'referralName'
     or existing.referral_code is distinct from p_referral->>'referralCode' then return 'different_contact';end if;
 else
   insert into request_intent_private.catalog_referral_admission(owner_binding,policy_revision,admission_expires_at,referral_name,referral_code)
    values(p_owner_binding,p_policy_revision,expires,p_referral->>'referralName',p_referral->>'referralCode')
    on conflict(owner_binding,policy_revision) do update set revision=gen_random_uuid(),admission_expires_at=excluded.admission_expires_at,
      referral_name=excluded.referral_name,referral_code=excluded.referral_code;
 end if;
 return outcome;
end; $$;

create or replace function request_intent_private.create_with_referral(
 p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb,p_admission jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare stored request_intent_private.requests; proposed_request_id uuid; choice jsonb; facts jsonb:='{}'; revision uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='request_intent_backend_required';end if;
 if jsonb_typeof(p_context) is distinct from 'object'
   or not request_intent_private.only_keys(p_context,array['goal','referralChoice'])
   or not(p_context ? 'referralChoice')
   or (p_context ? 'goal' and (jsonb_typeof(p_context->'goal') is distinct from 'string'
      or p_context->>'goal' not in ('compare_options','understand_details','check_availability','ask_about_process'))) then
   raise exception using errcode='22023',message='request_intent_invalid_optional_context';end if;
 choice:=p_context->'referralChoice';
 if jsonb_typeof(choice) is distinct from 'object' then raise exception using errcode='22023',message='request_intent_invalid_optional_context';end if;
 if choice->>'mode'='omit' and choice=jsonb_build_object('mode','omit') then null;
 elsif choice->>'mode'='replace' and request_intent_private.only_keys(choice,array['mode','referralName','referralCode'])
   and choice-'mode'<>'{}'::jsonb and request_intent_private.valid_reported_referral(choice-'mode') then facts:=choice-'mode';
 elsif choice->>'mode'='use_saved' and request_intent_private.only_keys(choice,array['mode','admissionRevision'])
   and jsonb_typeof(choice->'admissionRevision')='string'
   and (choice->>'admissionRevision') collate "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then null;
 else raise exception using errcode='22023',message='request_intent_invalid_optional_context';end if;
 if jsonb_typeof(p_detail) is distinct from 'object' or not request_intent_private.only_keys(p_detail,array[
   'kind','requestId','publicReference','status','createdAt','contact','agreements','lines'])
   or p_detail->>'kind' is distinct from 'unapproved_selection_request'
   or p_detail->>'status' is distinct from 'pending_review' then raise exception using errcode='22023',message='request_intent_invalid';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash||':'||p_attempt_hash,0));
 -- Exact replay precedes temporary-data lookup and never reconstructs a snapshot.
 select * into stored from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
 if found then
   if stored.fingerprint is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
   return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
 end if;
 proposed_request_id:=(p_detail->>'requestId')::uuid;
 -- Exact canonical INSERT, constraints and AFTER INSERT policy/workflow/outbox
 -- triggers. RETURNING distinguishes a real winner even from a legacy writer
 -- proposing the same UUID. Every later failure rolls back all these effects.
 insert into request_intent_private.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,contact,agreements,lines)
  values(proposed_request_id,'XRI-'||upper(replace(proposed_request_id::text,'-','')),p_owner_hash,p_attempt_hash,p_fingerprint,
    p_detail->'contact',p_detail->'agreements',p_detail->'lines')
  on conflict(owner_hash,attempt_hash) do nothing returning * into stored;
 if not found then
   select * into strict stored from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
   if stored.fingerprint is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
   return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
 end if;
 if not exists(select 1 from request_intent_private.request_policy_snapshots policy where policy.request_id=stored.id) then
   raise exception using errcode='55000',message='request_intent_referral_policy_required';end if;
 if choice->>'mode'='use_saved' then
   if jsonb_typeof(p_admission) is distinct from 'object' or not request_intent_private.only_keys(p_admission,array['ownerBinding','policyRevision'])
     or (p_admission->>'ownerBinding') collate "C" !~ '^[a-f0-9]{64}$'
     or (p_admission->>'policyRevision') collate "C" !~ '^[a-f0-9]{64}$' then
     raise exception using errcode='22023',message='request_intent_referral_stale';end if;
   select r.revision,jsonb_strip_nulls(jsonb_build_object('referralName',r.referral_name,'referralCode',r.referral_code)) into revision,facts
    from request_intent_private.catalog_contact_admission a join request_intent_private.catalog_referral_admission r using(owner_binding,policy_revision)
    where a.owner_binding=p_admission->>'ownerBinding' and a.policy_revision=p_admission->>'policyRevision'
      and a.postal_address is not null and a.expires_at>clock_timestamp() and a.expires_at=r.admission_expires_at
      and r.revision=(choice->>'admissionRevision')::uuid for share of a,r;
   if not found then raise exception using errcode='22023',message='request_intent_referral_stale';end if;
 elsif p_admission is not null then raise exception using errcode='22023',message='request_intent_invalid_optional_context';end if;
 if p_context ? 'goal' then insert into request_intent_private.optional_context(request_id,goal) values(stored.id,p_context->>'goal');end if;
 insert into request_intent_private.reported_referral_snapshots(request_id,mode,referral_name,referral_code)
   values(stored.id,choice->>'mode',facts->>'referralName',facts->>'referralCode');
 insert into request_intent_private.access_events(request_id,event_type) values(stored.id,'submitted');
 return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
end; $$;

create or replace function request_intent_private.referral_staff_get(p_request_id uuid,p_actor_user_id uuid,p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare detail jsonb; facts jsonb;
begin
 -- Existing permission, scope, current assignment, purpose and read audit FIRST.
 if p_scope='operator' then detail:=request_intent_private.operator_get(p_request_id,p_actor_user_id,true);
 elsif p_scope='staff' then detail:=request_intent_private.staff_get_with_context(p_request_id,p_actor_user_id);
 else raise exception using errcode='42501',message='request_intent_staff_required';end if;
 if detail is null then return null;end if;
 select jsonb_strip_nulls(jsonb_build_object('referralName',referral_name,'referralCode',referral_code)) into facts
  from request_intent_private.reported_referral_snapshots where request_id=p_request_id;
 if facts is null or facts='{}'::jsonb then return detail;end if;
 return detail||jsonb_build_object('optionalIntake',coalesce(detail->'optionalIntake','{}'::jsonb)||facts);
end; $$;

create or replace function public.request_intent_catalog_referral_status(p_owner_binding text,p_policy_revision text)
returns jsonb language sql stable security invoker set search_path='' as $$ select request_intent_private.catalog_referral_status(p_owner_binding,p_policy_revision); $$;
create or replace function public.request_intent_catalog_referral_put(p_owner_binding text,p_policy_revision text,p_full_legal_name text,p_email text,p_postal_address jsonb,p_ttl_seconds integer,p_referral jsonb)
returns text language sql security invoker set search_path='' as $$ select request_intent_private.catalog_referral_put(p_owner_binding,p_policy_revision,p_full_legal_name,p_email,p_postal_address,p_ttl_seconds,p_referral); $$;
create or replace function public.request_intent_create_with_referral(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb,p_admission jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select request_intent_private.create_with_referral(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail,p_context,p_admission); $$;
create or replace function public.request_intent_referral_staff_get(p_request_id uuid,p_actor_user_id uuid,p_scope text)
returns jsonb language sql security invoker set search_path='' as $$ select request_intent_private.referral_staff_get(p_request_id,p_actor_user_id,p_scope); $$;
revoke all on function request_intent_private.valid_reported_referral(jsonb),
 request_intent_private.catalog_referral_status(text,text), request_intent_private.catalog_referral_put(text,text,text,text,jsonb,integer,jsonb),
 request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb),request_intent_private.referral_staff_get(uuid,uuid,text),
 public.request_intent_catalog_referral_status(text,text),public.request_intent_catalog_referral_put(text,text,text,text,jsonb,integer,jsonb),
 public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb),public.request_intent_referral_staff_get(uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function request_intent_private.catalog_referral_status(text,text),request_intent_private.catalog_referral_put(text,text,text,text,jsonb,integer,jsonb),
 request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb),request_intent_private.referral_staff_get(uuid,uuid,text),
 public.request_intent_catalog_referral_status(text,text),public.request_intent_catalog_referral_put(text,text,text,text,jsonb,integer,jsonb),
 public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb),public.request_intent_referral_staff_get(uuid,uuid,text) to service_role;
commit;
