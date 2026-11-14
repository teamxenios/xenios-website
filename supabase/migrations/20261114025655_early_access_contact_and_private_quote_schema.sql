-- Additive production schema foundation: contact admission plus private quote tables.
-- Source: 7e5e507241025f7d9a8f61a3a641311a88b1ce97.
-- Requires the canonical request-intent schema and its service-role USAGE.
-- Quote runtime authorization and server configuration require separate review.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
BEGIN
  IF NOT has_schema_privilege('service_role', 'request_intent_private', 'USAGE')
     OR to_regclass('public.research_notification_outbox') IS NULL THEN
    RAISE EXCEPTION 'Canonical request intent and notification prerequisites missing';
  END IF;
END $preflight$;
-- Unregistered source candidate. Requires the existing request_intent_private schema;
-- applying this file cannot turn on the Early Access gate. No cron job is installed.
CREATE TABLE IF NOT EXISTS request_intent_private.catalog_contact_admission (
  owner_binding text not null check(owner_binding collate "C" ~ '^[a-f0-9]{64}$'),
  policy_revision text not null check(policy_revision collate "C" ~ '^[a-f0-9]{64}$'),
  full_legal_name text not null check(length(full_legal_name) between 1 and 200),
  email text not null check(length(email) between 3 and 254),
  expires_at timestamptz not null, primary key(owner_binding,policy_revision)
);
CREATE INDEX IF NOT EXISTS catalog_contact_expiry on request_intent_private.catalog_contact_admission(expires_at);
alter table request_intent_private.catalog_contact_admission enable row level security;
revoke all on table request_intent_private.catalog_contact_admission from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION request_intent_private.contact_admission_has(p_owner_binding text,p_policy_revision text)
returns boolean language plpgsql stable security definer set search_path='' as $f$
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='private_custody_required';end if;
 return exists(select 1 from request_intent_private.catalog_contact_admission where owner_binding=p_owner_binding and policy_revision=p_policy_revision and expires_at>statement_timestamp());
end $f$;

CREATE OR REPLACE FUNCTION request_intent_private.contact_admission_put(p_owner_binding text,p_policy_revision text,p_full_legal_name text,p_email text,p_ttl_seconds integer)
returns text language plpgsql security definer set search_path='' as $f$
declare row_ request_intent_private.catalog_contact_admission%rowtype;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='private_custody_required';end if;
 if p_owner_binding is null or p_owner_binding collate "C" !~ '^[a-f0-9]{64}$' or p_policy_revision is null or p_policy_revision collate "C" !~ '^[a-f0-9]{64}$'
    or p_ttl_seconds is null or p_ttl_seconds not between 60 and 86400 or p_full_legal_name is null or length(p_full_legal_name) not between 1 and 200
    or btrim(p_full_legal_name)<>p_full_legal_name or p_full_legal_name ~ '[[:cntrl:]]' or p_email is null or length(p_email)>254
    or p_email<>btrim(p_email) or p_email<>lower(p_email) or p_email ~ '[[:cntrl:]]' or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 then raise exception using errcode='22023',message='invalid_contact_admission';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_binding||':'||p_policy_revision,0));
 select * into row_ from request_intent_private.catalog_contact_admission where owner_binding=p_owner_binding and policy_revision=p_policy_revision for update;
 if found and row_.expires_at>clock_timestamp() then
   if row_.full_legal_name=p_full_legal_name and row_.email=p_email then return 'already_same';end if;
   return 'different_contact';
 end if;
 insert into request_intent_private.catalog_contact_admission values(p_owner_binding,p_policy_revision,p_full_legal_name,p_email,clock_timestamp()+pg_catalog.make_interval(secs=>p_ttl_seconds))
 on conflict(owner_binding,policy_revision) do update set full_legal_name=excluded.full_legal_name,email=excluded.email,expires_at=excluded.expires_at;
 return 'committed';
end $f$;

-- Optional owner-scheduled purge; no EXECUTE privilege for the service, customer roles or PUBLIC.
CREATE OR REPLACE FUNCTION request_intent_private.purge_expired_contact_admissions(p_limit integer)
returns integer language plpgsql security invoker set search_path='' as $f$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception using errcode='22023',message='invalid_batch_limit';end if;
 with expired as (select owner_binding,policy_revision from request_intent_private.catalog_contact_admission
  where expires_at <= clock_timestamp() order by expires_at limit p_limit for update skip locked)
 delete from request_intent_private.catalog_contact_admission a using expired e where a.owner_binding=e.owner_binding and a.policy_revision=e.policy_revision;
 get diagnostics n=row_count;return n;
end $f$;
CREATE OR REPLACE FUNCTION public.request_intent_catalog_contact_has(p_owner_binding text,p_policy_revision text)
returns boolean language sql stable security invoker set search_path='' as $f$
 select request_intent_private.contact_admission_has(p_owner_binding,p_policy_revision);
$f$;
CREATE OR REPLACE FUNCTION public.request_intent_catalog_contact_put(p_owner_binding text,p_policy_revision text,p_full_legal_name text,p_email text,p_ttl_seconds integer)
returns text language sql security invoker set search_path='' as $f$
 select request_intent_private.contact_admission_put(p_owner_binding,p_policy_revision,p_full_legal_name,p_email,p_ttl_seconds);
