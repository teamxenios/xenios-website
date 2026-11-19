-- SOURCE CANDIDATE ONLY. No configuration, role, fixture or delivery activation.
-- Rev2 contract: one owner-published staging tuple, immutable birth/descendant
-- lineage, and native attempt fences. Historical sources/retention stay intact.
begin;
set local lock_timeout='5s';

do $preflight$
declare n text; ok boolean;
begin
 if current_user<>'postgres' then raise exception using errcode='42501',message='fixture_operator_only';end if;
 foreach n in array array[
  'request_intent_private.requests','request_intent_private.workflow_settings',
  'request_intent_private.workflow_staff_intents','request_intent_private.workflow_notice_intents',
  'request_intent_private.workflow_notice_receipts','request_intent_private.catalog_contact_admission',
  'request_intent_private.catalog_referral_admission','request_intent_private.optional_context',
  'request_intent_private.reported_referral_snapshots','public.research_notification_outbox',
  'public.research_notification_attempts','quote_delivery_private.qd_notification_intents',
  'quote_delivery_private.qd_directory','quote_delivery_private.qd_quotes'] loop
  if not exists(select 1 from pg_catalog.pg_class c where c.oid=pg_catalog.to_regclass(n) and c.relkind='r'
    and pg_catalog.pg_get_userbyid(c.relowner)='postgres'
    and not exists(select 1 from pg_catalog.pg_inherits h where h.inhrelid=c.oid or h.inhparent=c.oid)) then
   raise exception using errcode='55000',message='fixture_no_mail_prerequisites_missing';
  end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='request_intent_private.workflow_settings'::regclass
   and attname='fixture_control_id' and not attisdropped) then
  if pg_catalog.to_regprocedure('public.request_intent_fixture_mail_guard_status()') is null then
   raise exception using errcode='55000',message='fixture_no_mail_partial_installation';
  end if;
  execute 'select (public.request_intent_fixture_mail_guard_status()->>''ready'')::boolean' into ok;
  if ok is distinct from true then raise exception using errcode='55000',message='fixture_no_mail_drift_refused';end if;
 else
  if exists(select 1 from pg_catalog.pg_attribute a where not a.attisdropped and (
    (a.attrelid in ('public.research_notification_outbox'::regclass,'quote_delivery_private.qd_notification_intents'::regclass,
      'request_intent_private.workflow_staff_intents'::regclass,'request_intent_private.workflow_notice_intents'::regclass)
      and a.attname in ('mail_disposition','fixture_control_id','fixture_request_id'))
    or (a.attrelid='request_intent_private.requests'::regclass and a.attname in
      ('fixture_no_mail_control_id','fixture_no_mail_approval_sha256','fixture_no_mail_environment'))
    or (a.attrelid='request_intent_private.workflow_settings'::regclass and left(a.attname,length('fixture_'))='fixture_'))) then
   raise exception using errcode='55000',message='fixture_no_mail_partial_installation';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.create_or_replay(text,text,text,jsonb)') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='8af7c8fc530c6b0d0183ba6598f8aa22fff17d159c4b8835f91ba6fda4089bf1') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='e17caee8302a366e1329590ec43f976f2ddffdb257caafa6ec07d60fe1434e4f') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='240522a689dc4d322b2256ed2cdbe76c9da891dd7b17d7c7206fb99d083f06b4') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[])') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='6274ccd971a41123ef979b51ce780f1cb62bbffad19a4f295b4b401d33673192') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='c2b89a5ff80a7862b06b58da0e91cd2cbe757a822d8c5d243da45384e7e233e8') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.workflow_customer_notice(uuid,uuid)') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='197415e5775e0e4afc613988716fd09c8741521872216f15e56264537abda922') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('request_intent_private.customer_notice_receipt_evidence(uuid,uuid)') and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'UTF8')),'hex')='937884155515d1e6f5d68d268313d4d9760cb698ef275c38b6a5d1a09feecb9c') then raise exception using errcode='55000',message='fixture_canonical_definition_unreviewed';end if;
 end if;
end $preflight$;

alter table request_intent_private.workflow_settings
 add column if not exists fixture_control_id uuid,
 add column if not exists fixture_environment text,
 add column if not exists fixture_owner_hash text,
 add column if not exists fixture_attempt_hash text,
 add column if not exists fixture_fingerprint text,
 add column if not exists fixture_snapshot_sha256 text,
 add column if not exists fixture_approval_evidence_id text,
 add column if not exists fixture_approval_sha256 text,
 add column if not exists fixture_prepared_at timestamptz,
 add column if not exists fixture_authorized_until timestamptz,
 add column if not exists fixture_admission_owner text,
 add column if not exists fixture_admission_policy text,
 add column if not exists fixture_admission_expires_at timestamptz,
 add column if not exists fixture_referral_revision uuid,
 add column if not exists fixture_request_id uuid;
alter table request_intent_private.requests
 add column if not exists fixture_no_mail_control_id uuid,
 add column if not exists fixture_no_mail_approval_sha256 text,
 add column if not exists fixture_no_mail_environment text;
alter table public.research_notification_outbox
 add column if not exists mail_disposition text not null default 'ordinary',
 add column if not exists fixture_control_id uuid,
 add column if not exists fixture_request_id uuid;
alter table quote_delivery_private.qd_notification_intents
 add column if not exists mail_disposition text not null default 'ordinary',
 add column if not exists fixture_control_id uuid,
 add column if not exists fixture_request_id uuid;
alter table request_intent_private.workflow_staff_intents
 add column if not exists mail_disposition text not null default 'ordinary',
 add column if not exists fixture_control_id uuid;
alter table request_intent_private.workflow_notice_intents
 add column if not exists mail_disposition text not null default 'ordinary',
 add column if not exists fixture_control_id uuid;

create or replace function request_intent_private.fixture_locks(p_owner text,p_attempt text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_owner is null or p_attempt is null or p_owner !~ '^[a-f0-9]{64}$' or p_attempt !~ '^[a-f0-9]{64}$' then
  raise exception using errcode='22023',message='fixture_tuple_invalid';
 end if;
 -- L is ALREADY held by current context/referral writers. Never F then L.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner||':'||p_attempt,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('request-intent/fixture-no-mail/v1:'||p_owner||':'||p_attempt,0));
end $$;

create or replace function request_intent_private.fixture_snapshot_digest(p_snapshot jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
begin
 if pg_catalog.jsonb_typeof(p_snapshot) is distinct from 'object'
   or not (p_snapshot ?& array['lines','agreements'])
   or p_snapshot-array['lines','agreements']<>'{}'::jsonb
   or pg_catalog.jsonb_typeof(p_snapshot->'lines') is distinct from 'array'
   or pg_catalog.jsonb_typeof(p_snapshot->'agreements') is distinct from 'array' then
  raise exception using errcode='22023',message='fixture_snapshot_invalid';
 end if;
 return pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot::text,'UTF8')),'hex');
