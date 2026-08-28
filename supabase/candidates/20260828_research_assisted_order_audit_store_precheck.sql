-- UNAPPLIED candidate precheck. Read-only: it refuses a collision or a base
-- that cannot enforce the v1 assisted-order audit authority.

do $$
begin
  if to_regclass('public.research_assisted_order_requests') is null then
    raise exception 'assisted-order audit precheck: base request table is absent';
  end if;
  if not exists (
    select 1
      from pg_attribute
     where attrelid = 'public.research_assisted_order_requests'::regclass
       and attname = 'id'
       and atttypid = 'uuid'::regtype
       and attnotnull
       and not attisdropped
  ) then
    raise exception 'assisted-order audit precheck: request id is not a required uuid';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'assisted-order audit precheck: extensions.digest(bytea,text) is absent';
  end if;
  if to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception 'assisted-order audit precheck: required Supabase roles are absent';
  end if;
  if to_regclass('public.research_assisted_order_audit_events_v1') is not null
     or to_regprocedure('public.research_assisted_order_audit_authority()') is not null
     or to_regprocedure('public.research_assisted_order_audit_append(text,text,jsonb)') is not null then
    raise exception 'assisted-order audit precheck: candidate object collision';
  end if;
end;
$$;
