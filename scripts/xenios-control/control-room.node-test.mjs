import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {createControlRoomHandler, createCoordinatorPort, createConnectorStore, projectMessages, projectRoom, readGitSnapshot, RECEIPT_PROTOCOL, roomInstant} from './control-room.mjs';

import {createHandoffSubmission} from './control-room.js';
import {createBridge} from './control-room-mcp.mjs';

// These tests exercise the real transport/guards/projection against a bounded
// in-memory coordinator double. They do not qualify an installed native corpus.
const instant = '2026-11-19T23:00:00.000Z';
const initial = () => ({availability: 'authority', capturedAt: instant, sourceSha: null, reason: null,
  coordination: {revision: 4, authorityId: 'test-only', observedAt: instant}, messages: [],
  registries: {
    SESSION_REGISTRY: {schemaVersion: 1, updatedAt: instant, sessions: [
      {id: 'root', tool: 'codex', state: 'active', heartbeatAt: instant},
      {id: 'reviewer', tool: 'claude-code', state: 'active', heartbeatAt: instant},
      {id: 'other', tool: 'codex', state: 'active', heartbeatAt: instant},
    ]},
    ACTIVE_TASKS: {schemaVersion: 1, updatedAt: instant, tasks: [{id: 'TASK-1', title: 'Review the change', state: 'claimed', owner: 'reviewer', priority: 'P0', paths: ['src/example.ts']}]},
    CODE_OWNERSHIP: {schemaVersion: 1, updatedAt: instant, leases: [{id: 'lease-1', state: 'active', session: 'reviewer', task: 'TASK-1', paths: ['src/example.ts'], heartbeatAt: instant}]},
  }});
function fakeCoordinator(state = initial()) {
  const receipts = new Map();
  let mutations = 0;
  return {state, get mutations() {return mutations;}, async read() {return structuredClone(state);},
    async message(request) {
      mutations++;
      const fingerprint = JSON.stringify({from: request.from, to: request.to, text: request.text, expectedRevision: request.expectedRevision});
      if (receipts.has(request.operationId)) {
        const prior = receipts.get(request.operationId);
        if (prior.fingerprint !== fingerprint) throw Object.assign(new Error('Operation conflict'), {status: 409, code: 'operation_identity_conflict'});
        return {...prior.result, coordination: {...prior.result.coordination, replayed: true}};
      }
      if (request.expectedRevision !== state.coordination.revision) throw Object.assign(new Error('Revision conflict'), {status: 409, code: 'coordination_revision_conflict'});
      const message = {id: request.operationId, from: request.from, to: request.to, text: request.text, createdAt: instant};
      state.messages.push(message); state.coordination.revision++;
      const result = {message, coordination: {...state.coordination, operationId: request.operationId, replayed: false}};
      receipts.set(request.operationId, {fingerprint, result}); return result;
    }};
}
const resources = {observedAt: instant, disk: {freeBytes: 30 * 1024 ** 3, totalBytes: 100 * 1024 ** 3, state: 'healthy', label: 'test volume'}, memory: {freeBytes: 4 * 1024 ** 3, totalBytes: 8 * 1024 ** 3, state: 'healthy'}};
async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xenios-room-test-'));
  const coordinator = overrides.coordinator || fakeCoordinator();
  let time = instant;
  const store = createConnectorStore(directory, {clock: () => time});
  const handler = createControlRoomHandler({repoRoot: directory, assetsDirectory: directory, runtimeDirectory: directory,
    coordinator, connectorStore: store, operatorSession: 'root', clock: () => time, resourceReader: async () => resources,
    snapshotReader: async () => {throw Error('No snapshot');}, ...overrides});
  const server = http.createServer(async (request, response) => {
    if (!await handler(request, response)) {response.writeHead(404); response.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {await new Promise(resolve => server.close(resolve)); await fs.rm(directory, {recursive: true, force: true});});
  async function request(route, {payload, method = payload ? 'POST' : 'GET', headers = {}} = {}) {
    return new Promise((resolve, reject) => {
      const bytes = payload ? JSON.stringify(payload) : null;
      const request = http.request(`${origin}${route}`, {method, headers: {Host: '127.0.0.1:4177', ...(bytes ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes)} : {}), ...headers}}, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => {
          let value; try {value = JSON.parse(Buffer.concat(chunks));} catch {value = null;}
          resolve({status: response.statusCode, value, headers: {get: key => response.headers[key.toLowerCase()]}});
        });
      });
      request.on('error', reject); if (bytes) request.write(bytes); request.end();
    });
  }
  const bootstrap = await request('/api/control-room/bootstrap');
  const browserHeaders = {Origin: 'http://127.0.0.1:4177', 'X-Xenios-Control-Token': bootstrap.value.csrfToken};
  const browser = (route, payload) => request(route, {payload, headers: browserHeaders});
  const create = async (sessionId = 'reviewer') => (await browser('/api/control-room/connectors', {sessionId, provider: 'claude', label: 'Review seat'})).value;
  return {directory, coordinator, store, request, browser, browserHeaders, create, advance: milliseconds => {time = new Date(Date.parse(time) + milliseconds).toISOString();}};
}
const handoff = (revision = 4) => ({operationId: randomUUID(), expectedRevision: revision, to: 'reviewer', taskId: 'TASK-1', subject: 'Review candidate', goal: 'Inspect the changed paths.', acceptance: 'Return findings with evidence.'});

