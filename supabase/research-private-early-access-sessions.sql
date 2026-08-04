-- Private Early Access durable cookie-session and one-time grant-nonce spine.
--
-- UNMOUNTED / UNAPPLIED. This additive migration creates no account, product,
-- price, order, payment, provider, notification, Care, or commercial authority.
-- A future adapter may register one authenticated grant nonce and atomically
-- exchange it for an opaque reusable session. No standalone session-minting
-- function exists. Database time alone determines every durable timestamp.
--
-- Raw nonces, cookie values, passwords, and key material are never stored. The
-- application supplies only independent lowercase SHA-256 HMAC digests.

begin;

do $preflight$
declare
  v_sessions regclass := pg_catalog.to_regclass('public.research_private_early_access_sessions');
  v_nonces regclass := pg_catalog.to_regclass('public.research_private_early_access_nonces');
  v_expected_functions regprocedure[] := array[
    pg_catalog.to_regprocedure('public.research_private_early_access_issue_nonce(text,uuid,text)'),
    pg_catalog.to_regprocedure('public.research_private_early_access_exchange_nonce(text,text,uuid,text)'),
    pg_catalog.to_regprocedure('public.research_private_early_access_session_active(text,uuid,text)'),
    pg_catalog.to_regprocedure('public.research_private_early_access_revoke_session(text,uuid,text)')
  ];
  v_existing_function_count integer;
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid in (v_sessions, v_nonces)
      and (c.relkind <> 'r' or c.relpersistence <> 'p')
  ) then
    raise exception 'research_private_early_access_sessions: tables must be ordinary persistent relations.';
  end if;

  select pg_catalog.count(*)::integer
    into v_existing_function_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'research_private_early_access_issue_nonce',
      'research_private_early_access_exchange_nonce',
      'research_private_early_access_session_active',
      'research_private_early_access_revoke_session'
    );

  if (v_sessions is null) <> (v_nonces is null) then
    raise exception
      'research_private_early_access_sessions: partial installation detected; both tables must be absent or present.';
  end if;

  if v_sessions is null then
    if v_existing_function_count <> 0
       or pg_catalog.to_regclass('public.research_private_early_access_sessions_owner_active_idx') is not null
       or pg_catalog.to_regclass('public.research_private_early_access_nonces_unconsumed_idx') is not null then
      raise exception
        'research_private_early_access_sessions: function/index-only partial installation detected.';
    end if;
  elsif v_existing_function_count <> 4
        or v_expected_functions[1] is null
        or v_expected_functions[2] is null
        or v_expected_functions[3] is null
        or v_expected_functions[4] is null then
    raise exception
      'research_private_early_access_sessions: incomplete or overloaded function installation detected.';
  end if;
end
$preflight$;

create table if not exists public.research_private_early_access_sessions (
  session_hash text primary key,
  owner_id uuid not null,
  access_role text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_private_early_access_sessions_hash_format
    check (session_hash ~ '^[a-f0-9]{64}$'),
  constraint research_private_early_access_sessions_role_exact
    check (access_role = 'private_early_access_member'),
  constraint research_private_early_access_sessions_expiry_exact
    check (expires_at = issued_at + interval '240 minutes'),
  constraint research_private_early_access_sessions_revocation_order
    check (revoked_at is null or revoked_at >= issued_at)
);

create table if not exists public.research_private_early_access_nonces (
  nonce_hash text primary key,
  owner_id uuid not null,
  access_role text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  exchanged_session_hash text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_private_early_access_nonces_exchange_fk
    foreign key (exchanged_session_hash)
    references public.research_private_early_access_sessions(session_hash)
    on update restrict on delete restrict,
  constraint research_private_early_access_nonces_exchange_unique
    unique (exchanged_session_hash),
  constraint research_private_early_access_nonces_hash_format
    check (nonce_hash ~ '^[a-f0-9]{64}$'),
  constraint research_private_early_access_nonces_exchange_hash_format
    check (exchanged_session_hash is null or exchanged_session_hash ~ '^[a-f0-9]{64}$'),
  constraint research_private_early_access_nonces_role_exact
    check (access_role = 'private_early_access_member'),
  constraint research_private_early_access_nonces_expiry_exact
    check (expires_at = issued_at + interval '5 minutes'),
  constraint research_private_early_access_nonces_exchange_state
    check ((consumed_at is null) = (exchanged_session_hash is null)),
  constraint research_private_early_access_nonces_consumption_order
    check (consumed_at is null or (consumed_at >= issued_at and consumed_at < expires_at))
);

