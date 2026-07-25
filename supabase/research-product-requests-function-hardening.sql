-- Production follow-up for the append-only event trigger helper. Trigger
-- execution continues internally, while browser roles have no direct EXECUTE
-- privilege on any Product Request System function.

revoke all on function public.research_reject_product_request_event_mutation()
from public, anon, authenticated;