end $$;

-- Actual expiry/revision, never a UI or status TTL. This helper reads no text
-- values from the contact/referral record and changes none of them.
create or replace function request_intent_private.fixture_admission(p_key jsonb,p_revision uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare until_at timestamptz;
begin
 if pg_catalog.jsonb_typeof(p_key) is distinct from 'object'
   or not (p_key ?& array['ownerBinding','policyRevision'])
   or p_key-array['ownerBinding','policyRevision']<>'{}'::jsonb
   or pg_catalog.jsonb_typeof(p_key->'ownerBinding') is distinct from 'string'
   or pg_catalog.jsonb_typeof(p_key->'policyRevision') is distinct from 'string'
   or (p_key->>'ownerBinding') !~ '^[a-f0-9]{64}$'
   or (p_key->>'policyRevision') !~ '^[a-f0-9]{64}$' then
  raise exception using errcode='22023',message='fixture_admission_invalid';
 end if;
 select a.expires_at into until_at from request_intent_private.catalog_contact_admission a
 where a.owner_binding=p_key->>'ownerBinding' and a.policy_revision=p_key->>'policyRevision'
   and a.postal_address is not null and a.expires_at>pg_catalog.clock_timestamp() for share;
 if not found then raise exception using errcode='55000',message='fixture_admission_unavailable';end if;
 if p_revision is not null then
  if p_revision::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
   raise exception using errcode='22023',message='fixture_referral_revision_invalid';
  end if;
  perform 1 from request_intent_private.catalog_referral_admission r
   where r.owner_binding=p_key->>'ownerBinding' and r.policy_revision=p_key->>'policyRevision'
    and r.revision=p_revision and r.admission_expires_at=until_at for share;
  if not found then raise exception using errcode='55000',message='fixture_admission_unavailable';end if;
 end if;
 return until_at;
end $$;

create or replace function request_intent_private.fixture_prepare_metadata(
 p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_snapshot jsonb,
 p_admission_key jsonb,p_referral_revision uuid,p_prepare_not_after timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg request_intent_private.workflow_settings; observed timestamptz; expiry timestamptz; admitted timestamptz; digest text;
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='fixture_prepare_backend_only';
 end if;
 perform request_intent_private.fixture_locks(p_owner_hash,p_attempt_hash);
 if (public.request_intent_fixture_mail_guard_status()->>'ready')::boolean is distinct from true then
  raise exception using errcode='55000',message='fixture_guard_unavailable';
 end if;
 select * into cfg from request_intent_private.workflow_settings where singleton for share;
 if not found or cfg.environment is distinct from 'staging' or cfg.fixture_owner_hash=p_owner_hash
  or exists(select 1 from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash) then
  raise exception using errcode='55000',message='fixture_prepare_unavailable';
 end if;
 if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
  or p_prepare_not_after is null or not pg_catalog.isfinite(p_prepare_not_after)
  or p_prepare_not_after<=pg_catalog.clock_timestamp()
  or not request_intent_private.valid_lines(p_snapshot->'lines')
  or not request_intent_private.valid_agreements(p_snapshot->'agreements') then
  raise exception using errcode='22023',message='fixture_prepare_invalid';
 end if;
 digest:=request_intent_private.fixture_snapshot_digest(p_snapshot);
 admitted:=request_intent_private.fixture_admission(p_admission_key,p_referral_revision);
 observed:=pg_catalog.clock_timestamp();expiry:=least(p_prepare_not_after,admitted);
 if expiry<=observed then raise exception using errcode='55000',message='fixture_prepare_expired';end if;
 return pg_catalog.jsonb_build_object('protocol','request-intent/fixture-prepare/v1','snapshotSha256',digest,
  'issuedAt',to_char(observed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'expiresAt',to_char(expiry at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'admissionExpiresAt',to_char(admitted at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'admissionPolicyRevision',p_admission_key->>'policyRevision')
  || case when p_referral_revision is null then '{}'::jsonb else pg_catalog.jsonb_build_object('referralRevision',p_referral_revision) end;
end $$;
create or replace function public.request_intent_fixture_prepare_metadata(
 p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_snapshot jsonb,
 p_admission_key jsonb,p_referral_revision uuid,p_prepare_not_after timestamptz)
returns jsonb language sql security invoker set search_path='' as $$
 select request_intent_private.fixture_prepare_metadata(p_owner_hash,p_attempt_hash,p_fingerprint,p_snapshot,p_admission_key,p_referral_revision,p_prepare_not_after);
$$;

create or replace function request_intent_private.fixture_no_mail_publish(
 p_control_id uuid,p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_snapshot_sha256 text,
 p_approval_evidence_id text,p_approval_sha256 text,p_prepared_at timestamptz,p_authorized_until timestamptz,
 p_admission_key jsonb,p_admission_expires_at timestamptz,p_referral_revision uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare cfg request_intent_private.workflow_settings; actual_expiry timestamptz; expected jsonb; existing jsonb;
begin
 -- This is NOT a backend API command. It has no application EXECUTE grant.
 if current_user<>'postgres' then raise exception using errcode='42501',message='fixture_operator_only';end if;
 perform request_intent_private.fixture_locks(p_owner_hash,p_attempt_hash);
 if (public.request_intent_fixture_mail_guard_status()->>'ready')::boolean is distinct from true then
  raise exception using errcode='55000',message='fixture_guard_unavailable';
 end if;
 select * into strict cfg from request_intent_private.workflow_settings where singleton for update;
 expected:=pg_catalog.jsonb_build_array(p_control_id,'staging',p_owner_hash,p_attempt_hash,p_fingerprint,p_snapshot_sha256,
  p_approval_evidence_id,p_approval_sha256,p_prepared_at,p_authorized_until,p_admission_key,p_admission_expires_at,p_referral_revision);
 if cfg.fixture_control_id is not null then
  if request_intent_private.fixture_has_send_evidence(cfg.fixture_control_id) then
   raise exception using errcode='55000',message='fixture_prior_attempt_requires_reconciliation';
  end if;
  if cfg.fixture_request_id is not null and not exists(select 1 from request_intent_private.requests r
    where r.id=cfg.fixture_request_id and r.owner_hash=cfg.fixture_owner_hash and r.attempt_hash=cfg.fixture_attempt_hash
     and r.fingerprint=cfg.fixture_fingerprint and r.fixture_no_mail_control_id=cfg.fixture_control_id
     and r.fixture_no_mail_approval_sha256=cfg.fixture_approval_sha256) then
   raise exception using errcode='55000',message='fixture_consumed_request_unavailable';
  end if;
  existing:=pg_catalog.jsonb_build_array(cfg.fixture_control_id,cfg.fixture_environment,cfg.fixture_owner_hash,cfg.fixture_attempt_hash,
   cfg.fixture_fingerprint,cfg.fixture_snapshot_sha256,cfg.fixture_approval_evidence_id,cfg.fixture_approval_sha256,cfg.fixture_prepared_at,
   cfg.fixture_authorized_until,pg_catalog.jsonb_build_object('ownerBinding',cfg.fixture_admission_owner,'policyRevision',cfg.fixture_admission_policy),
   cfg.fixture_admission_expires_at,cfg.fixture_referral_revision);
  if existing is distinct from expected then raise exception using errcode='23505',message='fixture_control_immutable';end if;
  return pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(expected::text,'UTF8')),'hex');
 end if;
 if cfg.environment is distinct from 'staging' or p_control_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
  or p_snapshot_sha256 is null or p_snapshot_sha256 !~ '^[a-f0-9]{64}$'
  or p_approval_sha256 is null or p_approval_sha256 !~ '^[a-f0-9]{64}$'
  or p_approval_evidence_id is null or length(p_approval_evidence_id) not between 1 and 180
  or p_prepared_at is null or not pg_catalog.isfinite(p_prepared_at) or p_prepared_at>pg_catalog.clock_timestamp()
  or p_authorized_until is null or not pg_catalog.isfinite(p_authorized_until) or p_authorized_until<=pg_catalog.clock_timestamp()
  or p_authorized_until<=p_prepared_at or p_admission_expires_at is null
  or p_authorized_until>p_admission_expires_at then
  raise exception using errcode='22023',message='fixture_publication_invalid';
 end if;
 if exists(select 1 from request_intent_private.requests where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash) then
  raise exception using errcode='55000',message='fixture_existing_request_not_convertible';
 end if;
 actual_expiry:=request_intent_private.fixture_admission(p_admission_key,p_referral_revision);
 if actual_expiry is distinct from p_admission_expires_at then
  raise exception using errcode='55000',message='fixture_admission_changed';
 end if;
 update request_intent_private.workflow_settings set fixture_control_id=p_control_id,fixture_environment='staging',
  fixture_owner_hash=p_owner_hash,fixture_attempt_hash=p_attempt_hash,fixture_fingerprint=p_fingerprint,
  fixture_snapshot_sha256=p_snapshot_sha256,fixture_approval_evidence_id=p_approval_evidence_id,
  fixture_approval_sha256=p_approval_sha256,fixture_prepared_at=p_prepared_at,fixture_authorized_until=p_authorized_until,
  fixture_admission_owner=p_admission_key->>'ownerBinding',fixture_admission_policy=p_admission_key->>'policyRevision',
  fixture_admission_expires_at=p_admission_expires_at,fixture_referral_revision=p_referral_revision where singleton;
 return pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(expected::text,'UTF8')),'hex');
end $$;

create or replace function request_intent_private.fixture_assert_submission(p_owner text,p_attempt text,p_fingerprint text,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare cfg request_intent_private.workflow_settings; stored request_intent_private.requests; admitted timestamptz;
begin
 perform request_intent_private.fixture_locks(p_owner,p_attempt);
 select * into cfg from request_intent_private.workflow_settings where singleton for share;
 if cfg.fixture_control_id is null or cfg.fixture_owner_hash is distinct from p_owner or cfg.fixture_attempt_hash is distinct from p_attempt then return null;end if;
 if (public.request_intent_fixture_mail_guard_status()->>'ready')::boolean is distinct from true then
  raise exception using errcode='55000',message='fixture_guard_unavailable';
 end if;
 if cfg.fixture_environment is distinct from 'staging' or cfg.environment is distinct from cfg.fixture_environment
  or cfg.fixture_fingerprint is distinct from p_fingerprint then
  raise exception using errcode='23505',message='fixture_submission_conflict';
 end if;
 if cfg.fixture_request_id is not null then
  select * into stored from request_intent_private.requests where id=cfg.fixture_request_id
   and owner_hash=p_owner and attempt_hash=p_attempt;
  if not found or stored.fingerprint is distinct from p_fingerprint
   or stored.fixture_no_mail_control_id is distinct from cfg.fixture_control_id
   or stored.fixture_no_mail_approval_sha256 is distinct from cfg.fixture_approval_sha256
   or stored.fixture_no_mail_environment is distinct from cfg.fixture_environment then
   raise exception using errcode='55000',message='fixture_consumed_request_unavailable';
  end if;
  return cfg.fixture_control_id; -- exact committed replay, never a renewed admission
 end if;
 if cfg.fixture_authorized_until<=pg_catalog.clock_timestamp()
  or cfg.fixture_snapshot_sha256 is distinct from request_intent_private.fixture_snapshot_digest(p_snapshot) then
  raise exception using errcode='55000',message='fixture_submission_not_authorized';
 end if;
 admitted:=request_intent_private.fixture_admission(pg_catalog.jsonb_build_object('ownerBinding',cfg.fixture_admission_owner,'policyRevision',cfg.fixture_admission_policy),cfg.fixture_referral_revision);
 if admitted is distinct from cfg.fixture_admission_expires_at then raise exception using errcode='55000',message='fixture_admission_changed';end if;
 return cfg.fixture_control_id;
end $$;

create or replace function request_intent_private.fixture_birth()
returns trigger language plpgsql security definer set search_path='' as $$
declare control uuid; cfg request_intent_private.workflow_settings;
begin
 if new.fixture_no_mail_control_id is not null or new.fixture_no_mail_approval_sha256 is not null or new.fixture_no_mail_environment is not null then
  raise exception using errcode='42501',message='fixture_classification_not_input';
 end if;
 control:=request_intent_private.fixture_assert_submission(new.owner_hash,new.attempt_hash,new.fingerprint,
  pg_catalog.jsonb_build_object('lines',new.lines,'agreements',new.agreements));
 if control is not null then
  select * into strict cfg from request_intent_private.workflow_settings where singleton;
  new.fixture_no_mail_control_id:=control;new.fixture_no_mail_approval_sha256:=cfg.fixture_approval_sha256;new.fixture_no_mail_environment:=cfg.fixture_environment;
 end if;
 return new;
end $$;
create or replace function request_intent_private.fixture_consume()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.fixture_no_mail_control_id is not null then
  update request_intent_private.workflow_settings set fixture_request_id=new.id where singleton
   and fixture_control_id=new.fixture_no_mail_control_id and (fixture_request_id is null or fixture_request_id=new.id);
  if not found then raise exception using errcode='55000',message='fixture_control_conflict';end if;
 end if;
 return new;
end $$;
create or replace function request_intent_private.fixture_control_pin()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.fixture_control_id is not null then
   raise exception using errcode='42501',message='fixture_control_immutable';
  end if;
  return old;
 end if;
 if old.fixture_control_id is not null then
  if row(old.fixture_control_id,old.fixture_environment,old.fixture_owner_hash,old.fixture_attempt_hash,old.fixture_fingerprint,old.fixture_snapshot_sha256,old.fixture_approval_evidence_id,old.fixture_approval_sha256,old.fixture_prepared_at,old.fixture_authorized_until,old.fixture_admission_owner,old.fixture_admission_policy,old.fixture_admission_expires_at,old.fixture_referral_revision)
    is distinct from row(new.fixture_control_id,new.fixture_environment,new.fixture_owner_hash,new.fixture_attempt_hash,new.fixture_fingerprint,new.fixture_snapshot_sha256,new.fixture_approval_evidence_id,new.fixture_approval_sha256,new.fixture_prepared_at,new.fixture_authorized_until,new.fixture_admission_owner,new.fixture_admission_policy,new.fixture_admission_expires_at,new.fixture_referral_revision) then
   raise exception using errcode='42501',message='fixture_control_immutable';
  end if;
  if old.fixture_request_id is not null and new.fixture_request_id is distinct from old.fixture_request_id then
   raise exception using errcode='42501',message='fixture_control_immutable';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists request_fixture_birth on request_intent_private.requests;
create trigger request_fixture_birth before insert on request_intent_private.requests for each row execute function request_intent_private.fixture_birth();
drop trigger if exists request_fixture_consume on request_intent_private.requests;
create trigger request_fixture_consume after insert on request_intent_private.requests for each row execute function request_intent_private.fixture_consume();
drop trigger if exists fixture_control_pin on request_intent_private.workflow_settings;
create trigger fixture_control_pin before update or delete on request_intent_private.workflow_settings for each row execute function request_intent_private.fixture_control_pin();

create or replace function request_intent_private.fixture_request_lineage(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r request_intent_private.requests;
begin
 select * into r from request_intent_private.requests where id=p_id;
 if not found then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
 if r.fixture_no_mail_control_id is null then
  return pg_catalog.jsonb_build_object('disposition','ordinary','requestId',r.id);
 end if;
 if r.fixture_no_mail_environment is distinct from 'staging' or r.fixture_no_mail_approval_sha256 !~ '^[a-f0-9]{64}$' then
  return '{"disposition":"unavailable_binding"}'::jsonb;
 end if;
 return pg_catalog.jsonb_build_object('disposition','fixture_no_mail','requestId',r.id,'controlId',r.fixture_no_mail_control_id);
end $$;

create or replace function request_intent_private.fixture_job_lineage(p_key text,p_type text,p_template text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare rid uuid; eid uuid; i request_intent_private.workflow_notice_intents;
 source public.research_notification_outbox; q quote_delivery_private.qd_notification_intents;
begin
 if p_template='admin_email_failure' then
  if p_type<>'notification_failed_admin' or p_key !~ '^email-failure:[a-f0-9-]{36}:[0-9]+:' then
   return '{"disposition":"unavailable_binding"}'::jsonb;
  end if;
  select * into source from public.research_notification_outbox where id=pg_catalog.split_part(p_key,':',2)::uuid;
  if not found or source.template_key='admin_email_failure' then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
  if source.mail_disposition='fixture_no_mail' then
   return pg_catalog.jsonb_build_object('disposition','fixture_no_mail','requestId',source.fixture_request_id,'controlId',source.fixture_control_id);
  end if;
  return request_intent_private.fixture_job_lineage(source.event_key,source.event_type,source.template_key,source.payload);
 end if;
 if p_template in ('ea_request_submitted_staff_v1','ea_request_submitted_staff_full_v1') then
  if p_type is distinct from p_template or p_key !~ '^ea-request-submitted-[a-f0-9-]{36}$' then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
  rid:=pg_catalog.substr(p_key,length('ea-request-submitted-')+1)::uuid;
  if p_payload->>'reference' is distinct from 'XRI-'||upper(replace(rid::text,'-','')) then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
  return request_intent_private.fixture_request_lineage(rid);
 end if;
 if p_template in ('ea_request_received_queued_customer_v1','ea_request_reviewing_customer_v1') then
  if p_type is distinct from p_template or p_key !~ '^ea-request-customer-[a-f0-9-]{36}$' then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
  eid:=pg_catalog.substr(p_key,length('ea-request-customer-')+1)::uuid;
  select * into i from request_intent_private.workflow_notice_intents where event_id=eid;
  if not found or p_payload->>'kind' is distinct from i.kind or p_payload->>'environment' is distinct from i.environment
   or p_payload->>'revision' is distinct from i.revision::text
   or p_template is distinct from case i.kind when 'request_received_queued' then 'ea_request_received_queued_customer_v1' when 'request_reviewing' then 'ea_request_reviewing_customer_v1' end then
   return '{"disposition":"unavailable_binding"}'::jsonb;
  end if;
  if i.mail_disposition='fixture_no_mail' then return pg_catalog.jsonb_build_object('disposition','fixture_no_mail','requestId',i.request_id,'controlId',i.fixture_control_id);end if;
  return request_intent_private.fixture_request_lineage(i.request_id);
 end if;
 if p_template='ea_private_quote_notice_v1' then
  if p_type is distinct from p_template or p_key !~ '^qd-[a-f0-9]{64}$'
   or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object'
   or not (p_payload ?& array['tenant','xriId','quoteId'])
   or p_payload-array['tenant','xriId','quoteId']<>'{}'::jsonb then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
  select * into q from quote_delivery_private.qd_notification_intents
   where tenant=p_payload->>'tenant' and id=p_payload->>'quoteId' and xri_id=p_payload->>'xriId';
  if not found or not exists(select 1 from quote_delivery_private.qd_directory d
   join quote_delivery_private.qd_quotes v on v.tenant=d.tenant and v.target_id=d.target_id and v.xri_id=d.xri_id
   where d.tenant=q.tenant and d.xri_id=q.xri_id and v.id=q.id) then return '{"disposition":"unavailable_binding"}'::jsonb;end if;
  if q.mail_disposition='fixture_no_mail' then return pg_catalog.jsonb_build_object('disposition','fixture_no_mail','requestId',q.fixture_request_id,'controlId',q.fixture_control_id);end if;
  if q.xri_id !~ '^[a-f0-9-]{36}$' then return '{"disposition":"ordinary"}'::jsonb;end if;
  return request_intent_private.fixture_request_lineage(q.xri_id::uuid);
 end if;
 return '{"disposition":"ordinary"}'::jsonb;
exception when invalid_text_representation then return '{"disposition":"unavailable_binding"}'::jsonb;
end $$;

create or replace function request_intent_private.fixture_workflow_lineage()
returns trigger language plpgsql security definer set search_path='' as $$
declare facts jsonb;
begin
 if tg_op='UPDATE' and old.mail_disposition='fixture_no_mail' then
  -- Includes attempt_digest: an excluded notice cannot be bound for sending.
  if pg_catalog.to_jsonb(new) is distinct from pg_catalog.to_jsonb(old) then return null;end if;
  return new;
 end if;
 facts:=request_intent_private.fixture_request_lineage(new.request_id);
 if facts->>'disposition'='fixture_no_mail' then
  new.mail_disposition:='fixture_no_mail';new.fixture_control_id:=(facts->>'controlId')::uuid;
 elsif facts->>'disposition'='ordinary' then
  if new.mail_disposition<>'ordinary' or new.fixture_control_id is not null then
   raise exception using errcode='42501',message='fixture_lineage_not_input';
  end if;
 else raise exception using errcode='55000',message='fixture_lineage_unavailable';end if;
 return new;
end $$;

create or replace function request_intent_private.fixture_outbox_fence()
returns trigger language plpgsql security definer set search_path='' as $$
declare facts jsonb; disposition text; ignored text[]:=array['mail_disposition','fixture_control_id','fixture_request_id'];
begin
 if tg_op='UPDATE' and old.mail_disposition='fixture_no_mail' then
  if new.mail_disposition is distinct from old.mail_disposition or new.fixture_control_id is distinct from old.fixture_control_id
   or new.fixture_request_id is distinct from old.fixture_request_id then
   raise exception using errcode='42501',message='fixture_lineage_immutable';
  end if;
  -- Old worker claim.single(), stale/completion select(id) and retry all see
  -- NO mutated row. In particular the ledger INSERT must not run later.
  if pg_catalog.to_jsonb(new)-ignored is distinct from pg_catalog.to_jsonb(old)-ignored then return null;end if;
  return new;
 end if;
 facts:=request_intent_private.fixture_job_lineage(new.event_key,new.event_type,new.template_key,new.payload);
 disposition:=facts->>'disposition';
 if disposition='fixture_no_mail' then
  if tg_op='UPDATE' and pg_catalog.to_jsonb(new)-ignored is distinct from pg_catalog.to_jsonb(old)-ignored then return null;end if;
  if tg_op='INSERT' and (new.status<>'pending' or new.attempt_count<>0 or new.last_attempt_at is not null
    or new.provider_message_id is not null or new.completed_at is not null) then return null;end if;
  new.mail_disposition:='fixture_no_mail';new.fixture_control_id:=(facts->>'controlId')::uuid;new.fixture_request_id:=(facts->>'requestId')::uuid;
 elsif disposition='ordinary' then
  if new.mail_disposition<>'ordinary' or new.fixture_control_id is not null or new.fixture_request_id is not null then
   raise exception using errcode='42501',message='fixture_lineage_not_input';
  end if;
 else return null;end if;
 return new;
end $$;

create or replace function request_intent_private.fixture_attempt_fence()
returns trigger language plpgsql security definer set search_path='' as $$
declare source public.research_notification_outbox; facts jsonb;
begin
 select * into source from public.research_notification_outbox where id=new.outbox_id;
 if not found then return new;end if; -- retain the real foreign-key refusal
 if source.mail_disposition='fixture_no_mail' then return null;end if;
 facts:=request_intent_private.fixture_job_lineage(source.event_key,source.event_type,source.template_key,source.payload);
 if facts->>'disposition' is distinct from 'ordinary' then return null;end if;
 return new;
end $$;

create or replace function request_intent_private.fixture_quote_fence()
returns trigger language plpgsql security definer set search_path='' as $$
declare facts jsonb; ignored text[]:=array['mail_disposition','fixture_control_id','fixture_request_id'];
begin
 if tg_op='UPDATE' and old.mail_disposition='fixture_no_mail' then
  if new.mail_disposition is distinct from old.mail_disposition or new.fixture_control_id is distinct from old.fixture_control_id
   or new.fixture_request_id is distinct from old.fixture_request_id then
   raise exception using errcode='42501',message='fixture_lineage_immutable';
  end if;
  -- desk.dispatch is EXPORTED: its direct queued->attempting UPDATE must fail
  -- before COMMIT/transport even when no shared outbox worker is involved.
  if pg_catalog.to_jsonb(new)-ignored is distinct from pg_catalog.to_jsonb(old)-ignored then return null;end if;
  return new;
 end if;
 if new.xri_id ~ '^[a-f0-9-]{36}$' then facts:=request_intent_private.fixture_request_lineage(new.xri_id::uuid);
 else facts:='{"disposition":"ordinary"}'::jsonb;end if;
 if facts->>'disposition'='fixture_no_mail' then
  if tg_op='INSERT' and (new.state<>'queued' or new.provider_id is not null) then return null;end if;
  if tg_op='UPDATE' and pg_catalog.to_jsonb(new)-ignored is distinct from pg_catalog.to_jsonb(old)-ignored then return null;end if;
  new.mail_disposition:='fixture_no_mail';new.fixture_control_id:=(facts->>'controlId')::uuid;new.fixture_request_id:=(facts->>'requestId')::uuid;
 elsif facts->>'disposition'='ordinary' then
  if new.mail_disposition<>'ordinary' or new.fixture_control_id is not null or new.fixture_request_id is not null then
   raise exception using errcode='42501',message='fixture_lineage_not_input';
  end if;
 else return null;end if;
 return new;
end $$;

drop trigger if exists fixture_workflow_lineage on request_intent_private.workflow_staff_intents;
create trigger fixture_workflow_lineage before insert or update on request_intent_private.workflow_staff_intents for each row execute function request_intent_private.fixture_workflow_lineage();
drop trigger if exists fixture_workflow_lineage on request_intent_private.workflow_notice_intents;
create trigger fixture_workflow_lineage before insert or update on request_intent_private.workflow_notice_intents for each row execute function request_intent_private.fixture_workflow_lineage();
drop trigger if exists fixture_outbox_fence on public.research_notification_outbox;
create trigger fixture_outbox_fence before insert or update on public.research_notification_outbox for each row execute function request_intent_private.fixture_outbox_fence();
drop trigger if exists fixture_attempt_fence on public.research_notification_attempts;
create trigger fixture_attempt_fence before insert on public.research_notification_attempts for each row execute function request_intent_private.fixture_attempt_fence();
drop trigger if exists fixture_quote_fence on quote_delivery_private.qd_notification_intents;
create trigger fixture_quote_fence before insert or update on quote_delivery_private.qd_notification_intents for each row execute function request_intent_private.fixture_quote_fence();

create or replace function public.request_intent_fixture_mail_disposition(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
begin
 if pg_catalog.current_setting('role',true) is distinct from 'service_role' or auth.uid() is not null then
  raise exception using errcode='42501',message='fixture_backend_only';
 end if;
 return request_intent_private.fixture_request_lineage(p_request_id)->>'disposition';
end $$;

create or replace function request_intent_private.fixture_has_send_evidence(p_control uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.research_notification_outbox o where o.fixture_control_id=p_control
  and (o.status in ('processing','sent','delivered') or o.attempt_count<>0 or o.last_attempt_at is not null
   or o.provider_message_id is not null or exists(select 1 from public.research_notification_attempts a where a.outbox_id=o.id)))
 or exists(select 1 from quote_delivery_private.qd_notification_intents q where q.fixture_control_id=p_control
  and (q.state not in ('queued','suppressed') or q.provider_id is not null));
$$;

-- Exact canonical successor bodies, amended only at the named control seams.


create or replace function request_intent_private.create_or_replay(
  p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored request_intent_private.requests; request_id uuid;
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='request_intent_backend_required';
  end if;
  if not request_intent_private.only_keys(p_detail,array[
    'kind','requestId','publicReference','status','createdAt','contact','agreements','lines'
  ]) or p_detail->>'kind' is distinct from 'unapproved_selection_request'
    or p_detail->>'status' is distinct from 'pending_review' then
    raise exception using errcode='22023',message='request_intent_invalid';
  end if;
  perform request_intent_private.fixture_assert_submission(p_owner_hash,p_attempt_hash,p_fingerprint,
    pg_catalog.jsonb_build_object('lines',p_detail->'lines','agreements',p_detail->'agreements'));
  request_id := (p_detail->>'requestId')::uuid;
  insert into request_intent_private.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,contact,agreements,lines)
    values(request_id,'XRI-'||upper(replace(request_id::text,'-','')),p_owner_hash,p_attempt_hash,p_fingerprint,
      p_detail->'contact',p_detail->'agreements',p_detail->'lines')
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
  -- Serialize v2 retries even if the caller deliberately reuses the proposed request UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash || ':' || p_attempt_hash,0));
  perform request_intent_private.fixture_assert_submission(p_owner_hash,p_attempt_hash,p_fingerprint,
    pg_catalog.jsonb_build_object('lines',p_detail->'lines','agreements',p_detail->'agreements'));
  prior:=request_intent_private.find_attempt(p_owner_hash,p_attempt_hash);
  result:=request_intent_private.create_or_replay(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail);
  -- Existing request replay never resurrects optional data after privacy erasure.
  if prior is null and (result->'receipt'->>'requestId')::uuid = (p_detail->>'requestId')::uuid then
    insert into request_intent_private.optional_context(request_id,goal,referral_code)
    values((p_detail->>'requestId')::uuid,p_context->>'goal',p_context->>'referralCode')
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
   'kind','requestId','publicReference','status','createdAt','contact','agreements','lines'])
   or p_detail->>'kind' is distinct from 'unapproved_selection_request'
   or p_detail->>'status' is distinct from 'pending_review' then raise exception using errcode='22023',message='request_intent_invalid';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash||':'||p_attempt_hash,0));
 perform request_intent_private.fixture_assert_submission(p_owner_hash,p_attempt_hash,p_fingerprint,
  pg_catalog.jsonb_build_object('lines',p_detail->'lines','agreements',p_detail->'agreements'));
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

