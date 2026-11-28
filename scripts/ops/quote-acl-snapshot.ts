/** Pure semantic comparator, adopted from the reviewed revision-2 algorithm.
 * No captured production catalog, OID, ACL preimage, provider call or I/O here.
 * Array/key ordering is immaterial; every captured semantic value is retained.
 */
export type Oid = string | number;
export type Privilege = { allowed: boolean; grantable: boolean };
export type Acl = { grantorOid: Oid; grantor: string; granteeOid: Oid; grantee: string; privilege: string; grantable: boolean };
export type Policy = { name: string; command: string; permissive: boolean; roles: { oid: Oid; name: string }[]; using: string; check: string };
export type Relation = { oid: Oid; schema: string; table: string; kind: string; owner: string; rls: boolean; forceRls: boolean;
  acl: Acl[]; runtimeTable: Record<string, Privilege>;
  columns: { name: string; acl: Acl[]; runtime: Record<string, Privilege>; [key: string]: unknown }[];
  policies: Policy[]; [key: string]: unknown };
export type Snapshot = {
  snapshotVersion: number; database: string; operator: string; operatorOid: Oid; serverVersion: string;
  roles: { oid: Oid; name: string; login: boolean; inherit: boolean; super: boolean; bypassRls: boolean;
    createRole: boolean; createDb: boolean; replication: boolean; [key: string]: unknown }[];
  memberships: { roleOid: Oid; memberOid: Oid; set: boolean; inherit: boolean; admin: boolean; [key: string]: unknown }[];
  schemas: { name: string; runtimeUsage: boolean; runtimeCreate: boolean; anonUsage: boolean;
    authenticatedUsage: boolean; serviceRoleUsage: boolean; [key: string]: unknown }[];
  relations: Relation[]; [key: string]: unknown;
};
export type Grant = { schema: string; table: string; column: string; operation: string };
export type Delta = { version: number; grantor: string; grantee: string; grantable: boolean; grants: Grant[];
  policies: { schema: string; table: string; name: string; command: string; permissive: boolean; role: string; using: string; check: string }[] };
export function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function normal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normal).sort((a,b) => (JSON.stringify(a)??"undefined").localeCompare(JSON.stringify(b)??"undefined"));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,normal(v)]));
  return value;
}
export function equalSnapshot(actual: unknown, expected: unknown): void {
  insist(JSON.stringify(normal(actual)) === JSON.stringify(normal(expected)), "Exact reviewed catalog image differs; stop and re-review drift.");
}
const grants = (table: string, columns: string[], operations: string[], schema="quote_delivery_private"): Grant[] =>
  operations.flatMap(operation => columns.map(column => ({ schema,table,column,operation })));
