-- Disposable-database proof for the Care PR 1 role lifecycle.
-- Run after care-access-foundation.sql. The transaction always rolls back.

begin;

insert into auth.users (id)
values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.care_role_assignments (
  user_id,
  role,
  granted_by
)
values (
  '10000000-0000-0000-0000-000000000001',
  'care_patient',
  '10000000-0000-0000-0000-000000000002'
);

update public.care_role_assignments
set revoked_at = now()
where user_id = '10000000-0000-0000-0000-000000000001'
  and role = 'care_patient'
  and revoked_at is null;

-- A legitimate grant after revocation must create a new lifecycle row.
insert into public.care_role_assignments (
  user_id,
  role,
  granted_by
)
values (
  '10000000-0000-0000-0000-000000000001',
  'care_patient',
  '10000000-0000-0000-0000-000000000002'
);

do $$
declare
  active_count integer;
  lifecycle_count integer;
begin
  select count(*)
  into active_count
  from public.care_role_assignments
  where user_id = '10000000-0000-0000-0000-000000000001'
    and role = 'care_patient'
    and revoked_at is null;

  select count(*)
  into lifecycle_count
  from public.care_role_assignments
  where user_id = '10000000-0000-0000-0000-000000000001'
    and role = 'care_patient';

  if active_count <> 1 or lifecycle_count <> 2 then
    raise exception 'grant -> revoke -> re-grant lifecycle proof failed';
  end if;

  begin
    insert into public.care_role_assignments (
      user_id,
      role,
      granted_by
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'care_patient',
      '10000000-0000-0000-0000-000000000002'
    );
    raise exception 'a second simultaneous active grant was accepted';
  exception
    when unique_violation then
      null;
  end;
end;
$$;

insert into public.care_access_audit (
  actor_user_id,
  permission,
  outcome
)
values (
  '10000000-0000-0000-0000-000000000001',
  'care:security_audit',
  'allowed'
);

do $$
declare
  audit_id bigint;
begin
  select id
  into audit_id
  from public.care_access_audit
  where actor_user_id = '10000000-0000-0000-0000-000000000001'
    and permission = 'care:security_audit'
    and outcome = 'allowed'
  order by id desc
  limit 1;

  if audit_id is null then
    raise exception 'care access audit insert proof failed';
  end if;

  begin
    update public.care_access_audit
    set outcome = 'forbidden'
    where id = audit_id;
    raise exception 'care access audit update was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  begin
    delete from public.care_access_audit
    where id = audit_id;
    raise exception 'care access audit delete was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  if not exists (
    select 1
    from public.care_access_audit
    where id = audit_id
      and outcome = 'allowed'
  ) then
    raise exception 'care access audit append-only proof failed';
  end if;
end;
$$;

rollback;
