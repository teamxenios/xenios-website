// ADP03 synthetic-only disposable fixture layer. Import, never rewrite, the
// independently retained ADP02 proof. No managed URL or external adapter exists.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ProviderExecutionHarness, migrationPath as executionMigrationPath, prefix,
  sourceId, adapterRevision, policyRevision as createPolicyRevision, scope,
  expected, id, request, actor, actorLabel, reference, q, j, service, json,
  statusExpr, digest,
} from './research_assisted_order_quote_provider_execution_harness.mjs';
export { executionMigrationPath, prefix, sourceId, adapterRevision, createPolicyRevision,
  scope, expected, id, request, actor, actorLabel, reference, q, j, service, json, statusExpr, digest };
export const migrationPath='supabase/migrations/20261001115512_research_assisted_order_quote_provider_settlement.sql';
export const settlementPolicyRevision='synthetic-settlement-policy-v1';
export const authority=Object.freeze({schemaVersion:'assisted_order_provider_settlement_v1',
  transactionIsolation:'read_committed_only',settlementPolicy:'separate_scoped_admin_capture_v1',
  effectsPolicy:'canonical_verification_outbox_admin_v2',eligibilityPolicy:'reviewed_lineage_no_new_facts_v1',historicalAdoption:false});

export class ProviderSettlementHarness extends ProviderExecutionHarness {
  journals=new Map();
  settlements=new Map();
  async baseline(){
    await super.baseline();
    await this.psql(await readFile(executionMigrationPath,'utf8'));
    assert.match(await this.psql('show server_version;'),/^17\.11(?:\D|$)/);
  }
  async install(){await this.psql(await readFile(migrationPath,'utf8'));}
  async provisionExecution(options={}){await super.provision(options);}
  async provisionSettlement({source=sourceId,policy=settlementPolicyRevision}={}){
    await this.psql(`insert into ${prefix}provider_settlement_policies(source_id,policy_revision,capture_semantics,granted_by)
      values(${q(source)},${q(policy)},'single_full_capture','synthetic-owner');
      insert into ${prefix}provider_settlement_grants(source_id,auth_user_id,actor_label,granted_by)
      values(${q(source)},'${actor}',${q(actorLabel)},'synthetic-owner');`);
  }
  async provision(options={}){
    await super.provision(options);
    const source=options.source??sourceId,policy=options.settlementPolicy??settlementPolicyRevision;
    await this.provisionSettlement({source,policy});
  }
  capture(n,overrides={}){
    return this.event(n,{eventId:`synthetic-settlement-capture-${n}`,payloadSha256:digest(`synthetic-capture-bytes-${n}`),
      providerPaymentId:`synthetic-payment-${n}`,providerSessionId:`synthetic-session-${n}`,...overrides});
  }
  captureExpr(n,event=this.capture(n),configuration={}){
    const c={sourceId,revision:adapterRevision,scope,...configuration};
    return `${prefix}provider_event_append(${q(c.sourceId)},${q(c.revision)},${j(c.scope)},${j(event)})`;
  }
  async captureAppend(n,event=this.capture(n),configuration={}){
    const receipt=json(await this.psql(service(`select ${this.captureExpr(n,event,configuration)}::text;`)));
    this.journals.set(n,receipt);return receipt;
  }
  async candidate(n,{result={},event={},capture=true,configuration={}}={}){
    await this.setup(n);
    await this.reserve(n,configuration);
    await this.claim(n,id(6,n),configuration);
    assert.equal((await this.append(n,this.result(n,result),configuration)).classification,'bound');
    return capture?this.captureAppend(n,this.capture(n,event),configuration):null;
  }
  settleExpr(n,overrides={}){
    const a={requestId:request(n),journalId:this.journals.get(n)?.journalId,sourceId,
      revision:adapterRevision,scope,policy:settlementPolicyRevision,actor,...overrides};
    return `${prefix}provider_settlement_commit(${q(a.requestId)},${q(a.journalId)},${q(a.sourceId)},${q(a.revision)},
      ${j(a.scope)},${q(a.policy)},${q(a.actor)})`;
  }
  async settle(n,overrides={}){
    const receipt=json(await this.psql(service(`select ${this.settleExpr(n,overrides)}::text;`)));
    this.settlements.set(n,receipt);return receipt;
  }
  async eligibility(n){return json(await this.psql(service(`select ${prefix}financial_eligibility('${request(n)}')::text;`)));}
  async financial(n){
    return json(await this.psql(`select jsonb_build_object(
      'request',(select to_jsonb(r) from ${prefix}requests r where id='${request(n)}'),
      'quotes',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}quotes r where request_id='${request(n)}'),
      'observations',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}payment_observations r where request_id='${request(n)}'),
      'claims',(select jsonb_agg(to_jsonb(r) order by method,provider_namespace,evidence_ref) from ${prefix}evidence_claims r where request_id='${request(n)}'),
      'verifications',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}payment_verifications r where request_id='${request(n)}'),
      'settlements',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}provider_settlements r where request_id='${request(n)}'),
      'events',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}events r where request_id='${request(n)}'),
      'outbox',(select jsonb_agg(to_jsonb(r) order by id) from public.research_notification_outbox r where assisted_order_verification_id in
        (select id from ${prefix}payment_verifications where request_id='${request(n)}')),
      'audit',(select jsonb_agg(to_jsonb(r) order by event_id) from ${prefix}audit_events_v1 r where request_id='${request(n)}'),
      'financial',${prefix}financial_state('${request(n)}'))::text;`));
  }
}
