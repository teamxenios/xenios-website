#!/usr/bin/env node
/**
 * Review artifact: MCP stdio adapter for the existing local coordinator.
 * No dependencies, provider session control, polling, or automatic receipts.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const SUPPORTED_PROTOCOLS = Object.freeze([
  '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05',
]);
export const LIMITS = Object.freeze({
  lineBytes: 64 * 1024,
  requestBytes: 32 * 1024,
  responseBytes: 1024 * 1024,
  outputBytes: 2 * 1024 * 1024,
  // A receipt can require two coordinator CLI operations, each bounded at 30s.
  // Allow those operations and their owned-helper cleanup to finish; no retries.
  timeoutMs: 65000,
  receiptSummaryCharacters: 3000,
  heartbeatSummaryCharacters: 500,
});
const DEFAULT_URL = 'http://127.0.0.1:4177';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_STAGES = ['delivered', 'acknowledged', 'working'];
const WORK_STATES = ['unknown', 'idle', 'running', 'waiting_review', 'blocked'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

class BridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function invalid(message) {
  throw new BridgeError('invalid_arguments', message);
}

export function validateBaseUrl(value = DEFAULT_URL) {
  // Literal addresses only: do not trust DNS, proxy settings, URL normalisation,
  // userinfo, alternate numeric IP spellings, redirects, or URL path injection.
  if (typeof value !== 'string' || !/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?\/?$/.test(value)) {
    throw new BridgeError('invalid_configuration', 'XENIOS_FACTORY_URL must be an HTTP numeric-loopback origin, without a path, query, credentials, or fragment.');
  }
  let url;
  try { url = new URL(value); } catch {
    throw new BridgeError('invalid_configuration', 'XENIOS_FACTORY_URL is not a valid loopback origin.');
  }
  return new URL('/api/control-room/bridge', url);
}

function configured(env) {
  const endpoint = validateBaseUrl(env.XENIOS_FACTORY_URL || DEFAULT_URL);
  const token = env.XENIOS_FACTORY_TOKEN;
  if (typeof token !== 'string' || !token.length) {
    throw new BridgeError('connector_not_configured', 'Provision a session-bound connector and pass its token through XENIOS_FACTORY_TOKEN.');
  }
  if (token.length > 4096 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) {
    throw new BridgeError('invalid_configuration', 'XENIOS_FACTORY_TOKEN is not a valid bearer credential.');
  }
  return { endpoint, token };
}

function exactObject(args, keys) {
  if (!record(args)) invalid('Arguments must be a JSON object.');
  if (Object.keys(args).some(key => !keys.includes(key))) invalid('Unknown argument; only the documented tool fields are accepted.');
}

function textField(args, key, max, { empty = false } = {}) {
  const value = args[key];
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    invalid(`${key} must be ${empty ? 'a' : 'a nonempty'} string of at most ${max} characters, without control characters.`);
  }
  return value;
}

function receipt(args, stage) {
  const allowed = ['operationId', 'messageId', 'summary', 'expectedRevision'];
  if (!stage) allowed.push('stage');
  exactObject(args, allowed);
  if (typeof args.operationId !== 'string' || !UUID.test(args.operationId)) invalid('operationId must be an explicit UUID.');
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) invalid('expectedRevision must be a nonnegative safe integer from a fresh inbox.');
  const messageId = textField(args, 'messageId', 200);
  if (/\s/.test(messageId)) invalid('messageId must be a canonical identifier without whitespace.');
  const selectedStage = stage || args.stage;
  if (!stage && !RECEIPT_STAGES.includes(selectedStage)) invalid('stage must be delivered, acknowledged, or working.');
  return {
    kind: 'receipt', operationId: args.operationId, messageId,
    stage: selectedStage,
    summary: textField(args, 'summary', LIMITS.receiptSummaryCharacters),
    expectedRevision: args.expectedRevision,
  };
}

const operationProperties = {
  operationId: { type: 'string', format: 'uuid', description: 'Caller-generated UUID. Reuse only for an identical retry after checking the outcome.' },
  messageId: { type: 'string', minLength: 1, maxLength: 200, description: 'Original canonical handoff ID addressed to this connector session.' },
  expectedRevision: { type: 'integer', minimum: 0, description: 'Revision returned by the latest factory_inbox. Refresh on conflict.' },
  summary: { type: 'string', minLength: 1, maxLength: LIMITS.receiptSummaryCharacters, description: 'Factual acknowledgement or evidence summary; never include secrets or unsupported completion claims.' },
};
const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const annotations = readOnly => ({ readOnlyHint: readOnly, destructiveHint: false, idempotentHint: true, openWorldHint: false });

export const TOOLS = Object.freeze([
  {
    name: 'factory_status',
    description: 'Read bound-session inbox counts and coordinator revision. Does not send a heartbeat, ACK a message, claim a task, or prove an agent is working.',
    inputSchema: schema({}), annotations: annotations(true),
  },
  {
    name: 'factory_inbox',
    description: 'Read messages and tasks for the connector-bound session. Reading does not mark anything delivered or acknowledged.',
    inputSchema: schema({}), annotations: annotations(true),
  },
  {
    name: 'factory_acknowledge',
    description: 'Explicitly record delivered, acknowledged, or working for an original handoff. The caller must choose a truthful stage, supply its own UUID, and use the current revision. No automatic ACK.',
    inputSchema: schema({ ...operationProperties, stage: { type: 'string', enum: RECEIPT_STAGES } }),
    annotations: annotations(false),
  },
  {
    name: 'factory_submit_result',
    description: 'Submit a result receipt with evidence for an original handoff. This is not independent acceptance, merge, deployment, or completion of a canonical task.',
    inputSchema: schema(operationProperties), annotations: annotations(false),
  },
  {
    name: 'factory_heartbeat',
    description: 'Explicitly report observed work state. Does not renew leases or change canonical ownership/task status. Use a positive monotonic sequence for this credential.',
    inputSchema: schema({
      sequence: { type: 'integer', minimum: 1, description: 'Strictly increasing per connector credential, including across bridge restarts.' },
      workState: { type: 'string', enum: WORK_STATES },
      summary: { type: 'string', maxLength: LIMITS.heartbeatSummaryCharacters, description: 'Short observed state, not inferred progress; no secrets.' },
    }), annotations: { ...annotations(false), idempotentHint: false },
  },
]);

function scrub(value, token) {
  // Defence in depth against a response that echoes the credential. No logging
  // or returned data ever includes this process's configured token.
  const encoded = JSON.stringify(value, (key, item) => {
    if (/^(?:token|accessToken|refreshToken|authorization|password|secret|XENIOS_FACTORY_TOKEN)$/i.test(key)) return '[redacted]';
    if (typeof item === 'string' && token) return item.split(token).join('[redacted]');
    return item;
  });
  const cleaned = token ? encoded.split(token).join('[redacted]') : encoded;
  if (Buffer.byteLength(cleaned, 'utf8') > LIMITS.outputBytes) {
    throw new BridgeError('response_too_large', 'The coordinator response exceeds the bridge output limit.');
  }
  return JSON.parse(cleaned);
}

/** A bounded direct loopback request. Never follows redirects or uses a proxy. */
function post(endpoint, token, body, limits) {
  const payload = Buffer.from(JSON.stringify(body));
  if (payload.length > limits.requestBytes) throw new BridgeError('request_too_large', 'The bridge request exceeds its size limit.');
  return new Promise((resolve, reject) => {
    let done = false;
    let timer;
    let req;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    req = http.request(endpoint, {
      method: 'POST', agent: false,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': payload.length,
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.destroy();
        finish(new BridgeError('redirect_rejected', 'The loopback coordinator returned a redirect; the bridge did not follow it.', { httpStatus: res.statusCode }));
        return;
      }
      let size = 0;
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > limits.responseBytes) {
          finish(new BridgeError('response_too_large', 'The coordinator response exceeds the bridge size limit.'));
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('aborted', () => finish(new BridgeError('connection_lost', 'The coordinator response was interrupted. A write may already have committed; inspect the inbox before retrying.')));
      res.on('error', () => finish(new BridgeError('connection_lost', 'The coordinator response failed. A write may already have committed; inspect the inbox before retrying.')));
      res.on('end', () => {
        if (done) return;
        let value;
        const raw = Buffer.concat(chunks).toString('utf8');
        try { value = JSON.parse(raw); } catch {
          finish(new BridgeError('invalid_response', 'The coordinator returned non-JSON data; no success is confirmed.', { httpStatus: res.statusCode }));
          return;
        }
        if (!record(value)) {
          finish(new BridgeError('invalid_response', 'The coordinator returned an invalid response envelope.', { httpStatus: res.statusCode }));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300 || value.ok !== true) {
          const upstreamCode = typeof value.code === 'string' ? value.code : typeof value.error === 'string' ? value.error : value.error?.code;
          const conflict = res.statusCode === 409;
          const uncertain = upstreamCode === 'mutation_outcome_unknown';
          finish(new BridgeError(uncertain ? 'mutation_outcome_unknown' : conflict ? 'revision_or_operation_conflict' : 'coordinator_rejected',
            uncertain ? 'The coordinator could not confirm the write outcome. It may already have committed. Inspect the inbox; any identical retry must preserve the same operationId and payload.' : conflict ? 'The coordinator rejected the revision or operation. Refresh the inbox and inspect the existing outcome; do not invent a new operation ID to bypass a conflict.' : 'The coordinator rejected this operation; no success is confirmed.',
            { httpStatus: res.statusCode, ...(body.operationId ? { operationId: body.operationId } : {}), ...(typeof upstreamCode === 'string' ? { coordinatorCode: upstreamCode } : {}), upstream: value.error ?? value.message ?? null }));
          return;
        }
        finish(null, value);
      });
    });
    req.on('error', () => finish(new BridgeError('connection_failed', 'Cannot reach the loopback coordinator. If this was a write, its outcome may be unknown; inspect the inbox before retrying.')));
    timer = setTimeout(() => {
      finish(new BridgeError('timeout', 'The coordinator did not reply before the deadline. A write may already have committed; inspect the inbox before retrying.'));
      req.destroy();
    }, limits.timeoutMs);
    req.end(payload);
  });
}

