-- Install the scheduler and register only the Early Access temporary contact purge.
-- Keep this job separate from durable request, quote, and outbox retention.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $schedule$
BEGIN
  IF NOT has_schema_privilege(current_user, 'request_intent_private', 'USAGE')
     OR NOT has_function_privilege(
       current_user, 'request_intent_private.purge_expired_contact_admissions(integer)', 'EXECUTE'
     )
     OR NOT has_table_privilege(
       current_user, 'request_intent_private.catalog_contact_admission', 'SELECT'
     )
     OR NOT has_table_privilege(
       current_user, 'request_intent_private.catalog_contact_admission', 'DELETE'
     ) THEN
    RAISE EXCEPTION 'The migration owner must be able to run the contact purge';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ea_contact_admission_purge') THEN
    IF (SELECT count(*) FROM cron.job WHERE jobname = 'ea_contact_admission_purge') <> 1
       OR NOT EXISTS (
         SELECT 1 FROM cron.job
         WHERE jobname = 'ea_contact_admission_purge'
           AND active AND username = current_user AND database = current_database()
           AND schedule = '*/5 * * * *'
           AND command = 'SELECT request_intent_private.purge_expired_contact_admissions(1000)'
       ) THEN
      RAISE EXCEPTION 'Existing Early Access contact purge does not match the reviewed job';
    END IF;
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'ea_contact_admission_purge',
    '*/5 * * * *',
    'SELECT request_intent_private.purge_expired_contact_admissions(1000)'
  );
END $schedule$;
COMMIT;