create or replace function request_intent_private.enqueue_staff_notices(p_since timestamptz, p_recipients text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  enqueued integer;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'staff_notice_backend_only';
  end if;
  if p_since is null or not isfinite(p_since) or cardinality(p_recipients) is distinct from 2
    or p_recipients[1] is null or p_recipients[2] is null or p_recipients[1] = p_recipients[2]
    or exists (
      select 1 from unnest(p_recipients) as address
      where length(address) > 254 or address !~ '^[a-z0-9._+%-]+@[a-z0-9-]+([.][a-z0-9-]+)+$'
    ) then
    raise exception using errcode = '22023', message = 'invalid_staff_notice_configuration';
  end if;

  insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload)
  select 'ea-request-submitted-' || r.id::text, 'ea_request_submitted_staff_v1',
    'ea_request_submitted_staff_v1', p_recipients[1],
    jsonb_build_object(
      'reference', r.public_reference,
      'submittedAt', r.created_at,
      'itemCount', jsonb_array_length(r.lines),
      'recipients', to_jsonb(p_recipients)
    )
  from request_intent_private.requests r
  where r.fixture_no_mail_control_id is null and r.created_at >= p_since
    and not exists (
      select 1 from public.research_notification_outbox o
      where o.event_key = 'ea-request-submitted-' || r.id::text
    )
  order by r.created_at, r.id
  limit 100
  for key share of r
  on conflict (event_key) do nothing;
  get diagnostics enqueued = row_count;
  return enqueued;
