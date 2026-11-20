import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const ROOM_ORIGIN = 'http://127.0.0.1:4177';
export const ROOM_PATH = '/api/control-room';
export const RECEIPT_PROTOCOL = 'xenios-control-handoff-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROVIDERS = ['codex', 'claude', 'muse', 'ollie', 'generic'];
const WORK_STATES = new Set(['unknown', 'idle', 'running', 'waiting_review', 'blocked']);
const STAGES = ['recorded', 'delivered', 'acknowledged', 'working', 'result_submitted'];
const REGISTRIES = ['SESSION_REGISTRY', 'ACTIVE_TASKS', 'CODE_OWNERSHIP'];
const MAX_BODY = 32 * 1024;
const MAX_EXPORT = 16 * 1024 * 1024;
const MAX_RECORDS = 1000;
const STALE_AFTER = 90_000;
const text = (value, length = 2000) => typeof value === 'string' ? value.slice(0, length) : '';
const validId = value => typeof value === 'string' && IDENTIFIER.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
export function roomInstant(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_INSTANT.exec(value);
  if (!match || match[0] !== value) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date.parse normalizes some impossible dates and 24:00 to the next day.
  // Validate the written local calendar, clock and numeric offset first.
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59
    || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}
const instant = roomInstant;
const FUTURE_SKEW = 30_000;
function sourceTiming(state, observedAt) {
  const capturedAt = instant(state.capturedAt), now = instant(observedAt);
  const age = capturedAt && now ? Date.parse(now) - Date.parse(capturedAt) : null;
  return {capturedAt, freshness: age === null ? 'unknown' : age > 30 * 60_000 || age < -FUTURE_SKEW ? 'stale' : 'current'};
}
function connectorTiming(row, at) {
  const now = instant(at), createdAt = instant(row.createdAt), expiresAt = instant(row.expiresAt);
  if (!now || !createdAt || !expiresAt) return null;
  const created = Date.parse(createdAt), expires = Date.parse(expiresAt), observed = Date.parse(now);
  if (expires <= created || created > observed + FUTURE_SKEW) return null;
  return {now: observed, created, expires};
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeArray = value => Array.isArray(value) ? value.slice(0, MAX_RECORDS) : [];
const nowISO = () => new Date().toISOString();
const error = (status, code, message) => Object.assign(new Error(message || code.replaceAll('_', ' ')), {status, code});
function requireCondition(value, status, code, message) { if (!value) throw error(status, code, message); }
function exactInput(input, keys) {
  requireCondition(object(input) && Object.keys(input).every(key => keys.includes(key)), 400, 'invalid_fields');
}
function boundedText(value, max, required = false) {
  requireCondition(typeof value === 'string' && value.length <= max && (!required || value.trim().length), 400, 'invalid_text');
  requireCondition(!/\u0000/.test(value), 400, 'invalid_text');
  requireCondition(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk_live_|sk_test_)[A-Za-z0-9_]{16,}/.test(value), 400, 'credential_content_rejected');
  return value.trim();
}
function parseJSON(value) { return JSON.parse(String(value).replace(/^\uFEFF/, '')); }

/** Existing CLI is the sole authority. This port cannot bind, bootstrap, repair,
 * create tasks, transfer ownership, run agents, or bypass host approvals. */
