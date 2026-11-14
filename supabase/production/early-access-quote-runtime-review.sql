-- Review only. This operator-owned grant proposal is outside the migration ledger.
-- Run only with the production access owner's approval after the four Early Access
-- migrations. Reconcile existing role names before retrying. This transaction
-- leaves the login disabled and does not install a password or enable any route.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = 'public.research_notification_outbox'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Quote grants require row security on the existing notification outbox';
  END IF;
END
$preflight$;

CREATE ROLE ea_quote_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE ea_quote_login NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT ea_quote_runtime TO ea_quote_login WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;

GRANT USAGE ON SCHEMA quote_delivery_private, public TO ea_quote_runtime;
GRANT SELECT, INSERT ON
  quote_delivery_private.qd_quotes, quote_delivery_private.qd_attempts,
  quote_delivery_private.qd_notification_intents, quote_delivery_private.qd_directory
  TO ea_quote_runtime;
GRANT INSERT ON quote_delivery_private.qd_audits TO ea_quote_runtime;
GRANT UPDATE (state) ON quote_delivery_private.qd_quotes TO ea_quote_runtime;
GRANT UPDATE (state, provider_id) ON quote_delivery_private.qd_notification_intents TO ea_quote_runtime;

-- Preserve the original policies and cap this role at the production tenant
-- even if it supplies a different value for the transaction tenant setting.
DO $scope$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'qd_quotes', 'qd_attempts', 'qd_notification_intents', 'qd_directory', 'qd_audits'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY production_quote_runtime_tenant ON quote_delivery_private.%I AS RESTRICTIVE TO ea_quote_runtime
       USING (tenant = ''ea-production'') WITH CHECK (tenant = ''ea-production'')',
      table_name
    );
  END LOOP;
END
$scope$;

-- The runtime inserts quote notices. The existing worker owns all other outbox
-- reads and transitions. SELECT(event_key) supports ON CONFLICT and RETURNING.
GRANT INSERT (event_key, event_type, template_key, recipient, payload), SELECT (event_key)
  ON public.research_notification_outbox TO ea_quote_runtime;
CREATE POLICY production_quote_runtime_outbox_access ON public.research_notification_outbox
  TO ea_quote_runtime USING (true) WITH CHECK (true);
CREATE POLICY production_quote_runtime_outbox_scope ON public.research_notification_outbox
  AS RESTRICTIVE TO ea_quote_runtime
  USING (
    event_type = 'ea_private_quote_notice_v1' AND template_key = event_type
    AND payload->>'tenant' = 'ea-production' AND event_key ~ '^qd-[0-9a-f]{64}$'
  )
  WITH CHECK (
    event_type = 'ea_private_quote_notice_v1' AND template_key = event_type
    AND payload->>'tenant' = 'ea-production' AND event_key ~ '^qd-[0-9a-f]{64}$'
    AND payload = pg_catalog.jsonb_build_object(
      'tenant', 'ea-production', 'xriId', payload->>'xriId', 'quoteId', payload->>'quoteId'
    )
    AND payload->>'xriId' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    AND payload->>'quoteId' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  );

COMMIT;