-- A same-named manual object with the wrong columns/types/constraints is not
-- silently repaired. Exact shape is checked on both first and repeated apply.
do $shape_guard$
declare
  v_session_shape text[];
  v_nonce_shape text[];
  v_session_constraints text[];
  v_nonce_constraints text[];
begin
  select pg_catalog.array_agg(
    a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
    order by a.attnum
  ) into v_session_shape
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.research_private_early_access_sessions'::regclass
    and a.attnum > 0 and not a.attisdropped;

  if v_session_shape is distinct from array[
    'session_hash:text:true', 'owner_id:uuid:true', 'access_role:text:true',
    'issued_at:timestamp with time zone:true', 'expires_at:timestamp with time zone:true',
    'revoked_at:timestamp with time zone:false', 'created_at:timestamp with time zone:true'
  ]::text[] then
    raise exception 'research_private_early_access_sessions: incompatible sessions table columns: %', v_session_shape;
  end if;

  select pg_catalog.array_agg(
    a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
    order by a.attnum
  ) into v_nonce_shape
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.research_private_early_access_nonces'::regclass
    and a.attnum > 0 and not a.attisdropped;

  if v_nonce_shape is distinct from array[
    'nonce_hash:text:true', 'owner_id:uuid:true', 'access_role:text:true',
    'issued_at:timestamp with time zone:true', 'expires_at:timestamp with time zone:true',
    'consumed_at:timestamp with time zone:false', 'exchanged_session_hash:text:false',
    'created_at:timestamp with time zone:true'
  ]::text[] then
    raise exception 'research_private_early_access_sessions: incompatible nonces table columns: %', v_nonce_shape;
  end if;

  select pg_catalog.array_agg(
    c.conname || '|' || c.contype::text || '|' || c.convalidated::text || '|'
      || pg_catalog.pg_get_constraintdef(c.oid, true)
    order by c.conname
  )
    into v_session_constraints
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.research_private_early_access_sessions'::regclass;

  if v_session_constraints is distinct from array[
    'research_private_early_access_sessions_expiry_exact|c|true|CHECK (expires_at = (issued_at + ''04:00:00''::interval))',
    'research_private_early_access_sessions_hash_format|c|true|CHECK (session_hash ~ ''^[a-f0-9]{64}$''::text)',
    'research_private_early_access_sessions_pkey|p|true|PRIMARY KEY (session_hash)',
    'research_private_early_access_sessions_revocation_order|c|true|CHECK (revoked_at IS NULL OR revoked_at >= issued_at)',
    'research_private_early_access_sessions_role_exact|c|true|CHECK (access_role = ''private_early_access_member''::text)'
  ]::text[] then
    raise exception 'research_private_early_access_sessions: incompatible sessions constraints: %', v_session_constraints;
  end if;

  select pg_catalog.array_agg(
    c.conname || '|' || c.contype::text || '|' || c.convalidated::text || '|'
      || pg_catalog.pg_get_constraintdef(c.oid, true)
    order by c.conname
  )
    into v_nonce_constraints
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.research_private_early_access_nonces'::regclass;

  if v_nonce_constraints is distinct from array[
    'research_private_early_access_nonces_consumption_order|c|true|CHECK (consumed_at IS NULL OR consumed_at >= issued_at AND consumed_at < expires_at)',
    'research_private_early_access_nonces_exchange_fk|f|true|FOREIGN KEY (exchanged_session_hash) REFERENCES research_private_early_access_sessions(session_hash) ON UPDATE RESTRICT ON DELETE RESTRICT',
    'research_private_early_access_nonces_exchange_hash_format|c|true|CHECK (exchanged_session_hash IS NULL OR exchanged_session_hash ~ ''^[a-f0-9]{64}$''::text)',
    'research_private_early_access_nonces_exchange_state|c|true|CHECK ((consumed_at IS NULL) = (exchanged_session_hash IS NULL))',
    'research_private_early_access_nonces_exchange_unique|u|true|UNIQUE (exchanged_session_hash)',
    'research_private_early_access_nonces_expiry_exact|c|true|CHECK (expires_at = (issued_at + ''00:05:00''::interval))',
    'research_private_early_access_nonces_hash_format|c|true|CHECK (nonce_hash ~ ''^[a-f0-9]{64}$''::text)',
    'research_private_early_access_nonces_pkey|p|true|PRIMARY KEY (nonce_hash)',
    'research_private_early_access_nonces_role_exact|c|true|CHECK (access_role = ''private_early_access_member''::text)'
  ]::text[] then
    raise exception 'research_private_early_access_sessions: incompatible nonces constraints: %', v_nonce_constraints;
  end if;

  if exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    ) and not t.tgisinternal
  ) then
    raise exception 'research_private_early_access_sessions: unexpected table trigger detected.';
  end if;

  if pg_catalog.pg_get_expr(
    (select d.adbin from pg_catalog.pg_attrdef d
      where d.adrelid = 'public.research_private_early_access_sessions'::regclass and d.adnum = 7),
    'public.research_private_early_access_sessions'::regclass
  ) <> 'clock_timestamp()'
  or pg_catalog.pg_get_expr(
    (select d.adbin from pg_catalog.pg_attrdef d
      where d.adrelid = 'public.research_private_early_access_nonces'::regclass and d.adnum = 8),
    'public.research_private_early_access_nonces'::regclass
  ) <> 'clock_timestamp()' then
    raise exception 'research_private_early_access_sessions: incompatible created_at default.';
  end if;
