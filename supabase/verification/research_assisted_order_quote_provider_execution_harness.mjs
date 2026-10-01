// ADP02 extends the frozen ADP01 disposable harness without rewriting its proof.
// Synthetic source/grant rows exist only inside the no-network local container.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ProviderJournalHarness, migrationPath as journalMigrationPath, id, request, actor,
  actorLabel, reference, q, j, service, json, statusExpr,
} from './research_assisted_order_quote_provider_journal_harness.mjs';
export { id, request, actor, actorLabel, reference, q, j, service, json, statusExpr };
export const migrationPath = 'supabase/migrations/20261001102904_research_assisted_order_quote_provider_execution.sql';
export const prefix = 'public.research_assisted_order_';
export const sourceId = 'synthetic-provider-execution';
export const adapterRevision = 'synthetic-execution-adapter-v1';
export const policyRevision = 'synthetic-create-policy-v1';
export const scope = Object.freeze({ provider: 'synthetic-unconfigured', accountId: 'synthetic-execution-account', mode: 'test' });
export const digest = value => createHash('sha256').update(value).digest('hex');
export const expected = detail => ['P0001', `ASSISTED_ORDER_PROVIDER_${detail}`];
export const authority = Object.freeze({ schemaVersion: 'assisted_order_provider_execution_v1',
  transactionIsolation: 'read_committed_only', durableCreateOwnership: true, providerIdentityBinding: 'write_once',
  dispatchTiming: 'database_budget_monotonic_v1',
  settlementEnabled: false, refundEnabled: false, liveExecutionEnabled: false });

