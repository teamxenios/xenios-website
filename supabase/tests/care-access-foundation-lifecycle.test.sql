-- Disposable-database proof for the Care PR 1 role lifecycle.
-- Run after care-access-foundation.sql. The transaction always rolls back.

begin;

insert into auth.users (id)
values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003')
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
  outcome,
  occurred_at
)
values (
  '10000000-0000-0000-0000-000000000001',
  'care:security_audit',
  'allowed',
  '2026-07-26 06:30:00+00'
);

do $$
declare
  audit_id bigint;
  original_permission text;
  original_outcome text;
  original_occurred_at timestamptz;
begin
  select id, permission, outcome, occurred_at
  into audit_id, original_permission, original_outcome, original_occurred_at
  from public.care_access_audit
  where actor_user_id = '10000000-0000-0000-0000-000000000001'
    and permission = 'care:security_audit'
    and outcome = 'allowed'
    and occurred_at = '2026-07-26 06:30:00+00'
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
    update public.care_access_audit
    set actor_user_id = '10000000-0000-0000-0000-000000000003'
    where id = audit_id;
    raise exception 'care access audit actor reassignment was accepted';
  exception
    when sqlstate '55000' then
      null;
  end;

  delete from auth.users
  where id = '10000000-0000-0000-0000-000000000001';

  if not exists (
    select 1
    from public.care_access_audit
    where id = audit_id
      and actor_user_id is null
      and permission is not distinct from original_permission
      and outcome is not distinct from original_outcome
      and occurred_at is not distinct from original_occurred_at
  ) then
    raise exception 'audited auth-user deletion did not redact actor';
  end if;

  begin
    update public.care_access_audit
    set actor_user_id = '10000000-0000-0000-0000-000000000003'
    where id = audit_id;
    raise exception 'care access audit actor restoration was accepted';
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
      and actor_user_id is null
      and permission = original_permission
      and outcome = 'allowed'
      and occurred_at = original_occurred_at
  ) then
    raise exception 'care access audit append-only proof failed';
  end if;
end;
$$;

rollback;

do $$
begin
  if exists (
    select 1
    from public.care_access_audit
    where permission = 'care:security_audit'
      and outcome = 'allowed'
      and occurred_at = '2026-07-26 06:30:00+00'
  ) then
    raise exception 'care access audit disposable row survived rollback';
  end if;

  if exists (
    select 1
    from public.care_role_assignments
    where user_id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003'
    )
  ) then
    raise exception 'care role disposable row survived rollback';
  end if;

  if exists (
    select 1
    from auth.users
    where id in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003'
    )
  ) then
    raise exception 'auth user disposable row survived rollback';
  end if;
end;
$$;
