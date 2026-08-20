-- Xenios Research affiliates: the customer-declared affiliate code (Lane 4).
-- Candidate only. FOUNDER-GATED: apply after review, then register in the
-- canonical migration DAG. Run the sibling precheck first and the sibling
-- postcheck after.
--
-- WHY THIS EXISTS. Founder requirement 5 (2026-08-20): the customer may type
-- an optional affiliate code, it is stored with the request and the canonical
-- order, shown to authorized admin, and matched to an owner BY HAND.
--
-- WHY IT IS NOT A COLUMN ON THE REQUEST ROW. `research_assisted_order_requests
-- .affiliate_attribution_ref` holds a SERVER-VERIFIED fact derived from the
-- HMAC-signed attribution cookie, and the submit service deliberately ignores
-- any body-supplied value so a browser cannot choose which partner an order
-- pays. A typed string is a different fact of a different strength. Writing it
-- anywhere near that column invites a future reader to treat a claim as an
-- attribution, so it lives here, in its own table, plainly named as a claim.
--
-- WHY EVENTS RATHER THAN A ROW. The capture is immutable (it is what the
-- customer actually typed) and the manual match is a separate, later, human
-- judgment that must be correctable without erasing the earlier one. Appending
-- a `match_cleared` event corrects a mistake while keeping the record of who
-- decided what and when, and it means this table needs no UPDATE grant at all.
--
-- WHAT IT MAY NOT HOLD. No economics of any kind: no rate, no amount, no
-- payout state. No email address — the application refuses one before writing,
-- and the CHECK below refuses it again, so third-party identity cannot
-- accumulate here even if the application is wrong.
--
-- ROLLBACK. Dropping the table removes declared codes and nothing else.
-- Verified attribution, commissions, orders and fulfilment are untouched, and
-- the order journey never depended on this table: a failed write is swallowed
-- by the caller because an unusable code must never stop an order.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight.
-- ---------------------------------------------------------------------------

do $lane4_declared_preflight$
begin
  if to_regclass('public.research_affiliate_declared_codes') is not null then
    raise exception
      'research_affiliate_declared_codes already exists; review before applying'
      using errcode = '55000';
  end if;
end;
$lane4_declared_preflight$;

-- ---------------------------------------------------------------------------
-- The append-only event log.
-- ---------------------------------------------------------------------------

create table public.research_affiliate_declared_codes (
  id bigint generated always as identity primary key,
  -- The canonical request/order reference the claim belongs to.
  request_ref text not null
    constraint radc_request_ref_shape
      check (request_ref ~ '^[^[:space:]]{3,120}$'),
  kind text not null
    constraint radc_kind
      check (kind in ('captured', 'matched', 'match_cleared')),

  -- The customer's own words, kept verbatim for the human who matches them.
  -- Never an address: the application refuses one, and so does this CHECK.
  raw_code text
    constraint radc_raw_code_bounds
      check (raw_code is null
             or (char_length(raw_code) between 1 and 80
                 and raw_code !~ '@'
                 and raw_code !~ '[[:cntrl:]]')),
  -- The alphanumeric comparison key a manual match compares against.
  match_key text
    constraint radc_match_key_shape
      check (match_key is null or match_key ~ '^[A-Z0-9]{1,64}$'),
  invalid_reason text
    constraint radc_invalid_reason
      check (invalid_reason is null
             or invalid_reason in ('address_shaped', 'no_matchable_characters')),

  -- Set only by a match event.
  partner_id text
    constraint radc_partner_id_shape
      check (partner_id is null or partner_id ~ '^[^[:space:]@]{1,200}$'),
  -- The human who decided. A manual match is always somebody's judgment.
  actor_admin_id text
    constraint radc_actor_shape
      check (actor_admin_id is null or actor_admin_id ~ '^[^[:space:]]{1,200}$'),
  note text
    constraint radc_note_bounds
      check (note is null or char_length(note) between 1 and 500),

  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),

  -- Per-kind shape. Each event carries exactly the fields its kind means, so a
  -- row cannot claim a partner without naming who matched it, and a capture
  -- cannot smuggle in a partner id.
  constraint radc_captured_shape check (
    kind <> 'captured' or (
      partner_id is null
      and actor_admin_id is null
      and (
        -- a usable claim
        (raw_code is not null and match_key is not null and invalid_reason is null)
        -- or a refused entry, which stores no value at all
        or (raw_code is null and match_key is null and invalid_reason is not null)
      )
    )
  ),
  constraint radc_matched_shape check (
    kind <> 'matched' or (
      partner_id is not null
      and actor_admin_id is not null
      and raw_code is null and match_key is null and invalid_reason is null
    )
  ),
  constraint radc_cleared_shape check (
    kind <> 'match_cleared' or (
      partner_id is null
      and actor_admin_id is not null
      and raw_code is null and match_key is null and invalid_reason is null
    )
  )
);

