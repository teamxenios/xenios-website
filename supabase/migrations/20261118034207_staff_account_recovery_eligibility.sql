-- Source-only, default-off staff recovery eligibility. No account, member,
-- capability, role assignment, Auth setting or Auth-table grant is created.
-- The application additionally requires its explicit feature/origin/budgets.
begin;
set local lock_timeout = '5s';

-- Preserve every installed permission constraint and prior approved value.
-- This audit purpose is not a permission in the Care authorization role map.
do $migration$
declare prior record; column_number smallint; checked integer := 0;
begin
  select attnum into strict column_number from pg_catalog.pg_attribute
    where attrelid='public.care_access_audit'::regclass and attname='permission' and not attisdropped;
  for prior in select conname, pg_catalog.pg_get_expr(conbin,conrelid) as expression
    from pg_catalog.pg_constraint
    where conrelid='public.care_access_audit'::regclass and contype='c'
      and convalidated and conkey=array[column_number] loop
    checked := checked + 1;
    if position(quote_literal('care:staff_recovery_request') in prior.expression)=0 then
      execute format('alter table public.care_access_audit drop constraint %I, add constraint %I check ((%s) or permission=%L)',
        prior.conname, prior.conname, prior.expression, 'care:staff_recovery_request');
    end if;
  end loop;
  if checked=0 then raise exception 'staff_recovery_audit_contract_missing'; end if;
end;
$migration$;

create schema if not exists research_auth_private;
revoke all on schema research_auth_private from public, anon, authenticated, service_role;
grant usage on schema research_auth_private to service_role;

-- service_role deliberately has no SELECT on auth.users. Only this definer
-- reads the indexed exact email, and its sole result is an audited boolean.
create or replace function research_auth_private.staff_recovery_request(p_email text)
returns boolean language plpgsql security definer set search_path='' as $$
declare eligible boolean := false;
begin
  if pg_catalog.current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501', message='staff_recovery_backend_only';
  end if;
  if p_email is not null and pg_catalog.length(p_email) between 3 and 254
    and p_email=pg_catalog.lower(pg_catalog.btrim(p_email))
    and p_email !~ '[[:space:][:cntrl:]]' then
    select pg_catalog.count(*)=1 and coalesce(pg_catalog.bool_and(
      u.email_confirmed_at is not null and u.email_confirmed_at <= pg_catalog.now()
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now())
      and exists (
        select 1 from public.care_role_assignments as staff
        where staff.user_id=u.id and staff.revoked_at is null and staff.granted_at <= pg_catalog.now()
          and staff.role in ('clinician','clinical_admin','request_intent_reader','request_intent_processor',
            'pharmacy_operations','lab_reviewer','clinical_support','care_security_admin')
      )
    ),false) into eligible
    from auth.users as u
    -- Existing idx_users_email / users_email_partial_key support this lookup.
    -- Do not lower/trim the indexed column or scan the admin user directory.
    where u.email=p_email and u.is_sso_user=false;
  end if;

  -- This unauthenticated requester is not the target Auth identity. No target
  -- id/address/hash, request payload or provider delivery claim is recorded.
  -- A failed audit insert aborts the RPC, so no recovery can be authorized.
  insert into public.care_access_audit(actor_user_id,permission,outcome,occurred_at)
  values (null,'care:staff_recovery_request',case when eligible then 'allowed' else 'forbidden' end,pg_catalog.now());
  return eligible;
end;
$$;

create or replace function public.research_staff_recovery_request(p_email text)
returns boolean language sql security invoker set search_path='' as $$
  select research_auth_private.staff_recovery_request(p_email);
$$;

revoke all on function research_auth_private.staff_recovery_request(text) from public,anon,authenticated,service_role;
revoke all on function public.research_staff_recovery_request(text) from public,anon,authenticated,service_role;
grant execute on function research_auth_private.staff_recovery_request(text) to service_role;
grant execute on function public.research_staff_recovery_request(text) to service_role;
comment on function public.research_staff_recovery_request(text) is
  'Service-only current staff eligibility and anonymous-request audit; not authentication, membership, authorization or proof of recovery delivery.';
commit;