end
$shape_guard$;

create index if not exists research_private_early_access_sessions_owner_active_idx
  on public.research_private_early_access_sessions(owner_id, expires_at)
  where revoked_at is null;

create index if not exists research_private_early_access_nonces_unconsumed_idx
  on public.research_private_early_access_nonces(owner_id, expires_at)
  where consumed_at is null;

do $index_guard$
declare
  v_index_definitions text[];
begin
  select pg_catalog.array_agg(
    c.relname || '|' || i.indisvalid::text || '|' || i.indisready::text || '|'
      || i.indislive::text || '|' || i.indisunique::text || '|'
      || pg_catalog.pg_get_indexdef(c.oid)
    order by c.relname
  )
    into v_index_definitions
  from pg_catalog.pg_class c
  join pg_catalog.pg_index i on i.indexrelid = c.oid
  where i.indrelid in (
    'public.research_private_early_access_sessions'::regclass,
    'public.research_private_early_access_nonces'::regclass
  );

  if v_index_definitions is distinct from array[
    'research_private_early_access_nonces_exchange_unique|true|true|true|true|CREATE UNIQUE INDEX research_private_early_access_nonces_exchange_unique ON public.research_private_early_access_nonces USING btree (exchanged_session_hash)',
    'research_private_early_access_nonces_pkey|true|true|true|true|CREATE UNIQUE INDEX research_private_early_access_nonces_pkey ON public.research_private_early_access_nonces USING btree (nonce_hash)',
    'research_private_early_access_nonces_unconsumed_idx|true|true|true|false|CREATE INDEX research_private_early_access_nonces_unconsumed_idx ON public.research_private_early_access_nonces USING btree (owner_id, expires_at) WHERE (consumed_at IS NULL)',
    'research_private_early_access_sessions_owner_active_idx|true|true|true|false|CREATE INDEX research_private_early_access_sessions_owner_active_idx ON public.research_private_early_access_sessions USING btree (owner_id, expires_at) WHERE (revoked_at IS NULL)',
    'research_private_early_access_sessions_pkey|true|true|true|true|CREATE UNIQUE INDEX research_private_early_access_sessions_pkey ON public.research_private_early_access_sessions USING btree (session_hash)'
  ]::text[] then
    raise exception 'research_private_early_access_sessions: incompatible or partial indexes: %', v_index_definitions;
  end if;
end
$index_guard$;

alter table public.research_private_early_access_sessions enable row level security;
alter table public.research_private_early_access_sessions force row level security;
alter table public.research_private_early_access_nonces enable row level security;
alter table public.research_private_early_access_nonces force row level security;

do $zero_policy_guard$
begin
  if exists (
    select 1 from pg_catalog.pg_policy
    where polrelid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
  ) then
    raise exception 'research_private_early_access_sessions: unexpected RLS policy detected; zero policies are required.';
  end if;
end
$zero_policy_guard$;