end;
$$;

create or replace function request_intent_private.enqueue_staff_notices(
  p_since timestamptz, p_recipients text[], p_detail_since timestamptz
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  enqueued integer;
begin
  if current_setting('role', true) is distinct from 'service_role' or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'staff_notice_backend_only';
  end if;
  if p_since is null or not isfinite(p_since)
    or p_detail_since is null or not isfinite(p_detail_since)
    or cardinality(p_recipients) is distinct from 2
    or p_recipients[1] is null or p_recipients[2] is null or p_recipients[1] = p_recipients[2]
    or exists (
      select 1 from unnest(p_recipients) as address
      where length(address) > 254 or address !~ '^[a-z0-9._+%-]+@[a-z0-9-]+([.][a-z0-9-]+)+$'
    ) then
    raise exception using errcode = '22023', message = 'invalid_staff_notice_configuration';
  end if;

  insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload)
  select 'ea-request-submitted-' || r.id::text, chosen.template, chosen.template, p_recipients[1],
    jsonb_build_object(
      'reference', r.public_reference,
      'submittedAt', r.created_at,
      'itemCount', jsonb_array_length(r.lines),
      'recipients', to_jsonb(p_recipients)
    )
  from request_intent_private.requests r
  cross join lateral (select case when r.created_at >= p_detail_since
    then 'ea_request_submitted_staff_full_v1' else 'ea_request_submitted_staff_v1' end as template) chosen
  where r.fixture_no_mail_control_id is null and r.created_at >= p_since
    and not exists (
      select 1 from public.research_notification_outbox o
      where o.event_key = 'ea-request-submitted-' || r.id::text
    )
  order by r.created_at, r.id
  limit 100
  for key share of r
  on conflict (event_key) do nothing;
  get diagnostics enqueued = row_count;
  return enqueued;
