-- Install the scheduler and register only the Early Access temporary contact purge.
-- Keep this job separate from durable request, quote, and outbox retention.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $schedule$
BEGIN
  IF NOT has_function_privilege(
    current_user, 'request_intent_private.purge_expired_contact_admissions(integer)', 'EXECUTE'
  ) OR NOT has_table_privilege(
    current_user, 'request_intent_private.catalog_contact_admission', 'SELECT, DELETE'
  ) THEN
    RAISE EXCEPTION 'The migration owner must be able to run the contact purge';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ea_contact_admission_purge') THEN
    RAISE EXCEPTION 'The Early Access contact purge job already exists';
  END IF;

  PERFORM cron.schedule(
    'ea_contact_admission_purge',
    '*/5 * * * *',
    'SELECT request_intent_private.purge_expired_contact_admissions(1000)'
  );
END $schedule$;
COMMIT;
