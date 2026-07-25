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

rollback;