end;
$$;

create or replace function request_intent_private.enqueue_workflow_notice(
  p_request_id uuid, p_event_id uuid, p_kind text, p_revision bigint, p_environment text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  stored request_intent_private.requests;
  existing request_intent_private.workflow_notice_intents;
  template text;
  event_kind text;
  happened_at timestamptz;
begin
  if p_request_id is null or p_event_id is null or p_kind is null or p_revision is null or p_revision < 0
    or p_environment is null or p_environment !~ '^[a-z][a-z0-9_-]{2,63}$' then
    raise exception using errcode = '22023', message = 'invalid_workflow_notice';
  end if;
  template := case p_kind
    when 'request_received_queued' then 'ea_request_received_queued_customer_v1'
    when 'request_reviewing' then 'ea_request_reviewing_customer_v1'
  end;
  event_kind := case p_kind
    when 'request_received_queued' then 'queued'
    when 'request_reviewing' then 'review_started'
  end;
  if template is null then
    raise exception using errcode = '22023', message = 'unsupported_workflow_notice_kind';
  end if;
  select * into stored from request_intent_private.requests where id = p_request_id;
  if not found then
    raise exception using errcode = '23503', message = 'workflow_notice_request_missing';
  end if;
  -- The notice belongs to one recorded event of this request, of the matching
  -- kind and revision. Its time is that event's time.
  select e.occurred_at into happened_at from request_intent_private.workflow_events e
  where e.id = p_event_id and e.request_id = p_request_id and e.revision = p_revision and e.kind = event_kind;
  if not found then
    raise exception using errcode = '22023', message = 'workflow_notice_event_unmatched';
  end if;

  insert into request_intent_private.workflow_notice_intents (event_id, request_id, kind, revision, environment)
  values (p_event_id, p_request_id, p_kind, p_revision, p_environment)
  -- Both unique indexes arbitrate a same-event race. A revision-only conflict
  -- is not a replay: the exact event and all its facts must still match below.
  on conflict do nothing;
  select * into existing from request_intent_private.workflow_notice_intents where event_id = p_event_id;
  -- This VOLATILE function takes a fresh lookup snapshot after the INSERT
  -- under READ COMMITTED. A missing or different event is never success.
  if not found or existing.request_id <> p_request_id or existing.kind <> p_kind
    or existing.revision <> p_revision or existing.environment <> p_environment then
    raise exception using errcode = '23505', message = 'workflow_notice_identity_conflict';
  end if;

  -- Logical intent/event identity is retained; fixture has no send job.
  if stored.fixture_no_mail_control_id is not null then return;end if;

  insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload)
  values ('ea-request-customer-' || p_event_id::text, template, template, 'customer:' || stored.public_reference,
    jsonb_build_object(
      'reference', stored.public_reference,
      'eventAt', happened_at,
      'kind', p_kind,
      'revision', p_revision,
      'environment', p_environment
    ))
  on conflict (event_key) do nothing;