test('browser Host, Origin and CSRF boundaries protect handoff writes', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/control-room', {headers: {Host: 'evil.example'}})).status, 403);
  assert.equal((await f.request('/api/control-room/handoffs', {payload: handoff()})).status, 403);
  assert.equal((await f.request('/api/control-room/handoffs', {payload: handoff(), headers: {...f.browserHeaders, Origin: 'https://evil.example'}})).status, 403);
  assert.equal(f.coordinator.mutations, 0);
  const response = await f.request('/api/control-room');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.value.room.sessions[1].workState, 'unknown');
});

test('snapshot fallback is labeled and cannot send or provision credentials', async t => {
  const snapshot = {...initial(), availability: 'snapshot', sourceSha: 'a'.repeat(40)};
  const f = await fixture(t, {coordinator: {read: async () => {throw Error('No binding');}}, snapshotReader: async () => snapshot});
  const response = await f.request('/api/control-room');
  assert.equal(response.value.room.source.availability, 'snapshot');
  assert.equal(response.value.room.source.revision, null);
  assert.equal(response.value.room.capabilities.sendHandoff, false);
  assert.equal(response.value.room.capabilities.configureConnector, false);
  assert.equal((await f.browser('/api/control-room/handoffs', handoff())).status, 503);
  assert.equal((await f.browser('/api/control-room/connectors', {sessionId: 'reviewer', provider: 'claude', label: 'Review'})).status, 503);
});

test('missing and malformed source are unavailable, with no empty-success write claim', async t => {
  const f = await fixture(t, {coordinator: {read: async () => ({availability: 'authority', registries: {}})}});
  const result = await f.request('/api/control-room');
  assert.equal(result.value.room.source.availability, 'unavailable');
  assert.equal(result.value.room.sessions.length, 0);
  assert.equal(result.value.room.capabilities.sendHandoff, false);
});

test('recording handoff is not delivery; stable operation replay does not duplicate', async t => {
  const f = await fixture(t); const input = handoff();
  const first = await f.browser('/api/control-room/handoffs', input);
  assert.equal(first.status, 201); assert.equal(first.value.stage, 'recorded');
  const replay = await f.browser('/api/control-room/handoffs', input);
  assert.equal(replay.value.messageId, first.value.messageId);
  assert.equal(replay.value.coordination.replayed, true);
  assert.equal(f.coordinator.state.messages.length, 1);
  assert.equal((await f.browser('/api/control-room/handoffs', {...input, goal: 'Different work'})).status, 409);
  assert.equal((await f.browser('/api/control-room/handoffs', handoff())).status, 409);
  const projection = (await f.request('/api/control-room')).value.room.messages;
  assert.equal(projection[0].stage, 'recorded');
});