export function createBridge({ env = process.env, limits: overrides = {} } = {}) {
  const limits = { ...LIMITS, ...overrides };
  for (const key of ['requestBytes', 'responseBytes', 'timeoutMs']) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > LIMITS[key]) throw new Error('Test limits may only tighten production limits.');
  }
  return {
    async call(name, args = {}) {
      let token = typeof env.XENIOS_FACTORY_TOKEN === 'string' ? env.XENIOS_FACTORY_TOKEN : '';
      try {
        let body;
        switch (name) {
          case 'factory_status':
          case 'factory_inbox':
            exactObject(args, []);
            body = { kind: 'inbox' };
            break;
          case 'factory_acknowledge': body = receipt(args); break;
          case 'factory_submit_result': body = receipt(args, 'result_submitted'); break;
          case 'factory_heartbeat':
            exactObject(args, ['sequence', 'workState', 'summary']);
            if (!Number.isSafeInteger(args.sequence) || args.sequence < 1) invalid('sequence must be a positive safe integer.');
            if (!WORK_STATES.includes(args.workState)) invalid('workState is not a supported state.');
            body = { kind: 'heartbeat', sequence: args.sequence, workState: args.workState, summary: textField(args, 'summary', LIMITS.heartbeatSummaryCharacters, { empty: true }) };
            break;
          default: invalid('Unknown factory tool.');
        }
        const config = configured(env);
        token = config.token;
        const response = await post(config.endpoint, token, body, limits);
        let result;
        if (body.kind === 'inbox') {
          if (typeof response.sessionId !== 'string' || !response.sessionId || !Number.isSafeInteger(response.revision) || response.revision < 0 || !Array.isArray(response.messages) || !Array.isArray(response.tasks)) {
            throw new BridgeError('invalid_response', 'The coordinator did not return a valid bound-session inbox.');
          }
          const {messagesTotal, messagesReturned, messagesTruncated, messageCount} = response;
          if (!Number.isSafeInteger(messagesTotal) || messagesTotal < 0 || messagesTotal > 10000
            || !Number.isSafeInteger(messagesReturned) || messagesReturned !== response.messages.length || messagesReturned > 1000
            || messagesTotal < messagesReturned || messageCount !== messagesTotal
            || typeof messagesTruncated !== 'boolean' || messagesTruncated !== (messagesTotal > messagesReturned)) {
            throw new BridgeError('invalid_response', 'The coordinator did not return consistent inbox completeness evidence.');
          }
          const completeness = {messageCount, messagesTotal, messagesReturned, messagesTruncated};
          result = name === 'factory_status'
            ? { ok: true, sessionId: response.sessionId, revision: response.revision, observedAt: new Date().toISOString(), ...completeness, taskCount: response.tasks.length, observation: 'Credential-bound coordinator inbox read only; provider authentication, work state, and delivery acknowledgement are not inferred.' }
            : { ok: true, sessionId: response.sessionId, revision: response.revision, ...completeness, messages: response.messages, tasks: response.tasks };
        } else if (body.kind === 'heartbeat') {
          if (typeof response.receivedAt !== 'string' || !Number.isFinite(Date.parse(response.receivedAt))) throw new BridgeError('invalid_response', 'Heartbeat receipt is missing a valid receivedAt timestamp.');
          result = { ok: true, receivedAt: response.receivedAt };
        } else {
          if (typeof response.messageId !== 'string' || !response.messageId || response.stage !== body.stage || !record(response.coordination)) throw new BridgeError('invalid_response', 'The coordinator did not confirm the requested receipt stage. Inspect the inbox before retrying.');
          result = { ok: true, messageId: response.messageId, stage: response.stage, coordination: response.coordination };
        }
        return { content: [{ type: 'text', text: JSON.stringify(scrub(result, token)) }] };
      } catch (error) {
        const known = error instanceof BridgeError;
        const failure = { ok: false, error: { code: known ? error.code : 'bridge_error', message: known ? error.message : 'The bridge could not complete this operation.', ...(known ? error.details : {}) } };
        let safe;
        try { safe = scrub(failure, token); } catch { safe = { ok: false, error: { code: 'bridge_error', message: 'The bridge could not safely return this response.' } }; }
        return { isError: true, content: [{ type: 'text', text: JSON.stringify(safe) }] };
      }
    },
  };
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