end;
$$;

create or replace function request_intent_private.workflow_customer_notice(p_request_id uuid, p_event_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  job_id uuid;
  job_status text;
  job_error text;
  evidence text;
begin
  if p_request_id is null or p_event_id is null or not exists (
    select 1 from request_intent_private.workflow_notice_intents i
    where i.event_id = p_event_id and i.request_id = p_request_id
  ) then
    return 'unavailable';
  end if;
  -- Add only a truthful unattempted fixture branch to the CURRENT 194612
  -- projection. Its accepted/delivered/bounced/conflicting receipt path below
  -- is byte-preserved for ordinary jobs and real unexpected send evidence.
  if exists(select 1 from request_intent_private.workflow_notice_intents i
      where i.event_id=p_event_id and i.request_id=p_request_id and i.mail_disposition='fixture_no_mail')
    and not exists(select 1 from public.research_notification_outbox o
      where o.event_key='ea-request-customer-'||p_event_id::text
       and (o.status in ('processing','sent','delivered') or o.last_attempt_at is not null
         or o.attempt_count<>0 or o.provider_message_id is not null
         or exists(select 1 from public.research_notification_attempts a where a.outbox_id=o.id))) then
    return 'suppressed';
  end if;
  select o.id, o.status, o.last_error_summary into job_id, job_status, job_error
  from public.research_notification_outbox o
  where o.event_key = 'ea-request-customer-' || p_event_id::text;
  if not found then return 'unavailable'; end if;
  if job_status = 'delivered' then return 'delivered_to_server'; end if;
  if job_status = 'sent' then
    evidence := request_intent_private.customer_notice_receipt_evidence(p_request_id, p_event_id);
    if evidence = 'delivered' then return 'delivered_to_server'; end if;
    if evidence = 'bounced' then return 'failed'; end if;
    if evidence = 'conflicting' then return 'delivery_unknown'; end if;
    return 'provider_accepted';
  end if;
  if job_status in ('pending', 'processing', 'failed_retryable') then return 'pending'; end if;
  if job_status = 'cancelled' then return 'suppressed'; end if;
  -- A job that stopped after a send whose result was never confirmed may have
  -- been delivered. That is unknown, not failed.
  if exists (
    select 1 from public.research_notification_attempts a
    where a.outbox_id = job_id and a.outcome = 'failed'
      and (a.error_summary = 'Customer notice send had no confirmed result.'
        or a.error_summary like '%stale processing%')
  ) then
    return 'delivery_unknown';
  end if;
  if coalesce(job_error, '') like 'Not sent:%' then return 'suppressed'; end if;
  return 'failed';
end;
$$;

do $checks$
declare rel text; request_column text;
begin
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='request_intent_private.requests'::regclass and conname='fixture_request_marker') then
  alter table request_intent_private.requests add constraint fixture_request_marker check ((
   (fixture_no_mail_control_id is null and fixture_no_mail_approval_sha256 is null and fixture_no_mail_environment is null)
   or (fixture_no_mail_control_id is not null and fixture_no_mail_approval_sha256 ~ '^[a-f0-9]{64}$' and fixture_no_mail_environment='staging')) is true);
 end if;
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='request_intent_private.workflow_settings'::regclass and conname='fixture_control_shape') then
  alter table request_intent_private.workflow_settings add constraint fixture_control_shape check ((
   (fixture_control_id is null and fixture_environment is null and fixture_owner_hash is null and fixture_attempt_hash is null
    and fixture_fingerprint is null and fixture_snapshot_sha256 is null and fixture_approval_evidence_id is null
    and fixture_approval_sha256 is null and fixture_prepared_at is null and fixture_authorized_until is null
    and fixture_admission_owner is null and fixture_admission_policy is null and fixture_admission_expires_at is null
    and fixture_referral_revision is null and fixture_request_id is null)
   or (fixture_control_id is not null and fixture_environment='staging' and environment=fixture_environment
    and fixture_owner_hash ~ '^[a-f0-9]{64}$' and fixture_attempt_hash ~ '^[a-f0-9]{64}$'
    and fixture_fingerprint ~ '^[a-f0-9]{64}$' and fixture_snapshot_sha256 ~ '^[a-f0-9]{64}$'
    and length(fixture_approval_evidence_id) between 1 and 180 and fixture_approval_sha256 ~ '^[a-f0-9]{64}$'
    and isfinite(fixture_prepared_at) and isfinite(fixture_authorized_until) and fixture_authorized_until>fixture_prepared_at
    and fixture_admission_owner ~ '^[a-f0-9]{64}$' and fixture_admission_policy ~ '^[a-f0-9]{64}$'
    and isfinite(fixture_admission_expires_at) and fixture_authorized_until<=fixture_admission_expires_at)) is true);
 end if;
 foreach rel in array array['public.research_notification_outbox','quote_delivery_private.qd_notification_intents',
   'request_intent_private.workflow_staff_intents','request_intent_private.workflow_notice_intents'] loop
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid=pg_catalog.to_regclass(rel) and conname='fixture_mail_lineage') then
   request_column:=case when rel in ('public.research_notification_outbox','quote_delivery_private.qd_notification_intents') then 'fixture_request_id' else 'request_id' end;
   execute pg_catalog.format('alter table %s add constraint fixture_mail_lineage check (((mail_disposition=''ordinary'' and fixture_control_id is null%s) or (mail_disposition=''fixture_no_mail'' and fixture_control_id is not null and %I is not null)) is true)',
     rel,case when request_column='fixture_request_id' then ' and fixture_request_id is null' else '' end,request_column);
  end if;
 end loop;