test('credential-bound receiver acknowledges through canonical messages; another session cannot', async t => {
  const f = await fixture(t); const input = handoff();
  const sent = await f.browser('/api/control-room/handoffs', input);
  const reviewer = await f.create(); const other = await f.create('other');
  const receipt = {kind: 'receipt', operationId: randomUUID(), expectedRevision: 5, messageId: sent.value.messageId, stage: 'acknowledged', summary: 'Received; reading scope.'};
  const wrong = await f.request('/api/control-room/bridge', {payload: receipt, headers: {Authorization: `Bearer ${other.token}`}});
  assert.equal(wrong.status, 403);
  const accepted = await f.request('/api/control-room/bridge', {payload: receipt, headers: {Authorization: `Bearer ${reviewer.token}`}});
  assert.equal(accepted.status, 200);
  const room = (await f.request('/api/control-room')).value.room;
  assert.equal(room.messages.find(row => row.id === sent.value.messageId).stage, 'acknowledged');
  assert.equal(room.tasks[0].state, 'claimed');
  assert.equal(room.tasks[0].acceptedBy, '');
});

test('inbox reads never acknowledge, expose tokens, or include another recipient private handoff', async t => {
  const f = await fixture(t); const credential = await f.create();
  await f.browser('/api/control-room/handoffs', handoff());
  await f.browser('/api/control-room/handoffs', {...handoff(5), to: 'other', goal: 'Private-other-marker'});
  const inbox = await f.request('/api/control-room/bridge', {payload: {kind: 'inbox'}, headers: {Authorization: `Bearer ${credential.token}`}});
  assert.equal(inbox.status, 200); assert.equal(inbox.value.messages.length, 1);
  assert.equal(inbox.value.messages[0].stage, 'recorded');
  assert.equal(f.coordinator.state.messages.length, 2);
  assert.doesNotMatch(JSON.stringify(inbox.value), /Private-other-marker|tokenHash/);
  const room = await f.request('/api/control-room');
  assert.equal(JSON.stringify(room.value).includes(credential.token), false);
  assert.doesNotMatch(JSON.stringify(room.value), /tokenHash/);
  const disk = await fs.readFile(path.join(f.directory, 'control-room-connectors.json'), 'utf8');
  assert.equal(disk.includes(credential.token), false);
});

test('revoked, expired, foreign-origin and stopped-session credentials are refused', async t => {
  const f = await fixture(t); const credential = await f.create();
  const call = headers => f.request('/api/control-room/bridge', {payload: {kind: 'inbox'}, headers: {Authorization: `Bearer ${credential.token}`, ...headers}});
  assert.equal((await call({Origin: 'https://evil.example'})).status, 403);
  f.coordinator.state.registries.SESSION_REGISTRY.sessions[1].state = 'stopped';
  assert.equal((await call()).status, 403);
  f.coordinator.state.registries.SESSION_REGISTRY.sessions[1].state = 'active';
  assert.equal((await f.browser('/api/control-room/connectors/revoke', {id: credential.connector.id})).status, 200);
  assert.equal((await call()).status, 401);
  const replacement = await f.create();
  f.advance(24 * 60 * 60_000 + 1);
  assert.equal((await f.request('/api/control-room/bridge', {payload: {kind: 'inbox'}, headers: {Authorization: `Bearer ${replacement.token}`}})).status, 401);
});

test('heartbeats are monotonic connector observations and become stale without releasing custody', async t => {
  const f = await fixture(t); const credential = await f.create();
  const payload = {kind: 'heartbeat', sequence: 1, workState: 'running', summary: 'Inspecting candidate'};
  const headers = {Authorization: `Bearer ${credential.token}`};
  assert.equal((await f.request('/api/control-room/bridge', {payload, headers})).status, 200);
  assert.equal((await f.request('/api/control-room/bridge', {payload, headers})).status, 409);
  let room = (await f.request('/api/control-room')).value.room;
  assert.equal(room.sessions[1].workStateSource, 'connector_reported');
  assert.equal(room.sessions[1].workState, 'running');
  f.advance(91_000);
  room = (await f.request('/api/control-room')).value.room;
  assert.equal(room.sessions[1].connection, 'stale');
  assert.equal(room.sessions[1].workState, 'unknown');
  assert.equal(room.ownership[0].state, 'active');
  assert.equal(room.sessions[1].heartbeatAt, instant);
});

