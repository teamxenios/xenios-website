-- CANDIDATE ONLY; apply after delivery tables, private schema in search_path.
CREATE TABLE qd_verified_receipts(tenant text NOT NULL,eid text NOT NULL,pid text NOT NULL,kind text NOT NULL CHECK(kind IN('accepted','delivered','bounced')),digest text NOT NULL,address_tag text NOT NULL,
disposition text NOT NULL CHECK(disposition IN('pending','applied','conflict')),received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,eid));
CREATE INDEX qd_receipt_pending ON qd_verified_receipts(tenant,pid,eid) WHERE disposition='pending';
ALTER TABLE qd_verified_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qd_verified_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qd_verified_receipts USING(tenant=pg_catalog.current_setting('xenios.private_quote_tenant',true)) WITH CHECK(tenant=pg_catalog.current_setting('xenios.private_quote_tenant',true));
REVOKE ALL ON qd_verified_receipts FROM PUBLIC;
