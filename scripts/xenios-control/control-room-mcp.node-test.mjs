import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createBridge, createRpcHandler, serveStdio, validateBaseUrl, SUPPORTED_PROTOCOLS, LIMITS } from './control-room-mcp.mjs';

const TOKEN = 'local-test-only-connector-token';
const parseResult = result => JSON.parse(result.content[0].text);
const inbox = () => ({ ok: true, sessionId: 'claude-2', revision: 12, messages: [{ id: 'handoff-1', stage: 'recorded' }], tasks: [{ id: 'KAN-137', state: 'review' }] });
const init = (version = '2025-11-25') => ({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test-client', version: '1' } } });
const ready = { jsonrpc: '2.0', method: 'notifications/initialized' };
const operation = () => ({ operationId: randomUUID(), messageId: 'handoff-1', expectedRevision: 12, summary: 'Reviewed the handoff and accepted the requested task.' });

async function mockCoordinator(t, handler = () => inbox()) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk.toString('utf8');
    const entry = { method: req.method, path: req.url, headers: req.headers, body: JSON.parse(raw || '{}') };
    requests.push(entry);
    const response = await handler(entry, req, res);
    if (response !== undefined && !res.writableEnded && !res.destroyed) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(response));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, requests, origin, bridge: createBridge({ env: { XENIOS_FACTORY_URL: origin, XENIOS_FACTORY_TOKEN: TOKEN } }) };
}

test('status and inbox are authenticated reads with no implicit heartbeat or ACK', async t => {
  const mock = await mockCoordinator(t);
  const status = parseResult(await mock.bridge.call('factory_status'));
  assert.equal(status.sessionId, 'claude-2');
  assert.equal(status.revision, 12);
  assert.equal(status.messageCount, 1);
  assert.equal(status.taskCount, 1);
  assert.equal(status.workState, undefined);
  const result = parseResult(await mock.bridge.call('factory_inbox', {}));
  assert.deepEqual(result, inbox());
  assert.equal(mock.requests.length, 2);
  for (const request of mock.requests) {
    assert.deepEqual(request.body, { kind: 'inbox' });
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/api/control-room/bridge');
    assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(request.headers.origin, undefined);
    assert.equal(request.headers['content-type'], 'application/json');
  }
});

test('explicit receipt stage, UUID, revision and result reach only the canonical bridge', async t => {
  const mock = await mockCoordinator(t, ({ body }) => ({ ok: true, messageId: 'receipt-2', stage: body.stage, coordination: { revision: 13 } }));
  for (const stage of ['delivered', 'acknowledged', 'working']) {
    const args = { ...operation(), stage };
    const result = await mock.bridge.call('factory_acknowledge', args);
    assert.equal(result.isError, undefined);
    assert.deepEqual(mock.requests.at(-1).body, { kind: 'receipt', ...args });
    assert.equal(parseResult(result).stage, stage);
  }
  const args = operation();
  const result = await mock.bridge.call('factory_submit_result', args);
  assert.deepEqual(mock.requests.at(-1).body, { kind: 'receipt', ...args, stage: 'result_submitted' });
  assert.equal(parseResult(result).stage, 'result_submitted');
  assert.equal(mock.requests.length, 4);
});

test('invalid or identity-spoofing arguments never perform HTTP requests', async t => {
  const mock = await mockCoordinator(t);
  const good = { ...operation(), stage: 'acknowledged' };
  const attempts = [
    ['factory_acknowledge', { ...good, operationId: 'invented' }],
    ['factory_acknowledge', { ...good, expectedRevision: -1 }],
    ['factory_acknowledge', { ...good, expectedRevision: 1.5 }],
    ['factory_acknowledge', { ...good, expectedRevision: undefined }],
    ['factory_acknowledge', { ...good, stage: 'accepted' }],
    ['factory_acknowledge', { ...good, stage: 'result_submitted' }],
    ['factory_acknowledge', { ...good, from: 'root' }],
    ['factory_acknowledge', { ...good, sessionId: 'root' }],
    ['factory_acknowledge', { ...good, summary: 'x'.repeat(LIMITS.receiptSummaryCharacters + 1) }],
    ['factory_acknowledge', { ...good, messageId: 'a\nb' }],
    ['factory_submit_result', good],
    ['factory_heartbeat', { sequence: 0, workState: 'running', summary: '' }],
    ['factory_heartbeat', { sequence: 1, workState: 'deployed', summary: '' }],
    ['factory_heartbeat', { sequence: 1, workState: 'running', summary: 'x'.repeat(LIMITS.heartbeatSummaryCharacters + 1) }],
    ['factory_status', { to: 'someone-else' }],
    ['factory_inbox', []],
    ['exec', { command: 'echo forbidden' }],
  ];
  for (const [name, args] of attempts) {
    const result = await mock.bridge.call(name, args);
    assert.equal(result.isError, true, name);
    assert.equal(parseResult(result).error.code, 'invalid_arguments');
  }
  assert.equal(mock.requests.length, 0);
});