export class ProviderExecutionHarness extends ProviderJournalHarness {
  attempts = new Map();
  claims = new Map();
  async baseline() {
    await super.baseline();
    await this.psql(await readFile(journalMigrationPath, 'utf8'));
    assert.match(await this.psql('show server_version;'), /^17\.11(?:\D|$)/);
  }
  async install() { await this.psql(await readFile(migrationPath, 'utf8')); }
  async provision({ source = sourceId, configuredScope = scope, revision = adapterRevision,
    policy = policyRevision, seconds = 60, leaseMs = 1000 } = {}) {
    await this.psql(`insert into ${prefix}provider_sources(source_id,provider_namespace,account_ref,mode,adapter_revision,granted_by)
      values(${q(source)},${q(configuredScope.provider)},${q(configuredScope.accountId)},${q(configuredScope.mode)},${q(revision)},'synthetic-owner');
      insert into ${prefix}provider_source_grants(source_id,auth_user_id,actor_label,granted_by)
      values(${q(source)},'${actor}','${actorLabel}','synthetic-owner');
      insert into ${prefix}provider_create_policies(source_id,policy_revision,replay_guarantee,create_replay_seconds,lease_ms,granted_by)
      values(${q(source)},${q(policy)},'same_key_same_body',${seconds},${leaseMs},'synthetic-owner');
      insert into ${prefix}provider_execution_grants(source_id,auth_user_id,actor_label,granted_by)
      values(${q(source)},'${actor}','${actorLabel}','synthetic-owner');`);
  }
  reserveExpr(n, overrides = {}) {
    const input = { requestId: request(n), quoteId: this.quotes.get(n), quoteVersion: 1,
      acceptanceId: this.acceptances.get(n), sourceId, revision: adapterRevision, scope, actor,
      key: digest(`synthetic-execution-reservation-${n}`), ...overrides };
    return `${prefix}provider_attempt_reserve(${q(input.requestId)},${q(input.quoteId)},${input.quoteVersion},
      ${q(input.acceptanceId)},${q(input.sourceId)},${q(input.revision)},${j(input.scope)},${q(input.actor)},${q(input.key)})`;
  }
  async reserve(n, overrides = {}) {
    const receipt = json(await this.psql(service(`select ${this.reserveExpr(n, overrides)}::text;`)));
    this.attempts.set(n, receipt); return receipt;
  }
  contextArgs(n, overrides = {}) {
    return { requestId: request(n), attemptId: this.attempts.get(n)?.attemptId, sourceId,
      revision: adapterRevision, scope, policy: policyRevision, actor, ...overrides };
  }
  contextExpr(n, overrides = {}) {
    const a = this.contextArgs(n, overrides);
    return `${prefix}provider_create_context(${q(a.requestId)},${q(a.attemptId)},${q(a.sourceId)},${q(a.revision)},
      ${j(a.scope)},${q(a.policy)},${q(a.actor)})`;
  }
  claimExpr(n, claimKey = id(6, n), overrides = {}) {
    const a = this.contextArgs(n, overrides);
    return `${prefix}provider_create_claim(${q(a.requestId)},${q(a.attemptId)},${q(a.sourceId)},${q(a.revision)},
      ${j(a.scope)},${q(a.policy)},${q(a.actor)},${q(claimKey)})`;
  }
  async context(n, overrides = {}) {
    return json(await this.psql(service(`select ${this.contextExpr(n, overrides)}::text;`)));
  }
  async claim(n, claimKey = id(6, n), overrides = {}) {
    const receipt = json(await this.psql(service(`select ${this.claimExpr(n, claimKey, overrides)}::text;`)));
    if (receipt.authorized) this.claims.set(n, receipt); return receipt;
  }
  result(n, overrides = {}) {
    const a = this.attempts.get(n);
    return { schemaVersion: 'assisted_order_provider_create_result_v1', outcome: 'object', reason: 'object_received',
      provider: scope.provider, accountId: scope.accountId, mode: scope.mode, attemptId: a.attemptId,
      requestId: a.requestId, quoteId: a.quoteId, quoteVersion: a.quoteVersion, acceptanceId: a.acceptanceId,
      observedAmountCents: a.expectedAmountCents, currency: a.currency, providerPaymentId: `synthetic-payment-${n}`,
      providerSessionId: `synthetic-session-${n}`, state: 'pending', ...overrides };
  }
  unknown(reason = 'transport_uncertain') {
    return { schemaVersion: 'assisted_order_provider_create_result_v1', outcome: 'unknown', reason,
      provider: null, accountId: null, mode: null, attemptId: null, requestId: null, quoteId: null,
      quoteVersion: null, acceptanceId: null, observedAmountCents: null, currency: null,
      providerPaymentId: null, providerSessionId: null, state: null };
  }
  resultExpr(n, result = this.result(n), overrides = {}) {
    const a = { claimId: this.claims.get(n)?.claimId, sourceId, revision: adapterRevision, scope, policy: policyRevision, ...overrides };
    return `${prefix}provider_create_result_append(${q(a.claimId)},${q(a.sourceId)},${q(a.revision)},${j(a.scope)},${q(a.policy)},${j(result)})`;
  }
  async append(n, result = this.result(n), overrides = {}) {
    return json(await this.psql(service(`select ${this.resultExpr(n, result, overrides)}::text;`)));
  }
  event(n, overrides = {}) {
    const a = this.attempts.get(n);
    return { schemaVersion: 'assisted_order_provider_event_v1', eventId: `synthetic-execution-event-${n}`,
      payloadSha256: digest(`synthetic-execution-event-bytes-${n}`), kind: 'captured', occurredAt: new Date().toISOString(),
      claimedAttemptId: a?.attemptId ?? null, claimedRequestId: request(n), claimedQuoteId: a?.quoteId ?? null,
      claimedQuoteVersion: a?.quoteVersion ?? null, claimedAcceptanceId: a?.acceptanceId ?? null,
      claimedCanonicalOrderId: null, providerPaymentId: `synthetic-event-payment-${n}`, providerSessionId: null,
      adjustmentId: null, observedAmountCents: 5000, currency: 'USD', ...overrides };
  }
  eventExpr(n, overrides = {}) {
    return `${prefix}provider_event_append('${sourceId}','${adapterRevision}',${j(scope)},${j(this.event(n, overrides))})`;
  }
  async snapshot() {
    return json(await this.psql(`select jsonb_build_object(
      'requests',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}requests r),
      'quotes',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}quotes r),
      'observations',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}payment_observations r),
      'verifications',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}payment_verifications r),
      'claims',(select jsonb_agg(to_jsonb(r) order by method,provider_namespace,evidence_ref) from ${prefix}evidence_claims r),
      'dispositions',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}financial_dispositions r),
      'events',(select jsonb_agg(to_jsonb(r) order by id) from ${prefix}events r),
      'outbox',(select jsonb_agg(to_jsonb(r) order by id) from public.research_notification_outbox r),
      'audit',(select jsonb_agg(to_jsonb(r) order by event_id) from ${prefix}audit_events_v1 r))::text;`));
  }
  async waitForLease(n) {
    const c = await this.context(n);
    if (c.leaseExpiresAt) {
      await this.psql(`select pg_sleep(greatest(0,extract(epoch from (${q(c.leaseExpiresAt)}::timestamptz-clock_timestamp())))+0.02);`);
    }
  }
}