$f$;
revoke all on function request_intent_private.purge_expired_contact_admissions(integer),
 request_intent_private.contact_admission_has(text,text),request_intent_private.contact_admission_put(text,text,text,text,integer),
 public.request_intent_catalog_contact_has(text,text),public.request_intent_catalog_contact_put(text,text,text,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function request_intent_private.contact_admission_has(text,text),request_intent_private.contact_admission_put(text,text,text,text,integer),
 public.request_intent_catalog_contact_has(text,text),public.request_intent_catalog_contact_put(text,text,text,text,integer) to service_role;

CREATE SCHEMA IF NOT EXISTS quote_delivery_private;
SET LOCAL search_path = quote_delivery_private, pg_catalog;
-- Candidate DDL. Apply ONLY in the private schema documented in README; never public.
CREATE TABLE IF NOT EXISTS qd_quotes (
  tenant text NOT NULL, id text NOT NULL, target_id text NOT NULL, xri_id text NOT NULL, seller text NOT NULL,
  version integer NOT NULL CHECK(version>0), state text NOT NULL CHECK(state IN ('issued','superseded','accepted','withdrawn','declined','expired')),
  snapshot text NOT NULL, PRIMARY KEY(tenant,id), UNIQUE(tenant,target_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS qd_one_open ON qd_quotes(tenant,target_id) WHERE state='issued';
CREATE INDEX IF NOT EXISTS qd_xri_quotes ON qd_quotes(tenant,xri_id);
CREATE TABLE IF NOT EXISTS qd_attempts(tenant text NOT NULL, xri_id text NOT NULL, opkey text NOT NULL, fingerprint text NOT NULL, id text NOT NULL,
 PRIMARY KEY(tenant,xri_id,opkey), FOREIGN KEY(tenant,id) REFERENCES qd_quotes(tenant,id));
CREATE TABLE IF NOT EXISTS qd_notification_intents(tenant text NOT NULL,id text NOT NULL,xri_id text NOT NULL,
 contact_tag text NOT NULL, bindings_tag text NOT NULL, issuer text NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','attempting','uncertain','accepted','suppressed','delivered','bounced')),
 provider_id text, PRIMARY KEY(tenant,id), UNIQUE(provider_id), FOREIGN KEY(tenant,id) REFERENCES qd_quotes(tenant,id));
CREATE INDEX IF NOT EXISTS qd_pending ON qd_notification_intents(tenant,state);
CREATE TABLE IF NOT EXISTS qd_audits(id text PRIMARY KEY, tenant text NOT NULL, quote_id text NOT NULL, kind text NOT NULL, at_time text NOT NULL);
CREATE TABLE IF NOT EXISTS qd_events(eid text PRIMARY KEY, tenant text NOT NULL, provider_id text NOT NULL, kind text NOT NULL);
CREATE TABLE IF NOT EXISTS qd_directory(tenant text NOT NULL, target_id text NOT NULL, xri_id text NOT NULL, seller text NOT NULL,
 PRIMARY KEY(tenant,target_id),UNIQUE(tenant,xri_id,seller));
CREATE TABLE IF NOT EXISTS qd_replies(tenant text NOT NULL,quote_id text NOT NULL,evidence_id text NOT NULL UNIQUE,
 PRIMARY KEY(tenant,quote_id,evidence_id), FOREIGN KEY(tenant,quote_id) REFERENCES qd_quotes(tenant,id));
-- CANDIDATE ONLY. Run tables.sql + this file in ONE trusted install transaction,
-- under SET LOCAL search_path=quote_delivery_private,pg_catalog. No role is granted.
REVOKE ALL ON SCHEMA quote_delivery_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA quote_delivery_private FROM PUBLIC;
DO $guard$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qd_quotes','qd_attempts','qd_notification_intents','qd_audits','qd_events','qd_directory','qd_replies']
  LOOP
    EXECUTE format('ALTER TABLE quote_delivery_private.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE quote_delivery_private.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON quote_delivery_private.%I',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON quote_delivery_private.%I USING (tenant = pg_catalog.current_setting(''xenios.private_quote_tenant'',true)) WITH CHECK (tenant = pg_catalog.current_setting(''xenios.private_quote_tenant'',true))',t);
  END LOOP;
END $guard$;
CREATE OR REPLACE FUNCTION quote_delivery_private.qd_guard_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF OLD.state <> 'issued' OR NEW.state NOT IN('expired','withdrawn','superseded') OR
   (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
   RAISE EXCEPTION 'Immutable quote cannot be rewritten';
 END IF;
 RETURN NEW;
END $fn$;
CREATE OR REPLACE TRIGGER immutable_economic_snapshot BEFORE UPDATE ON quote_delivery_private.qd_quotes
 FOR EACH ROW EXECUTE FUNCTION quote_delivery_private.qd_guard_snapshot();
REVOKE ALL ON FUNCTION quote_delivery_private.qd_guard_snapshot() FROM PUBLIC;
CREATE TABLE IF NOT EXISTS qd_verified_receipts(tenant text NOT NULL,eid text NOT NULL,pid text NOT NULL,kind text NOT NULL CHECK(kind IN('accepted','delivered','bounced')),digest text NOT NULL,address_tag text NOT NULL,
disposition text NOT NULL CHECK(disposition IN('pending','applied','conflict')),received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,eid));
CREATE INDEX IF NOT EXISTS qd_receipt_pending ON qd_verified_receipts(tenant,pid,eid) WHERE disposition='pending';
ALTER TABLE qd_verified_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qd_verified_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON qd_verified_receipts;
CREATE POLICY tenant_isolation ON qd_verified_receipts USING(tenant=pg_catalog.current_setting('xenios.private_quote_tenant',true)) WITH CHECK(tenant=pg_catalog.current_setting('xenios.private_quote_tenant',true));
REVOKE ALL ON qd_verified_receipts FROM PUBLIC;

REVOKE ALL ON SCHEMA quote_delivery_private FROM anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA quote_delivery_private FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA quote_delivery_private FROM anon, authenticated, service_role;
COMMIT;
