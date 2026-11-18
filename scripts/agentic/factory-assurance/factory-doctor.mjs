#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assess, normalizeRegistries, proposeLessons, evaluate, compareEvaluations, VERSION } from './factory-assurance.mjs';

const HELP = `Xenios Factory Assurance ${VERSION} — offline, advisory, read-only

node factory-doctor.mjs assess --snapshot FILE [--policy FILE] [--now ISO]
node factory-doctor.mjs assess --registries DIRECTORY [--evidence FILE] [--policy FILE] [--now ISO]
node factory-doctor.mjs evaluate --cases FILE [--policy FILE] [--now ISO]
node factory-doctor.mjs compare --baseline FILE --candidate FILE
node factory-doctor.mjs lessons --assessment FILE [--reviewed FILE]

Registry directory: ACTIVE_TASKS.json, CODE_OWNERSHIP.json, SESSION_REGISTRY.json.
Evidence overlay accepts only schemaVersion, claims, receipts, runtimeFacts, resources.
It cannot replace source timestamps, owners, leases or task state.

Output: JSON on stdout. Errors: bounded messages on stderr.
Exit 0: no findings, valid evaluation, proposed lessons or reviewable comparison.
Exit 1: findings, invalid evaluation or rejected comparison. Exit 2: usage/input error.
No command changes files, starts workers, accesses a network or authorizes release.
`;

const FLAGS = {
  assess: new Set(['snapshot', 'registries', 'evidence', 'policy', 'now']),
  evaluate: new Set(['cases', 'policy', 'now']),
  compare: new Set(['baseline', 'candidate']),
  lessons: new Set(['assessment', 'reviewed']),
};

function readJson(path, label) {
  if (!path) throw new Error(`Missing ${label} input.`);
  let stat, data;
  try {
    stat = statSync(path);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('SIZE');
    data = readFileSync(path, 'utf8');
  } catch { throw new Error(`Cannot read ${label}: use a regular JSON file of at most 5 MiB.`); }
  try { return JSON.parse(data); } catch { throw new Error(`Invalid JSON in ${label}.`); }
}

function run(args) {
  if (!args.length || args.includes('--help')) { process.stdout.write(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { process.stdout.write(VERSION + '\n'); return 0; }
  const [command, ...rest] = args;
  if (!Object.hasOwn(FLAGS, command)) throw new Error('Unknown command. Run with --help.');
  const options = Object.create(null);
  for (let index = 0; index < rest.length; index += 2) {
    const token = rest[index];
    if (!token.startsWith('--') || !FLAGS[command].has(token.slice(2))) throw new Error('Unknown option. Run with --help.');
    const key = token.slice(2), value = rest[index + 1];
    if (!value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error('Missing or repeated option value.');
    options[key] = value;
  }
  const now = options.now ?? new Date().toISOString();
  const policy = options.policy ? readJson(options.policy, 'policy') : {};
  let result, code;
  if (command === 'assess') {
    if (Boolean(options.snapshot) === Boolean(options.registries)) throw new Error('Choose exactly one of --snapshot and --registries.');
    if (options.evidence && !options.registries) throw new Error('--evidence is only supported with --registries.');
    let input;
    if (options.snapshot) input = readJson(options.snapshot, 'snapshot');
    else {
      input = normalizeRegistries({
        activeTasks: readJson(join(options.registries, 'ACTIVE_TASKS.json'), 'task registry'),
        codeOwnership: readJson(join(options.registries, 'CODE_OWNERSHIP.json'), 'ownership registry'),
        sessionRegistry: readJson(join(options.registries, 'SESSION_REGISTRY.json'), 'session registry'),
      }, now);
      if (options.evidence) {
        const overlay = readJson(options.evidence, 'evidence');
        const allowed = new Set(['schemaVersion', 'claims', 'receipts', 'runtimeFacts', 'resources']);
        if (!overlay || Array.isArray(overlay) || typeof overlay !== 'object' || overlay.schemaVersion !== 1
          || Object.keys(overlay).some(key => !allowed.has(key))) throw new Error('Unsupported evidence overlay fields or schema.');
        for (const key of allowed) if (key !== 'schemaVersion' && Object.hasOwn(overlay, key)) input[key] = overlay[key];
      }
    }
    result = assess(input, policy, now);
    code = result.findings.length ? 1 : 0;
  } else if (command === 'evaluate') {
    result = evaluate(readJson(options.cases, 'evaluation cases'), policy, options.now);
    code = result.valid ? 0 : 1;
  } else if (command === 'compare') {
    result = compareEvaluations(readJson(options.baseline, 'baseline'), readJson(options.candidate, 'candidate'));
    code = result.recommendation === 'review_candidate' ? 0 : 1;
  } else {
    const reviewed = options.reviewed ? readJson(options.reviewed, 'reviewed lessons') : [];
    if (!Array.isArray(reviewed)) throw new Error('Reviewed lessons must be an array.');
    result = { mode: 'proposal_only', automaticPromotion: false, lessons: proposeLessons(readJson(options.assessment, 'assessment'), reviewed) };
    code = 0;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return code;
}

try { process.exitCode = run(process.argv.slice(2)); }
catch (error) {
  const message = error instanceof Error ? error.message : 'Input could not be processed.';
  process.stderr.write(`Factory doctor: ${message.slice(0, 240)}\n`);
  process.exitCode = 2;
}
