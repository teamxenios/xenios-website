-- Read-only verification. Run after the candidate transaction, never before.

do $verify$
declare
  v_signature text;
  v_public_acl int;
  v_service_acl int;
begin
  foreach v_signature in array array[
    'public.research_early_access_customer_refs_for_member(uuid)',
    'public.research_early_access_orders_for_member(uuid)',
    'public.research_early_access_order_for_member(uuid,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'missing Roman order-history function: %', v_signature;
    end if;
    select count(*) into v_public_acl
      from information_schema.routine_privileges
     where specific_schema = 'public'
       and routine_name = split_part(split_part(v_signature, '.', 2), '(', 1)
       and grantee in ('PUBLIC','anon','authenticated');
    if v_public_acl <> 0 then
      raise exception 'Roman order-history function has a public/browser grant: %', v_signature;
    end if;
    select count(*) into v_service_acl
      from information_schema.routine_privileges
     where specific_schema = 'public'
       and routine_name = split_part(split_part(v_signature, '.', 2), '(', 1)
       and grantee = 'service_role'
       and privilege_type = 'EXECUTE';
    if v_service_acl <> 1 then
      raise exception 'Roman order-history function lacks exact service_role execute: %', v_signature;
    end if;
  end loop;
end;
$verify$;

select
  public.research_early_access_customer_refs_for_member(
    '00000000-0000-4000-8000-000000000000'::uuid
  ) = '[]'::jsonb as unknown_member_has_no_customer_refs,
  public.research_early_access_orders_for_member(
    '00000000-0000-4000-8000-000000000000'::uuid
  ) = '[]'::jsonb as unknown_member_has_no_orders,
  public.research_early_access_order_for_member(
    '00000000-0000-4000-8000-000000000000'::uuid,
    'XEA-AAAAAAAAAAAAAAAA'
  ) is null as unknown_member_cannot_read_detail;
