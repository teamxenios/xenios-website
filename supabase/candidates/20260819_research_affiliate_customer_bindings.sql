-- Xenios Research affiliates: the durable customer attribution binding (Lane 4).
-- Candidate only. FOUNDER-GATED: apply after review, then register in the
-- canonical migration DAG. Run the sibling precheck first and the sibling
-- postcheck after.
--
-- WHY THIS EXISTS. The Gen 2 attribution spine captures a referral as an
-- append-only touch plus a signed browser cookie, and the conversion seams
-- read the cookie at submit time. The cookie is therefore the ONLY carrier of
-- attribution across sign-in: clear it and a legitimate referral silently
-- loses credit before any order exists. This table is the durable middle —
-- the first time a request carries BOTH a verified attribution cookie AND a
-- resolved customer identity, the server records the pairing here, keyed by
-- the opaque customer handle, exactly once.
--
-- WHAT THE TABLE MAY AND MAY NOT HOLD.
--
--   * WHO referred WHOM, WITH WHICH CODE, WHEN — and nothing about money.
--     Rates, holds and payouts live in the founder-gated program config and
--     the commission ledger; program_state records only whether economics
--     were active at bind time ('pending_program' preserves attribution
--     without inventing a single basis point).
--   * No identity. customer_key and subject_key are opaque handles (the
--     check constraints refuse address-shaped or whitespace-bearing values);
--     no email, name, or member profile column exists to be filled.
--
-- FIRST BIND WINS, AT THE PRIVILEGE LEVEL. The PRIMARY KEY makes a second
-- bind for the same customer a conflict, and service_role receives INSERT and
-- SELECT only — no UPDATE, no DELETE — so no application defect can re-point
-- an attribution that already landed. anon and authenticated get nothing, and
-- row level security stays enabled with no policies.
--
-- ROLLBACK. Dropping the table removes durable bindings and nothing else:
-- capture, cookies, assisted-order attribution and the commission ledger are
-- untouched, and a customer whose cookie still lives simply re-binds on their
-- next identified request after the table returns.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight. This candidate creates one new table; it must not silently adopt
-- an object someone else created under the same name.
-- ---------------------------------------------------------------------------

do $lane4_bindings_preflight$
begin
  if to_regclass('public.research_affiliate_customer_bindings') is not null then
    raise exception
      'research_affiliate_customer_bindings already exists; review before applying'
      using errcode = '55000';
  end if;
end;
$lane4_bindings_preflight$;

-- ---------------------------------------------------------------------------
-- The table.
-- ---------------------------------------------------------------------------

create table public.research_affiliate_customer_bindings (
  -- The opaque customer handle the conversion seams already use (an Early
  -- Access customer ref, or a namespaced member key). Never an email: the
  -- pattern refuses '@' and whitespace outright.
  customer_key text primary key
    constraint racb_customer_key_opaque
      check (customer_key ~ '^[^[:space:]@]{3,200}$'),
  -- From the VERIFIED attribution cookie payload only; the application never
  -- accepts a partner id from a request value.
  partner_id text not null
    constraint racb_partner_id_shape
      check (partner_id ~ '^[^[:space:]@]{1,200}$'),
  -- The link code that was clicked, verbatim (signed codes are long).
  code text not null
    constraint racb_code_bounds
      check (char_length(code) between 1 and 512),
  -- The opaque visitor key the capture touch was written under, preserving
  -- continuity with research_attribution_touches.
  subject_key text not null
    constraint racb_subject_key_opaque
      check (subject_key ~ '^[^[:space:]@]{3,200}$'),
  -- When the touch was captured (the cookie's issuedAt), and when identity
  -- became known. Capture never happens after the bind that records it.
  captured_at timestamptz not null,
  bound_at timestamptz not null,
  constraint racb_capture_before_bind check (captured_at <= bound_at),
  program_state text not null
    constraint racb_program_state
      check (program_state in ('active', 'pending_program')),
  method text not null
    constraint racb_method
      check (method = 'attribution_cookie'),
  created_at timestamptz not null default now()
);

comment on table public.research_affiliate_customer_bindings is
  'Append-only: which affiliate referred which customer, with which link code, and when — recorded once per customer (first bind wins, PRIMARY KEY) from a server-verified attribution cookie at the moment identity became known. Carries no economics and no personal identity. service_role may INSERT and SELECT only; nothing may UPDATE or DELETE.';

-- ---------------------------------------------------------------------------
-- Privileges. RLS on with no policies; nothing for the public roles; INSERT
-- and SELECT only for service_role, so the append-only rule holds even
-- against an application defect.
-- ---------------------------------------------------------------------------

alter table public.research_affiliate_customer_bindings enable row level security;

revoke all on table public.research_affiliate_customer_bindings
  from public, anon, authenticated;
revoke all on table public.research_affiliate_customer_bindings from service_role;
grant select, insert on table public.research_affiliate_customer_bindings
  to service_role;

-- ---------------------------------------------------------------------------
-- Post-condition.
-- ---------------------------------------------------------------------------

do $lane4_bindings_postcondition$
declare
  v_rls boolean;
  v_role text;
  v_priv text;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'research_affiliate_customer_bindings';
  if v_rls is distinct from true then
    raise exception 'Lane 4 post-condition: RLS must be enabled on the bindings table'
      using errcode = '55000';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(v_role,
             'public.research_affiliate_customer_bindings', v_priv) then
          raise exception
            'Lane 4 post-condition: % may % the bindings table', v_role, v_priv
            using errcode = '55000';
        end if;
      end loop;
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    if not has_table_privilege('service_role',
         'public.research_affiliate_customer_bindings', 'INSERT')
       or not has_table_privilege('service_role',
         'public.research_affiliate_customer_bindings', 'SELECT') then
      raise exception
        'Lane 4 post-condition: service_role must hold SELECT and INSERT'
        using errcode = '55000';
    end if;
    foreach v_priv in array array['UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('service_role',
           'public.research_affiliate_customer_bindings', v_priv) then
        raise exception
          'Lane 4 post-condition: service_role may % the bindings table — append-only is broken',
          v_priv using errcode = '55000';
      end if;
    end loop;
  end if;
end;
$lane4_bindings_postcondition$;

commit;