test('receipt and heartbeat summaries match the coordinator character limits exactly', async t => {
  const mock = await mockCoordinator(t, ({ body }) => body.kind === 'heartbeat'
    ? { ok: true, receivedAt: '2026-11-19T20:00:00.000Z' }
    : { ok: true, messageId: 'receipt-2', stage: body.stage, coordination: { revision: 13 } });
  assert.equal(LIMITS.receiptSummaryCharacters, 3000);
  assert.equal(LIMITS.heartbeatSummaryCharacters, 500);
  const ack = await mock.bridge.call('factory_acknowledge', { ...operation(), stage: 'acknowledged', summary: 'x'.repeat(3000) });
  assert.equal(ack.isError, undefined);
  const heartbeat = await mock.bridge.call('factory_heartbeat', { sequence: 1, workState: 'unknown', summary: 'x'.repeat(500) });
  assert.equal(heartbeat.isError, undefined);
  assert.equal(mock.requests[0].body.summary.length, 3000);
  assert.equal(mock.requests[1].body.summary.length, 500);
});

test('heartbeats are explicit and stale sequences are refused by the authority', async t => {
  let previous = 0;
  const mock = await mockCoordinator(t, ({ body }, _req, res) => {
    if (body.sequence <= previous) {
      res.statusCode = 409;
      return { ok: false, error: 'sequence_not_monotonic' };
    }
    previous = body.sequence;
    return { ok: true, receivedAt: '2026-11-19T20:00:00.000Z' };
  });
  const args = { sequence: 10, workState: 'waiting_review', summary: 'Result submitted; reviewer has not accepted it.' };
  assert.equal(parseResult(await mock.bridge.call('factory_heartbeat', args)).ok, true);
  const repeated = await mock.bridge.call('factory_heartbeat', args);
  assert.equal(repeated.isError, true);
  assert.equal(parseResult(repeated).error.httpStatus, 409);
  assert.deepEqual(mock.requests[0].body, { kind: 'heartbeat', ...args });
  assert.equal(mock.requests.length, 2);
});

test('only literal loopback HTTP origins are allowed', () => {
  assert.equal(validateBaseUrl().href, 'http://127.0.0.1:4177/api/control-room/bridge');
  assert.equal(validateBaseUrl('http://[::1]:4177/').href, 'http://[::1]:4177/api/control-room/bridge');
  for (const value of [
    'https://127.0.0.1:4177', 'http://localhost:4177', 'http://127.0.0.2:4177',
    'http://127.1:4177', 'http://2130706433:4177', 'http://0x7f000001:4177',
    'http://127.0.0.1.evil.test:4177', 'http://127.0.0.1:4177@evil.test',
    'http://user:password@127.0.0.1:4177', 'http://127.0.0.1:4177/path',
    'http://127.0.0.1:4177/?query=1', 'http://127.0.0.1:4177/#fragment',
    'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://[::ffff:127.0.0.1]:4177',
    'http://10.0.0.1:4177', ' http://127.0.0.1:4177',
  ]) assert.throws(() => validateBaseUrl(value), undefined, value);
});

test('missing or malformed credentials fail without a network request or secret echo', async t => {
  const mock = await mockCoordinator(t);
  for (const token of [undefined, '', 'bad\nheader', '${XENIOS_FACTORY_TOKEN}']) {
    const bridge = createBridge({ env: { XENIOS_FACTORY_URL: mock.origin, XENIOS_FACTORY_TOKEN: token } });
    const result = await bridge.call('factory_status');
    assert.equal(result.isError, true);
    if (token) assert.equal(JSON.stringify(result).includes(token), false);
  }
  assert.equal(mock.requests.length, 0);
});

