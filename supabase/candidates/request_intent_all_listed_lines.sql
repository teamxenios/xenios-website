-- SOURCE-ONLY CANDIDATE. Not a registered or applied migration.
-- Requires a disposable rehearsal, reviewed migration-DAG placement and the
-- owner's approval before it is applied anywhere.
--
-- Purpose: a customer may ask about any listed row. The first version of
-- valid_lines refused a line whose row is coming soon or planned, and a line
-- for a supply or service row. This version accepts them. Nothing else in the
-- check changes: the allowed keys, the quantity range, the workflow modes, the
-- pending review state, the 200-line limit and the duplicate check all stand.
--
-- An inquiry line is still not an order. This grants nothing and changes no
-- table, policy, grant or other function.
--
-- After it is applied, set RESEARCH_REQUEST_INTENT_ALL_LISTED_ENABLED=true so
-- the server lists those rows as selectable. Applying it without the setting
-- changes nothing a customer can do. Setting it without applying this would
-- let a customer add a row whose request the store then refuses whole.
begin;
create or replace function request_intent_private.valid_lines(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare entry jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) not between 1 and 200 then return false; end if;
  for entry in select jsonb_array_elements(value) loop
    if not request_intent_private.only_keys(entry, array[
      'productId','variantId','sourceVariantId','productName','specification','family','workflowMode',
      'quantity','researchUseOnly','clinicalReviewRequired','sourceDisplayState','sourceVariantDisplayState',
      'sourceRefusal','catalogVersion','reviewState'
    ]) then return false; end if;
    if entry->>'reviewState' is distinct from 'pending'
      or jsonb_typeof(entry->'quantity') is distinct from 'number'
      or (entry->>'quantity') !~ '^[0-9]+$'
      or (entry->>'quantity')::numeric not between 1 and 100
      or jsonb_typeof(entry->'researchUseOnly') is distinct from 'boolean'
      or jsonb_typeof(entry->'clinicalReviewRequired') is distinct from 'boolean'
      or entry->>'workflowMode' is null
      or entry->>'workflowMode' not in ('direct_order_request','provider_request','request_pricing','request_activation','availability_review')
    then return false; end if;
    if exists (select 1 from unnest(array[
      'productId','variantId','sourceVariantId','productName','family',
      'sourceDisplayState','sourceVariantDisplayState','catalogVersion'
    ]) k where jsonb_typeof(entry->k) is distinct from 'string'
      or length(entry->>k) not between 1 and 300) then return false; end if;
    if jsonb_typeof(entry->'specification') is distinct from 'string'
      and jsonb_typeof(entry->'specification') is distinct from 'null' then return false; end if;
    if jsonb_typeof(entry->'sourceRefusal') is distinct from 'string'
      and jsonb_typeof(entry->'sourceRefusal') is distinct from 'null' then return false; end if;
    if entry->>'workflowMode' = 'provider_request'
      and entry->'clinicalReviewRequired' is distinct from 'true'::jsonb then return false; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(value) e
    group by e->>'productId', e->>'variantId' having count(*) > 1) then return false; end if;
  return true;
exception when others then return false;
end;
$$;
revoke all on function request_intent_private.valid_lines(jsonb) from public, anon, authenticated, service_role;
commit;
