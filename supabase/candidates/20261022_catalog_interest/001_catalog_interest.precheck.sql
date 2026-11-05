-- Read-only precheck. Expected prerequisite: the canonical research outbox.
do $$
begin
  if to_regclass('public.research_notification_outbox') is null then
    raise exception 'canonical research_notification_outbox is missing';
  end if;
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'extensions.digest(text,text) is missing';
  end if;
end
$$;

select
  to_regclass('public.research_notification_outbox') as canonical_outbox,
  to_regclass('public.catalog_interest_leads') as existing_leads,
  to_regclass('public.catalog_interest_consents') as existing_consents,
  to_regprocedure(
    'public.record_catalog_interest(uuid,text,text,boolean,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,text,text,text)'
  ) as existing_rpc;

select event_type, template_key, count(*) as existing_rows
from public.research_notification_outbox
where event_type in ('catalog_interest_customer', 'catalog_interest_team')
   or template_key in ('catalog_interest_customer', 'catalog_interest_team')
group by event_type, template_key
order by event_type, template_key;
