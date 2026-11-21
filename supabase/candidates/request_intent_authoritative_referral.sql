-- SOURCE CANDIDATE ONLY. KAN-137 locator -> immutable native XRI birth fact.
-- No installation/flag/partner/privacy/retention/financial/mail activation.
-- Apply only as the reviewed composition with a separately owned no-mail
-- definition-pin successor and approved V1 privacy/XRI retention successor.
begin;
set local lock_timeout='5s';
set local search_path=pg_catalog;
set local standard_conforming_strings=on;

do $preflight$
declare item record; present boolean;
begin
 if current_user<>'postgres' then raise exception using errcode='42501',message='xri_referral_owner_only';end if;
 if not exists(select 1 from pg_catalog.pg_class c where c.oid=pg_catalog.to_regclass('request_intent_private.requests')
  and c.relkind='r' and c.relpersistence='p' and c.relrowsecurity and c.relforcerowsecurity and pg_catalog.pg_get_userbyid(c.relowner)='postgres'
  and not exists(select 1 from pg_catalog.pg_inherits h where h.inhrelid=c.oid or h.inhparent=c.oid)) then
  raise exception using errcode='55000',message='xri_referral_request_prerequisite_missing';end if;
 if pg_catalog.to_regprocedure('request_intent_private.fixture_locks(text,text)') is null
  or pg_catalog.to_regprocedure('request_intent_private.find_attempt(text,text)') is null then
  raise exception using errcode='55000',message='xri_referral_writer_prerequisite_missing';end if;
 -- Fixed existing wrapper/lock/replay/immutable authorities, not new grants.
 for item in select * from (values
  ('public.request_intent_create_or_replay(text,text,text,jsonb)','3998482d03b7c22569f2c198083d74f56bf47f67416b8d48ec349e3918f7dada',false,true),
  ('public.request_intent_create_with_context(text,text,text,jsonb,jsonb)','4a50862ea2374ede60cf18d7cbb3f2866750abf9f8dc64003ad496a23f67a65e',false,true),
  ('public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb)','4dcccec2d5979a4cd367c663b9736cc599f24443173953f2c524de2efd52077c',false,true),
  ('request_intent_private.find_attempt(text,text)','9acfc2292e187e6e9f091b37daaaa0c3e018c41419e8b2b70ef826be4252af87',true,true),
  ('request_intent_private.fixture_locks(text,text)','9c7b92de33aadb8c2695c9181ad24b4584f0b47facd0697a55037974fd02d7e3',false,false),
  ('request_intent_private.fixture_assert_submission(text,text,text,jsonb)','ba3d4ccc26912eb7cb2da0c87040adf5fc2e0709c1da1334342d3e2f48ea2e4d',true,false),
  ('request_intent_private.deny_mutation()','b48cf18e1a9a21b8f65c10a6f32daee2d22b5f8eb06c7a8a4e4c7622a2cd2052',false,false)
 ) v(signature,body_sha256,is_definer,service_execute) loop
  if not exists(select 1 from pg_catalog.pg_proc q where q.oid=pg_catalog.to_regprocedure(item.signature)
   and pg_catalog.pg_get_userbyid(q.proowner)='postgres' and q.prosecdef=item.is_definer
   and q.proconfig in(array['search_path=""']::text[],array['search_path=']::text[])
   and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(q.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=item.body_sha256
   and not pg_catalog.has_function_privilege('anon',q.oid,'EXECUTE') and not pg_catalog.has_function_privilege('authenticated',q.oid,'EXECUTE')
   and pg_catalog.has_function_privilege('service_role',q.oid,'EXECUTE')=item.service_execute
   and not exists(select 1 from pg_catalog.aclexplode(coalesce(q.proacl,pg_catalog.acldefault('f',q.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) then
   raise exception using errcode='55000',message='xri_referral_existing_authority_drift';end if;
 end loop;
 if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='request_intent_private.requests'::regclass
  and t.tgname='request_intent_immutable' and t.tgfoid='request_intent_private.deny_mutation()'::regprocedure
  and t.tgtype=27 and t.tgenabled in('O','A') and not t.tgisinternal and t.tgqual is null and t.tgnargs=0
  and t.tgargs=pg_catalog.decode('','hex') and t.tgattr=''::pg_catalog.int2vector and not t.tgdeferrable and not t.tginitdeferred) then
  raise exception using errcode='55000',message='xri_referral_immutable_guard_missing';end if;
 select exists(select 1 from pg_catalog.pg_attribute where attrelid='request_intent_private.requests'::regclass
  and attname='authoritative_referral_snapshot' and not attisdropped) into present;
 if present then
  if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='request_intent_private.requests'::regclass
   and t.tgname='request_authoritative_referral_birth' and t.tgfoid=pg_catalog.to_regprocedure('request_intent_private.xri_referral_birth()')
   and t.tgtype=7 and t.tgenabled in('O','A') and not t.tgisinternal and t.tgqual is null and t.tgnargs=0
   and t.tgargs=pg_catalog.decode('','hex') and t.tgattr=''::pg_catalog.int2vector
   and not t.tgdeferrable and not t.tginitdeferred and t.tgconstraint=0 and t.tgparentid=0)
   or not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='request_intent_private.requests'::regclass
    and c.conname='request_authoritative_referral_snapshot_shape' and c.contype='c' and c.convalidated and not c.connoinherit
    and pg_catalog.pg_get_expr(c.conbin,c.conrelid)='request_intent_private.xri_referral_snapshot_valid(authoritative_referral_snapshot)') then
   raise exception using errcode='55000',message='xri_referral_reapply_guard_drift';end if;
  for item in select * from (values
  ('request_intent_private.xri_referral_time(text)','158f0cb369c907b593e24d548f649a781cf19508209a5040ae1eb3a58b680f51',false),
  ('request_intent_private.xri_referral_snapshot_valid(jsonb)','555fa32cb68934247036002655fbe4a4572c459be9e8289c0a2db7ed50fa1a09',false),
  ('request_intent_private.xri_referral_negative(text,text,text,timestamptz)','bb1dc6ad7aa1d4587f86f4aec8d0dd4ab2d13220496c18f7bd9a7377e69b2379',false),
  ('request_intent_private.xri_referral_lock(text,text)','984e7ca0efbfc819f8a2c6ccf99d36271ea0d7e16d5c4b37f80202766bb2183a',false),
  ('request_intent_private.xri_referral_authority_state()','55adeb2f95066809e8b03215065e9ac05c6eca9eabf701fb516a95a10d0d74ac',true),
  ('request_intent_private.xri_referral_decide(text,jsonb)','29ffbba776c7d27eb4dcea86f5d5ab16da3124f6e5d9601ff1baccecee87e2aa',true),
  ('request_intent_private.xri_referral_birth()','a05a570bb81360d07cd84d0aa1d7c4c645e289e8ecf2848f8fe660fe6d6791c2',true),
  ('request_intent_private.create_or_replay(text,text,text,jsonb)','a4f2d7b4a966c6821a356b415d40848c8bddac97324ee2d62afe19da1aa9388c',true),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)','3d9eb3d527c6d83b5c382c34a730fc6c4a79dc0519b071554407313ecd4cfddb',true),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)','d154e45675491c2950504bd283622dbf4f0be1b17d6dd7167fb7d64e9eee6756',true)
  ) v(signature,body_sha256,is_definer) loop
   if not exists(select 1 from pg_catalog.pg_proc q where q.oid=pg_catalog.to_regprocedure(item.signature)
    and pg_catalog.pg_get_userbyid(q.proowner)='postgres' and q.prosecdef=item.is_definer
    and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(q.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=item.body_sha256) then
    raise exception using errcode='55000',message='xri_referral_reapply_drift';end if;
  end loop;
 else
  for item in select * from (values
  ('request_intent_private.create_or_replay(text,text,text,jsonb)','58b4296388dce802f401d2fdc92768f57a53c62b8cd30965eddcaf5cdb70a903'),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)','69a830fdb9234c3b7b153fdbca14f275b63c0ced7d3666d253cb198f45f2a246'),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)','c0bdece4b965d389319fce6c59760e4fc3e767a3f7bfa528ac5fabc5ed984913')
  ) v(signature,body_sha256) loop
   if not exists(select 1 from pg_catalog.pg_proc q where q.oid=pg_catalog.to_regprocedure(item.signature)
    and pg_catalog.pg_get_userbyid(q.proowner)='postgres' and q.prosecdef
    and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(q.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')=item.body_sha256) then
    raise exception using errcode='55000',message='xri_referral_predecessor_unreviewed';end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_proc q join pg_catalog.pg_namespace ns on ns.oid=q.pronamespace
    where ns.nspname='request_intent_private' and q.proname like 'xri_referral_%') then
   raise exception using errcode='55000',message='xri_referral_partial_installation';end if;
 end if;
end $preflight$;

alter table request_intent_private.requests
  add column if not exists authoritative_referral_snapshot jsonb;

create or replace function request_intent_private.xri_referral_time(p_text text)
returns timestamptz language sql stable security invoker set search_path='' as $$
 select case when p_text ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
   and pg_catalog.pg_input_is_valid(p_text,'timestamp with time zone')
  then case when pg_catalog.isfinite(p_text::timestamptz) then p_text::timestamptz end end;
$$;

create or replace function request_intent_private.xri_referral_snapshot_valid(p_value jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare k text; expected text[]; availability text; reason text;
begin
 if p_value is null then return true;end if; -- historical unknown, never backfilled
 if pg_catalog.jsonb_typeof(p_value) is distinct from 'object'
   or pg_catalog.octet_length(pg_catalog.convert_to(p_value::text,'UTF8'))>2048
   or p_value->>'protocol' is distinct from 'xri-referral/v1'
   or p_value->>'decidedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
   or request_intent_private.xri_referral_time(p_value->>'decidedAt') is null then return false;end if;
 availability:=p_value->>'availability';reason:=p_value->>'reason';
 if p_value->>'state'='bound_account' then
  expected:=array['protocol','decidedAt','state','source','availability','partnerId','linkId','touchId','revisionId','boundAt','effectiveAt'];
  if p_value->>'source' not in ('capture','admin_transfer') then return false;end if;
  if availability='unavailable' then
   expected:=expected||array['reason'];
   if reason is distinct from 'availability_unavailable' then return false;end if;
  elsif availability is null or availability not in ('ready','partner_inactive','self_referral') then return false;end if;
  foreach k in array array['partnerId','linkId','touchId','revisionId'] loop
   if pg_catalog.jsonb_typeof(p_value->k) is distinct from 'string'
    or p_value->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then return false;end if;
  end loop;
  foreach k in array array['boundAt','effectiveAt'] loop
   if p_value->>k !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
    or request_intent_private.xri_referral_time(p_value->>k) is null then return false;end if;
  end loop;
  if request_intent_private.xri_referral_time(p_value->>'boundAt')>request_intent_private.xri_referral_time(p_value->>'effectiveAt')
   or request_intent_private.xri_referral_time(p_value->>'effectiveAt')>request_intent_private.xri_referral_time(p_value->>'decidedAt') then return false;end if;
 elsif p_value->>'state'='provisional_touch' then
  expected:=array['protocol','decidedAt','state','source','availability','partnerId','linkId','touchId'];
  if p_value->>'source' is distinct from 'guest_touch' or availability is distinct from 'ready' then return false;end if;
  foreach k in array array['partnerId','linkId','touchId'] loop
   if pg_catalog.jsonb_typeof(p_value->k) is distinct from 'string'
    or p_value->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then return false;end if;
  end loop;
 elsif p_value->>'state'='none' then
  expected:=array['protocol','decidedAt','state','source','availability','reason'];
  if p_value->>'source' is distinct from 'none' or (case
    when reason in ('no_supported_touch','no_account_binding','touch_missing','touch_rejected') then availability='none'
    when reason in ('claim_expired','touch_expired','link_expired') then availability='expired'
    when reason='link_revoked' then availability='revoked'
    when reason='partner_inactive' then availability='partner_inactive'
    when reason='self_referral' then availability='self_referral'
    else false end) is distinct from true then return false;end if;
 elsif p_value->>'state'='unavailable' then
  expected:=array['protocol','decidedAt','state','source','availability','reason'];
  if p_value->>'source' is distinct from 'none' or availability is distinct from 'unavailable'
   or reason is null or reason not in ('disabled','unconfigured','invalid_source','not_requested',
      'authority_unavailable','authority_unsupported','provenance_unavailable') then return false;end if;
 else return false;end if;
 if not (p_value ?& expected) or p_value-expected<>'{}'::jsonb then return false;end if;
 foreach k in array expected loop
  if pg_catalog.jsonb_typeof(p_value->k) is distinct from 'string' then return false;end if;
 end loop;
 return true;
end $$;

create or replace function request_intent_private.xri_referral_negative(p_state text,p_reason text,p_availability text,p_at timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 select pg_catalog.jsonb_build_object('protocol','xri-referral/v1','decidedAt',
  pg_catalog.to_char(p_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'state',p_state,'source','none','availability',p_availability,'reason',p_reason);
$$;

create or replace function request_intent_private.xri_referral_lock(p_owner text,p_attempt text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 -- Global Referral V1 must precede legacy XRI L then F/settings, including
 -- context's early lock and the direct referral INSERT path.
 perform pg_catalog.pg_advisory_xact_lock(9042026,1);
 perform request_intent_private.fixture_locks(p_owner,p_attempt);
end $$;

create or replace function request_intent_private.xri_referral_authority_state()
returns text language plpgsql stable security definer set search_path='' as $$
declare item record; actual text; p pg_catalog.pg_proc;
begin
 -- V1 is optional: no missing-relation row types are compiled into this file.
 -- Each delegate is fixed to reviewed native source, not a caller version label.
 for item in select * from (values
  ('public.research_referral_v1_authority()','0671d0287463ddf00bc8fe779ede011a819dbca41b0f8e6c007916c2b95c449b',true,'jsonb',array[]::text[],0),
  ('public.research_referral_v1_binding_at_json(text,timestamptz)','4b55bba12dfb401c715812c31158a4d8ee9d4058c38c77ea49fc0bad63e3f3e5',false,'jsonb',array['p_key','p_occurred_at']::text[],0),
  ('public.research_referral_v1_partner_availability(uuid,uuid)','bf229be7d54dbfd67ffc4a5a4308dbcd9c0012878198ddf8a22fc1d969591626',false,'text',array['p_partner_id','p_actor']::text[],1),
  ('public.research_referral_v1_availability(uuid,uuid)','1a6a8b3f61a8b606b9b43ef1e35541208177f5143b29143332127e3349b3ccde',false,'text',array['p_link_id','p_actor']::text[],1),
  ('public.research_referral_v1_touch_attribution(uuid,text,uuid)','80ba1394d7c00c9d4e7bdea8fbd87ae1bf542f68610c1008a341a8018ef60041',false,'jsonb',array['p_touch_id','p_subject_key_hash','p_actor_auth_user_id']::text[],0)
 ) v(signature,body_sha256,service_execute,result_type,argument_names,default_count) loop
  if pg_catalog.to_regprocedure(item.signature) is null then return 'authority_unavailable';end if;
  select * into p from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure(item.signature);
  actual:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex');
  if actual is distinct from item.body_sha256 or pg_catalog.pg_get_userbyid(p.proowner)<>'postgres'
    or not p.prosecdef or p.prokind<>'f' or p.proretset or p.provolatile<>'v'
    or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or pg_catalog.pg_get_function_result(p.oid) is distinct from item.result_type
    or coalesce(p.proargnames,array[]::text[]) is distinct from item.argument_names
    or p.pronargdefaults is distinct from item.default_count
    or p.proconfig is null or p.proconfig not in (array['search_path=""']::text[],array['search_path=']::text[])
    or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') is distinct from item.service_execute
    or exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE') then return 'authority_unsupported';end if;
 end loop;
 return 'available';
end $$;

create or replace function request_intent_private.xri_referral_decide(p_owner text,p_source jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare observed timestamptz:=pg_catalog.clock_timestamp(); source_kind text; authority_state text;
 authority jsonb; binding jsonb; again jsonb; facts jsonb; availability text; touch jsonb; attribution jsonb;
 actor uuid; bound_at timestamptz; effective_at timestamptz; touch_expiry timestamptz; claim_ms numeric;
 k text; n bigint; fields text[];
begin
 if p_source is null then return request_intent_private.xri_referral_negative('unavailable','not_requested','unavailable',observed);end if;
 if pg_catalog.jsonb_typeof(p_source) is distinct from 'object' then
  return request_intent_private.xri_referral_negative('unavailable','invalid_source','unavailable',observed);end if;
 source_kind:=p_source->>'kind';
 if source_kind='unavailable' and p_source ?& array['kind','reason'] and p_source-array['kind','reason']='{}'::jsonb
  and p_source->>'reason' in ('disabled','unconfigured','invalid_source') then
  return request_intent_private.xri_referral_negative('unavailable',p_source->>'reason','unavailable',observed);
 elsif source_kind='account' and p_source ?& array['kind','actorAuthUserId'] and p_source-array['kind','actorAuthUserId']='{}'::jsonb
  and pg_catalog.jsonb_typeof(p_source->'actorAuthUserId')='string'
  and p_source->>'actorAuthUserId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
  actor:=(p_source->>'actorAuthUserId')::uuid;
  if p_owner is distinct from pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    '["request-intent-owner","member","'||actor::text||'"]','UTF8')),'hex') then
   return request_intent_private.xri_referral_negative('unavailable','invalid_source','unavailable',observed);end if;
 elsif source_kind='guest_touch' and p_source ?& array['kind','touchId','subjectKeyHash','claimExpiresAt']
  and p_source-array['kind','touchId','subjectKeyHash','claimExpiresAt']='{}'::jsonb
  and pg_catalog.jsonb_typeof(p_source->'touchId')='string'
  and p_source->>'touchId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  and pg_catalog.jsonb_typeof(p_source->'subjectKeyHash')='string' and p_source->>'subjectKeyHash' ~ '^[a-f0-9]{64}$'
  and pg_catalog.jsonb_typeof(p_source->'claimExpiresAt')='number' and p_source->>'claimExpiresAt' ~ '^[0-9]{1,16}$' then
  claim_ms:=(p_source->>'claimExpiresAt')::numeric;
  if claim_ms>8640000000000000 then return request_intent_private.xri_referral_negative('unavailable','invalid_source','unavailable',observed);end if;
 elsif source_kind='no_supported_touch' and p_source=pg_catalog.jsonb_build_object('kind','no_supported_touch') then null;
 else return request_intent_private.xri_referral_negative('unavailable','invalid_source','unavailable',observed);end if;

 authority_state:=request_intent_private.xri_referral_authority_state();
 if authority_state<>'available' then return request_intent_private.xri_referral_negative('unavailable',authority_state,'unavailable',observed);end if;
 begin
  execute 'select public.research_referral_v1_authority()' into authority;
 exception when undefined_function or undefined_table or undefined_column or insufficient_privilege then
  return request_intent_private.xri_referral_negative('unavailable','authority_unavailable','unavailable',pg_catalog.clock_timestamp());
 end;
 if authority is distinct from '{"ok":true,"value":{"schemaVersion":"gen2_referral_v1_transfer_touch_20260921"}}'::jsonb then
  return request_intent_private.xri_referral_negative('unavailable','authority_unsupported','unavailable',pg_catalog.clock_timestamp());end if;
 if source_kind='no_supported_touch' then return request_intent_private.xri_referral_negative('none','no_supported_touch','none',pg_catalog.clock_timestamp());end if;

 if source_kind='account' then
  -- Locks are OUTSIDE optional read handlers. Deadlock/timeout/cancellation or
  -- concurrent native topology loss must fail this transaction, never a save.
  execute 'select 1 from public.research_members where auth_user_id=$1 for share' using actor;
  get diagnostics n=row_count;
  if n<>1 then return request_intent_private.xri_referral_negative('unavailable','invalid_source','unavailable',pg_catalog.clock_timestamp());end if;
  begin
   execute 'select public.research_referral_v1_binding_at_json($1,$2)' into binding using 'auth:'||actor::text,pg_catalog.clock_timestamp();
  exception when undefined_function or undefined_table or undefined_column or insufficient_privilege then
   return request_intent_private.xri_referral_negative('unavailable','authority_unavailable','unavailable',pg_catalog.clock_timestamp());
  end;
  if binding is null then return request_intent_private.xri_referral_negative('none','no_account_binding','none',pg_catalog.clock_timestamp());end if;
  fields:=array['accountKey','partnerId','linkId','touchId','revisionId','boundAt','effectiveAt','source'];
  if pg_catalog.jsonb_typeof(binding) is distinct from 'object' or not(binding ?& fields) or binding-fields<>'{}'::jsonb
   or binding->>'accountKey' is distinct from 'auth:'||actor::text or binding->>'source' not in ('capture','admin_transfer') then
   return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',pg_catalog.clock_timestamp());end if;
  foreach k in array array['partnerId','linkId','touchId','revisionId'] loop
   if pg_catalog.jsonb_typeof(binding->k) is distinct from 'string'
    or binding->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
    return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',pg_catalog.clock_timestamp());end if;
  end loop;
  bound_at:=request_intent_private.xri_referral_time(binding->>'boundAt');effective_at:=request_intent_private.xri_referral_time(binding->>'effectiveAt');
  if bound_at is null or effective_at is null or bound_at>effective_at then
   return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',pg_catalog.clock_timestamp());end if;
  execute 'select 1 from public.research_partners where id=$1 for share' using (binding->>'partnerId')::uuid;
  observed:=pg_catalog.clock_timestamp();
  begin
   execute 'select public.research_referral_v1_binding_at_json($1,$2)' into again using 'auth:'||actor::text,observed;
  exception when undefined_function or undefined_table or undefined_column or insufficient_privilege then
   return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',observed);
  end;
  -- A scheduled transfer crossing a row-lock wait cannot credit stale facts.
  if again is distinct from binding or effective_at>observed then
   return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',observed);end if;
  facts:=pg_catalog.jsonb_build_object('protocol','xri-referral/v1','decidedAt',pg_catalog.to_char(observed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'state','bound_account','source',binding->>'source','partnerId',binding->>'partnerId','linkId',binding->>'linkId',
   'touchId',binding->>'touchId','revisionId',binding->>'revisionId',
   'boundAt',pg_catalog.to_char(bound_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'effectiveAt',pg_catalog.to_char(effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  begin
   execute 'select public.research_referral_v1_partner_availability($1,$2)' into availability using (binding->>'partnerId')::uuid,actor;
  exception when undefined_function or undefined_table or undefined_column or insufficient_privilege then
   availability:='unavailable';
  end;
  if availability is null or availability not in ('ready','partner_inactive','self_referral') then
   return facts||'{"availability":"unavailable","reason":"availability_unavailable"}'::jsonb;end if;
  return facts||pg_catalog.jsonb_build_object('availability',availability);
 end if;

 begin
  execute 'select jsonb_build_object(''id'',id,''partnerId'',partner_id,''linkId'',referral_link_id,''expiresAt'',referral_expires_at)
   from public.research_attribution_touches where id=$1 and subject_key=$2 and referral_version=1'
   into touch using (p_source->>'touchId')::uuid,p_source->>'subjectKeyHash';
 exception when undefined_function or undefined_table or undefined_column or insufficient_privilege then
  return request_intent_private.xri_referral_negative('unavailable','authority_unavailable','unavailable',pg_catalog.clock_timestamp());
 end;
 if touch is null then return request_intent_private.xri_referral_negative('none','touch_missing','none',pg_catalog.clock_timestamp());end if;
 foreach k in array array['id','partnerId','linkId'] loop
  if pg_catalog.jsonb_typeof(touch->k) is distinct from 'string'
   or touch->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
   return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',pg_catalog.clock_timestamp());end if;
 end loop;
 touch_expiry:=request_intent_private.xri_referral_time(touch->>'expiresAt');
 if touch_expiry is null then return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',pg_catalog.clock_timestamp());end if;
 execute 'select 1 from public.research_partners where id=$1 for share' using (touch->>'partnerId')::uuid;
 execute 'select 1 from public.research_partner_links where id=$1 and referral_version=1 for share' using (touch->>'linkId')::uuid;
 execute 'select 1 from public.research_attribution_touches where id=$1 and subject_key=$2 and referral_version=1 for share'
  using (touch->>'id')::uuid,p_source->>'subjectKeyHash';
 observed:=pg_catalog.clock_timestamp();
 -- Numeric epoch MILLISECONDS retains the exact signed integer and native
 -- microseconds: no floating seconds conversion, inferred TTL or renewal.
 if claim_ms<=extract(epoch from observed)*1000 then return request_intent_private.xri_referral_negative('none','claim_expired','expired',observed);end if;
 if touch_expiry<=observed then return request_intent_private.xri_referral_negative('none','touch_expired','expired',observed);end if;
 begin
  execute 'select public.research_referral_v1_availability($1,$2)' into availability using (touch->>'linkId')::uuid,null::uuid;
  execute 'select public.research_referral_v1_touch_attribution($1,$2,$3)' into attribution using (touch->>'id')::uuid,p_source->>'subjectKeyHash',null::uuid;
 exception when undefined_function or undefined_table or undefined_column or insufficient_privilege then
  return request_intent_private.xri_referral_negative('unavailable','authority_unavailable','unavailable',observed);
 end;
 if availability in ('partner_inactive','self_referral','revoked','expired') then
  return request_intent_private.xri_referral_negative('none',case availability when 'revoked' then 'link_revoked' when 'expired' then 'link_expired' else availability end,availability,observed);
 end if;
 if availability is distinct from 'ready' then return request_intent_private.xri_referral_negative('unavailable','authority_unsupported','unavailable',observed);end if;
 if attribution='{"partnerId":null,"eligible":false}'::jsonb then return request_intent_private.xri_referral_negative('none','touch_rejected','none',observed);end if;
 if attribution is distinct from pg_catalog.jsonb_build_object('partnerId',touch->>'partnerId','eligible',true) then
  return request_intent_private.xri_referral_negative('unavailable','provenance_unavailable','unavailable',observed);end if;
 return pg_catalog.jsonb_build_object('protocol','xri-referral/v1','decidedAt',pg_catalog.to_char(observed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'state','provisional_touch','source','guest_touch','availability','ready','partnerId',touch->>'partnerId','linkId',touch->>'linkId','touchId',touch->>'id');
end $$;

create or replace function request_intent_private.xri_referral_birth()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform request_intent_private.xri_referral_lock(new.owner_hash,new.attempt_hash);
 if new.authoritative_referral_snapshot is null then
  new.authoritative_referral_snapshot:=request_intent_private.xri_referral_negative('unavailable','not_requested','unavailable',pg_catalog.clock_timestamp());
 end if;
 return new;
end $$;

create or replace function request_intent_private.create_or_replay(
  p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored request_intent_private.requests; request_id uuid;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  if not request_intent_private.only_keys(p_detail,array[
    'kind','requestId','publicReference','status','createdAt','contact','agreements','lines','_serverReferral'
  ]) or p_detail->>'kind' is distinct from 'unapproved_selection_request'
    or p_detail->>'status' is distinct from 'pending_review' then
    raise exception using errcode='22023',message='request_intent_invalid';
  end if;
  -- Saved replay never consults a locator, V1 authority or mutable availability.
  select * into stored from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
  if found then
    if stored.fingerprint is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
    return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
  end if;
  perform request_intent_private.xri_referral_lock(p_owner_hash,p_attempt_hash);
  select * into stored from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
  if found then
    if stored.fingerprint is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
    return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
  end if;
  perform request_intent_private.fixture_assert_submission(p_owner_hash,p_attempt_hash,p_fingerprint,
    pg_catalog.jsonb_build_object('lines',p_detail->'lines','agreements',p_detail->'agreements'));
  request_id := (p_detail->>'requestId')::uuid;
  insert into request_intent_private.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,contact,agreements,lines,authoritative_referral_snapshot)
    values(request_id,'XRI-'||upper(replace(request_id::text,'-','')),p_owner_hash,p_attempt_hash,p_fingerprint,
      p_detail->'contact',p_detail->'agreements',p_detail->'lines',
      request_intent_private.xri_referral_decide(p_owner_hash,p_detail->'_serverReferral'))
    on conflict(owner_hash,attempt_hash) do nothing returning * into stored;
  if found then
    insert into request_intent_private.access_events(request_id,event_type) values(stored.id,'submitted');
  else
    -- A second statement sees the committed winner under READ COMMITTED.
    select * into strict stored from request_intent_private.requests
      where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
    if stored.fingerprint is distinct from p_fingerprint then
      raise exception using errcode='23505',message='request_intent_attempt_conflict';
    end if;
  end if;
  return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
end;
$$;

create or replace function request_intent_private.create_with_context(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; prior jsonb;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  if jsonb_typeof(p_context) is distinct from 'object'
     or not request_intent_private.only_keys(p_context,array['goal','referralCode'])
     or p_context='{}'::jsonb
     or (p_context ? 'goal' and jsonb_typeof(p_context->'goal') is distinct from 'string')
     or (p_context ? 'referralCode' and jsonb_typeof(p_context->'referralCode') is distinct from 'string') then
    raise exception using errcode='22023',message='request_intent_invalid_optional_context';
  end if;
  if jsonb_typeof(p_detail) is distinct from 'object' or not request_intent_private.only_keys(p_detail,array[
    'kind','requestId','publicReference','status','createdAt','contact','agreements','lines','_serverReferral'])
    or p_detail->>'kind' is distinct from 'unapproved_selection_request'
    or p_detail->>'status' is distinct from 'pending_review' then
    raise exception using errcode='22023',message='request_intent_invalid';
  end if;
  prior:=request_intent_private.find_attempt(p_owner_hash,p_attempt_hash);
  if prior is not null then
    if prior->>'fingerprint' is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
    return prior;
  end if;
  -- Serialize v2 retries even if the caller deliberately reuses the proposed request UUID.
  perform request_intent_private.xri_referral_lock(p_owner_hash,p_attempt_hash);
  prior:=request_intent_private.find_attempt(p_owner_hash,p_attempt_hash);
  if prior is not null then
    if prior->>'fingerprint' is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
    return prior;
  end if;

  perform request_intent_private.fixture_assert_submission(p_owner_hash,p_attempt_hash,p_fingerprint,
    pg_catalog.jsonb_build_object('lines',p_detail->'lines','agreements',p_detail->'agreements'));
  result:=request_intent_private.create_or_replay(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail);
  -- Existing request replay never resurrects optional data after privacy erasure.
  -- L and the unconditional native birth gate exclude a competing writer here;
  -- create_or_replay itself uses INSERT RETURNING. Never infer a winner from UUID equality.
  if prior is null then
    insert into request_intent_private.optional_context(request_id,goal,referral_code)
    values((result->'receipt'->>'requestId')::uuid,p_context->>'goal',p_context->>'referralCode')
    on conflict (request_id) do nothing;
  end if;
  return result;
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
   'kind','requestId','publicReference','status','createdAt','contact','agreements','lines','_serverReferral'])
   or p_detail->>'kind' is distinct from 'unapproved_selection_request'
   or p_detail->>'status' is distinct from 'pending_review' then raise exception using errcode='22023',message='request_intent_invalid';end if;
 select * into stored from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
 if found then
   if stored.fingerprint is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
   return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
 end if;
 perform request_intent_private.xri_referral_lock(p_owner_hash,p_attempt_hash);
 -- Exact replay precedes temporary-data lookup and never reconstructs a snapshot.
 select * into stored from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash;
 if found then
   if stored.fingerprint is distinct from p_fingerprint then raise exception using errcode='23505',message='request_intent_attempt_conflict';end if;
   return jsonb_build_object('receipt',request_intent_private.receipt(stored),'fingerprint',stored.fingerprint);
 end if;
 perform request_intent_private.fixture_assert_submission(p_owner_hash,p_attempt_hash,p_fingerprint,
  pg_catalog.jsonb_build_object('lines',p_detail->'lines','agreements',p_detail->'agreements'));
 proposed_request_id:=(p_detail->>'requestId')::uuid;
 -- Exact canonical INSERT, constraints and AFTER INSERT policy/workflow/outbox
 -- triggers. RETURNING distinguishes a real winner even from a legacy writer
 -- proposing the same UUID. Every later failure rolls back all these effects.
 insert into request_intent_private.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,contact,agreements,lines,authoritative_referral_snapshot)
  values(proposed_request_id,'XRI-'||upper(replace(proposed_request_id::text,'-','')),p_owner_hash,p_attempt_hash,p_fingerprint,
    p_detail->'contact',p_detail->'agreements',p_detail->'lines',
    request_intent_private.xri_referral_decide(p_owner_hash,p_detail->'_serverReferral'))
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

do $constraint$
begin
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='request_intent_private.requests'::regclass
   and conname='request_authoritative_referral_snapshot_shape') then
  alter table request_intent_private.requests add constraint request_authoritative_referral_snapshot_shape
   check(request_intent_private.xri_referral_snapshot_valid(authoritative_referral_snapshot));
 end if;
 if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='request_intent_private.requests'::regclass
  and c.conname='request_authoritative_referral_snapshot_shape' and c.contype='c' and c.convalidated
  and not c.connoinherit and pg_catalog.pg_get_expr(c.conbin,c.conrelid)='request_intent_private.xri_referral_snapshot_valid(authoritative_referral_snapshot)') then
  raise exception using errcode='55000',message='xri_referral_constraint_drift';end if;
end $constraint$;
drop trigger if exists request_authoritative_referral_birth on request_intent_private.requests;
create trigger request_authoritative_referral_birth before insert on request_intent_private.requests
 for each row execute function request_intent_private.xri_referral_birth();
-- This name sorts before request_fixture_birth: even old direct INSERT obtains
-- the global V1 lock before the preexisting L/F fixture guard.
revoke all on function request_intent_private.xri_referral_time(text) from public,anon,authenticated,service_role;
revoke all on function request_intent_private.xri_referral_snapshot_valid(jsonb) from public,anon,authenticated,service_role;
revoke all on function request_intent_private.xri_referral_negative(text,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function request_intent_private.xri_referral_lock(text,text) from public,anon,authenticated,service_role;
revoke all on function request_intent_private.xri_referral_authority_state() from public,anon,authenticated,service_role;
revoke all on function request_intent_private.xri_referral_decide(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function request_intent_private.xri_referral_birth() from public,anon,authenticated,service_role;
do $final$
declare item record; q pg_catalog.pg_proc;
begin
 if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='request_intent_private.requests'::regclass
  and a.attname='authoritative_referral_snapshot' and a.atttypid='jsonb'::regtype and not a.attisdropped
  and not a.attnotnull and a.attacl is null and a.attidentity='' and a.attgenerated=''
  and not exists(select 1 from pg_catalog.pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) then
  raise exception using errcode='55000',message='xri_referral_column_drift';end if;
 if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='request_intent_private.requests'::regclass
  and t.tgname='request_authoritative_referral_birth' and t.tgfoid='request_intent_private.xri_referral_birth()'::regprocedure
  and t.tgtype=7 and t.tgenabled in('O','A') and not t.tgisinternal and t.tgqual is null and t.tgnargs=0
  and t.tgargs=pg_catalog.decode('','hex') and t.tgattr=''::pg_catalog.int2vector
  and not t.tgdeferrable and not t.tginitdeferred and t.tgconstraint=0 and t.tgparentid=0) then
  raise exception using errcode='55000',message='xri_referral_birth_guard_drift';end if;
 for item in select * from (values
  ('request_intent_private.xri_referral_time(text)','158f0cb369c907b593e24d548f649a781cf19508209a5040ae1eb3a58b680f51',false),
  ('request_intent_private.xri_referral_snapshot_valid(jsonb)','555fa32cb68934247036002655fbe4a4572c459be9e8289c0a2db7ed50fa1a09',false),
  ('request_intent_private.xri_referral_negative(text,text,text,timestamptz)','bb1dc6ad7aa1d4587f86f4aec8d0dd4ab2d13220496c18f7bd9a7377e69b2379',false),
  ('request_intent_private.xri_referral_lock(text,text)','984e7ca0efbfc819f8a2c6ccf99d36271ea0d7e16d5c4b37f80202766bb2183a',false),
  ('request_intent_private.xri_referral_authority_state()','55adeb2f95066809e8b03215065e9ac05c6eca9eabf701fb516a95a10d0d74ac',true),
  ('request_intent_private.xri_referral_decide(text,jsonb)','29ffbba776c7d27eb4dcea86f5d5ab16da3124f6e5d9601ff1baccecee87e2aa',true),
  ('request_intent_private.xri_referral_birth()','a05a570bb81360d07cd84d0aa1d7c4c645e289e8ecf2848f8fe660fe6d6791c2',true),
  ('request_intent_private.create_or_replay(text,text,text,jsonb)','a4f2d7b4a966c6821a356b415d40848c8bddac97324ee2d62afe19da1aa9388c',true),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)','3d9eb3d527c6d83b5c382c34a730fc6c4a79dc0519b071554407313ecd4cfddb',true),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)','d154e45675491c2950504bd283622dbf4f0be1b17d6dd7167fb7d64e9eee6756',true)
 ) v(signature,body_sha256,is_definer) loop
  select * into q from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure(item.signature);
  if not found or pg_catalog.pg_get_userbyid(q.proowner)<>'postgres' or q.prosecdef is distinct from item.is_definer
   or q.prokind<>'f' or q.proretset or q.proconfig is null or q.proconfig not in(array['search_path=""']::text[],array['search_path=']::text[])
   or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(q.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') is distinct from item.body_sha256 then
   raise exception using errcode='55000',message='xri_referral_definition_drift';end if;
  if pg_catalog.has_function_privilege('anon',q.oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',q.oid,'EXECUTE')
   or exists(select 1 from pg_catalog.aclexplode(coalesce(q.proacl,pg_catalog.acldefault('f',q.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
   or pg_catalog.has_function_privilege('service_role',q.oid,'EXECUTE') is distinct from (q.proname in('create_or_replay','create_with_context','create_with_referral')) then
   raise exception using errcode='55000',message='xri_referral_execute_drift';end if;
 end loop;
 if exists(select 1 from (values('anon'),('authenticated'),('service_role')) roles(name)
   where pg_catalog.has_table_privilege(roles.name,'request_intent_private.requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_any_column_privilege(roles.name,'request_intent_private.requests','SELECT,INSERT,UPDATE,REFERENCES')) then
  raise exception using errcode='55000',message='xri_referral_private_table_grant_drift';end if;
end $final$;
-- No native positive activation or definition/retention/privacy repin occurs.
commit;