revoke all on table public.research_private_early_access_sessions from public;
revoke all on table public.research_private_early_access_nonces from public;

do $table_role_revokes$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      execute pg_catalog.format('revoke all on table public.research_private_early_access_sessions from %I', v_role);
      execute pg_catalog.format('revoke all on table public.research_private_early_access_nonces from %I', v_role);
    end if;
  end loop;
end
$table_role_revokes$;

do $effective_table_privilege_guard$
declare
  v_role text;
  v_table text;
  v_column text;
  v_privilege text;
  v_has_maintain boolean := pg_catalog.current_setting('server_version_num')::integer >= 170000;
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) a
    where c.oid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
  ) <> (case when v_has_maintain then 16 else 14 end) or exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) a
    where c.oid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
      and (
        a.grantee <> c.relowner
        or a.grantor <> c.relowner
        or (
          a.privilege_type not in (
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
          )
          and not (v_has_maintain and a.privilege_type = 'MAINTAIN')
        )
        or a.is_grantable
      )
  ) then
    raise exception 'research_private_early_access_sessions: table ACL allowlist violation.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid in (
      'public.research_private_early_access_sessions'::regclass,
      'public.research_private_early_access_nonces'::regclass
    )
      and a.attnum > 0
      and not a.attisdropped
      and a.attacl is not null
  ) then
    raise exception 'research_private_early_access_sessions: column ACL entries are forbidden.';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      foreach v_table in array array[
        'public.research_private_early_access_sessions',
        'public.research_private_early_access_nonces'
      ] loop
        foreach v_privilege in array array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ] loop
          if pg_catalog.has_table_privilege(v_role, v_table, v_privilege) then
            raise exception 'research_private_early_access_sessions: effective table privilege %:%:%',
              v_role, v_table, v_privilege;
          end if;
        end loop;

        if v_has_maintain and pg_catalog.has_table_privilege(v_role, v_table, 'MAINTAIN') then
          raise exception 'research_private_early_access_sessions: effective table privilege %:%:MAINTAIN',
            v_role, v_table;
        end if;

        for v_column in
          select a.attname
          from pg_catalog.pg_attribute a
          where a.attrelid = v_table::regclass
            and a.attnum > 0
            and not a.attisdropped
        loop
          foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
            if pg_catalog.has_column_privilege(v_role, v_table, v_column, v_privilege) then
              raise exception 'research_private_early_access_sessions: effective column privilege %:%:%:%',
                v_role, v_table, v_column, v_privilege;
            end if;
          end loop;
        end loop;
      end loop;
    end if;
  end loop;
end
$effective_table_privilege_guard$;

-- Register one one-time grant nonce. Database time fixes its exact five-minute
-- lifetime. An exact unconsumed retry returns the original expiry; ownership or
-- role drift, an expired row, or a consumed row returns NULL.
create or replace function public.research_private_early_access_issue_nonce(
  p_nonce_hash text,
  p_owner_id uuid,
  p_access_role text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $issue_nonce$
declare
  v_now timestamptz;
  v_expiry timestamptz;
  v_existing public.research_private_early_access_nonces%rowtype;
begin
  if p_nonce_hash is null or p_nonce_hash !~ '^[a-f0-9]{64}$'
     or p_owner_id is null
     or p_access_role is null or p_access_role <> 'private_early_access_member' then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('xenios:private-early-access:nonce:v2|' || p_nonce_hash, 0)
  );

  select * into v_existing
  from public.research_private_early_access_nonces n
  where n.nonce_hash = p_nonce_hash
  for update;

  -- Refresh the database clock after every potentially blocking lock. A caller
  -- cannot preserve a stale pre-lock timestamp across nonce expiry.
  v_now := pg_catalog.clock_timestamp();
  v_expiry := v_now + interval '5 minutes';

  if found then
    if v_existing.owner_id = p_owner_id
       and v_existing.access_role = p_access_role
       and v_existing.consumed_at is null
       and v_existing.exchanged_session_hash is null
       and v_existing.expires_at > v_now then
      return v_existing.expires_at;
    end if;
    return null;
  end if;

  insert into public.research_private_early_access_nonces (
    nonce_hash, owner_id, access_role, issued_at, expires_at
  ) values (
    p_nonce_hash, p_owner_id, p_access_role, v_now, v_expiry
  );
  return v_expiry;
