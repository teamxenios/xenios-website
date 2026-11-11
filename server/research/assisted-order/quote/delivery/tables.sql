-- Candidate DDL. Apply ONLY in the private schema documented in README; never public.
CREATE TABLE qd_quotes (
  tenant text NOT NULL, id text NOT NULL, target_id text NOT NULL, xri_id text NOT NULL, seller text NOT NULL,
  version integer NOT NULL CHECK(version>0), state text NOT NULL CHECK(state IN ('issued','superseded','accepted','withdrawn','declined','expired')),
  snapshot text NOT NULL, PRIMARY KEY(tenant,id), UNIQUE(tenant,target_id,version)
);
CREATE UNIQUE INDEX qd_one_open ON qd_quotes(tenant,target_id) WHERE state='issued';
CREATE INDEX qd_xri_quotes ON qd_quotes(tenant,xri_id);
CREATE TABLE qd_attempts(tenant text NOT NULL, xri_id text NOT NULL, opkey text NOT NULL, fingerprint text NOT NULL, id text NOT NULL,
 PRIMARY KEY(tenant,xri_id,opkey), FOREIGN KEY(tenant,id) REFERENCES qd_quotes(tenant,id));
CREATE TABLE qd_notification_intents(tenant text NOT NULL,id text NOT NULL,xri_id text NOT NULL,
 contact_tag text NOT NULL, bindings_tag text NOT NULL, issuer text NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','attempting','uncertain','accepted','suppressed','delivered','bounced')),
 provider_id text, PRIMARY KEY(tenant,id), UNIQUE(provider_id), FOREIGN KEY(tenant,id) REFERENCES qd_quotes(tenant,id));
CREATE INDEX qd_pending ON qd_notification_intents(tenant,state);
CREATE TABLE qd_audits(id text PRIMARY KEY, tenant text NOT NULL, quote_id text NOT NULL, kind text NOT NULL, at_time text NOT NULL);
CREATE TABLE qd_events(eid text PRIMARY KEY, tenant text NOT NULL, provider_id text NOT NULL, kind text NOT NULL);
CREATE TABLE qd_directory(tenant text NOT NULL, target_id text NOT NULL, xri_id text NOT NULL, seller text NOT NULL,
 PRIMARY KEY(tenant,target_id),UNIQUE(tenant,xri_id,seller));
CREATE TABLE qd_replies(tenant text NOT NULL,quote_id text NOT NULL,evidence_id text NOT NULL UNIQUE,
 PRIMARY KEY(tenant,quote_id,evidence_id), FOREIGN KEY(tenant,quote_id) REFERENCES qd_quotes(tenant,id));
