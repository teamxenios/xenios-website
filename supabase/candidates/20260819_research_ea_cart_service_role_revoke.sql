-- Xenios Research Early Access: close the M58 service_role direct-read hole.
-- Candidate only. FOUNDER-GATED: production mutation requires Samuel's
-- current explicit approval.
--
-- WHY THIS EXISTS. The 2026-08-19 adversarial migration review found the six
-- M58 cart tables (checkouts, quotes, items, invoices, settlements, events —
-- carrying customer refs, money, and contact/shipping inside `record` jsonb)
-- were revoked from public/anon/authenticated only; service_role kept its
-- managed-platform default table privileges, and service_role holds BYPASSRLS,
-- so forced RLS does not contain it. The M62 and 20260804121000 families
-- revoked their own tables from service_role; M58's were missed. Every
-- application read/write against these tables goes through SECURITY DEFINER
-- RPCs (verified: cart/supabase-store.ts and orders/cart-order-history.ts use
-- runEarlyAccessCall exclusively), and definer functions execute with the
-- owner's privileges, so revoking service_role changes no application
-- behavior — it removes the out-of-boundary direct path only.
--
-- ROLLBACK / CONTAINMENT: re-grant with
--   grant select, insert, update, delete on <table> to service_role;
-- per table. Nothing is written by this migration; no function, policy, or
-- RLS state changes.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'research_early_access_cart_checkouts',
    'research_early_access_cart_quotes',
    'research_early_access_cart_items',
    'research_early_access_cart_invoices',
    'research_early_access_cart_settlements',
    'research_early_access_cart_events'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception using errcode = '55000',
        message = 'missing prerequisite table public.' || v_table;
    end if;
    execute format('revoke all on table public.%I from service_role', v_table);
  end loop;
end $$;

-- In-transaction post-condition: no direct service_role privilege remains on
-- any of the six tables; abort whole rather than apply partially.
do $$
declare
  v_leak integer;
begin
  select count(*) into v_leak
  from (values
    ('research_early_access_cart_checkouts'),
    ('research_early_access_cart_quotes'),
    ('research_early_access_cart_items'),
    ('research_early_access_cart_invoices'),
    ('research_early_access_cart_settlements'),
    ('research_early_access_cart_events')
  ) as t(name)
  where has_table_privilege('service_role', 'public.' || t.name, 'SELECT')
     or has_table_privilege('service_role', 'public.' || t.name, 'INSERT')
     or has_table_privilege('service_role', 'public.' || t.name, 'UPDATE')
     or has_table_privilege('service_role', 'public.' || t.name, 'DELETE');
  if v_leak > 0 then
    raise exception using errcode = '55000',
      message = 'service_role still holds direct privileges on ' || v_leak || ' cart table(s)';
  end if;
end $$;

commit;
