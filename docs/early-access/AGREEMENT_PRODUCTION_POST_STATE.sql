-- ===========================================================================
-- Early Access agreement smoke: production post-state verification
--
-- READ ONLY. Every statement is a SELECT. Nothing here inserts, updates,
-- deletes, alters or grants. It is safe to run against production at any time,
-- and it is safe to run twice.
--
-- Run AFTER the smoke sequence in AGREEMENT_CONTRACT_VERIFICATION.md §8.
--
-- Set these two before running. The window bounds every "did anything change"
-- query, so a wide window will report unrelated activity as smoke debris.
--   :customer_ref   the eac_ reference used in the smoke
--   :window_start   timestamptz, immediately before step A
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. EXACTLY ONE acceptance exists, and a repeat did not duplicate it
-- ---------------------------------------------------------------------------
-- Expect exactly one row. Two rows means the unique constraint is not doing
-- its job and the idempotency claim is false.
select
  customer_ref,
  agreement_kind,
  agreement_version,
  accepted_at,
  recorded_at,
  count(*) over () as total_rows_for_customer
from public.research_early_access_agreement_acceptances
where customer_ref = :'customer_ref'
order by recorded_at;

-- The same question asked so the answer is a single number.
-- Expect: 1
select count(*) as acceptance_rows
from public.research_early_access_agreement_acceptances
where customer_ref = :'customer_ref'
  and agreement_kind = 'early_access_terms'
  and agreement_version = 'v1';

-- No OTHER kind or version was written by the smoke.
-- Expect: zero rows.
select agreement_kind, agreement_version, count(*)
from public.research_early_access_agreement_acceptances
where customer_ref = :'customer_ref'
  and not (agreement_kind = 'early_access_terms' and agreement_version = 'v1')
group by 1, 2;

-- Evidence carries nothing it should not. Read the keys, not the values, so
-- this query cannot itself print a secret.
-- Expect: no key resembling a token, password, secret, key or authorization.
select jsonb_object_keys(evidence) as evidence_key
from public.research_early_access_agreement_acceptances
where customer_ref = :'customer_ref';


-- ---------------------------------------------------------------------------
-- 2. The wrong-price request created NO order
-- ---------------------------------------------------------------------------
-- Expect: zero rows. An order here means a 409 PRICE_CHANGED still wrote
-- something, which is a refusal that left debris.
select order_number, created_at
from public.research_early_access_orders
where created_at >= :'window_start'
order by created_at;

-- Any order at all for this customer, whenever created. Run it so a
-- pre-existing order is not mistaken for smoke debris by the query above.
select order_number, created_at
from public.research_early_access_orders
where customer_ref = :'customer_ref'
order by created_at;


-- ---------------------------------------------------------------------------
-- 3. NO money state changed
-- ---------------------------------------------------------------------------
-- Each of these must return zero rows for the window. They are listed
-- separately rather than unioned so a non-zero answer names which one moved.

select 'invoice' as artifact, count(*) as rows_in_window
from public.research_early_access_invoices where created_at >= :'window_start'
union all
select 'payment_verification', count(*)
from public.research_early_access_payment_verifications where created_at >= :'window_start'
union all
select 'receipt', count(*)
from public.research_early_access_receipts where created_at >= :'window_start'
union all
select 'refund', count(*)
from public.research_early_access_refunds where created_at >= :'window_start'
union all
select 'commission_hold', count(*)
from public.research_early_access_commission_events where created_at >= :'window_start';

-- NOTE FOR THE OPERATOR: if the correct-price draft was deliberately created,
-- 'invoice' will be 1 and that is expected. Every other row must be 0. A
-- receipt or a payment verification in this window means payment was approved
-- by something, and that is a stop-the-launch finding.


-- ---------------------------------------------------------------------------
-- 4. NO supplier release occurred
-- ---------------------------------------------------------------------------
-- Expect: zero rows in both. A supplier order in this window means product was
-- released against an order that was never paid.
select 'supplier_order' as artifact, count(*) as rows_in_window
from public.research_early_access_supplier_orders where created_at >= :'window_start'
union all
select 'supplier_send_event', count(*)
from public.research_early_access_supplier_send_events where created_at >= :'window_start'
union all
select 'tracking_event', count(*)
from public.research_early_access_tracking_events where created_at >= :'window_start';


-- ---------------------------------------------------------------------------
-- 5. Catalogue state is UNCHANGED: 22 visible / 18 purchasable / 4 held
-- ---------------------------------------------------------------------------
-- The initializer verified 19 products, 22 variants, 22 visible units,
-- 18 purchasable, 4 held. The smoke must not have moved any of it.
--
-- Expect: visible 22, purchasable 18, held 4.
select
  count(*)                                          as visible_units,
  count(*) filter (where purchasable is true)       as purchasable_units,
  count(*) filter (where purchasable is not true)   as held_units
from public.research_product_variants v
where v.audience = 'PRIVATE_EARLY_ACCESS';

-- Cagrilintide specifically: visible, founder-held, NO price.
-- Expect: one row, purchasable false, price null.
select
  p.display_name,
  v.strength,
  v.purchasable,
  v.price_cents
from public.research_product_variants v
join public.research_products p on p.id = v.product_id
where p.display_name ilike 'Cagrilintide%';

-- NAD+ 1000 mg at 10075 cents, as initialized.
-- Expect: price_cents = 10075.
select p.display_name, v.strength, v.price_cents
from public.research_product_variants v
join public.research_products p on p.id = v.product_id
where p.display_name ilike 'NAD%' and v.strength ilike '%1%000%';

-- Founder releases and supplier confirmations, as initialized.
-- Expect: 21 releases, 22 confirmations.
select 'founder_releases' as artifact, count(*) from public.research_early_access_founder_releases
union all
select 'supplier_confirmations', count(*) from public.research_early_access_supplier_confirmations;


-- ---------------------------------------------------------------------------
-- 6. Feature flag and enablement, for the record
-- ---------------------------------------------------------------------------
-- There is no flag table; RESEARCH_EARLY_ACCESS_ENABLED is an environment
-- variable and must be confirmed BY NAME through the deployment dashboard, not
-- read here. Recorded so nobody looks for it in the database and concludes it
-- is unset.
select 'RESEARCH_EARLY_ACCESS_ENABLED is an env var; verify by name in Render, never by value' as note;


-- ===========================================================================
-- TABLE NAMES ARE ASSERTED, NOT VERIFIED.
--
-- The five money and three fulfilment table names above were written from the
-- durable-persistence design, not read from the applied schema. Before relying
-- on a zero result, confirm each table exists, because a query against a table
-- that does not exist ERRORS, while a typo'd name in a `union all` can make a
-- section look reassuringly empty.
--
-- Run this first:
-- ===========================================================================
select
  t.expected_table,
  to_regclass('public.' || t.expected_table) is not null as exists
from (values
  ('research_early_access_agreement_acceptances'),
  ('research_early_access_orders'),
  ('research_early_access_invoices'),
  ('research_early_access_payment_verifications'),
  ('research_early_access_receipts'),
  ('research_early_access_refunds'),
  ('research_early_access_commission_events'),
  ('research_early_access_supplier_orders'),
  ('research_early_access_supplier_send_events'),
  ('research_early_access_tracking_events'),
  ('research_early_access_founder_releases'),
  ('research_early_access_supplier_confirmations'),
  ('research_product_variants'),
  ('research_products')
) as t(expected_table);