test('projection rejects wrong-actor receipts and does not regress on out-of-order receipts', () => {
  const id = randomUUID();
  const original = {id, from: 'root', to: 'reviewer', createdAt: instant, text: JSON.stringify({protocol: RECEIPT_PROTOCOL, kind: 'handoff', subject: 'Read code', goal: 'Review'})};
  const receipt = (from, stage, at) => ({id: randomUUID(), from, to: 'root', createdAt: at, text: JSON.stringify({protocol: RECEIPT_PROTOCOL, kind: 'receipt', messageId: id, stage, summary: ''})});
  let output = projectMessages([original, receipt('other', 'result_submitted', instant)]);
  assert.equal(output[0].stage, 'recorded');
  output = projectMessages([original, receipt('reviewer', 'result_submitted', '2026-11-19T23:01:00Z'), receipt('reviewer', 'delivered', '2026-11-19T23:02:00Z')]);
  assert.equal(output[0].stage, 'result_submitted');
  const room = projectRoom(initial(), [], resources, {clock: () => instant});
  assert.equal(room.sessions[1].state, 'active'); assert.equal(room.sessions[1].workState, 'unknown');
});

test('closed schemas, body limit, unsupported types and credential content fail before mutations', async t => {
  const f = await fixture(t);
  assert.equal((await f.browser('/api/control-room/handoffs', {...handoff(), from: 'other'})).status, 400);
  assert.equal((await f.browser('/api/control-room/handoffs', {...handoff(), goal: 'x'.repeat(40_000)})).status, 413);
  assert.equal((await f.request('/api/control-room/handoffs', {payload: handoff(), headers: {...f.browserHeaders, 'Content-Type': 'text/plain'}})).status, 415);
  assert.equal((await f.browser('/api/control-room/handoffs', {...handoff(), goal: '-----BEGIN PRIVATE KEY-----'})).status, 400);
  assert.equal((await f.request('/api/control-room?source=/etc/passwd')).status, 405);
  assert.equal(f.coordinator.mutations, 0);
});

test('operator must be an active canonical session and cannot mint a guessed recipient', async t => {
  const f = await fixture(t, {operatorSession: 'not-registered'});
  assert.equal((await f.request('/api/control-room')).value.room.capabilities.sendHandoff, false);
  assert.equal((await f.browser('/api/control-room/handoffs', handoff())).status, 403);
  assert.equal((await f.browser('/api/control-room/connectors', {sessionId: 'reviewer', provider: 'claude', label: 'Test'})).status, 403);
});

test('busy unrelated sessions cannot crowd a recipient out of its bounded inbox', async t => {
  const f = await fixture(t); const credential = await f.create();
  const sent = await f.browser('/api/control-room/handoffs', handoff());
  for (let i = 0; i < 1010; i++) f.coordinator.state.messages.push({id: randomUUID(), from: 'root', to: 'other', createdAt: '2026-11-19T23:01:00Z', text: 'Unrelated note'});
  const inbox = await f.request('/api/control-room/bridge', {payload: {kind: 'inbox'}, headers: {Authorization: `Bearer ${credential.token}`}});
  assert.equal(inbox.value.messages.length, 1);
  assert.equal(inbox.value.messages[0].id, sent.value.messageId);
  assert.equal(inbox.value.messagesTruncated, false);
});

test('legacy ownership without an ID remains visible without inventing a lease identity', () => {
  const state = initial(); delete state.registries.CODE_OWNERSHIP.leases[0].id;
  const room = projectRoom(state, [], resources, {clock: () => instant});
  assert.equal(room.ownership.length, 1); assert.equal(room.ownership[0].id, null);
  assert.equal(room.ownership[0].legacy, true); assert.equal(room.ownership[0].sourceIndex, 0);
  assert.deepEqual(room.ownership[0].paths, ['src/example.ts']);
});

test('revocation completed during an authority read prevents the pending receipt write', async t => {
  const coordinator = fakeCoordinator();
  let pause = false, release, announce;
  const reached = new Promise(resolve => {announce = resolve;});
  const originalRead = coordinator.read;
  coordinator.read = async () => {
    if (pause) {announce(); await new Promise(resolve => {release = resolve;});}
    return originalRead();
  };
  const f = await fixture(t, {coordinator}); const credential = await f.create();
  const sent = await f.browser('/api/control-room/handoffs', handoff());
  pause = true;
  const pending = f.request('/api/control-room/bridge', {payload: {kind: 'receipt', operationId: randomUUID(), expectedRevision: 5,
    messageId: sent.value.messageId, stage: 'acknowledged', summary: 'Received'}, headers: {Authorization: `Bearer ${credential.token}`}});
  await reached;
  assert.equal((await f.browser('/api/control-room/connectors/revoke', {id: credential.connector.id})).status, 200);
  release();
  assert.equal((await pending).status, 401);
  assert.equal(coordinator.mutations, 1);
  assert.equal(coordinator.state.messages.length, 1);
});

