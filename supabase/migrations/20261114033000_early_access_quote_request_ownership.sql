BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('request_intent_private.requests') IS NULL
     OR NOT has_schema_privilege('service_role', 'request_intent_private', 'USAGE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
     ) THEN
    RAISE EXCEPTION 'The existing private request store and its definer role are required';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION request_intent_private.quote_owned_ids(
  p_owner_hash text, p_request_id uuid, p_after_id uuid
) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $ownership$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'request_intent_backend_required';
  END IF;
  IF p_owner_hash IS NULL OR p_owner_hash !~ '^[a-f0-9]{64}$'
     OR (p_request_id IS NOT NULL AND p_after_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request_intent_invalid_scope';
  END IF;

  IF p_request_id IS NOT NULL THEN
    RETURN ARRAY(
      SELECT r.id FROM request_intent_private.requests AS r
      WHERE r.id = p_request_id AND r.owner_hash = p_owner_hash
    );
  END IF;

  RETURN ARRAY(
    SELECT r.id FROM request_intent_private.requests AS r
    WHERE r.owner_hash = p_owner_hash AND (p_after_id IS NULL OR r.id > p_after_id)
    ORDER BY r.id
    LIMIT 100
  );
END;
$ownership$;

REVOKE ALL ON FUNCTION request_intent_private.quote_owned_ids(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION request_intent_private.quote_owned_ids(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_intent_owned_ids(
  p_owner_hash text, p_request_id uuid, p_after_id uuid
) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $wrapper$
  SELECT request_intent_private.quote_owned_ids(p_owner_hash, p_request_id, p_after_id);
$wrapper$;

REVOKE ALL ON FUNCTION public.request_intent_owned_ids(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_intent_owned_ids(text, uuid, uuid) TO service_role;
COMMIT;