end $checks$;
create index if not exists research_outbox_fixture_dispatchable_due on public.research_notification_outbox(status,next_attempt_at)
 where mail_disposition='ordinary';

-- This status is READ ONLY. It attests the actual named native guards and
-- pinned body bytes (LF/CRLF normalized ONLY), not a caller version string.
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
  ('quote_delivery_private.qd_notification_intents','fixture_quote_fence','request_intent_private.fixture_quote_fence()',23)
 ) v(relation_name,trigger_name,function_name,type_bits) loop
  if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=pg_catalog.to_regclass(item.relation_name)
    and t.tgname=item.trigger_name and not t.tgisinternal and t.tgenabled in ('O','A')
    and t.tgfoid=pg_catalog.to_regprocedure(item.function_name) and t.tgtype::int=item.type_bits) then valid:=false;end if;
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
  ('request_intent_private.fixture_job_lineage(text,text,text,jsonb)','8c7b27872b6a39ef771ebff0389c23c93f1611331dc29ec99a081861e3fab660',true,'plpgsql','v','jsonb'),
  ('request_intent_private.fixture_workflow_lineage()','685c8f267b37e4627d1f1279f56b05689dc68eaad76dfb874513126f79db417a',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_outbox_fence()','3de949c9c130c73462e932517738e008edeb9ba66fda6622b9ddc9fcb645ca18',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_attempt_fence()','9457b714f689972a200a4df5e4faa655cba408ac64e37e56c1cefdecce7f808d',true,'plpgsql','v','trigger'),
  ('request_intent_private.fixture_quote_fence()','58a7d87e45a8db322be900c42950591cc3806e9877d7ffdf0c74124a9f969863',true,'plpgsql','v','trigger'),
  ('public.request_intent_fixture_mail_disposition(uuid)','7bdac606b1ee1d51eac723e112b2884b61813f20d29f8f575bbe1090088665dc',true,'plpgsql','v','text'),
  ('request_intent_private.fixture_has_send_evidence(uuid)','3f3abcff1aac43607fe59539a6174662db8d8c87b4d1418e177472a856b40954',true,'sql','s','boolean'),
  ('request_intent_private.create_or_replay(text,text,text,jsonb)','58b4296388dce802f401d2fdc92768f57a53c62b8cd30965eddcaf5cdb70a903',true,'plpgsql','v','jsonb'),
  ('request_intent_private.create_with_context(text,text,text,jsonb,jsonb)','69a830fdb9234c3b7b153fdbca14f275b63c0ced7d3666d253cb198f45f2a246',true,'plpgsql','v','jsonb'),
  ('request_intent_private.create_with_referral(text,text,text,jsonb,jsonb,jsonb)','c0bdece4b965d389319fce6c59760e4fc3e767a3f7bfa528ac5fabc5ed984913',true,'plpgsql','v','jsonb'),
  ('request_intent_private.enqueue_staff_notices(timestamptz,text[])','f6a46969c33331c01c19b42d4fba12443054cc2f94848ff7012f5fddbb9aa8ca',true,'plpgsql','v','integer'),
  ('request_intent_private.enqueue_staff_notices(timestamptz,text[],timestamptz)','1b991c292f4f9e289a36c7ec8dbb362695b74055f2511498bd19d30f903be007',true,'plpgsql','v','integer'),
  ('request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text)','34db6b63b536810bb797907fd24694c1910bc9e4844ac680058ebb5f336f40e1',true,'plpgsql','v','void'),
  ('request_intent_private.workflow_customer_notice(uuid,uuid)','91840e12fd0b17721921895385765d5994bc28f38503c2491cfad95d058bfb86',true,'plpgsql','s','text')
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
 return pg_catalog.jsonb_build_object('protocol','request-intent/fixture-no-mail/v1','ready',valid);