test('coordinator export uses a fixed CLI, validates hashes and single-flights concurrent reads', async () => {
  const state = initial(); let calls = 0;
  const files = Object.fromEntries(Object.entries(state.registries).map(([name, value]) => {const bytes = Buffer.from(JSON.stringify(value)); return [`${name}.json`, {base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex')}];}));
  const port = createCoordinatorPort('/synthetic/repo', {run: async (executable, args, options) => {
    calls++; assert.equal(executable, process.execPath); assert.deepEqual(args, [path.join('/synthetic/repo', 'scripts', 'agentic', 'xenios-os.mjs'), 'export']);
    assert.equal(options.shell, undefined); assert.equal(options.timeout, 30_000);
    await new Promise(resolve => setTimeout(resolve, 15));
    return {stdout: JSON.stringify({ok: true, coordination: state.coordination, files})};
  }});
  const reads = await Promise.all(Array.from({length: 12}, () => port.read()));
  assert.equal(calls, 1); assert.equal(reads[0].availability, 'authority');
  await port.read(); assert.equal(calls, 1);
  const bad = createCoordinatorPort('/synthetic/repo', {run: async () => ({stdout: JSON.stringify({ok: true, coordination: state.coordination, files: {...files, 'SESSION_REGISTRY.json': {...files['SESSION_REGISTRY.json'], sha256: '0'.repeat(64)}}})})});
  await assert.rejects(bad.read(), failure => failure.code === 'coordinator_invalid');
});

test('uncertain native message result preserves operation identity and reports uncertainty', async () => {
  const seen = [];
  const port = createCoordinatorPort('/synthetic/repo', {run: async (_executable, args) => {seen.push(args); throw Object.assign(new Error('Timed out'), {killed: true});}});
  const input = {from: 'root', to: 'reviewer', text: 'Test', operationId: randomUUID(), expectedRevision: 4};
  await assert.rejects(port.message(input), failure => failure.code === 'mutation_outcome_unknown');
  await assert.rejects(port.message(input), failure => failure.code === 'mutation_outcome_unknown');
  assert.deepEqual(seen[0], seen[1]);
});

test('snapshot reads all registry files from the same pinned commit, never working-tree JSON', async () => {
  const state = initial(); const sha = 'a'.repeat(40), calls = [];
  const snapshot = await readGitSnapshot('/synthetic/repo', {run: async (command, args) => {
    calls.push(args); assert.equal(command, 'git');
    if (args[0] === 'rev-parse') return {stdout: `${sha}\n`};
    assert.equal(args[0], 'show'); assert.ok(args[1].startsWith(`${sha}:.xenios/`));
    const name = args[1].split('/').at(-1).replace('.json', ''); return {stdout: JSON.stringify(state.registries[name])};
  }});
  assert.equal(snapshot.availability, 'snapshot'); assert.equal(snapshot.sourceSha, sha); assert.equal(snapshot.coordination, null);
  assert.equal(calls.length, 4);
});

// Same submission controller used by submitHandoff/reconcileHandoff in the
// real page, through the real HTTP handler. Only canonical storage is doubled.
const payloadOf = ({operationId: _id, expectedRevision: _revision, ...payload}) => payload;
function frontendPost(f, seen = []) {
  return async (route, body) => {
    seen.push({route, body: structuredClone(body)});
    const result = await f.browser(route, body);
    if (result.status >= 400) throw Object.assign(Error(result.value.error), {
      status: result.status, code: result.value.code, reconciliation: result.value.reconciliation,
    });
    return result.value;
  };
}

test('frontend freezes UUID payload and revision after committed-response loss and edits, then reconciles one message', async t => {
  const f = await fixture(t), seen = [], post = frontendPost(f, seen);
  let dropped = false, uuidCalls = 0;
  const controller = createHandoffSubmission({makeOperationId: () => {uuidCalls++; return randomUUID();},
    post: async (route, body) => {
      const response = await post(route, body);
      if (!dropped) {dropped = true; throw Error('Response lost after canonical commit');}
      return response;
    }});
  const payload = payloadOf(handoff());
  assert.equal((await controller.submit(payload, 4, {goal: payload.goal})).outcome, 'unresolved');
  const frozen = controller.pending;
  assert.equal(f.coordinator.state.messages.length, 1);
  assert.throws(() => {frozen.body.expectedRevision = 5;}, TypeError);
  assert.equal((await controller.submit({...payload, goal: 'Edited while outcome unknown'}, 5)).outcome, 'unresolved');
  assert.equal(controller.pending, frozen);
  assert.equal(uuidCalls, 1); assert.equal(seen.length, 1);
  const reconciled = await controller.reconcile();
  assert.equal(reconciled.outcome, 'recorded'); assert.equal(controller.pending, null);
  assert.equal(f.coordinator.state.messages.length, 1);
  assert.deepEqual(seen[1].body, seen[0].body);
  assert.equal(seen[1].body.expectedRevision, 4);
  assert.equal(seen[1].route, '/api/control-room/handoffs/reconcile');
  assert.equal(f.coordinator.state.messages[0].id, frozen.body.operationId);
  assert.equal(reconciled.result.coordination.replayed, true);
});

test('frontend identity conflicts retain the frozen attempt and cannot re-ID after edits or changed replay revision', async t => {
  const f = await fixture(t), original = handoff();
  await f.browser('/api/control-room/handoffs', original);
  const payload = payloadOf(original), seen = [];
  for (const [edited, revision] of [[{...payload, goal: 'Different payload'}, 4], [payload, 5]]) {
    let uuidCalls = 0;
    const controller = createHandoffSubmission({post: frontendPost(f, seen), makeOperationId: () => {uuidCalls++; return original.operationId;}});
    const result = await controller.submit(edited, revision);
    assert.equal(result.code, 'operation_identity_conflict'); assert.equal(result.outcome, 'unresolved');
    const frozen = controller.pending;
    await controller.submit({...edited, goal: 'Another edit'}, 99);
    const reconciled = await controller.reconcile();
    assert.equal(reconciled.code, 'operation_identity_conflict');
    assert.equal(controller.pending, frozen); assert.equal(uuidCalls, 1);
    assert.equal(f.coordinator.state.messages.length, 1);
  }
  assert.equal((await f.request('/api/control-room/handoffs/reconcile', {payload: original})).status, 403);
  assert.equal(f.coordinator.state.messages.length, 1);
});

test('frontend requires explicit native pre-write reconciliation before releasing a stale revision attempt', async t => {
  const f = await fixture(t), seen = [];
  f.coordinator.state.coordination.revision = 5;
  let uuidCalls = 0;
  const controller = createHandoffSubmission({post: frontendPost(f, seen), makeOperationId: () => {uuidCalls++; return randomUUID();}});
  const payload = payloadOf(handoff());
  const first = await controller.submit(payload, 4);
  assert.equal(first.code, 'coordination_revision_conflict');
  assert.equal(first.outcome, 'unresolved'); assert.ok(controller.pending);
  assert.equal(f.coordinator.state.messages.length, 0);
  await controller.submit(payload, 5);
  assert.equal(uuidCalls, 1); assert.equal(seen.length, 1);
  assert.equal((await controller.reconcile()).outcome, 'not_recorded');
  assert.equal(controller.pending, null);
  assert.deepEqual(seen[0].body, seen[1].body);
  assert.equal(f.coordinator.state.messages.length, 0);
  assert.equal((await controller.submit(payload, 5)).outcome, 'recorded');
  assert.equal(uuidCalls, 2); assert.equal(f.coordinator.state.messages.length, 1);
});

test('native port preserves distinct revision and operation identity conflict codes', async () => {
  for (const code of ['coordination_revision_conflict', 'operation_identity_conflict', 'operation_id_conflict', 'operation_id_reused']) {
    const port = createCoordinatorPort('/synthetic/repo', {run: async () => {throw Object.assign(Error('Rejected'), {stderr: JSON.stringify({ok: false, code})});}});
    await assert.rejects(port.message({from: 'root', to: 'reviewer', text: 'Same frozen text', operationId: randomUUID(), expectedRevision: 4}), failure => failure.status === 409 && failure.code === code);
  }
});

test('calendar validator rejects normalized impossible or timezone-less instants and preserves valid written offsets', () => {
  for (const value of ['bad', '2026-03-02T12:00:00', '2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z',
    '2100-02-29T12:00:00Z', '2026-04-31T12:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z',
    '2026-01-01T12:00:60Z', '2026-01-01T12:00:00+24:00', '2026-01-01T12:00:00+12:60', '2026-01-01T12:00:00Z\n']) {
    assert.equal(roomInstant(value), null, value);
  }
  for (const value of ['2000-02-29T12:00:00Z', '2024-02-29T12:00:00.123456789+05:30', '2026-03-02T06:00:00-06:00']) assert.equal(roomInstant(value), value);
});

test('invalid or future connection and source timestamps never establish connected work-state claims', () => {
  const now = '2026-03-02T12:00:00.000Z', state = initial(); state.capturedAt = now;
  const record = {id: randomUUID(), provider: 'claude', sessionId: 'reviewer', createdAt: '2026-03-02T11:00:00Z',
    expiresAt: '2026-03-03T11:00:00Z', lastObservedAt: now, workState: 'running', capabilities: ['inbox.read']};
  const project = (row, source = state, clock = now) => projectRoom(source, [row], resources, {clock: () => clock, operatorSession: 'root'});
  for (const lastObservedAt of ['bad', '2026-03-02T12:00:00', '2026-02-30T12:00:00Z', '2026-03-02T10:59:59Z']) {
    const room = project({...record, lastObservedAt});
    assert.equal(room.sessions[1].connection, 'unknown'); assert.equal(room.sessions[1].workState, 'unknown');
    assert.deepEqual(room.sessions[1].capabilities, []);
  }
  assert.equal(project({...record, lastObservedAt: '2026-03-02T12:00:31Z'}).sessions[1].connection, 'stale');
  assert.equal(project({...record, expiresAt: '2026-03-03T11:00:00'}).sessions[1].connection, 'unknown');
  const positive = project({...record, lastObservedAt: '2026-03-02T06:00:00-06:00'});
  assert.equal(positive.sessions[1].connection, 'connected'); assert.equal(positive.sessions[1].observedAt, '2026-03-02T06:00:00-06:00');
  const impossibleSource = project(record, {...state, capturedAt: '2026-02-30T12:00:00Z'});
  assert.equal(impossibleSource.source.capturedAt, null); assert.equal(impossibleSource.source.freshness, 'unknown');
  assert.notEqual(impossibleSource.sessions[1].connection, 'connected'); assert.equal(impossibleSource.operator.available, false);
  assert.equal(project(record, {...state, capturedAt: '2026-03-02T12:00:31Z'}).source.freshness, 'stale');
  assert.equal(project(record, state, 'not-a-clock').sessions[1].connection, 'unknown');
});

test('connector credentials refuse invalid lifecycle clocks and the exact expiry boundary', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xenios-room-expiry-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  let clock = instant;
  const store = createConnectorStore(directory, {clock: () => clock});
  const credential = await store.create({sessionId: 'reviewer', provider: 'claude', label: 'Synthetic expiry control'});
  const filename = path.join(directory, 'control-room-connectors.json');
  const original = JSON.parse(await fs.readFile(filename, 'utf8'));
  const expires = credential.connector.expiresAt;
  clock = new Date(Date.parse(expires) - 1).toISOString(); assert.equal((await store.authenticate(credential.token)).sessionId, 'reviewer');
  clock = expires; await assert.rejects(store.authenticate(credential.token), error => error.status === 401);
  clock = instant;
  for (const patch of [{expiresAt: '2026-02-30T12:00:00Z'}, {expiresAt: '2026-11-20T23:00:00'},
    {expiresAt: '2026-11-19T22:00:00Z'}, {createdAt: '2026-11-21T23:00:00Z'}, {createdAt: 'invalid'}]) {
    const value = structuredClone(original); Object.assign(value.connectors[0], patch);
    await fs.writeFile(filename, JSON.stringify(value));
    await assert.rejects(store.authenticate(credential.token), error => error.status === 401);
  }
  await fs.writeFile(filename, JSON.stringify(original)); clock = '2026-11-19T23:00:00';
  await assert.rejects(store.authenticate(credential.token), error => error.status === 401);
});

test('1001 addressed messages retain authoritative totals across the real handler and MCP adapter without automatic receipts', async t => {
  const f = await fixture(t), credential = await f.create();
  f.coordinator.state.messages = Array.from({length: 1001}, (_, index) => ({id: randomUUID(), from: 'root', to: 'reviewer',
    createdAt: instant, text: JSON.stringify({protocol: RECEIPT_PROTOCOL, kind: 'handoff', subject: `Synthetic ${index}`, goal: 'Read only'})}));
  const requests = [];
  // A test-only HTTP relay forwards the adapter into fixture.request's fixed
  // Host binding; the production handler's Host guard is never weakened.
  const relay = http.createServer(async (request, response) => {
    let raw = ''; for await (const part of request) raw += part.toString('utf8');
    const payload = JSON.parse(raw); requests.push(payload);
    const result = await f.request('/api/control-room/bridge', {payload, headers: {Authorization: request.headers.authorization}});
    response.writeHead(result.status, {'Content-Type': 'application/json'}); response.end(JSON.stringify(result.value));
  });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  t.after(async () => {relay.closeAllConnections(); await new Promise(resolve => relay.close(resolve));});
  const bridge = createBridge({env: {XENIOS_FACTORY_URL: `http://127.0.0.1:${relay.address().port}`, XENIOS_FACTORY_TOKEN: credential.token}});
  for (const name of ['factory_status', 'factory_inbox']) {
    const result = await bridge.call(name); assert.equal(result.isError, undefined);
    const value = JSON.parse(result.content[0].text);
    assert.equal(value.messageCount, 1001); assert.equal(value.messagesTotal, 1001);
    assert.equal(value.messagesReturned, 1000); assert.equal(value.messagesTruncated, true);
    if (name === 'factory_inbox') {assert.equal(value.messages.length, 1000); assert.ok(value.messages.every(row => row.stage === 'recorded'));}
  }
  assert.deepEqual(requests, [{kind: 'inbox'}, {kind: 'inbox'}]);
  assert.equal(f.coordinator.mutations, 0); assert.equal(f.coordinator.state.messages.length, 1001);
  assert.equal((await f.store.list())[0].lastObservedAt, null);
});
test('local invalid drafts allocate no UUID or pending request and a corrected multiline draft genuinely submits once', async t => {
  const f = await fixture(t), seen = [], id = randomUUID(); let uuidCalls = 0;
  const controller = createHandoffSubmission({post: frontendPost(f, seen), makeOperationId: () => {uuidCalls++; return id;}});
  const valid = {...payloadOf(handoff()), subject: '  Source review  ', goal: '  Inspect\n\tthe exact source.\r\nKeep all receipts.  '};
  const invalid = [
    {...valid, subject: ' \t\r\n '}, {...valid, goal: ' \t\r\n '},
    {...valid, subject: 's'.repeat(161)}, {...valid, goal: 'g'.repeat(8001)}, {...valid, acceptance: 'a'.repeat(3001)},
    {...valid, subject: 'bad\u0000subject'}, {...valid, goal: 'bad\u0000goal'}, {...valid, acceptance: 'bad\u0000acceptance'},
    {...valid, subject: 'ghp_' + 'a'.repeat(16)}, {...valid, goal: '-----BEGIN PRIVATE KEY-----'},
    {...valid, acceptance: 'sk_live_' + 'z'.repeat(16)}, {...valid, goal: 42}, {...valid, expectedRevision: 9},
    {...valid, to: 'not a session'}, {...valid, taskId: 'not a task'},
    {...valid, subject: '漢'.repeat(160), goal: '漢'.repeat(8000), acceptance: '漢'.repeat(3000)},
  ];
  for (const payload of invalid) {
    await assert.rejects(controller.submit(payload, 4));
    assert.equal(uuidCalls, 0); assert.equal(seen.length, 0); assert.equal(controller.pending, null);
  }
  const result = await controller.submit(valid, 4);
  assert.equal(result.outcome, 'recorded'); assert.equal(uuidCalls, 1); assert.equal(seen.length, 1);
  assert.equal(controller.pending, null); assert.equal(f.coordinator.state.messages.length, 1);
  const expected = {...valid, operationId: id, expectedRevision: 4};
  assert.deepEqual(seen[0].body, expected); assert.deepEqual(JSON.parse(result.attempt.fingerprint), expected);
  assert.equal(JSON.parse(f.coordinator.state.messages[0].text).goal, valid.goal.trim());
});