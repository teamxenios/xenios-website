-- SOURCE CANDIDATE ONLY. No managed installation or attribution activation.
-- Order: qualified fixture-no-mail prerequisite, accepted native bridge1f7,
-- then this PIN-ONLY successor. Never replay the old installer after bridge.
-- Changes ONLY the read-only status definition; preserves every other object,
-- ABI, privilege and row. Optional V1 absence is attribution unavailable, not
-- a missing mail fence. Privacy/retention successors remain separate holds.
begin;
set local lock_timeout='5s';
set local search_path=pg_catalog;
set local standard_conforming_strings=on;

do $preflight$
declare actual text;
begin
 if current_user<>'postgres' then raise exception using errcode='42501',message='fixture_referral_pin_owner_only';end if;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') into actual
   from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
   where p.oid=pg_catalog.to_regprocedure('public.request_intent_fixture_mail_guard_status()')
    and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and l.lanname='plpgsql'
    and p.provolatile='s' and p.prokind='f' and not p.proretset and p.pronargs=0 and p.pronargdefaults=0
    and coalesce(p.proargnames,array[]::text[])=array[]::text[]
    and pg_catalog.pg_get_function_result(p.oid)='jsonb'
    and p.proconfig in (array['search_path=""']::text[],array['search_path=']::text[])
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE')
    and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    and pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
 if actual is null or actual not in ('7d58ca4ba4a970d435d59af4d85d94dc41e16b0753d19c272f7d4d15277e894e','b2e771c49d7ea877a125f616b2b5033ebe144c9917114ef6a7d4eb9f9cf010c0') then
  raise exception using errcode='55000',message='fixture_referral_pin_predecessor_unreviewed';
 end if;
 -- The old status intentionally returns false after accepted writer changes.
 -- The final check below requires all fixed native prerequisites; failure rolls
 -- back the lone replacement instead of repairing or trusting observed bodies.
end $preflight$;

