-- CANDIDATE ONLY. Run tables.sql + this file in ONE trusted install transaction,
-- under SET LOCAL search_path=quote_delivery_private,pg_catalog. No role is granted.
REVOKE ALL ON SCHEMA quote_delivery_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA quote_delivery_private FROM PUBLIC;
DO $guard$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qd_quotes','qd_attempts','qd_notification_intents','qd_audits','qd_events','qd_directory','qd_replies']
  LOOP
    EXECUTE format('ALTER TABLE quote_delivery_private.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE quote_delivery_private.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON quote_delivery_private.%I USING (tenant = pg_catalog.current_setting(''xenios.private_quote_tenant'',true)) WITH CHECK (tenant = pg_catalog.current_setting(''xenios.private_quote_tenant'',true))',t);
  END LOOP;
END $guard$;
CREATE FUNCTION quote_delivery_private.qd_guard_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF OLD.state <> 'issued' OR NEW.state NOT IN('expired','withdrawn','superseded') OR
   (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
   RAISE EXCEPTION 'Immutable quote cannot be rewritten';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER immutable_economic_snapshot BEFORE UPDATE ON quote_delivery_private.qd_quotes
 FOR EACH ROW EXECUTE FUNCTION quote_delivery_private.qd_guard_snapshot();
REVOKE ALL ON FUNCTION quote_delivery_private.qd_guard_snapshot() FROM PUBLIC;