export function createCoordinatorPort(repoRoot, {run = execute, timeoutMs = 30_000} = {}) {
  const cli = path.join(repoRoot, 'scripts', 'agentic', 'xenios-os.mjs');
  let readPending = null, cachedRead = null, mutationChain = Promise.resolve();
  async function call(args) {
    let stdout;
    try {
      ({stdout} = await run(process.execPath, [cli, ...args], {
        cwd: repoRoot, encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_EXPORT, windowsHide: true,
      }));
    } catch (failure) {
      let code;
      try { code = parseJSON(failure.stderr || failure.stdout).code; } catch { /* Do not expose raw CLI errors or environment. */ }
      const conflict = ['coordination_revision_conflict', 'operation_id_reused', 'operation_id_conflict', 'operation_identity_conflict'].includes(code);
      throw error(conflict ? 409 : 503, conflict ? code : 'coordinator_unavailable');
    }
    let output;
    try { output = parseJSON(stdout); } catch { throw error(503, 'coordinator_invalid'); }
    requireCondition(output.ok === true && object(output.coordination), 503, 'coordinator_invalid');
    return output;
  }
  return {
    async read() {
      if (cachedRead && Date.now() - cachedRead.at < 1000) {
        if (cachedRead.failure) throw cachedRead.failure;
        return cachedRead.state;
      }
      if (readPending) return readPending;
      readPending = (async () => {
      const output = await call(['export']);
      requireCondition(object(output.files) && Number.isSafeInteger(output.coordination.revision), 503, 'coordinator_invalid');
      const decode = filename => {
        const file = output.files[filename];
        requireCondition(object(file) && typeof file.base64 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256 || ''), 503, 'coordinator_invalid');
        const bytes = Buffer.from(file.base64, 'base64');
        requireCondition(bytes.length <= MAX_EXPORT && hash(bytes) === file.sha256, 503, 'coordinator_invalid');
        return parseJSON(bytes.toString('utf8'));
      };
      const registries = Object.fromEntries(REGISTRIES.map(name => [name, decode(`${name}.json`)]));
      const messageFiles = Object.keys(output.files).filter(name => /^messages\/[A-Za-z0-9._:-]+\.json$/.test(name));
      requireCondition(messageFiles.length <= 10_000, 503, 'message_export_too_large');
      const messages = messageFiles.map(decode).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const state = {availability: 'authority', registries, messages, coordination: output.coordination,
        capturedAt: instant(output.coordination.observedAt), sourceSha: null, reason: null};
      cachedRead = {at: Date.now(), state};
      return state;
      })().catch(failure => {cachedRead = {at: Date.now(), failure}; throw failure;}).finally(() => {readPending = null;});
      return readPending;
    },
    async message({from, to, text: body, operationId, expectedRevision}) {
      requireCondition(validId(from) && validId(to) && UUID.test(operationId) && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, 400, 'invalid_message');
      const pending = mutationChain.then(() => call(['message', '--from', from, '--to', to, '--text', body,
        '--operation-id', operationId, '--expected-revision', String(expectedRevision)])).catch(failure => {
        if (failure.status === 409) throw failure;
        throw error(503, 'mutation_outcome_unknown', 'The coordinator did not confirm the outcome. Keep the same operation ID when checking or retrying.');
      }).finally(() => {cachedRead = null;});
      mutationChain = pending.catch(() => {});
      return pending;
    },
  };
}

/** All snapshot files come from one immutable Git commit. No checkout JSON is
 * promoted to an installed authority, and snapshots never enable writes. */
export async function readGitSnapshot(repoRoot, {run = execute} = {}) {
  const git = async args => (await run('git', args, {cwd: repoRoot, encoding: 'utf8', timeout: 2500, maxBuffer: 4 * 1024 * 1024, windowsHide: true})).stdout;
  const sourceSha = (await git(['rev-parse', 'HEAD'])).trim();
  requireCondition(/^[a-f0-9]{40}$/.test(sourceSha), 503, 'snapshot_unavailable');
  const values = await Promise.all(REGISTRIES.map(async name => [name, parseJSON(await git(['show', `${sourceSha}:.xenios/${name}.json`]))]));
  const registries = Object.fromEntries(values);
  const dates = values.map(([, value]) => instant(value.updatedAt)).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {availability: 'snapshot', registries, messages: [], coordination: null, sourceSha,
    capturedAt: dates.length === REGISTRIES.length ? dates[0] : null, reason: 'coordinator_not_connected'};
}

