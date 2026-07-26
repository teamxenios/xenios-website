-- Production grant convergence for the Research Product Control Center.
-- Idempotent and row-preserving. Website 2 owns reviewed application.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'research_products',
    'research_product_facts',
    'research_product_goals',
    'research_product_guide_links',
    'research_product_prohibited_claims',
    'research_product_open_questions',
    'research_supplement_candidates',
    'research_product_content',
    'research_product_variants',
    'research_product_prices',
    'research_product_media',
    'research_product_admin_audit'
  ]
  loop
    execute format(
      'revoke truncate, references, trigger on table public.%I from service_role',
      table_name
    );
  end loop;
end
$$;
