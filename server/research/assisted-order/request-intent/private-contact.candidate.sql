-- Unregistered source candidate. Requires the existing request_intent_private schema;
-- applying this file cannot turn on the Early Access gate. No cron job is installed.
begin;
create table request_intent_private.catalog_contact_admission (
  owner_binding text not null check(owner_binding collate "C" ~ '^[a-f0-9]{64}$'),
  policy_revision text not null check(policy_revision collate "C" ~ '^[a-f0-9]{64}$'),
  full_legal_name text not null check(length(full_legal_name) between 1 and 200),
  email text not null check(length(email) between 3 and 254),
  expires_at timestamptz not null, primary key(owner_binding,policy_revision)
);
create index catalog_contact_expiry on request_intent_private.catalog_contact_admission(expires_at);
alter table request_intent_private.catalog_contact_admission enable row level security;
revoke all on table request_intent_private.catalog_contact_admission from public,anon,authenticated,service_role;

create function request_intent_private.contact_admission_has(p_owner_binding text,p_policy_revision text)
returns boolean language plpgsql stable security definer set search_path='' as $f$
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception using errcode='42501',message='private_custody_required';end if;
 return exists(select 1 from request_intent_private.catalog_contact_admission where owner_binding=p_owner_binding and policy_revision=p_policy_revision and expires_at>statement_timestamp());
end $f$;

create function request_intent_private.contact_admission_put(p_owner_binding text,p_policy_revision text,p_full_legal_name text,p_email text,p_ttl_seconds integer)
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
create function request_intent_private.purge_expired_contact_admissions(p_limit integer)
returns integer language plpgsql security invoker set search_path='' as $f$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception using errcode='22023',message='invalid_batch_limit';end if;
 with expired as (select owner_binding,policy_revision from request_intent_private.catalog_contact_admission
  where expires_at <= clock_timestamp() order by expires_at limit p_limit for update skip locked)
 delete from request_intent_private.catalog_contact_admission a using expired e where a.owner_binding=e.owner_binding and a.policy_revision=e.policy_revision;
 get diagnostics n=row_count;return n;
end $f$;
create function public.request_intent_catalog_contact_has(p_owner_binding text,p_policy_revision text)
returns boolean language sql stable security invoker set search_path='' as $f$
 select request_intent_private.contact_admission_has(p_owner_binding,p_policy_revision);
$f$;
create function public.request_intent_catalog_contact_put(p_owner_binding text,p_policy_revision text,p_full_legal_name text,p_email text,p_ttl_seconds integer)
returns text language sql security invoker set search_path='' as $f$
 select request_intent_private.contact_admission_put(p_owner_binding,p_policy_revision,p_full_legal_name,p_email,p_ttl_seconds);
$f$;
revoke all on function request_intent_private.purge_expired_contact_admissions(integer),
 request_intent_private.contact_admission_has(text,text),request_intent_private.contact_admission_put(text,text,text,text,integer),
 public.request_intent_catalog_contact_has(text,text),public.request_intent_catalog_contact_put(text,text,text,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function request_intent_private.contact_admission_has(text,text),request_intent_private.contact_admission_put(text,text,text,text,integer),
 public.request_intent_catalog_contact_has(text,text),public.request_intent_catalog_contact_put(text,text,text,text,integer) to service_role;
commit;