function registryRows(state) {
  const registries = state?.registries || {};
  for (const [name, key] of [['SESSION_REGISTRY', 'sessions'], ['ACTIVE_TASKS', 'tasks'], ['CODE_OWNERSHIP', 'leases']]) {
    const value = registries[name];
    requireCondition(object(value) && value.schemaVersion === 1 && Array.isArray(value[key]) && value[key].length <= MAX_RECORDS, 503, 'invalid_registry');
  }
  return {sessions: registries.SESSION_REGISTRY.sessions, tasks: registries.ACTIVE_TASKS.tasks, ownership: registries.CODE_OWNERSHIP.leases};
}
function cleanMessage(row) {
  if (!object(row) || !validId(row.from) || !validId(row.to) || !validId(row.id)) return null;
  let envelope;
  try { envelope = parseJSON(row.text); } catch { /* Ordinary coordinator message. */ }
  const structured = object(envelope) && envelope.protocol === RECEIPT_PROTOCOL;
  return {id: row.id, from: row.from, to: row.to, text: text(row.text, 12_000), createdAt: instant(row.createdAt),
    kind: structured && ['handoff', 'receipt'].includes(envelope.kind) ? envelope.kind : 'note',
    subject: structured ? text(envelope.subject, 160) : 'Coordinator note',
    taskId: structured && validId(envelope.taskId) ? envelope.taskId : null,
    stage: 'recorded', receiptAt: null, envelope: structured ? envelope : null};
}
export function projectMessages(rawMessages) {
  const rows = (Array.isArray(rawMessages) ? rawMessages.slice(0, 10_000) : []).map(cleanMessage).filter(Boolean);
  const handoffs = new Map(rows.filter(row => row.kind === 'handoff').map(row => [row.id, row]));
  for (const receipt of rows.filter(row => row.kind === 'receipt').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const original = handoffs.get(receipt.envelope.messageId);
    const next = receipt.envelope.stage;
    if (!original || receipt.from !== original.to || receipt.to !== original.from || !STAGES.includes(next)) continue;
    if (STAGES.indexOf(next) >= STAGES.indexOf(original.stage)) {
      original.stage = next;
      original.receiptAt = receipt.createdAt;
    }
  }
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-MAX_RECORDS).map(({envelope, ...row}) => ({...row, ...(row.kind === 'handoff' ? {
    goal: text(envelope.goal, 8000), acceptance: text(envelope.acceptance, 3000),
  } : row.kind === 'receipt' ? {summary: text(envelope.summary, 3000)} : {})}));
}

/** Bounded transport credentials/observations, not a task or ownership ledger.
 * No provider transcript is read. Tokens are stored only as SHA256 hashes. */
