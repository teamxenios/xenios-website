-- Production follow-up for projects whose default table privileges granted
-- browser roles access when research-product-requests.sql first ran.
--
-- RLS already denied every row. This removes the table privileges themselves
-- so the private Product Request System remains server-only at both layers.

revoke all privileges on table
  public.research_product_demand_candidates,
  public.research_product_requests,
  public.research_product_request_files,
  public.research_product_request_storage_cleanup,
  public.research_product_request_events
from public, anon, authenticated;
