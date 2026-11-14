BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('request_intent_private.requests') IS NULL
     OR to_regclass('quote_delivery_private.qd_notification_intents') IS NULL
     OR to_regclass('public.research_notification_outbox') IS NULL
     OR NOT has_schema_privilege('service_role', 'request_intent_private', 'USAGE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
     ) THEN
    RAISE EXCEPTION 'The existing private request and quote stores and their definer role are required';
  END IF;
END $preflight$;

ALTER TABLE request_intent_private.access_events DROP CONSTRAINT access_events_event_type_check;
ALTER TABLE request_intent_private.access_events
  ADD CONSTRAINT access_events_event_type_check CHECK (
    event_type IN ('submitted', 'staff_read', 'queue_list', 'quote_customer_read', 'quote_dispatch_read')
  );

CREATE OR REPLACE FUNCTION request_intent_private.quote_request_for_read(
  p_request_id uuid, p_owner_hash text, p_quote_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $read$
DECLARE
  stored request_intent_private.requests;
  purpose text;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'request_intent_backend_required';
  END IF;
  IF p_request_id IS NULL OR (p_owner_hash IS NULL) = (p_quote_id IS NULL)
     OR (p_owner_hash IS NOT NULL AND p_owner_hash !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request_intent_invalid_scope';
  END IF;

  IF p_owner_hash IS NOT NULL THEN
    purpose := 'quote_customer_read';
    SELECT r.* INTO stored FROM request_intent_private.requests AS r
    WHERE r.id = p_request_id AND r.owner_hash = p_owner_hash;
  ELSE
    purpose := 'quote_dispatch_read';
    SELECT r.* INTO stored FROM request_intent_private.requests AS r
    WHERE r.id = p_request_id
      AND EXISTS (
        SELECT 1
        FROM quote_delivery_private.qd_notification_intents AS n
        JOIN quote_delivery_private.qd_quotes AS q
          ON q.tenant = n.tenant AND q.id = n.id AND q.xri_id = n.xri_id
        WHERE n.tenant = 'ea-production' AND n.xri_id = r.id::text AND n.id = p_quote_id::text
          AND n.state = 'queued' AND q.state = 'issued' AND q.seller = 'team-xenios'
      )
      AND EXISTS (
        SELECT 1 FROM public.research_notification_outbox AS o
        WHERE o.status = 'processing'
          AND o.event_type = 'ea_private_quote_notice_v1'
          AND o.template_key = 'ea_private_quote_notice_v1'
          AND o.event_key ~ '^qd-[0-9a-f]{64}$'
          AND o.payload = jsonb_build_object(
            'tenant', 'ea-production', 'xriId', p_request_id::text, 'quoteId', p_quote_id::text
          )
      );
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Customer and worker reads record their purpose without attributing it to staff.
  INSERT INTO request_intent_private.access_events (request_id, event_type)
  VALUES (stored.id, purpose);
  RETURN request_intent_private.receipt(stored) ||
    jsonb_build_object('contact', stored.contact, 'agreements', stored.agreements, 'lines', stored.lines);
END;
$read$;

REVOKE ALL ON FUNCTION request_intent_private.quote_request_for_read(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION request_intent_private.quote_request_for_read(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_intent_quote_read(
  p_request_id uuid, p_owner_hash text, p_quote_id uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $wrapper$
  SELECT request_intent_private.quote_request_for_read(p_request_id, p_owner_hash, p_quote_id);
$wrapper$;

REVOKE ALL ON FUNCTION public.request_intent_quote_read(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_intent_quote_read(uuid, text, uuid) TO service_role;
COMMIT;