export const EXACT_DELTA: Delta = {
  version: 2, grantor: "postgres", grantee: "ea_quote_runtime", grantable: false,
  grants: [
    ...grants("qd_events",["tenant","eid","provider_id","kind"],["SELECT","INSERT"]),
    ...grants("qd_replies",["tenant","quote_id","evidence_id"],["SELECT","INSERT"]),
    ...grants("qd_verified_receipts",["tenant","eid","pid","kind","digest","address_tag","disposition"],["SELECT","INSERT"]),
    ...grants("qd_verified_receipts",["disposition"],["UPDATE"]),
    ...grants("research_notification_outbox",["recipient","event_type","template_key"],["SELECT"],"public"),
  ],
  policies: ["qd_events","qd_replies","qd_verified_receipts"].map(table => ({
    schema:"quote_delivery_private",table,name:"production_quote_runtime_tenant",command:"*",permissive:false,
    role:"ea_quote_runtime",using:"(tenant = 'ea-production'::text)",check:"(tenant = 'ea-production'::text)",
  })),
};
function freezeTree(value:unknown):void {
  if(value&&typeof value==="object") { for(const child of Object.values(value)) freezeTree(child);Object.freeze(value); }
}
freezeTree(EXACT_DELTA);
export function assertDelta(d: Delta): void {
  insist(d.version===2 && d.grantor==="postgres" && d.grantee==="ea_quote_runtime" && d.grantable===false,"Wrong delta authority.");
  equalSnapshot(d.grants,EXACT_DELTA.grants); equalSnapshot(d.policies,EXACT_DELTA.policies);
}
export function assertBaseline(s: Snapshot, d: Delta): { runtime: Snapshot["roles"][number] } {
  assertDelta(d);
  insist(s.snapshotVersion===2 && s.database==="postgres" && s.operator==="postgres","Wrong catalog/operator/database; provider pin is external.");
  insist(s.roles.length===2 && new Set(s.roles.map(r=>r.name)).size===2,"Expected dedicated role pair.");
  const login=s.roles.find(r=>r.name==="ea_quote_login"), runtime=s.roles.find(r=>r.name==="ea_quote_runtime");
  insist(login && runtime,"Missing dedicated roles.");
  for (const r of [login,runtime]) insist(!r.login&&!r.inherit&&!r.super&&!r.bypassRls&&!r.createRole&&!r.createDb&&!r.replication,"Unsafe or activated role.");
  insist(s.memberships.filter(m=>m.memberOid===runtime.oid).length===0,"Runtime has a parent membership.");
  const parents=s.memberships.filter(m=>m.memberOid===login.oid);
  insist(parents.length===1 && parents[0].roleOid===runtime.oid && parents[0].set && !parents[0].inherit && !parents[0].admin,"Login membership differs.");
  insist(!s.memberships.some(m=>m.roleOid===runtime.oid&&m.memberOid!==login.oid&&(m.set||m.inherit)),"Another runtime assumer.");
  insist(!s.memberships.some(m=>m.roleOid===login.oid&&(m.set||m.inherit)),"Another login assumer.");
  insist(s.relations.length===9 && new Set(s.relations.map(r=>r.schema+"."+r.table)).size===9,"Expected nine protected relations.");
  for (const name of ["qd_attempts","qd_audits","qd_directory","qd_events","qd_notification_intents","qd_quotes","qd_replies","qd_verified_receipts"]) {
    const r=s.relations.find(r=>r.schema==="quote_delivery_private"&&r.table===name);
    insist(r&&r.kind==="r"&&r.owner==="postgres"&&r.rls&&r.forceRls,"Private identity/RLS drift.");
    insist(Object.entries(r.runtimeTable).every(([op,v])=>!v.grantable&&(!["DELETE","TRUNCATE","TRIGGER","MAINTAIN","REFERENCES","UPDATE"].includes(op)||!v.allowed)),"Broad private privilege.");
  }
  const out=s.relations.find(r=>r.schema==="public"&&r.table==="research_notification_outbox");
  insist(out&&out.kind==="r"&&out.owner==="postgres"&&out.rls&&!out.forceRls,"Outbox identity/RLS drift.");
  const ns=s.schemas.find(n=>n.name==="quote_delivery_private");
  insist(s.schemas.length===2&&ns?.runtimeUsage&&!ns.runtimeCreate&&!ns.anonUsage&&!ns.authenticatedUsage&&!ns.serviceRoleUsage,"Private schema access drift.");
  const tenant="(tenant = current_setting('xenios.private_quote_tenant'::text, true))";
  for (const p of d.policies) {
    const r=s.relations.find(r=>r.schema===p.schema&&r.table===p.table);
    insist(r?.policies.length===1,"Original policies changed.");
    const policy=r.policies[0];
    insist(policy.name==="tenant_isolation"&&policy.command==="*"&&policy.permissive&&policy.roles.length===1&&String(policy.roles[0].oid)==="0"&&policy.roles[0].name==="PUBLIC"&&policy.using===tenant&&policy.check===tenant,"Original tenant policy drift.");
  }
  for (const g of d.grants) {
    const r=s.relations.find(r=>r.schema===g.schema&&r.table===g.table), c=r?.columns.find(c=>c.name===g.column), p=c?.runtime[g.operation];
    insist(c&&p&&!p.allowed&&!p.grantable,"Required privilege is not denied.");
    insist(!c.acl.some(a=>a.granteeOid===runtime.oid&&a.privilege===g.operation),"Direct ACL already present.");
  }
  return {runtime};
}
export function expectedPostimage(pre: Snapshot,d: Delta): Snapshot {
  const {runtime}=assertBaseline(pre,d), post=structuredClone(pre);
  for (const g of d.grants) {
    const c=post.relations.find(r=>r.schema===g.schema&&r.table===g.table)!.columns.find(c=>c.name===g.column)!;
    c.acl.push({grantorOid:pre.operatorOid,grantor:"postgres",granteeOid:runtime.oid,grantee:"ea_quote_runtime",privilege:g.operation,grantable:false});
    c.runtime[g.operation]={allowed:true,grantable:false};
  }
  for (const p of d.policies) post.relations.find(r=>r.schema===p.schema&&r.table===p.table)!.policies.push({
    name:p.name,command:p.command,permissive:p.permissive,roles:[{oid:runtime.oid,name:"ea_quote_runtime"}],using:p.using,check:p.check,
  });
  return post;
}
export function validateApply(actualPre: Snapshot,reviewedPre: Snapshot,actualPost: Snapshot,d: Delta): void {
  equalSnapshot(actualPre,reviewedPre); equalSnapshot(actualPost,expectedPostimage(reviewedPre,d));
}
export function validateRollback(current: Snapshot,recordedPost: Snapshot,recordedPre: Snapshot,d: Delta): void {
  equalSnapshot(recordedPost,expectedPostimage(recordedPre,d)); equalSnapshot(current,recordedPost);
}