end
$issue_nonce$;

-- The only session-minting capability. The nonce row is locked, checked, the
-- session is inserted, and the nonce is linked/consumed inside this one RPC and
-- database transaction. Any exception rolls back both writes. Replays return
-- NULL and never create another session.
create or replace function public.research_private_early_access_exchange_nonce(
  p_nonce_hash text,
  p_session_hash text,
  p_owner_id uuid,
  p_access_role text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $exchange_nonce$
declare
  v_now timestamptz;
  v_expiry timestamptz;
  v_nonce public.research_private_early_access_nonces%rowtype;
  v_inserted text;
  v_consumed text;
begin
  if p_nonce_hash is null or p_nonce_hash !~ '^[a-f0-9]{64}$'
     or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
     or p_owner_id is null
     or p_access_role is null or p_access_role <> 'private_early_access_member' then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('xenios:private-early-access:nonce:v2|' || p_nonce_hash, 0)
  );

  select * into v_nonce
  from public.research_private_early_access_nonces n
  where n.nonce_hash = p_nonce_hash
  for update;

  -- The expiry decision is made only after advisory and row locks complete.
  v_now := pg_catalog.clock_timestamp();
  -- 240 minutes is the founder-decided session lifetime (bounds 15..480). The
  -- database, not the caller, fixes it, and the exact CHECK above means no
  -- caller can widen it: a row whose expiry is not exactly this is rejected by
  -- the table itself. RESEARCH_EARLY_ACCESS_SESSION_TTL_MINUTES must match, or
  -- the cookie would outlive the row and unlock refuses the mint.
  v_expiry := v_now + interval '240 minutes';

  if not found
     or v_nonce.owner_id <> p_owner_id
     or v_nonce.access_role <> p_access_role
     or v_nonce.consumed_at is not null
     or v_nonce.exchanged_session_hash is not null
     or v_nonce.issued_at > v_now
     or v_nonce.expires_at <= v_now then
    return null;
  end if;

  insert into public.research_private_early_access_sessions (
    session_hash, owner_id, access_role, issued_at, expires_at
  ) values (
    p_session_hash, p_owner_id, p_access_role, v_now, v_expiry
  )
  on conflict do nothing
  returning session_hash into v_inserted;

  if v_inserted is null then
    return null;
  end if;

  update public.research_private_early_access_nonces n
  set consumed_at = v_now,
      exchanged_session_hash = p_session_hash
  where n.nonce_hash = p_nonce_hash
    and n.consumed_at is null
    and n.exchanged_session_hash is null
  returning n.nonce_hash into v_consumed;

  if v_consumed is null then
    raise exception 'research_private_early_access_sessions: atomic exchange invariant failed.';
  end if;
  return v_expiry;
end
$exchange_nonce$;