export function createRpcHandler(bridge) {
  let initialized = false;
  let ready = false;
  let protocol;
  return async message => {
    const hasId = record(message) && own(message, 'id');
    // Valid notifications never receive a response or invoke a factory tool.
    if (record(message) && message.jsonrpc === '2.0' && typeof message.method === 'string' && !hasId) {
      if (message.method === 'notifications/initialized' && initialized) ready = true;
      return null;
    }
    const validId = hasId && ((typeof message.id === 'string' && message.id.length <= 200) || Number.isSafeInteger(message.id));
    if (!record(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || !validId) return rpcError(null, -32600, 'Invalid JSON-RPC request.');
    const id = message.id;
    if (message.params !== undefined && !record(message.params)) return rpcError(id, -32602, 'Params must be an object.');
    const params = message.params || {};
    if (message.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
    if (message.method === 'initialize') {
      if (initialized) return rpcError(id, -32600, 'The connection has already initialized.');
      if (typeof params.protocolVersion !== 'string' || !record(params.capabilities) || !record(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') return rpcError(id, -32602, 'Initialization requires protocolVersion, capabilities, and clientInfo.');
      protocol = SUPPORTED_PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED_PROTOCOLS[0];
      initialized = true;
      return { jsonrpc: '2.0', id, result: { protocolVersion: protocol, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'xenios-control-room', version: '0.1.0-review' }, instructions: 'Read your inbox, then explicitly acknowledge only actions you actually took. This adapter does not wake or control provider sessions.' } };
    }
    if (!ready) return rpcError(id, -32002, 'Initialize and send notifications/initialized before using tools.');
    if (message.method === 'tools/list') {
      if (params.cursor !== undefined) return rpcError(id, -32602, 'This fixed tool catalog has no pagination cursor.');
      const tools = protocol === '2024-11-05' ? TOOLS.map(({ annotations: _unused, ...tool }) => tool) : TOOLS;
      return { jsonrpc: '2.0', id, result: { tools } };
    }
    if (message.method === 'tools/call') {
      if (typeof params.name !== 'string' || !TOOLS.some(tool => tool.name === params.name) || (params.arguments !== undefined && !record(params.arguments))) return rpcError(id, -32602, 'Unknown tool or invalid arguments.');
      return { jsonrpc: '2.0', id, result: await bridge.call(params.name, params.arguments || {}) };
    }
    return rpcError(id, -32601, 'Method not found.');
  };
}

export async function serveStdio({ input = process.stdin, output = process.stdout, bridge = createBridge(), maxLineBytes = LIMITS.lineBytes } = {}) {
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1 || maxLineBytes > LIMITS.lineBytes) throw new Error('Invalid line size limit.');
  const handle = createRpcHandler(bridge);
  let buffer = Buffer.alloc(0);
  let dropping = false;
  const send = async value => {
    if (!value) return;
    await new Promise((resolve, reject) => output.write(`${JSON.stringify(value)}\n`, error => error ? reject(error) : resolve()));
  };
  const processLine = async line => {
    if (!line.length || !line.toString('utf8').trim()) return;
    let message;
    try { message = JSON.parse(line.toString('utf8')); } catch {
      await send(rpcError(null, -32700, 'Invalid JSON.'));
      return;
    }
    try { await send(await handle(message)); } catch { await send(rpcError(record(message) && own(message, 'id') ? message.id : null, -32603, 'Internal bridge error.')); }
  };
  for await (const item of input) {
    const chunk = Buffer.isBuffer(item) ? item : Buffer.from(item);
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.subarray(offset, end);
      if (!dropping) {
        if (buffer.length + part.length > maxLineBytes) {
          buffer = Buffer.alloc(0);
          dropping = true;
          await send(rpcError(null, -32700, 'JSON line exceeds the bridge size limit.'));
        } else buffer = Buffer.concat([buffer, part]);
      }
      if (newline !== -1) {
        if (!dropping) await processLine(buffer);
        buffer = Buffer.alloc(0);
        dropping = false;
      }
      offset = newline === -1 ? chunk.length : newline + 1;
    }
  }
  // MCP uses newline-delimited frames. Do not execute an incomplete final frame.
  if (buffer.length) await send(rpcError(null, -32700, 'Incomplete final JSON line.'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serveStdio().catch(() => { process.exitCode = 1; });
}