test('HTTP failures stay failures and credentials are redacted from upstream diagnostics', async t => {
  let status = 401;
  const mock = await mockCoordinator(t, (_entry, _req, res) => {
    res.statusCode = status;
    return { ok: false, error: { detail: `Token ${TOKEN} is rejected`, token: TOKEN, authorization: `Bearer ${TOKEN}` } };
  });
  for (status of [401, 403, 409, 500, 503]) {
    const result = await mock.bridge.call('factory_acknowledge', { ...operation(), stage: 'acknowledged' });
    const data = parseResult(result);
    assert.equal(result.isError, true);
    assert.equal(data.error.httpStatus, status);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
    if (status === 409) assert.equal(data.error.code, 'revision_or_operation_conflict');
  }
  assert.equal(mock.requests.length, 5, 'No automatic retry for writes.');
});

test('credentials echoed in successful inbox data are removed', async t => {
  const mock = await mockCoordinator(t, () => ({ ...inbox(), messages: [{ id: '1', text: `Do not disclose ${TOKEN}`, token: TOKEN, [TOKEN]: 'key' }] }));
  const result = await mock.bridge.call('factory_inbox');
  assert.equal(result.isError, undefined);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(parseResult(result).messages[0].token, '[redacted]');
});

test('unknown mutation outcome preserves the operation UUID and never becomes a successful result', async t => {
  const mock = await mockCoordinator(t, (_entry, _req, res) => {
    res.statusCode = 503;
    return { ok: false, code: 'mutation_outcome_unknown', error: 'The coordinator did not confirm the outcome.' };
  });
  const args = { ...operation(), stage: 'acknowledged' };
  const result = await mock.bridge.call('factory_acknowledge', args);
  const data = parseResult(result);
  assert.equal(result.isError, true);
  assert.equal(data.error.code, 'mutation_outcome_unknown');
  assert.equal(data.error.coordinatorCode, 'mutation_outcome_unknown');
  assert.equal(data.error.operationId, args.operationId);
  assert.match(data.error.message, /same operationId and payload/);
  assert.equal(mock.requests.length, 1);
});

test('redirects are rejected even if they point to another local server', async t => {
  const destination = await mockCoordinator(t);
  const source = await mockCoordinator(t, (_entry, _req, res) => {
    res.writeHead(302, { Location: destination.origin + '/api/control-room/bridge' });
    res.end();
  });
  const result = await source.bridge.call('factory_status');
  assert.equal(parseResult(result).error.code, 'redirect_rejected');
  assert.equal(destination.requests.length, 0);
});

test('timeout is bounded and reports an uncertain write outcome without retrying', async t => {
  const mock = await mockCoordinator(t, () => undefined);
  const bridge = createBridge({ env: { XENIOS_FACTORY_URL: mock.origin, XENIOS_FACTORY_TOKEN: TOKEN }, limits: { timeoutMs: 80 } });
  const before = Date.now();
  const result = await bridge.call('factory_acknowledge', { ...operation(), stage: 'working' });
  assert.equal(parseResult(result).error.code, 'timeout');
  assert.match(parseResult(result).error.message, /may already have committed/);
  assert.ok(Date.now() - before < 2000);
  assert.equal(mock.requests.length, 1);
});

test('response and request byte limits prevent unbounded payloads', async t => {
  const mock = await mockCoordinator(t, () => ({ ...inbox(), extra: 'x'.repeat(1024) }));
  const responseLimited = createBridge({ env: { XENIOS_FACTORY_URL: mock.origin, XENIOS_FACTORY_TOKEN: TOKEN }, limits: { responseBytes: 128 } });
  assert.equal(parseResult(await responseLimited.call('factory_status')).error.code, 'response_too_large');
  const requestLimited = createBridge({ env: { XENIOS_FACTORY_URL: mock.origin, XENIOS_FACTORY_TOKEN: TOKEN }, limits: { requestBytes: 64 } });
  assert.equal(parseResult(await requestLimited.call('factory_acknowledge', { ...operation(), stage: 'working' })).error.code, 'request_too_large');
  assert.equal(mock.requests.length, 1);
});

test('malformed and unconfirmed success replies cannot become positive receipts', async t => {
  let value;
  const mock = await mockCoordinator(t, () => value);
  for (value of [{ ok: true }, [], { ok: false, error: 'offline' }]) {
    assert.equal((await mock.bridge.call('factory_inbox')).isError, true);
  }
  value = { ok: true, messageId: 'receipt-2', stage: 'delivered', coordination: { revision: 13 } };
  const result = await mock.bridge.call('factory_acknowledge', { ...operation(), stage: 'acknowledged' });
  assert.equal(parseResult(result).error.code, 'invalid_response');
});

