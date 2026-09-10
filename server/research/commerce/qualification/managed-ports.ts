/** Real HTTP ports for qualification; no fixture fallback and no imports from production startup. */
import { createPinnedHttp, objectOf, requiredString, fail, originOf, cents } from './managed-runtime';
export interface ManagedPortConfig {
  baseUrl: string; databaseUrl: string; faultControlUrl: string | null;
  secrets: { serviceRoleKey(): string; secretKey(): string; webhookSecret(): string };
}
export function createManagedHttpPort(config: Pick<ManagedPortConfig, 'baseUrl'>) { return createPinnedHttp(config.baseUrl); }
export function createManagedDatabasePort(config: ManagedPortConfig) {
  const origin = originOf(config.databaseUrl), client = createPinnedHttp(origin), key = config.secrets.serviceRoleKey();
  const allowed = new Set(['research_orders', 'research_checkout_executions']);
  return {
    origin: () => origin, overHttp: () => true,
    async selectOne(table: string, columns: string, filters: Record<string, string>): Promise<Record<string, unknown> | null> {
      if (!allowed.has(table) || !/^[a-z_, ]+$/.test(columns) || !columns.trim()) fail('canonical_projection_not_allowed');
      const url = new URL(`/rest/v1/${table}`, origin); url.searchParams.set('select', columns); url.searchParams.set('limit', '2');
      if (Object.keys(filters).length === 0) fail('canonical_filter_missing');
      for (const [column, value] of Object.entries(filters)) {
        if (!['id', 'member_id', 'request_key'].includes(column) || !value) fail('canonical_filter_not_allowed');
        url.searchParams.set(column, `eq.${value}`);
      }
      const response = await client.request({ method: 'GET', url: url.href, headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
      if (response.status !== 200 || !Array.isArray(response.body)) fail('canonical_read_failed');
      if (response.body.length > 1) fail('canonical_read_ambiguous');
      if (response.body.length === 0) return null;
      const row = objectOf(response.body[0]); if (!row) fail('canonical_row_unreadable');
      return row;
    },
  };
}
export function createManagedProviderPort(config: ManagedPortConfig, options: { fetcher?: typeof fetch; maxPages?: number } = {}) {
  const key = config.secrets.secretKey(); if (!/^(sk|rk)_test_[A-Za-z0-9]{4,}$/.test(key)) fail('provider_test_key_required');
  const origin = 'https://api.stripe.com', client = createPinnedHttp(origin, { fetcher: options.fetcher });
  const maxPages = options.maxPages ?? 10;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) fail('provider_page_limit_invalid');
  const get = async (path: string): Promise<Record<string, unknown> | null> => {
    const r = await client.request({ method: 'GET', url: new URL(path, origin).href, headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (r.status === 404) return null;
    const body = objectOf(r.body); if (r.status !== 200 || !body) fail('provider_read_failed');
    return body;
  };
  return {
    mode: (): 'test' | 'live' => 'test', accountId: () => null,
    async retrieveIntent(reference: string) {
      if (!/^pi_[A-Za-z0-9]+$/.test(reference)) fail('provider_reference_invalid');
      const body = await get(`/v1/payment_intents/${encodeURIComponent(reference)}`);
      if (body && (body.id !== reference || body.livemode !== false)) fail('provider_mode_or_identity_mismatch');
      return body;
    },
    async listIntentsSince(createdAtSeconds: number) {
      cents(createdAtSeconds, 'provider_window_invalid');
      const rows: Record<string, unknown>[] = []; let cursor: string | null = null; const seen = new Set<string>();
      for (let page = 0; page < maxPages; page++) {
        const q = new URLSearchParams({ limit: '100', 'created[gte]': String(createdAtSeconds) });
        if (cursor) q.set('starting_after', cursor);
        const body = await get(`/v1/payment_intents?${q}`);
        if (!body || !Array.isArray(body.data) || typeof body.has_more !== 'boolean') fail('provider_list_unreadable');
        for (const raw of body.data) {
          const row = objectOf(raw); if (!row || row.livemode !== false) fail('provider_list_mode_invalid');
          const id = requiredString(row.id, 'provider_list_id_missing'); if (seen.has(id)) fail('provider_list_did_not_advance');
          seen.add(id); rows.push(row);
        }
        if (body.has_more === false) return rows;
        if (body.data.length === 0) fail('provider_list_did_not_advance');
        cursor = requiredString(objectOf(body.data[body.data.length - 1])?.id, 'provider_cursor_missing');
      }
      // Counts are evidence. Never turn a page cap into an apparently complete smaller count.
      return fail('provider_count_incomplete');
    },
  };
}
export function createAuthenticatedFaultPort(origin: string, token: string, expected: { runId: string; sourceSha: string; projectRef: string }) {
  const base = originOf(origin, true), client = createPinnedHttp(base);
  if (!/^[a-f0-9]{64}$/.test(token)) fail('fault_control_token_missing');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const verify = async () => {
    const r = await client.request({ method: 'GET', url: `${base}/__qualification/identity`, headers });
    const identity = objectOf(objectOf(r.body)?.identity);
    if (r.status !== 200 || !identity || identity.runId !== expected.runId || identity.projectRef !== expected.projectRef ||
      identity.sourceSha !== expected.sourceSha || identity.mode !== 'test' || !Number.isSafeInteger(identity.pid)) fail('fault_control_identity_mismatch');
  };
  const post = async (path: string, body: unknown) => {
    await verify();
    const r = await client.request({ method: 'POST', url: `${base}${path}`, headers, body });
    if (r.status !== 200 || objectOf(r.body)?.ok !== true) fail('fault_control_refused');
  };
  return { injectTransportFault: (fault: 'lost_response' | 'server_error') => post('/__qualification/fault', { fault }),
    failNextLocalCommit: () => post('/__qualification/fail-next-commit', {}) };
}