-- The claim is typed once, at submit. A second capture for the same request is
-- a replay, and the unique index makes that a conflict rather than a silent
-- second claim the projection would have to arbitrate.
create unique index research_affiliate_declared_codes_one_capture
  on public.research_affiliate_declared_codes (request_ref)
  where kind = 'captured';

-- The admin read is always "this request's events, oldest first".
create index research_affiliate_declared_codes_by_request
  on public.research_affiliate_declared_codes (request_ref, occurred_at, id);

-- Operator lookup: "which requests claimed this code". Partial, because only a
-- capture carries a key.
create index research_affiliate_declared_codes_by_key
  on public.research_affiliate_declared_codes (match_key)
  where match_key is not null;

comment on table public.research_affiliate_declared_codes is
  'Append-only event log of the affiliate code a CUSTOMER TYPED — a claim, never a verified attribution. Capture is immutable and happens once per request; a manual match and its correction are separate named admin events. Holds no economics and no email addresses. service_role may INSERT and SELECT only; nothing may UPDATE or DELETE.';

-- ---------------------------------------------------------------------------
-- Privileges. RLS on with no policies; nothing for the public roles;
-- INSERT + SELECT only for service_role, so append-only holds against an
-- application defect and not merely by convention.
-- ---------------------------------------------------------------------------

alter table public.research_affiliate_declared_codes enable row level security;

revoke all on table public.research_affiliate_declared_codes
  from public, anon, authenticated;
revoke all on table public.research_affiliate_declared_codes from service_role;
grant select, insert on table public.research_affiliate_declared_codes
  to service_role;

-- The identity sequence is owned by the table; no role needs direct access.
revoke all on sequence public.research_affiliate_declared_codes_id_seq
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Post-condition.
-- ---------------------------------------------------------------------------

do $lane4_declared_postcondition$
declare
  v_rls boolean;
  v_role text;
  v_priv text;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'research_affiliate_declared_codes';
  if v_rls is distinct from true then
    raise exception 'Lane 4 declared-codes: RLS must be enabled'
      using errcode = '55000';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(v_role,
             'public.research_affiliate_declared_codes', v_priv) then
          raise exception 'Lane 4 declared-codes: % may % the table', v_role, v_priv
            using errcode = '55000';
        end if;
      end loop;
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    if not has_table_privilege('service_role',
         'public.research_affiliate_declared_codes', 'INSERT')
       or not has_table_privilege('service_role',
         'public.research_affiliate_declared_codes', 'SELECT') then
      raise exception 'Lane 4 declared-codes: service_role must hold SELECT and INSERT'
        using errcode = '55000';
    end if;
    foreach v_priv in array array['UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('service_role',
           'public.research_affiliate_declared_codes', v_priv) then
        raise exception
          'Lane 4 declared-codes: service_role may % — append-only is broken', v_priv
          using errcode = '55000';
      end if;
    end loop;
  end if;

  if to_regclass('public.research_affiliate_declared_codes_one_capture') is null then
    raise exception 'Lane 4 declared-codes: the one-capture unique index is missing'
      using errcode = '55000';
  end if;
end;
$lane4_declared_postcondition$;

commit;