create or replace function public.request_intent_fixture_mail_guard_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item record; valid boolean:=true; actual text;
begin
 for item in select * from (values
  ('request_intent_private.requests','request_fixture_birth','request_intent_private.fixture_birth()',7),
  ('request_intent_private.requests','request_fixture_consume','request_intent_private.fixture_consume()',5),
  ('request_intent_private.workflow_settings','fixture_control_pin','request_intent_private.fixture_control_pin()',27),
  ('request_intent_private.workflow_staff_intents','fixture_workflow_lineage','request_intent_private.fixture_workflow_lineage()',23),
  ('request_intent_private.workflow_notice_intents','fixture_workflow_lineage','request_intent_private.fixture_workflow_lineage()',23),
  ('public.research_notification_outbox','fixture_outbox_fence','request_intent_private.fixture_outbox_fence()',23),
  ('public.research_notification_attempts','fixture_attempt_fence','request_intent_private.fixture_attempt_fence()',7),
  ('quote_delivery_private.qd_notification_intents','fixture_quote_fence','request_intent_private.fixture_quote_fence()',23),
  ('request_intent_private.requests','request_authoritative_referral_birth','request_intent_private.xri_referral_birth()',7),
  ('request_intent_private.requests','request_intent_immutable','request_intent_private.deny_mutation()',27)
 ) v(relation_name,trigger_name,function_name,type_bits) loop
  if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=pg_catalog.to_regclass(item.relation_name)
    and t.tgname=item.trigger_name and not t.tgisinternal and t.tgenabled in ('O','A')
    and t.tgfoid=pg_catalog.to_regprocedure(item.function_name) and t.tgtype::int=item.type_bits
    -- Exact native unconditional binding: a same-named WHEN(FALSE), UPDATE OF,
    -- argument-bearing or deferred constraint trigger is not this guard.
    and t.tgqual is null and t.tgnargs=0 and t.tgargs=pg_catalog.decode('','hex')
    and t.tgattr=''::pg_catalog.int2vector and not t.tgdeferrable and not t.tginitdeferred
    and t.tgconstraint=0 and t.tgconstrrelid=0 and t.tgconstrindid=0 and t.tgparentid=0
    and t.tgoldtable is null and t.tgnewtable is null) then valid:=false;end if;
 end loop;
 for item in select * from (values
  ('request_intent_private.fixture_locks(text,text)','9c7b92de33aadb8c2695c9181ad24b4584f0b47facd0697a55037974fd02d7e3',false,'plpgsql','v','void'),
  ('request_intent_private.fixture_snapshot_digest(jsonb)','b43a1aac37fb7daad9baf9765e8e7c6cc1a3118c49eaffb395b83e5ed2ea7836',false,'plpgsql','i','text'),
  ('request_intent_private.fixture_admission(jsonb,uuid)','793937d31ea4a300f07f767909453a42b0e83eeb541b51b195bbb76d5dfb1506',true,'plpgsql','v','timestamp with time zone'),
  ('request_intent_private.fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)','8a8430ba22896c488c56dd60f887bb4de5447725cf45102ecae499ac8232e3e4',true,'plpgsql','v','jsonb'),
  ('public.request_intent_fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)','2f760b5f3dc2740514fa637fb68a3f6aa8e9120f0c634d38dc0d4a5c2193f34f',false,'sql','v','jsonb'),
  ('request_intent_private.fixture_no_mail_publish(uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz,uuid)','0c272141fb7600c1db9a401115a22c2b358f4d3759dd09b282fb99716111de2d',false,'plpgsql','v','text'),
  ('request_intent_private.fixture_assert_submission(text,text,text,jsonb)','ba3d4ccc26912eb7cb2da0c87040adf5fc2e0709c1da1334342d3e2f48ea2e4d',true,'plpgsql','v','uuid'),
  ('request_intent_private.fixture_birth()','95a52af4559f05885563c8dd9fae85aafb7c297b367dfef8b5942ab69acdd5ba',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_consume()','593dfab5ee255091038429a2a38f20585e62abbd8c774527b8f5db139886cb22',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_control_pin()','4c3f8058782db012201efcce389fff7499e607811798adf6d3dd71da86038baa',false,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_request_lineage(uuid)','9887fa674409fc1b0bfb7d77ce60fe444d2eefbce05392d06d9e8f43897cd2b4',true,'plpgsql','v','jsonb'),
  ('request_intent_private.fixture_job_lineage(text,text,text,jsonb)','4cfdd08eccadea7d2eb9613c3a17aed3a06807fc3dd0fe70e6c0851ecf5d3da4',true,'plpgsql','v','jsonb'),
  ('request_intent_private.fixture_workflow_lineage()','685c8f267b37e4627d1f1279f56b05689dc68eaad76dfb874513126f79db417a',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_outbox_fence()','3de949c9c130c73462e932517738e008edeb9ba66fda6622b9ddc9fcb645ca18',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_attempt_fence()','9457b714f689972a200a4df5e4faa655cba408ac64e37e56c1cefdecce7f808d',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_quote_fence()','58a7d87e45a8db322be900c42950591cc3806e9877d7ffdf0c74124a9f969863',true,'plpgsql','v','trigger'),
  ('public.request_intent_fixture_mail_disposition(uuid)','7bdac606b1ee1d51eac723e112b2884b61813f20d29f8f575bbe1090088665dc',true,'plpgsql','v','text'),
  ('request_intent_private.fixture_has_send_evidence(uuid)','3f3abcff1aac43607fe59539a6174662db8d8c87b4d1418e177472a856b40954',true,'sql','s','boolean'),
  ('request_intent_private.create_or_replay(text,text,text,jsonb)','a4f2d7b4a966c6821a356b415d40848c8bddac97324ee2d62afe19da1aa9388c',true,'plpgsql','v','jsonb'),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)','3d9eb3d527c6d83b5c382c34a730fc6c4a79dc0519b071554407313ecd4cfddb',true,'plpgsql','v','jsonb'),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)','d154e45675491c2950504bd283622dbf4f0be1b17d6dd7167fb7d64e9eee6756',true,'plpgsql','v','jsonb'),
  ('request_intent_private.enqueue_staff_notices(timestamptz,text[])','f6a46969c33331c01c19b42d4fba12443054cc2f94848ff7012f5fddbb9aa8ca',true,'plpgsql','v','integer'),
  ('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)','1b991c292f4f9e289a36c7ec8dbb362695b74055f2511498bd19d30f903be007',true,'plpgsql','v','integer'),
  ('request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text)','34db6b63b536810bb797907fd24694c1910bc9e4844ac680058ebb5f336f40e1',true,'plpgsql','v','void'),
  ('request_intent_private.workflow_customer_notice(uuid,uuid)','91840e12fd0b17721921895385765d5994bc28f38503c2491cfad95d058bfb86',true,'plpgsql','s','text'),
  ('request_intent_private.xri_referral_time(text)','158f0cb369c907b593e24d548f649a781cf19508209a5040ae1eb3a58b680f51',false,'sql','s','timestamp with time zone'),
  ('request_intent_private.xri_referral_snapshot_valid(jsonb)','555fa32cb68934247036002655fbe4a4572c459be9e8289c0a2db7ed50fa1a09',false,'plpgsql','s','boolean'),
  ('request_intent_private.xri_referral_negative(text,text,text,timestamptz)','bb1dc6ad7aa1d4587f86f4aec8d0dd4ab2d13220496c18f7bd9a7377e69b2379',false,'sql','s','jsonb'),
  ('request_intent_private.xri_referral_lock(text,text)','984e7ca0efbfc819f8a2c6ccf99d36271ea0d7e16d5c4b37f80202766bb2183a',false,'plpgsql','v','void'),
  ('request_intent_private.xri_referral_authority_state()','55adeb2f95066809e8b03215065e9ac05c6eca9eabf701fb516a95a10d0d74ac',true,'plpgsql','s','text'),
  ('request_intent_private.xri_referral_decide(text,jsonb)','29ffbba776c7d27eb4dcea86f5d5ab16da3124f6e5d9601ff1baccecee87e2aa',true,'plpgsql','v','jsonb'),
  ('request_intent_private.xri_referral_birth()','a05a570bb81360d07cd84d0aa1d7c4c645e289e8ecf2848f8fe660fe6d6791c2',true,'plpgsql','v','trigger'),
  ('public.request_intent_create_or_replay(text,text,text,jsonb)','3998482d03b7c22569f2c198083d74f56bf47f67416b8d48ec349e3918f7dada',false,'sql','v','jsonb'),
  ('public.request_intent_create_with_context(text,text,text,jsonb,jsonb)','4a50862ea2374ede60cf18d7cbb3f2866750abf9f8dc64003ad496a23f67a65e',false,'sql','v','jsonb'),
  ('public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb)','4dcccec2d5979a4cd367c663b9736cc599f24443173953f2c524de2efd52077c',false,'sql','v','jsonb'),
  ('request_intent_private.find_attempt(text,text)','9acfc2292e187e6e9f091b37daaaa0c3e018c41419e8b2b70ef826be4252af87',true,'plpgsql','v','jsonb'),
  ('request_intent_private.deny_mutation()','b48cf18e1a9a21b8f65c10a6f32daee2d22b5f8eb06c7a8a4e4c7622a2cd2052',false,'plpgsql','v','trigger')
 ) v(signature,body_sha256,is_definer,language_name,volatility,result_type) loop
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') into actual
   from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
   where p.oid=pg_catalog.to_regprocedure(item.signature) and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    and p.prosecdef=item.is_definer and l.lanname=item.language_name and p.provolatile::text=item.volatility
    and pg_catalog.pg_get_function_result(p.oid)=item.result_type and p.prokind='f' and not p.proretset
    and p.proconfig in (array['search_path=""']::text[],array['search_path=']::text[]);
  if actual is distinct from item.body_sha256 then valid:=false;end if;
 end loop;
 for item in select * from (values
  ('request_intent_private.fixture_locks(text,text)',false),
  ('request_intent_private.fixture_snapshot_digest(jsonb)',false),
  ('request_intent_private.fixture_admission(jsonb,uuid)',false),
  ('request_intent_private.fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)',true),
  ('public.request_intent_fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)',true),
  ('request_intent_private.fixture_no_mail_publish(uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz,uuid)',false),
  ('request_intent_private.fixture_assert_submission(text,text,text,jsonb)',false),
  ('request_intent_private.fixture_birth()',false),
  ('request_intent_private.fixture_consume()',false),
  ('request_intent_private.fixture_control_pin()',false),
  ('request_intent_private.fixture_request_lineage(uuid)',false),
  ('request_intent_private.fixture_job_lineage(text,text,text,jsonb)',false),
  ('request_intent_private.fixture_workflow_lineage()',false),
  ('request_intent_private.fixture_outbox_fence()',false),
  ('request_intent_private.fixture_attempt_fence()',false),
  ('request_intent_private.fixture_quote_fence()',false),
  ('public.request_intent_fixture_mail_disposition(uuid)',true),
  ('request_intent_private.fixture_has_send_evidence(uuid)',false),
  ('request_intent_private.create_or_replay(text,text,text,jsonb)',true),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)',true),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)',true),
  ('request_intent_private.enqueue_staff_notices(timestamptz,text[])',true),
  ('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)',true),
  ('request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text)',false),
  ('request_intent_private.workflow_customer_notice(uuid,uuid)',false),
  ('request_intent_private.xri_referral_time(text)',false),
  ('request_intent_private.xri_referral_snapshot_valid(jsonb)',false),
  ('request_intent_private.xri_referral_negative(text,text,text,timestamptz)',false),
  ('request_intent_private.xri_referral_lock(text,text)',false),
  ('request_intent_private.xri_referral_authority_state()',false),
  ('request_intent_private.xri_referral_decide(text,jsonb)',false),
  ('request_intent_private.xri_referral_birth()',false),
  ('public.request_intent_create_or_replay(text,text,text,jsonb)',true),
  ('public.request_intent_create_with_context(text,text,text,jsonb,jsonb)',true),
  ('public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb)',true),
  ('request_intent_private.find_attempt(text,text)',true),
  ('request_intent_private.deny_mutation()',false),
  ('public.request_intent_fixture_mail_guard_status()',true)
 ) v(signature,service_execute) loop
  if exists(select 1 from pg_catalog.pg_proc p, lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where p.oid=pg_catalog.to_regprocedure(item.signature) and a.grantee=0 and a.privilege_type='EXECUTE')
    or pg_catalog.has_function_privilege('anon',pg_catalog.to_regprocedure(item.signature),'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',pg_catalog.to_regprocedure(item.signature),'EXECUTE')
    or pg_catalog.has_function_privilege('service_role',pg_catalog.to_regprocedure(item.signature),'EXECUTE') is distinct from item.service_execute then valid:=false;end if;
 end loop;
 for item in select * from (values
  ('public.research_notification_outbox','mail_disposition','text'),
  ('public.research_notification_outbox','fixture_control_id','uuid'),
  ('public.research_notification_outbox','fixture_request_id','uuid'),
  ('quote_delivery_private.qd_notification_intents','mail_disposition','text'),
  ('request_intent_private.requests','fixture_no_mail_control_id','uuid'),
  ('request_intent_private.workflow_settings','fixture_control_id','uuid')
 ) v(relation_name,column_name,type_name) loop
  if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(item.relation_name)
   and a.attname=item.column_name and not a.attisdropped and pg_catalog.format_type(a.atttypid,a.atttypmod)=item.type_name) then valid:=false;end if;
 end loop;
 -- Exact additional ABI inputs, not just an outer wrapper body hash.
 for item in select * from (values
  ('request_intent_private.create_or_replay(text,text,text,jsonb)',array['p_owner_hash','p_attempt_hash','p_fingerprint','p_detail']::text[],0),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)',array['p_owner_hash','p_attempt_hash','p_fingerprint','p_detail','p_context']::text[],0),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)',array['p_owner_hash','p_attempt_hash','p_fingerprint','p_detail','p_context','p_admission']::text[],0),
  ('request_intent_private.xri_referral_time(text)',array['p_text']::text[],0),
  ('request_intent_private.xri_referral_snapshot_valid(jsonb)',array['p_value']::text[],0),
  ('request_intent_private.xri_referral_negative(text,text,text,timestamptz)',array['p_state','p_reason','p_availability','p_at']::text[],0),
  ('request_intent_private.xri_referral_lock(text,text)',array['p_owner','p_attempt']::text[],0),
  ('request_intent_private.xri_referral_authority_state()',array[]::text[],0),
  ('request_intent_private.xri_referral_decide(text,jsonb)',array['p_owner','p_source']::text[],0),
  ('request_intent_private.xri_referral_birth()',array[]::text[],0),
  ('public.request_intent_create_or_replay(text,text,text,jsonb)',array['p_owner_hash','p_attempt_hash','p_fingerprint','p_detail']::text[],0),
  ('public.request_intent_create_with_context(text,text,text,jsonb,jsonb)',array['p_owner_hash','p_attempt_hash','p_fingerprint','p_detail','p_context']::text[],0),
  ('public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb)',array['p_owner_hash','p_attempt_hash','p_fingerprint','p_detail','p_context','p_admission']::text[],0),
  ('request_intent_private.find_attempt(text,text)',array['p_owner_hash','p_attempt_hash']::text[],0),
  ('request_intent_private.deny_mutation()',array[]::text[],0)
 ) v(signature,argument_names,default_count) loop
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(item.signature)
   and coalesce(p.proargnames,array[]::text[]) is not distinct from item.argument_names
   and p.pronargdefaults=item.default_count) then valid:=false;end if;
 end loop;
 if not exists(select 1 from pg_catalog.pg_attribute a
  where a.attrelid=pg_catalog.to_regclass('request_intent_private.requests') and a.attname='authoritative_referral_snapshot'
   and not a.attisdropped and a.atttypid='pg_catalog.jsonb'::pg_catalog.regtype and not a.attnotnull
   and a.attidentity='' and a.attgenerated='' and a.attacl is null
   and not exists(select 1 from pg_catalog.pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum))
  or not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=pg_catalog.to_regclass('request_intent_private.requests')
   and c.conname='request_authoritative_referral_snapshot_shape' and c.contype='c' and c.convalidated and not c.connoinherit
   and pg_catalog.pg_get_expr(c.conbin,c.conrelid)='request_intent_private.xri_referral_snapshot_valid(authoritative_referral_snapshot)') then
  valid:=false;
 end if;
 return pg_catalog.jsonb_build_object('protocol','request-intent/fixture-no-mail/v1','ready',valid);
end $$;

do $postflight$
declare actual text;
begin
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex') into actual
   from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
   where p.oid=pg_catalog.to_regprocedure('public.request_intent_fixture_mail_guard_status()')
    and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.prosecdef and l.lanname='plpgsql'
    and p.provolatile='s' and p.prokind='f' and not p.proretset and p.pronargs=0 and p.pronargdefaults=0
    and coalesce(p.proargnames,array[]::text[])=array[]::text[]
    and pg_catalog.pg_get_function_result(p.oid)='jsonb'
    and p.proconfig in (array['search_path=""']::text[],array['search_path=']::text[])
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE')
    and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    and pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
 if actual is distinct from 'b2e771c49d7ea877a125f616b2b5033ebe144c9917114ef6a7d4eb9f9cf010c0' then
  raise exception using errcode='55000',message='fixture_referral_pin_successor_drift';
 end if;
 if public.request_intent_fixture_mail_guard_status() is distinct from
   '{"protocol":"request-intent/fixture-no-mail/v1","ready":true}'::pg_catalog.jsonb then
  raise exception using errcode='55000',message='fixture_referral_pin_prerequisite_unavailable';
 end if;
end $postflight$;
commit;
