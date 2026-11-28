import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'factory-doctor.mjs');
const NOW = '2026-11-18T15:30:00.000Z';
const call = args => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 10000 });

test('the CLI returns a bounded usage error for a missing option value', () => {
  const r = call(['assess', '--snapshot']);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /Missing or repeated option value/);
});

test('the CLI refuses competing snapshot authorities', () => {
  const r = call(['assess', '--snapshot', 'unused.json', '--registries', 'unused']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /exactly one/);
});

test('the CLI reads a synthetic registry without changing any input file', t => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const records = {
    'ACTIVE_TASKS.json': { schemaVersion: 1, updatedAt: '2026-09-21T12:00:00.000Z', tasks: [] },
    'CODE_OWNERSHIP.json': { schemaVersion: 1, leases: [], rules: [] },
    'SESSION_REGISTRY.json': { schemaVersion: 1, updatedAt: NOW, sessions: [] },
  };
  for (const [name, record] of Object.entries(records)) writeFileSync(join(dir, name), JSON.stringify(record));
  const hashes = () => readdirSync(dir).sort().map(name => [name, createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')]);
  const before = hashes();
  const r = call(['assess', '--registries', dir, '--now', NOW]);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.equal(report.authority, 'none');
  assert.ok(report.findings.some(f => f.code === 'SOURCE_STALE'));
  assert.ok(report.findings.some(f => f.code === 'SOURCE_FRESHNESS_UNKNOWN'));
  assert.deepEqual(hashes(), before);
});

test('an evidence overlay cannot rewrite task ownership or authority timestamps', t => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-overlay-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, key] of [['ACTIVE_TASKS', 'tasks'], ['CODE_OWNERSHIP', 'leases'], ['SESSION_REGISTRY', 'sessions']]) {
    writeFileSync(join(dir, name + '.json'), JSON.stringify({ schemaVersion: 1, updatedAt: NOW, [key]: [] }));
  }
  const overlay = join(dir, 'overlay.json');
  writeFileSync(overlay, JSON.stringify({ schemaVersion: 1, sources: [{ authoritativeAsOf: NOW }], tasks: [{ id: 'unauthorized-replacement' }] }));
  const r = call(['assess', '--registries', dir, '--evidence', overlay, '--now', NOW]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unsupported evidence overlay/);
});

test('the CLI reports malformed input without reproducing its payload', t => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-bad-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = join(dir, 'bad.json');
  writeFileSync(input, '{ "sensitive-marker":');
  const r = call(['assess', '--snapshot', input]);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr + r.stdout, /sensitive-marker/);
});