end $$;

-- Close ONLY new function ACLs. Existing canonical command ABI/ACL stays as
-- installed. No PUBLIC/anon/authenticated publisher, role, policy or worker.
do $acl$
declare item record;
begin
 for item in select signature from (values
  ('request_intent_private.fixture_locks(text,text)'),
  ('request_intent_private.fixture_snapshot_digest(jsonb)'),
  ('request_intent_private.fixture_admission(jsonb,uuid)'),
  ('request_intent_private.fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)'),
  ('public.request_intent_fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz)'),
  ('request_intent_private.fixture_no_mail_publish(uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb,timestamptz,uuid)'),
  ('request_intent_private.fixture_assert_submission(text,text,text,jsonb)'),
  ('request_intent_private.fixture_birth()'),
  ('request_intent_private.fixture_consume()'),
  ('request_intent_private.fixture_control_pin()'),
  ('request_intent_private.fixture_request_lineage(uuid)'),
  ('request_intent_private.fixture_job_lineage(text,text,text,jsonb)'),
  ('request_intent_private.fixture_workflow_lineage()'),
  ('request_intent_private.fixture_outbox_fence()'),
  ('request_intent_private.fixture_attempt_fence()'),
  ('request_intent_private.fixture_quote_fence()'),
  ('public.request_intent_fixture_mail_disposition(uuid)'),
  ('request_intent_private.fixture_has_send_evidence(uuid)'),
  ('public.request_intent_fixture_mail_guard_status()')) v(signature) loop
  execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',item.signature);
 end loop;
end $acl$;
grant execute on function request_intent_private.fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz),
 public.request_intent_fixture_prepare_metadata(text,text,text,jsonb,jsonb,uuid,timestamptz),
 public.request_intent_fixture_mail_guard_status(),public.request_intent_fixture_mail_disposition(uuid) to service_role;
-- No application EXECUTE on fixture_no_mail_publish or trigger/digest helpers.
-- Unsupported new fields/triggers intentionally invalidate the old retention
-- graph/bindings. Do not repin that executor or activate its scheduler here.
do $qualification$
begin
 if (public.request_intent_fixture_mail_guard_status()->>'ready')::boolean is distinct from true then
  raise exception using errcode='55000',message='fixture_no_mail_installation_not_ready';
 end if;
end $qualification$;
commit;