export function createConnectorStore(directory, {clock = nowISO} = {}) {
  const filename = path.join(directory, 'control-room-connectors.json');
  let chain = Promise.resolve();
  async function read() {
    try {
      const stat = await fs.lstat(filename);
      requireCondition(stat.isFile() && !stat.isSymbolicLink() && stat.size < 256 * 1024, 503, 'connector_store_invalid');
      const value = parseJSON(await fs.readFile(filename, 'utf8'));
      requireCondition(value.schemaVersion === 1 && Array.isArray(value.connectors) && value.connectors.length <= 64, 503, 'connector_store_invalid');
      return value;
    } catch (failure) { if (failure.code === 'ENOENT') return {schemaVersion: 1, connectors: []}; throw failure; }
  }
  async function update(fn) {
    const pending = chain.then(async () => {
      const state = await read();
      const result = await fn(state);
      await fs.mkdir(directory, {recursive: true, mode: 0o700});
      const stat = await fs.lstat(directory);
      requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), 503, 'connector_store_invalid');
      const temporary = path.join(directory, `control-room-connectors.${randomUUID()}.tmp`);
      try { await fs.writeFile(temporary, `${JSON.stringify(state)}\n`, {mode: 0o600, flag: 'wx'}); await fs.rename(temporary, filename); }
      finally { await fs.rm(temporary, {force: true}).catch(() => {}); }
      return result;
    });
    chain = pending.catch(() => {});
    return pending;
  }
  function authorized(state, token) {
    requireCondition(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 401, 'connector_unauthorized');
    const digest = Buffer.from(hash(token), 'hex');
    const connector = state.connectors.find(row => typeof row.tokenHash === 'string' && /^[a-f0-9]{64}$/.test(row.tokenHash)
      && timingSafeEqual(digest, Buffer.from(row.tokenHash, 'hex')));
    const timing = connector && connectorTiming(connector, clock());
    requireCondition(connector && !connector.revokedAt && timing && timing.expires > timing.now, 401, 'connector_unauthorized');
    return connector;
  }
  return {
    async list() { await chain; return (await read()).connectors.map(({tokenHash, ...row}) => row); },
    async authenticate(token) { await chain; const {tokenHash, ...row} = authorized(await read(), token); return row; },
    async withCredential(token, callback) {
      // Revocation and the final authorization/write boundary are ordered.
      // An already-authorized write finishes before revoke returns; a write
      // arriving after completed revocation cannot use the prior observation.
      const pending = chain.then(async () => {
        const {tokenHash, ...row} = authorized(await read(), token);
        return callback(row);
      });
      chain = pending.catch(() => {});
      return pending;
    },
    async create({sessionId, provider, label}) {
      return update(state => {
        const at = instant(clock());
        requireCondition(at, 503, 'clock_unavailable');
        const current = state.connectors.filter(row => !row.revokedAt && (!instant(row.expiresAt) || Date.parse(row.expiresAt) > Date.parse(at)));
        requireCondition(current.length < 32, 409, 'connector_limit');
        requireCondition(!current.some(row => row.sessionId === sessionId), 409, 'session_already_connected');
        const token = randomBytes(32).toString('base64url');
        const record = {id: randomUUID(), sessionId, provider, label, tokenHash: hash(token), createdAt: at,
          expiresAt: new Date(Date.parse(at) + 24 * 60 * 60_000).toISOString(), lastObservedAt: null, sequence: 0,
          workState: 'unknown', summary: '', capabilities: ['inbox.read', 'receipt.write', 'status.publish']};
        state.connectors = [...current, record];
        const {tokenHash, ...connector} = record;
        return {connector, token};
      });
    },
    async revoke(id) { return update(state => { const row = state.connectors.find(item => item.id === id); requireCondition(row, 404, 'connector_not_found'); const at = instant(clock()); requireCondition(at, 503, 'clock_unavailable'); row.revokedAt = at; return {id, revokedAt: at}; }); },
    async heartbeat(token, {sequence, workState, summary}) {
      return update(state => {
        const row = authorized(state, token);
        requireCondition(Number.isSafeInteger(sequence) && sequence > row.sequence, 409, 'stale_sequence');
        requireCondition(WORK_STATES.has(workState), 400, 'invalid_work_state');
        const at = instant(clock()); requireCondition(at, 503, 'clock_unavailable');
        const timing = connectorTiming(row, at); requireCondition(timing && timing.expires > timing.now, 401, 'connector_unauthorized');
        row.sequence = sequence; row.workState = workState; row.summary = boundedText(summary, 500); row.lastObservedAt = at;
        return {receivedAt: row.lastObservedAt};
      });
    },
  };
}

export async function collectRoomResources(repoRoot, clock = nowISO) {
  let disk = {freeBytes: null, totalBytes: null, state: 'unknown', label: path.parse(repoRoot).root};
  try {
    const stat = await fs.statfs(repoRoot);
    const freeBytes = stat.bavail * stat.bsize, totalBytes = stat.blocks * stat.bsize;
    disk = {...disk, freeBytes, totalBytes, state: freeBytes < 5 * 1024 ** 3 ? 'critical' : freeBytes < 20 * 1024 ** 3 ? 'low' : 'healthy'};
  } catch { /* Unknown is preferable to a stale Windows C: reading. */ }
  const freeBytes = os.freemem();
  return {observedAt: clock(), disk, memory: {freeBytes, totalBytes: os.totalmem(), state: freeBytes < 700 * 1024 ** 2 ? 'critical' : freeBytes < 2 * 1024 ** 3 ? 'low' : 'healthy'}};
}

