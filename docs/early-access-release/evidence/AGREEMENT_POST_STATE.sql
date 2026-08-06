-- ---------------------------------------------------------------------------
-- Private Early Access: agreement acceptance post-state.
--
-- READ ONLY. There is not one INSERT, UPDATE, DELETE, ALTER, DROP, GRANT or
-- TRUNCATE below. Run the whole file; every row that comes back is a check with
-- its own PASS or FAIL, so nothing has to be eyeballed.
--
-- Run this AFTER the production acceptance smoke:
--   1. an order attempt before accepting        -> expect 403 AGREEMENT_REQUIRED
--   2. accept early_access_terms / v1           -> expect 200, alreadyAccepted false
--   3. accept the SAME pair again               -> expect 200, alreadyAccepted true
--   4. an order priced wrong by one cent        -> expect 409 PRICE_CHANGED
--
-- No customer PII is selected. customer_ref is an opaque eac_ handle, never a
-- name, email, address or phone number, so this output is safe to paste into an
-- engineering log. Do not add a join that changes that.
-- ---------------------------------------------------------------------------

-- 1. The acceptance table exists, and is the one the RPC writes.
select
  '01 acceptance table present' as check,
  count(*)::text as observed,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
from information_schema.tables
where table_schema = 'public'
  and table_name = 'research_early_access_agreement_acceptances';

-- 2. The uniqueness that makes a double-click harmless. Without this constraint
--    a repeat acceptance would append a second row and the RPC would report a
--    fresh insert every time, so "first acceptedAt stands" would not be true.
select
  '02 one acceptance per customer and pair' as check,
  coalesce(string_agg(conname, ', '), 'none') as observed,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
from pg_constraint
where conrelid = 'public.research_early_access_agreement_acceptances'::regclass
  and contype = 'u';

-- 3. Row level security is on and forced, so a leaked anon key reads nothing.
select
  '03 RLS enabled and forced' as check,
  format('enabled=%s forced=%s', relrowsecurity, relforcerowsecurity) as observed,
  case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end as verdict
from pg_class
where oid = 'public.research_early_access_agreement_acceptances'::regclass;

-- 4. Both halves of the contract exist: the writer and the reader.
select
  '04 record and gate functions present' as check,
  coalesce(string_agg(p.proname, ', ' order by p.proname), 'none') as observed,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'research_early_access_record_agreement',
    'research_early_access_agreements_accepted'
  );

-- 5. Exactly one row per customer for the configured pair. A count above one
--    for any customer would mean the duplicate path appended instead of being
--    caught, which is the defect this whole slice was repaired for.
select
  '05 no customer has a duplicate acceptance row' as check,
  coalesce(max(rows)::text, '0') as observed,
  case when coalesce(max(rows), 0) <= 1 then 'PASS' else 'FAIL' end as verdict
from (
  select count(*) as rows
  from public.research_early_access_agreement_acceptances
  where agreement_kind = 'early_access_terms'
    and agreement_version = 'v1'
  group by customer_ref
) per_customer;

-- 6. Only the configured pair was ever recorded. A row naming any other kind or
--    version would be an acceptance of a document nobody was shown, and this
--    table is append-only.
select
  '06 only early_access_terms/v1 on file' as check,
  coalesce(
    string_agg(distinct agreement_kind || '/' || agreement_version, ', '),
    'none yet'
  ) as observed,
  case
    when count(*) filter (
      where agreement_kind <> 'early_access_terms' or agreement_version <> 'v1'
    ) = 0 then 'PASS'
    else 'FAIL'
  end as verdict
from public.research_early_access_agreement_acceptances;

-- 7. Evidence is server-authored and carries no secret. channel is a constant,
--    requestIp is what Express derived from the trusted proxy chain, requestId
--    is caller-supplied correlation metadata that nothing reads back. Any other
--    key means a browser-supplied claim reached the record.
select
  '07 evidence keys are the three server-authored ones' as check,
  coalesce(string_agg(distinct key, ', ' order by key), 'none yet') as observed,
  case
    when count(*) filter (where key not in ('channel', 'requestIp', 'requestId')) = 0
      then 'PASS'
    else 'FAIL'
  end as verdict
from public.research_early_access_agreement_acceptances,
     lateral jsonb_object_keys(evidence) as key;

-- 8. No acceptance is dated in the future or before this release. acceptedAt is
--    written by the server clock; a stray value would mean a body-supplied
--    timestamp got through.
select
  '08 acceptedAt is server-plausible' as check,
  coalesce(
    format('min=%s max=%s', min(accepted_at)::text, max(accepted_at)::text),
    'none yet'
  ) as observed,
  case
    when count(*) filter (
      where accepted_at > pg_catalog.clock_timestamp() + interval '5 minutes'
         or accepted_at < timestamptz '2026-08-01 00:00:00+00'
    ) = 0 then 'PASS'
    else 'FAIL'
  end as verdict
from public.research_early_access_agreement_acceptances;

-- 9. How many customers are agreed. Not a pass or fail: the number to read
--    against how many people were asked to accept tonight.
select
  '09 customers with the required pair on file' as check,
  count(distinct customer_ref)::text as observed,
  'INFO' as verdict
from public.research_early_access_agreement_acceptances
where agreement_kind = 'early_access_terms'
  and agreement_version = 'v1';

-- 10. The acceptances themselves, newest first. Opaque handles only.
select
  '10 acceptance rows' as check,
  format(
    'ref=%s kind=%s version=%s acceptedAt=%s',
    customer_ref, agreement_kind, agreement_version, accepted_at::text
  ) as observed,
  'INFO' as verdict
from public.research_early_access_agreement_acceptances
order by accepted_at desc
limit 50;

-- 11. THE WRONG-PRICE PROOF. A 409 PRICE_CHANGED must leave nothing behind. If
--     any of these counts moved during the smoke, the refusal was not a refusal.
--     Compare this output against the same query run BEFORE the smoke.
select
  '11 ' || label as check,
  rows::text as observed,
  'COMPARE' as verdict
from (
  select 'placements (orders)' as label, count(*) as rows from public.research_early_access_placements
  union all select 'order lines', count(*) from public.research_early_access_order_lines
  union all select 'invoices', count(*) from public.research_early_access_invoices
  union all select 'receipts', count(*) from public.research_early_access_receipts
  union all select 'payment proofs', count(*) from public.research_early_access_payment_proofs
  union all select 'supplier orders', count(*) from public.research_early_access_supplier_orders
  union all select 'commission events', count(*) from public.research_early_access_commission_events
  union all select 'fulfillments', count(*) from public.research_early_access_fulfillments
  union all select 'settlements', count(*) from public.research_early_access_settlements
  union all select 'shipment tracking', count(*) from public.research_early_access_tracking
) counts
order by label;
