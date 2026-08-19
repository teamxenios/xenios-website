-- Xenios Research Early Access: canonical transaction identity ON the cart
-- settlements table itself (Lane C).
-- Candidate only. FOUNDER-GATED: apply after review, then register in the
-- canonical migration DAG. Run the sibling precheck first — it must report
-- APPLY_READY, and in particular ZERO duplicate canonical forms among the
-- settlements already on file — and the sibling postcheck after.
--
-- WHY THIS EXISTS. `EARLY_ACCESS_SETTLEMENT_NEEDS_CANONICAL_TXN_COLUMN`
-- (server/research/early-access/hardening-contract.ts) records the invariant:
-- two spellings of one payment must not be able to settle two checkouts, and
-- the DATABASE must enforce that, not just the service. M62 closed most of it:
-- the sole granted settlement RPC derives the canonical form and keys
-- `research_early_access_cart_transaction_ids.canonical_transaction_id`
-- uniquely. What remains open is the settlements TABLE itself: its only
-- uniqueness is on the RAW `external_transaction_id`, so any future routine
-- writing `research_early_access_cart_settlements` without passing through the
-- M62 wrapper would be checked raw-to-raw — exactly the defect the contract
-- names. Settlement money now also feeds commission holds, which makes a
-- double-settled payment a double-accrued commission.
--
-- THE FIX is structural: a STORED GENERATED column carrying the canonical form
-- (the same derivation the M62 wrapper and the service use: strip everything
-- outside [0-9A-Za-z], uppercase) and a UNIQUE index on it. Generated, so no
-- routine can forget to populate it or populate it differently; unique at the
-- table, so no routine can bypass it. The raw value stays untouched, because
-- an operator reconciling against a bank statement needs to see exactly what
-- was typed.
--
-- WHAT THIS DOES NOT DO. No routine changes. No data changes (the column is
-- derived from existing values). No length CHECK is added: the M62 wrapper
-- already refuses canonical forms shorter than 4 for every NEW settlement, and
-- a historical row must not make this migration unappliable retroactively.
--
-- ROLLBACK. Dropping the index and the column restores the previous shape
-- exactly; the raw column was never modified.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $lane_c_canonical_preflight$
begin
  if to_regclass('public.research_early_access_cart_settlements') is null then
    raise exception
      'Lane C canonical txn requires public.research_early_access_cart_settlements'
      using errcode = '55000';
  end if;

  -- The unique index this migration creates would fail half-way through on a
  -- duplicate; check first and fail whole, with a name, instead.
  if exists (
    select upper(regexp_replace(s.external_transaction_id, '[^0-9A-Za-z]+', '', 'g'))
    from public.research_early_access_cart_settlements s
    group by 1
    having count(*) > 1
  ) then
    raise exception
      'Lane C canonical txn: existing settlements contain duplicate canonical transaction forms; reconcile them before applying'
      using errcode = '55000';
  end if;
end;
$lane_c_canonical_preflight$;

alter table public.research_early_access_cart_settlements
  add column if not exists canonical_transaction_id text
  generated always as (
    upper(regexp_replace(external_transaction_id, '[^0-9A-Za-z]+', '', 'g'))
  ) stored;

comment on column public.research_early_access_cart_settlements.canonical_transaction_id is
  'The payment identity: the raw operator-typed id with everything outside [0-9A-Za-z] stripped, uppercased. Generated, so no routine can populate it differently; unique, so two spellings of one payment cannot settle two checkouts through ANY routine.';

create unique index if not exists research_ea_cart_settlements_canonical_txn_uidx
  on public.research_early_access_cart_settlements (canonical_transaction_id);

do $lane_c_canonical_postcondition$
begin
  if not exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_settlements'
      and att.attname = 'canonical_transaction_id'
      and att.attgenerated = 's'
      and att.attnum > 0
      and not att.attisdropped
  ) then
    raise exception
      'Lane C post-condition: canonical_transaction_id is absent or not STORED GENERATED'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    where idx.relname = 'research_ea_cart_settlements_canonical_txn_uidx'
      and i.indisunique
  ) then
    raise exception
      'Lane C post-condition: the canonical transaction unique index is absent or not unique'
      using errcode = '55000';
  end if;
end;
$lane_c_canonical_postcondition$;

commit;