export function projectRoom(state, connectorRecords, resources, {operatorSession = '', clock = nowISO, host = {name: os.hostname(), platform: process.platform, local: true}} = {}) {
  const observedAt = instant(clock());
  const timing = sourceTiming(state, observedAt);
  const rows = state.availability === 'unavailable' ? {sessions: [], tasks: [], ownership: []} : registryRows(state);
  const currentConnectors = connectorRecords.filter(object).filter(row => !row.revokedAt
    && (!instant(row.expiresAt) || !observedAt || Date.parse(row.expiresAt) > Date.parse(observedAt)));
  const bridgeBySession = new Map(currentConnectors.map(row => [row.sessionId, row]));
  const connectionState = row => {
    const lifetime = connectorTiming(row, observedAt);
    if (!lifetime) return 'unknown';
    if (row.lastObservedAt === null || row.lastObservedAt === undefined) return 'configured';
    const observation = instant(row.lastObservedAt);
    if (!observation) return 'unknown';
    const at = Date.parse(observation);
    if (at < lifetime.created || at > lifetime.expires) return 'unknown';
    if (at > lifetime.now + FUTURE_SKEW || lifetime.now - at > STALE_AFTER
      || state.availability !== 'authority' || timing.freshness !== 'current') return 'stale';
    return 'connected';
  };
  const tasks = rows.tasks.filter(row => validId(row.id)).map(row => ({id: row.id, title: text(row.title || row.id, 300),
    state: text(row.state, 50), owner: validId(row.owner) ? row.owner : null, priority: text(row.priority, 8),
    paths: safeArray(row.paths).map(value => text(value, 300)), dependsOn: safeArray(row.dependsOn).filter(validId),
    handoff: object(row.handoff) ? {session: text(row.handoff.session, 128), sha: text(row.handoff.sha, 40), at: instant(row.handoff.at)} : null,
    acceptedSha: /^[a-f0-9]{40}$/.test(row.acceptedSha || '') ? row.acceptedSha : null, acceptedBy: text(row.acceptedBy, 128)}));
  const sessions = rows.sessions.filter(row => validId(row.id)).map(row => {
    const bridge = bridgeBySession.get(row.id);
    const connected = bridge && connectionState(bridge) === 'connected';
    return {id: row.id, tool: text(row.tool, 60), lane: text(row.lane, 160), branch: text(row.branch, 250), state: text(row.state, 40),
      heartbeatAt: instant(row.heartbeatAt), note: text(row.note, 1800), workState: connected ? bridge.workState : 'unknown',
      workStateSource: connected ? 'connector_reported' : 'not_observed',
      connection: bridge ? connectionState(bridge) : 'not_configured', observedAt: instant(bridge?.lastObservedAt),
      taskIds: tasks.filter(task => task.owner === row.id && task.state !== 'done').map(task => task.id),
      capabilities: connected ? bridge.capabilities : []};
  });
  const messages = projectMessages(state.messages || []);
  const connections = PROVIDERS.map(provider => {
    const records = currentConnectors.filter(row => row.provider === provider);
    const states = records.map(connectionState);
    const state = states.includes('connected') ? 'connected' : states.includes('stale') ? 'stale' : states.includes('unknown') ? 'unknown' : records.length ? 'configured' : 'not_configured';
    return {id: provider, provider, label: {codex: 'Codex', claude: 'Claude Code', muse: 'Muse', ollie: 'Ollie', generic: 'Other agent'}[provider], state,
      capabilities: records.length ? ['inbox.read', 'receipt.write', 'status.publish'] : [],
      lastObservedAt: records.map(row => instant(row.lastObservedAt)).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || null,
      sessionIds: records.map(row => row.sessionId), connectors: records.map(row => ({...row, createdAt: instant(row.createdAt), expiresAt: instant(row.expiresAt), lastObservedAt: instant(row.lastObservedAt)})),
      description: provider === 'muse' || provider === 'ollie' ? 'Connect through a supported MCP client on this host. A cloud-only agent needs an approved reachable bridge.' : 'Connect an existing registered session through its supported MCP client. No automatic resume or new session.'};
  });
  const operator = {sessionId: operatorSession || null, available: state.availability === 'authority' && timing.freshness === 'current' && rows.sessions.some(row => row.id === operatorSession && row.state === 'active')};

  return {schemaVersion: 1, observedAt, host, source: {availability: state.availability,
    freshness: timing.freshness,
    capturedAt: timing.capturedAt, sourceSha: state.sourceSha || null, revision: state.coordination?.revision ?? null, reason: state.reason || null},
    sessions, tasks, messages, messagesTruncated: (state.messages || []).length > MAX_RECORDS, ownership: rows.ownership.filter(object).map((row, sourceIndex) => ({id: validId(row.id) ? row.id : null, legacy: !validId(row.id), sourceIndex, task: text(row.task, 128), session: text(row.session, 128),
      state: text(row.state, 40), paths: safeArray(row.paths).map(value => text(value, 300)), heartbeatAt: instant(row.heartbeatAt)})),
    resources, connections, operator, capabilities: {sendHandoff: operator.available, configureConnector: operator.available, revokeConnector: true},
    activity: messages.filter(row => row.kind !== 'receipt').slice(-50).reverse().map(row => ({id: row.id, type: row.kind, title: row.subject,
      detail: row.kind === 'handoff' ? `${row.stage} · ${row.to}` : row.text.slice(0, 200), at: row.receiptAt || row.createdAt, sessionId: row.to, taskId: row.taskId}))};
}