// Closed executable fragments, not a CLI or migration. Caller artifact hashes
// must additionally be bound by the external operator's one-shot authorization.
export const CHANGE_SQL = `-- PRIVATE UNEXECUTED FRAGMENT; only inside Root's qualified, approved controller.
CREATE POLICY production_quote_runtime_tenant
  ON quote_delivery_private.qd_events AS RESTRICTIVE FOR ALL TO ea_quote_runtime
  USING (tenant='ea-production') WITH CHECK (tenant='ea-production');
CREATE POLICY production_quote_runtime_tenant
  ON quote_delivery_private.qd_replies AS RESTRICTIVE FOR ALL TO ea_quote_runtime
  USING (tenant='ea-production') WITH CHECK (tenant='ea-production');
CREATE POLICY production_quote_runtime_tenant
  ON quote_delivery_private.qd_verified_receipts AS RESTRICTIVE FOR ALL TO ea_quote_runtime
  USING (tenant='ea-production') WITH CHECK (tenant='ea-production');


GRANT SELECT (tenant,eid,provider_id,kind),
      INSERT (tenant,eid,provider_id,kind)
  ON quote_delivery_private.qd_events TO ea_quote_runtime;
GRANT SELECT (tenant,quote_id,evidence_id),
      INSERT (tenant,quote_id,evidence_id)
  ON quote_delivery_private.qd_replies TO ea_quote_runtime;
GRANT SELECT (tenant,eid,pid,kind,digest,address_tag,disposition),
      INSERT (tenant,eid,pid,kind,digest,address_tag,disposition),
      UPDATE (disposition)
  ON quote_delivery_private.qd_verified_receipts TO ea_quote_runtime;
GRANT SELECT (recipient,event_type,template_key)
  ON public.research_notification_outbox TO ea_quote_runtime;
`;
export const INVERSE_SQL = `-- PRIVATE UNEXECUTED FRAGMENT; exact recorded postimage and bounded controller required.
REVOKE SELECT (tenant,eid,provider_id,kind),
       INSERT (tenant,eid,provider_id,kind)
  ON quote_delivery_private.qd_events FROM ea_quote_runtime RESTRICT;
REVOKE SELECT (tenant,quote_id,evidence_id),
       INSERT (tenant,quote_id,evidence_id)
  ON quote_delivery_private.qd_replies FROM ea_quote_runtime RESTRICT;
REVOKE SELECT (tenant,eid,pid,kind,digest,address_tag,disposition),
       INSERT (tenant,eid,pid,kind,digest,address_tag,disposition),
       UPDATE (disposition)
  ON quote_delivery_private.qd_verified_receipts FROM ea_quote_runtime RESTRICT;
REVOKE SELECT (recipient,event_type,template_key)
  ON public.research_notification_outbox FROM ea_quote_runtime RESTRICT;
DROP POLICY production_quote_runtime_tenant ON quote_delivery_private.qd_events;
DROP POLICY production_quote_runtime_tenant ON quote_delivery_private.qd_replies;
DROP POLICY production_quote_runtime_tenant ON quote_delivery_private.qd_verified_receipts;
`;
