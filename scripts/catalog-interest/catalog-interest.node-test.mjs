import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const app = read("client/src/App.tsx");
const page = read("client/src/pages/CatalogInterestPage.tsx");
const routes = read("server/routes.ts");
const production = read("server/catalog-interest/production.ts");
const mail = read("server/catalog-interest/mail.ts");
const outbox = read("server/research/outbox.ts");
const sql = read("supabase/candidates/20261022_catalog_interest/001_catalog_interest.sql");

test("the public page and API are mounted at the required seams", () => {
  assert.match(app, /path="\/health\/catalog" component=\{CatalogInterestRoutes\}/u);
  assert.ok(app.indexOf('path="/health/catalog"') < app.indexOf('path="/health"'));
  assert.match(routes, /registerCatalogInterestApi\(app, createCatalogInterestDependencies\(\)\)/u);
});

test("the page preserves Quick Order and sends only bounded catalog fields", () => {
  assert.match(page, /https:\/\/xeniostechnology\.com\/research\/early-access\/order-request/u);
  assert.match(page, /marketingConsent/u);
  assert.match(page, /not required to receive the catalog/u);
  assert.doesNotMatch(page, /getAttribution|source_page|landing_page|referrer_url/u);
  assert.doesNotMatch(page, /textarea/u);
});

test("production admission uses the durable limiter RPC with no memory fallback", () => {
  assert.match(production, /rpc\("research_rate_limit_hit"/u);
  assert.match(production, /return "unavailable"/u);
  assert.doesNotMatch(production, /rateLimitHit|memory_fallback/u);
});

test("one security-definer RPC owns the lead, consent, and exactly two outbox inserts", () => {
  assert.match(sql, /security definer/u);
  assert.match(sql, /set search_path = ''/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
  assert.match(sql, /extensions\.digest/u);
  assert.match(sql, /is distinct from v_expected_fingerprint/u);
  assert.match(sql, /p_fingerprint is null/u);
  assert.match(sql, /p_authority_state is null/u);
  assert.match(sql, /alter table public\.catalog_interest_leads force row level security/u);
  assert.match(sql, /grant execute on function public\.record_catalog_interest[^]*to service_role/u);
  assert.equal((sql.match(/insert into public\.research_notification_outbox/gu) ?? []).length, 2);
  assert.doesNotMatch(sql, /insert into public\.research_notification_outbox[^;]*on conflict/isu);
  assert.match(sql, /catalog_interest_customer/u);
  assert.match(sql, /catalog_interest_team/u);
});

test("customer delivery is cancelled for manual review and mail requires a provider ID", () => {
  assert.match(sql, /then 'pending' else 'cancelled'/u);
  assert.match(mail, /if \(result\.errorCode\)/u);
  assert.match(mail, /if \(!providerMessageId\)/u);
  assert.match(mail, /code: "provider_id_missing"/u);
  assert.match(mail, /idempotencyKey: parsed\.data\.eventKey/u);
});

test("the canonical outbox owns both catalog templates behind the strict adapter", () => {
  assert.match(outbox, /case CATALOG_INTEREST_CUSTOMER_EVENT:/u);
  assert.match(outbox, /case CATALOG_INTEREST_TEAM_EVENT:/u);
  assert.match(outbox, /sendCatalogInterestMail/u);
  assert.match(outbox, /catalogAuthorityFromEnvironment\(process\.env, now\)/u);
  assert.match(outbox, /createResendCatalogMailProvider/u);
  assert.match(outbox, /nonRetryable: !delivery\.retryable/u);
});