function security(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}
function json(response, status, payload) {
  security(response); response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); response.end(`${JSON.stringify(payload)}\n`);
}
async function body(request) {
  requireCondition(String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase() === 'application/json', 415, 'json_required');
  requireCondition(!request.headers['content-encoding'] || request.headers['content-encoding'] === 'identity', 415, 'encoding_rejected');
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; requireCondition(size <= MAX_BODY, 413, 'request_too_large'); chunks.push(chunk); }
  try { const value = parseJSON(Buffer.concat(chunks).toString('utf8')); requireCondition(object(value), 400, 'invalid_json'); return value; }
  catch (failure) { if (failure.status) throw failure; throw error(400, 'invalid_json'); }
}

export function createControlRoomHandler({repoRoot, assetsDirectory, runtimeDirectory, coordinator = createCoordinatorPort(repoRoot),
  snapshotReader = () => readGitSnapshot(repoRoot), connectorStore = createConnectorStore(runtimeDirectory),
  operatorSession = process.env.XENIOS_CONTROL_OPERATOR_SESSION || '', clock = nowISO,
  resourceReader = () => collectRoomResources(repoRoot, clock)} = {}) {
  const csrfToken = randomBytes(32).toString('base64url');
  let readPending = null;
  async function readState() {
    if (readPending) return readPending;
    readPending = (async () => {
      try { const state = await coordinator.read(); registryRows(state); return state; }
      catch {
        try { const state = await snapshotReader(); registryRows(state); return {...state, availability: 'snapshot', coordination: null}; }
        catch { return {availability: 'unavailable', capturedAt: null, sourceSha: null, reason: 'coordinator_unavailable', messages: []}; }
      }
    })().finally(() => {readPending = null;});
    return readPending;
  }
  async function authoritativeState() {
    let state;
    try { state = await coordinator.read(); } catch { throw error(503, 'coordinator_unavailable', 'The installed coordinator is unavailable. This handoff was not recorded.'); }
    requireCondition(state.availability === 'authority', 503, 'coordinator_unavailable');
    registryRows(state); requireCondition(sourceTiming(state, clock()).freshness === 'current', 503, 'coordinator_observation_unavailable'); return state;
  }
  function browserMutation(request) {
    requireCondition(request.headers.origin === ROOM_ORIGIN && request.headers['x-xenios-control-token'] === csrfToken, 403, 'mutation_guard_rejected');
  }
  function activeSession(state, sessionId) { return registryRows(state).sessions.some(row => row.id === sessionId && row.state === 'active'); }
  function revision(input) { requireCondition(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 && UUID.test(input.operationId || ''), 400, 'operation_and_revision_required'); }

  async function bridge(request, input) {
    requireCondition(!request.headers.origin || request.headers.origin === ROOM_ORIGIN, 403, 'origin_rejected');
    const authorization = String(request.headers.authorization || '');
    requireCondition(authorization.startsWith('Bearer '), 401, 'connector_unauthorized');
    const token = authorization.slice(7);
    const connector = await connectorStore.authenticate(token);
    const state = await authoritativeState();
    requireCondition(activeSession(state, connector.sessionId), 403, 'session_not_active');
    if (input.kind === 'heartbeat') {
      exactInput(input, ['kind', 'sequence', 'workState', 'summary']);
      return {ok: true, ...await connectorStore.heartbeat(token, input)};
    }
    if (input.kind === 'inbox') {
      exactInput(input, ['kind']);
      const addressed = (state.messages || []).filter(row => row.to === connector.sessionId || row.from === connector.sessionId || row.to === 'all');
      const messages = projectMessages(addressed);
      return {ok: true, sessionId: connector.sessionId, revision: state.coordination.revision,
        messages, messagesTotal: addressed.length, messagesReturned: messages.length,
        messagesTruncated: addressed.length > messages.length, messageCount: addressed.length,
        tasks: registryRows(state).tasks.filter(row => row.owner === connector.sessionId).map(row => ({id: row.id, title: text(row.title || row.id, 300), state: text(row.state, 40), priority: text(row.priority, 8)}))};
    }
    requireCondition(input.kind === 'receipt', 400, 'unknown_bridge_operation');
    exactInput(input, ['kind', 'operationId', 'messageId', 'stage', 'summary', 'expectedRevision']); revision(input);
    requireCondition(STAGES.slice(1).includes(input.stage), 400, 'invalid_receipt_stage');
    const original = (state.messages || []).map(cleanMessage).find(row => row?.id === input.messageId && row.kind === 'handoff');
    requireCondition(original && original.to === connector.sessionId, 403, 'handoff_not_addressed_to_session');
    const summary = boundedText(input.summary || '', 3000);
    const envelope = {protocol: RECEIPT_PROTOCOL, kind: 'receipt', messageId: original.id, stage: input.stage, summary};
    const result = await connectorStore.withCredential(token, current => coordinator.message({from: current.sessionId, to: original.from, operationId: input.operationId,
      expectedRevision: input.expectedRevision, text: JSON.stringify(envelope)}));
    return {ok: true, messageId: result.message.id, stage: input.stage, coordination: result.coordination};
  }

  return async function handle(request, response) {
    let url;
    try { url = new URL(request.url, ROOM_ORIGIN); } catch { return false; }
    const assets = new Map([['/control-room', ['control-room.html', 'text/html']], ['/control-room.html', ['control-room.html', 'text/html']],
      ['/control-room.css', ['control-room.css', 'text/css']], ['/control-room.js', ['control-room.js', 'text/javascript']]]);
    if (!url.pathname.startsWith(ROOM_PATH) && !assets.has(url.pathname)) return false;
    try {
      requireCondition(request.headers.host === '127.0.0.1:4177', 403, 'loopback_host_required');
      requireCondition(!url.search && ['GET', 'POST'].includes(request.method), 405, 'method_or_query_rejected');
      if (assets.has(url.pathname)) {
        requireCondition(request.method === 'GET', 405, 'get_required');
        const [file, mime] = assets.get(url.pathname); const bytes = await fs.readFile(path.join(assetsDirectory, file));
        security(response); response.writeHead(200, {'Content-Type': `${mime}; charset=utf-8`}); response.end(bytes); return true;
      }
      if (request.method === 'GET') {
        requireCondition(!request.headers['transfer-encoding'] && (!request.headers['content-length'] || request.headers['content-length'] === '0'), 400, 'body_not_allowed');
        if (url.pathname === `${ROOM_PATH}/bootstrap`) {json(response, 200, {ok: true, csrfToken}); return true;}
        requireCondition(url.pathname === ROOM_PATH, 404, 'endpoint_not_found');
        const [state, connectors, resources] = await Promise.all([readState(), connectorStore.list(), resourceReader()]);
        json(response, 200, {ok: true, room: projectRoom(state, connectors, resources, {operatorSession, clock})}); return true;
      }
      if (url.pathname === `${ROOM_PATH}/bridge`) {json(response, 200, await bridge(request, await body(request))); return true;}
      browserMutation(request);
      const input = await body(request);
      if (url.pathname === `${ROOM_PATH}/connectors/revoke`) {
        exactInput(input, ['id']); requireCondition(UUID.test(input.id || ''), 400, 'invalid_connector');
        json(response, 200, {ok: true, ...await connectorStore.revoke(input.id)}); return true;
      }
      requireCondition([`${ROOM_PATH}/handoffs`, `${ROOM_PATH}/handoffs/reconcile`, `${ROOM_PATH}/connectors`].includes(url.pathname), 404, 'endpoint_not_found');
      const reconciling = url.pathname === `${ROOM_PATH}/handoffs/reconcile`;
      const state = await authoritativeState();
      requireCondition(activeSession(state, operatorSession), 403, 'operator_session_not_configured');
      if (url.pathname === `${ROOM_PATH}/connectors`) {
        exactInput(input, ['sessionId', 'provider', 'label']);
        requireCondition(validId(input.sessionId) && activeSession(state, input.sessionId) && PROVIDERS.includes(input.provider), 400, 'invalid_connector_session');
        const label = boundedText(input.label, 100, true);
        const created = await connectorStore.create({sessionId: input.sessionId, provider: input.provider, label});
        json(response, 201, {ok: true, ...created, configuration: {command: process.execPath,
          args: [path.join(assetsDirectory, 'control-room-mcp.mjs')], env: {XENIOS_FACTORY_URL: ROOM_ORIGIN, XENIOS_FACTORY_TOKEN: created.token}}}); return true;
      }
      exactInput(input, ['operationId', 'expectedRevision', 'to', 'taskId', 'subject', 'goal', 'acceptance']); revision(input);
      requireCondition(validId(input.to) && activeSession(state, input.to), 400, 'recipient_not_active');
      requireCondition(!input.taskId || registryRows(state).tasks.some(row => row.id === input.taskId), 400, 'unknown_task');
      const envelope = {protocol: RECEIPT_PROTOCOL, kind: 'handoff', taskId: input.taskId || null,
        subject: boundedText(input.subject, 160, true), goal: boundedText(input.goal, 8000, true), acceptance: boundedText(input.acceptance || '', 3000)};
      let result;
      try {
        // Explicit reconciliation repeats the EXACT original native operation.
        // A committed operation replays; its UUID/payload/revision never changes.
        result = await coordinator.message({from: operatorSession, to: input.to, operationId: input.operationId,
          expectedRevision: input.expectedRevision, text: JSON.stringify(envelope)});
      } catch (failure) {
        // The strict native store checks an existing operation before its current
        // revision. Only this exact pre-write failure proves no message committed.
        if (reconciling && failure.status === 409 && failure.code === 'coordination_revision_conflict') {
          failure.reconciliation = {outcome: 'not_recorded', operationId: input.operationId, expectedRevision: input.expectedRevision};
        }
        throw failure;
      }
      json(response, 201, {ok: true, messageId: result.message.id, stage: 'recorded', coordination: result.coordination}); return true;
    } catch (failure) {
      if (!response.writableEnded) json(response, failure.status || 503, {ok: false,
        code: failure.status ? failure.code : 'control_room_unavailable',
        error: failure.status ? failure.message : 'The control room is unavailable. No successful operation is implied.',
        ...(failure.reconciliation ? {reconciliation: failure.reconciliation} : {})});
      return true;
    }
  };
}