test('MCP negotiates supported versions, then requires the initialized notification', async () => {
  for (const version of [...SUPPORTED_PROTOCOLS, '2099-01-01']) {
    const handle = createRpcHandler({ call: async () => { throw new Error('No tool invocation expected.'); } });
    assert.equal((await handle({ jsonrpc: '2.0', id: 0, method: 'tools/list' })).error.code, -32002);
    const response = await handle(init(version));
    assert.equal(response.result.protocolVersion, SUPPORTED_PROTOCOLS.includes(version) ? version : SUPPORTED_PROTOCOLS[0]);
    assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
    assert.equal((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).error.code, -32002);
    assert.equal(await handle(ready), null);
    const catalog = (await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).result.tools;
    assert.equal(catalog.length, 5);
    assert.equal(catalog[0].name, 'factory_status');
    if (version === '2024-11-05') assert.equal(catalog[0].annotations, undefined);
    else assert.equal(catalog[0].annotations.readOnlyHint, true);
    assert.equal((await handle(init(version))).error.code, -32600);
  }
});

test('notifications never respond or invoke mutations; unsupported operations are rejected', async () => {
  let calls = 0;
  const handle = createRpcHandler({ call: async () => { calls += 1; return {}; } });
  await handle(init());
  await handle(ready);
  for (const method of ['notifications/cancelled', 'notifications/initialized', 'tools/call', 'anything']) {
    assert.equal(await handle({ jsonrpc: '2.0', method, params: { name: 'factory_acknowledge', arguments: { ...operation(), stage: 'working' } } }), null);
  }
  assert.equal(calls, 0);
  assert.equal((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'run_shell', arguments: {} } })).error.code, -32602);
  assert.equal((await handle({ jsonrpc: '2.0', id: 3, method: 'provider/resume' })).error.code, -32601);
  assert.equal((await handle([{ jsonrpc: '2.0', id: 4, method: 'ping' }])).error.code, -32600);
});

test('stdio handles split UTF-8 frames, parse errors, overlong lines and recovery', async () => {
  const replies = [];
  const output = new Writable({ write(chunk, _encoding, callback) { replies.push(chunk.toString()); callback(); } });
  const ping = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'café', method: 'ping' }) + '\n');
  const split = ping.indexOf(Buffer.from('é')) + 1;
  await serveStdio({
    input: Readable.from([Buffer.from('not-json\n'), ping.subarray(0, split), ping.subarray(split), Buffer.from('x'.repeat(600) + '\n'), Buffer.from('{"jsonrpc":"2.0","id":9,"method":"ping"}\n')]),
    output, bridge: { call: async () => { throw new Error('No call'); } }, maxLineBytes: 512,
  });
  const data = replies.map(line => JSON.parse(line));
  assert.equal(data.length, 4);
  assert.equal(data[0].error.code, -32700);
  assert.equal(data[1].id, 'café');
  assert.equal(data[2].error.code, -32700);
  assert.equal(data[3].id, 9);
});

test('an incomplete final frame never executes its request', async () => {
  let calls = 0;
  const replies = [];
  const output = new Writable({ write(chunk, _encoding, callback) { replies.push(chunk.toString()); callback(); } });
  const frames = [init(), ready].map(value => JSON.stringify(value) + '\n').join('');
  await serveStdio({ input: Readable.from([frames + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'factory_status' } })]), output, bridge: { call: async () => { calls += 1; return {}; } } });
  assert.equal(calls, 0);
  assert.equal(JSON.parse(replies.at(-1)).error.code, -32700);
});

test('real subprocess stdio handshake reaches only the local mock and prints no logs or token', async t => {
  const mock = await mockCoordinator(t);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./control-room-mcp.mjs', import.meta.url))], {
    env: { ...process.env, XENIOS_FACTORY_URL: mock.origin, XENIOS_FACTORY_TOKEN: TOKEN },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const exited = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  child.stdin.end([init(), ready, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'factory_status', arguments: {} } }].map(value => JSON.stringify(value) + '\n').join(''));
  assert.equal(await exited, 0);
  const responses = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(responses.map(value => value.id), [1, 2, 3]);
  assert.equal(parseResult(responses.at(-1).result).sessionId, 'claude-2');
  assert.equal(stderr, '');
  assert.equal(stdout.includes(TOKEN), false);
  assert.equal(mock.requests.length, 1);
});
