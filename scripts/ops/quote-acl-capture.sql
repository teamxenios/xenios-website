-- Generic catalog projection only. Operator/provider/custody/closed-activation verification is external.
WITH targets(schema_name,table_name) AS (VALUES ('quote_delivery_private','qd_attempts'),
('quote_delivery_private','qd_audits'),
('quote_delivery_private','qd_directory'),
('quote_delivery_private','qd_events'),
('quote_delivery_private','qd_notification_intents'),
('quote_delivery_private','qd_quotes'),
('quote_delivery_private','qd_replies'),
('quote_delivery_private','qd_verified_receipts'),
('public','research_notification_outbox')),
relations AS (
 SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN targets t ON t.schema_name=n.nspname AND t.table_name=c.relname
),
pair AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname IN ('ea_quote_login','ea_quote_runtime')),
payload AS (
 SELECT pg_catalog.jsonb_build_object(
 'snapshotVersion',2,
 'database',pg_catalog.current_database(),
 'databaseOid',(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),
 'operator',current_user,
 'operatorOid',(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user),
 'serverVersion',pg_catalog.current_setting('server_version_num'),
 'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'oid',oid,'name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,
  'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb,
  'replication',rolreplication,'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil,
  'roleConfigDigest',md5(COALESCE(rolconfig::text,'')),
  'databaseConfigDigests',COALESCE((SELECT jsonb_agg(jsonb_build_object('databaseOid',s.setdatabase,'digest',md5(s.setconfig::text)) ORDER BY s.setdatabase) FROM pg_catalog.pg_db_role_setting s WHERE s.setrole=pair.oid),'[]'::jsonb)
 ) ORDER BY rolname) FROM pair),'[]'::jsonb),
 'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'oid',m.oid,'roleOid',m.roleid,'role',pg_get_userbyid(m.roleid),
   'memberOid',m.member,'member',pg_get_userbyid(m.member),
   'grantorOid',m.grantor,'grantor',pg_get_userbyid(m.grantor),
   'set',m.set_option,'inherit',m.inherit_option,'admin',m.admin_option)
   ORDER BY m.roleid,m.member,m.grantor)
  FROM pg_catalog.pg_auth_members m WHERE m.roleid IN (SELECT oid FROM pair) OR m.member IN (SELECT oid FROM pair)),'[]'::jsonb),
 'schemas',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'oid',n.oid,'name',n.nspname,'ownerOid',n.nspowner,'owner',pg_get_userbyid(n.nspowner),
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantorOid',x.grantor,'grantor',pg_catalog.pg_get_userbyid(x.grantor),'granteeOid',x.grantee,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.grantor,x.privilege_type,x.is_grantable) FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x),'[]'::jsonb),
   'runtimeUsage',has_schema_privilege('ea_quote_runtime',n.oid,'USAGE'),
   'runtimeCreate',has_schema_privilege('ea_quote_runtime',n.oid,'CREATE'),
   'loginUsage',has_schema_privilege('ea_quote_login',n.oid,'USAGE'),
   'anonUsage',has_schema_privilege('anon',n.oid,'USAGE'),
   'authenticatedUsage',has_schema_privilege('authenticated',n.oid,'USAGE'),
   'serviceRoleUsage',has_schema_privilege('service_role',n.oid,'USAGE')
 ) ORDER BY n.nspname) FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('quote_delivery_private','public')),'[]'::jsonb),
 'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'oid',c.oid,'schemaOid',c.relnamespace,'schema',c.nspname,'table',c.relname,
   'kind',c.relkind,'ownerOid',c.relowner,'owner',pg_get_userbyid(c.relowner),
   'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantorOid',x.grantor,'grantor',pg_catalog.pg_get_userbyid(x.grantor),'granteeOid',x.grantee,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.grantor,x.privilege_type,x.is_grantable) FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x),'[]'::jsonb),
   'runtimeTable', (SELECT jsonb_object_agg(p.operation,jsonb_build_object('allowed',has_table_privilege('ea_quote_runtime',c.oid,p.operation),'grantable',has_table_privilege('ea_quote_runtime',c.oid,p.operation||' WITH GRANT OPTION')) ORDER BY p.operation) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(operation)),
   'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'number',a.attnum,'name',a.attname,'typeOid',a.atttypid,'typeModifier',a.atttypmod,'notNull',a.attnotnull,
     'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantorOid',x.grantor,'grantor',pg_catalog.pg_get_userbyid(x.grantor),'granteeOid',x.grantee,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.grantor,x.privilege_type,x.is_grantable) FROM pg_catalog.aclexplode(CASE WHEN pg_catalog.cardinality(a.attacl)>0 THEN a.attacl ELSE NULL::pg_catalog.aclitem[] END) x),'[]'::jsonb),
     'runtime',(SELECT jsonb_object_agg(p.operation,jsonb_build_object('allowed',has_column_privilege('ea_quote_runtime',c.oid,a.attnum,p.operation),'grantable',has_column_privilege('ea_quote_runtime',c.oid,a.attnum,p.operation||' WITH GRANT OPTION')) ORDER BY p.operation) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(operation))
    ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
   'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles', (SELECT jsonb_agg(jsonb_build_object('oid',v.role_oid,'name',CASE WHEN v.role_oid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(v.role_oid) END) ORDER BY v.role_oid) FROM unnest(p.polroles) v(role_oid)),
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)
   ) ORDER BY p.polname) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb)
 ) ORDER BY c.nspname,c.relname) FROM relations c),'[]'::jsonb)
 ) AS snapshot
)
SELECT pg_catalog.jsonb_build_object('observedAt',pg_catalog.clock_timestamp(),'provenance','catalog projection only; provider identity requires external verification','snapshot',snapshot) AS evidence FROM payload;