-- Reusable read predicate. It performs no write and never slides expiry.
create or replace function public.research_private_early_access_session_active(
  p_session_hash text,
  p_owner_id uuid,
  p_access_role text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $session_active$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
     or p_owner_id is null
     or p_access_role is null or p_access_role <> 'private_early_access_member' then
    return false;
  end if;
  return exists (
    select 1 from public.research_private_early_access_sessions s
    where s.session_hash = p_session_hash
      and s.owner_id = p_owner_id
      and s.access_role = p_access_role
      and s.revoked_at is null
      and s.issued_at <= v_now
      and s.expires_at > v_now
  );
end
$session_active$;

create or replace function public.research_private_early_access_revoke_session(
  p_session_hash text,
  p_owner_id uuid,
  p_access_role text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $revoke_session$
declare
  v_revoked text;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
     or p_owner_id is null
     or p_access_role is null or p_access_role <> 'private_early_access_member' then
    return false;
  end if;
  update public.research_private_early_access_sessions s
  set revoked_at = coalesce(s.revoked_at, pg_catalog.clock_timestamp())
  where s.session_hash = p_session_hash
    and s.owner_id = p_owner_id
    and s.access_role = p_access_role
  returning s.session_hash into v_revoked;
  return v_revoked is not null;
end
$revoke_session$;

revoke all on function public.research_private_early_access_issue_nonce(text,uuid,text) from public;
revoke all on function public.research_private_early_access_exchange_nonce(text,text,uuid,text) from public;
revoke all on function public.research_private_early_access_session_active(text,uuid,text) from public;
revoke all on function public.research_private_early_access_revoke_session(text,uuid,text) from public;

do $function_role_boundary$
declare
  v_role text;
  v_signature text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      foreach v_signature in array array[
        'public.research_private_early_access_issue_nonce(text,uuid,text)',
        'public.research_private_early_access_exchange_nonce(text,text,uuid,text)',
        'public.research_private_early_access_session_active(text,uuid,text)',
        'public.research_private_early_access_revoke_session(text,uuid,text)'
      ] loop
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end loop;
    end if;
  end loop;

  if pg_catalog.to_regrole('service_role') is not null then
    foreach v_signature in array array[
      'public.research_private_early_access_issue_nonce(text,uuid,text)',
      'public.research_private_early_access_exchange_nonce(text,text,uuid,text)',
      'public.research_private_early_access_session_active(text,uuid,text)',
      'public.research_private_early_access_revoke_session(text,uuid,text)'
    ] loop
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end loop;
  end if;
end
$function_role_boundary$;

do $function_shape_guard$
declare
  v_count integer;
  v_table_owner oid;
  v_service_role oid := pg_catalog.to_regrole('service_role');
  v_role text;
  v_signature text;
begin
  select c.relowner into v_table_owner
  from pg_catalog.pg_class c
  where c.oid = 'public.research_private_early_access_sessions'::regclass;

  if v_table_owner is distinct from (
    select c.relowner from pg_catalog.pg_class c
    where c.oid = 'public.research_private_early_access_nonces'::regclass
  ) then
    raise exception 'research_private_early_access_sessions: table owner mismatch.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'research_private_early_access_%'
      and p.proname not in (
        'research_private_early_access_issue_nonce',
        'research_private_early_access_exchange_nonce',
        'research_private_early_access_session_active',
        'research_private_early_access_revoke_session'
      )
  ) then
    raise exception 'research_private_early_access_sessions: unexpected prefixed function detected.';
  end if;

  select pg_catalog.count(*)::integer into v_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and p.proname in (
      'research_private_early_access_issue_nonce',
      'research_private_early_access_exchange_nonce',
      'research_private_early_access_session_active',
      'research_private_early_access_revoke_session'
    )
    and p.prosecdef
    and p.proconfig = array['search_path=pg_catalog']::text[]
    and p.proowner = v_table_owner
    and (r.rolsuper or r.rolbypassrls);
  if v_count <> 4 then
    raise exception 'research_private_early_access_sessions: incompatible function owner/security/search_path.';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where n.nspname = 'public'
      and p.proname in (
        'research_private_early_access_issue_nonce',
        'research_private_early_access_exchange_nonce',
        'research_private_early_access_session_active',
        'research_private_early_access_revoke_session'
      )
  ) <> (case when v_service_role is null then 4 else 8 end)
  or exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where n.nspname = 'public'
      and p.proname in (
        'research_private_early_access_issue_nonce',
        'research_private_early_access_exchange_nonce',
        'research_private_early_access_session_active',
        'research_private_early_access_revoke_session'
      )
      and (
        (a.grantee <> p.proowner and (v_service_role is null or a.grantee <> v_service_role))
        or a.grantor <> p.proowner
        or a.privilege_type <> 'EXECUTE'
        or a.is_grantable
      )
  ) then
    raise exception 'research_private_early_access_sessions: function ACL allowlist violation.';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.to_regrole(v_role) is not null then
      foreach v_signature in array array[
        'public.research_private_early_access_issue_nonce(text,uuid,text)',
        'public.research_private_early_access_exchange_nonce(text,text,uuid,text)',
        'public.research_private_early_access_session_active(text,uuid,text)',
        'public.research_private_early_access_revoke_session(text,uuid,text)'
      ] loop
        if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
          raise exception 'research_private_early_access_sessions: effective browser RPC execute %:%',
            v_role, v_signature;
        end if;
      end loop;
    end if;
  end loop;
end
$function_shape_guard$;

comment on table public.research_private_early_access_sessions is
  'Hash-only reusable Private Early Access sessions; no raw cookie, password, product, order, or payment data.';
comment on table public.research_private_early_access_nonces is
  'Hash-only one-time grant nonces atomically exchanged for reusable sessions.';

commit;
