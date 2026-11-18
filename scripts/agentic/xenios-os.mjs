#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCorpusStore, contentHash, fail } from './corpus-store.mjs';
import { overlaps } from './path-overlap.mjs';

// All seven writers and every trusted read share one explicit Git-common-dir
// binding. This binary cannot bootstrap/adopt a corpus. Root must retire old
// direct writers before installing any real authority binding.
const values = process.argv.slice(2), command = values.shift() ?? 'help';
const mutations = new Set(['register', 'claim', 'heartbeat', 'handoff', 'accept', 'release', 'message']);
function check(condition, code) { if (!condition) fail(code); }
function safeId(value) { check(typeof value === 'string' && /^[A-Za-z0-9._-]{2,100}$/.test(value), 'invalid_id'); return value; }
const clean = value => String(value ?? '').trim();
const now = () => new Date().toISOString();
function parseArgs(input) {
  const result = {};
  for (let i = 0; i < input.length; i++) {
    check(/^--[a-z-]+$/.test(input[i]) && i + 1 < input.length && !input[i + 1].startsWith('--'), 'invalid_arguments');
    const key = input[i].slice(2); check(!Object.hasOwn(result, key), 'duplicate_argument'); result[key] = input[++i];
  }
  return result;
}
function repoRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current); check(parent !== current, 'git_repository_required'); current = parent;
  }
}
function taskIn(view, id) {
  const board = view.readJson('ACTIVE_TASKS.json'), task = board.tasks.find(item => item.id === id);
  check(task, 'unknown_task'); return { board, task };
}
function activeSession(view, id) {
  const session = view.readJson('SESSION_REGISTRY.json').sessions.find(item => item.id === id);
  check(session?.state === 'active', 'active_session_required'); return session;
}
function ownsClaim(task, ownership, actor) {
  check(task.state === 'claimed' && task.owner === actor
    && ownership.leases.some(lease => lease.id === task.claimId && lease.task === task.id && lease.session === actor && lease.state === 'active'), 'current_claim_required');
}
const dependenciesDone = (task, board) => (task.dependsOn ?? []).every(id => board.tasks.find(item => item.id === id)?.state === 'done');
const conflicts = (task, ownership) => ownership.leases.filter(lease => lease.state === 'active' && task.paths.some(a => lease.paths.some(b => overlaps(a, b))));
function ready(view) {
  const board = view.readJson('ACTIVE_TASKS.json'), ownership = view.readJson('CODE_OWNERSHIP.json');
  const priority = task => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[task.priority] ?? 99);
  return board.tasks.filter(task => task.state === 'ready' && dependenciesDone(task, board) && !conflicts(task, ownership).length)
    .sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
}
function readCommand(view, args) {
  if (command === 'validate') return { relationalValidation: true, hashValidation: true };
  if (command === 'export') return { files: Object.fromEntries(view.list('').map(rel => [rel, {
    sha256: contentHash(view.readBytes(rel)), base64: view.readBytes(rel).toString('base64') }])) };
  if (command === 'status') {
    const board = view.readJson('ACTIVE_TASKS.json');
    return { project: view.readJson('PROJECT_STATE.json'), release: view.readJson('RELEASE_STATE.json'),
      taskCounts: Object.fromEntries([...new Set(board.tasks.map(task => task.state))].map(state => [state, board.tasks.filter(task => task.state === state).length])),
      sessions: view.readJson('SESSION_REGISTRY.json').sessions };
  }
  if (command === 'next') { const candidates = ready(view); return { session: args.session ? safeId(args.session) : null, next: candidates[0] ?? null, candidates }; }
  if (command === 'stale') {
    const minutes = Number(args.minutes ?? 30); check(Number.isFinite(minutes) && minutes >= 1, 'invalid_stale_minutes');
    const cutoff = Date.now() - minutes * 60_000;
    // Observational only: heartbeat age never proves death or releases a claim.
    return { minutes, sessions: view.readJson('SESSION_REGISTRY.json').sessions.filter(item => Date.parse(item.heartbeatAt) < cutoff),
      leases: view.readJson('CODE_OWNERSHIP.json').leases.filter(item => item.state === 'active' && Date.parse(item.heartbeatAt) < cutoff) };
  }
  if (command === 'resume') {
    const session = safeId(args.session); activeSession(view, session);
    return { session: view.readJson('sessions/' + session + '.json'),
      tasks: view.readJson('ACTIVE_TASKS.json').tasks.filter(task => task.owner === session || task.handoff?.session === session),
      messages: view.list('messages/').reverse().slice(0, 100).map(rel => view.readJson(rel))
        .filter(item => item.to === 'all' || item.to === session || item.from === session).slice(0, 20) };
  }
  fail('unknown_command');
}
function mutationInput(args) {
  const keys = ({ register: ['id', 'tool', 'lane', 'branch', 'note'], claim: ['session', 'task'],
    heartbeat: ['session', 'note'], handoff: ['session', 'task', 'sha', 'summary'],
    accept: ['task', 'by', 'sha'], release: ['session', 'task'], message: ['from', 'to', 'text'] })[command];
  check(Object.keys(args).every(key => [...keys, 'operation-id', 'expected-revision'].includes(key)), 'unsupported_argument');
  const input = Object.fromEntries(keys.filter(key => key !== 'summary').map(key => [key, clean(args[key])]));
  const actor = safeId(command === 'register' ? args.id : command === 'accept' ? args.by : command === 'message' ? args.from : args.session);
  let summary = null;
  if (command === 'handoff') {
    check(args.summary, 'summary_file_required');
    const file = path.resolve(args.summary), stat = fs.lstatSync(file);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 5 * 1024 * 1024, 'invalid_summary_file');
    summary = fs.readFileSync(file); new TextDecoder('utf-8', { fatal: true }).decode(summary);
    // Fingerprint actual once-read bytes, without EOL or Unicode normalization.
    input.summary = { sha256: contentHash(summary), bytes: summary.length };
  }
  check(/^\d+$/.test(args['expected-revision'] ?? ''), 'operation_id_and_revision_required');
  return { actor, input, summary, operationId: args['operation-id'], expectedRevision: Number(args['expected-revision']) };
}
function writeCommand(view, request) {
  const { actor, input, operationId, summary } = request;
  if (command === 'register') {
    check(input.tool && input.lane && input.branch, 'register_fields_required');
    const registry = view.readJson('SESSION_REGISTRY.json'); check(!registry.sessions.some(item => item.id === actor), 'session_already_registered');
    const at = now(), session = { id: actor, tool: input.tool, lane: input.lane, branch: input.branch,
      state: 'active', startedAt: at, heartbeatAt: at, note: input.note };
    registry.sessions.push(session); view.writeJson('SESSION_REGISTRY.json', registry); view.writeJson('sessions/' + actor + '.json', session); return { session };
  }
  activeSession(view, actor);
  if (command === 'message') {
    check(input.text && input.text.length <= 100_000, 'message_text_required');
    const to = input.to || 'all'; if (to !== 'all') activeSession(view, safeId(to));
    const message = { id: operationId, from: actor, to, text: input.text, createdAt: now() };
    view.writeJson('messages/' + operationId + '.json', message); return { message };
  }
  const ownership = view.readJson('CODE_OWNERSHIP.json');
  if (command === 'heartbeat') {
    const registry = view.readJson('SESSION_REGISTRY.json'), session = registry.sessions.find(item => item.id === actor);
    session.heartbeatAt = now(); session.note = input.note;
    for (const lease of ownership.leases) if (lease.session === actor && lease.state === 'active') lease.heartbeatAt = session.heartbeatAt;
    view.writeJson('SESSION_REGISTRY.json', registry); view.writeJson('sessions/' + actor + '.json', session); view.writeJson('CODE_OWNERSHIP.json', ownership); return { session };
  }
  const { board, task } = taskIn(view, safeId(input.task));
  if (command === 'claim') {
    check(['ready', 'qa'].includes(task.state) && dependenciesDone(task, board), 'task_not_claimable'); check(conflicts(task, ownership).length === 0, 'path_conflict');
    const at = now(), claimId = crypto.randomUUID(); task.state = 'claimed'; task.owner = actor; task.claimId = claimId; task.claimedAt = at;
    ownership.leases.push({ id: claimId, task: task.id, session: actor, paths: [...task.paths], state: 'active', claimedAt: at, heartbeatAt: at });
  } else if (command === 'handoff') {
    ownsClaim(task, ownership, actor); check(/^[a-f0-9]{40}$/.test(input.sha), 'full_source_sha_required');
    const rel = 'handoffs/' + task.id + '-' + actor + '-' + operationId + '.md';
    view.writeBytes(rel, summary); task.state = 'qa'; task.handoff = { session: actor, sha: input.sha,
      file: '.xenios/' + rel, contentSha256: input.summary.sha256, bytes: summary.length, at: now() };
    ownership.leases.find(lease => lease.id === task.claimId).state = 'handoff';
  } else if (command === 'accept') {
    check(task.state === 'qa' && /^[a-f0-9]{40}$/.test(input.sha) && task.handoff.sha === input.sha, 'matching_qa_handoff_required');
    check(task.handoff.session !== actor, 'independent_acceptance_required');
    task.state = 'done'; task.acceptedSha = input.sha; task.acceptedBy = actor; task.acceptedAt = now();
    for (const lease of ownership.leases) if (lease.task === task.id) lease.state = 'released';
  } else if (command === 'release') {
    ownsClaim(task, ownership, actor); // Prior handoff authors cannot release a newer reviewer's claim.
    ownership.leases.find(lease => lease.id === task.claimId).state = 'released'; task.state = task.handoff ? 'qa' : 'ready'; task.owner = null; task.releasedAt = now(); delete task.claimId;
  }
  view.writeJson('ACTIVE_TASKS.json', board); view.writeJson('CODE_OWNERSHIP.json', ownership); return { task };
}
try {
  if (command === 'help') console.log('xenios-os: validate status export next stale resume recover register claim heartbeat handoff accept release message\nMutations require --operation-id UUID --expected-revision N. Binding/adoption is a separate Root operation.');
  else {
    const args = parseArgs(values), store = createCorpusStore(repoRoot(process.cwd())); let output;
    if (command === 'recover') { check(Object.keys(args).length === 0, 'unsupported_argument'); output = await store.recover(); }
    else if (mutations.has(command)) { const request = mutationInput(args); output = await store.mutate({ ...request, command }, view => writeCommand(view, request)); }
    else output = await store.read(view => readCommand(view, args));
    console.log(JSON.stringify({ ok: true, ...output.result, coordination: output.coordination }, null, 2));
  }
} catch (error) { console.error(JSON.stringify({ ok: false, code: error.code ?? 'coordination_unavailable' })); process.exitCode = 1; }
