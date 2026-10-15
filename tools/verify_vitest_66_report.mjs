#!/usr/bin/env node
/**
 * Xenios e33 exact three-file Vitest regression report verifier.
 *
 * Offline, zero-network checker. This does not execute the Vitest cases, the
 * PostgreSQL verifier, a browser journey, or any production operation.
 *
 * Identity contract is reconstructed from the reviewed e33 Git source and
 * checked against the Doc185 prefixes, then pinned by a full byte SHA-256.
 * A generic report with 65 passing arbitrary test names MUST be refused.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const CONTRACT_URL = new URL('../contract/e33-reviewed-test-identities.json', import.meta.url);
const CONTRACT_BYTE_SHA256 = 'acd3b338547d606aab6ef7493ce404af3c3b8f6d292596aca2c8ac7940f14873';
const REVIEWED_HASHES = Object.freeze({
  'server/release-control-plane.test.ts': '99bcf04419d181689a334fb7658bca35be83dfe31762eefa92d938061927e06c',
  'server/research/assisted-order/audit-store-sql.test.ts': 'f998eba9be5b1016074ab90e4e3931a810d6964dbf213c6a11d4ebd517469ae5',
  'server/research/inventory-admin/integration.test.ts': '4ddc27eb1dc0977300a02094ab2933f96aefd4e8b5c05953311b4dfc9a3633d4',
});
const REVIEWED_COMBINED_SHA256 = '7a936af7f2f7867cd9702cc26d2500cc58096384aaf02f89a477772375bc1818';
const CANDIDATE_SHA = 'e33c12a999536cc87c7c0153e482220c533b9624';
const PG16_SKIP_TITLE = 'executes the complete production verifier against canonical production-shaped PostgreSQL';

function refuse(message) {
  throw new Error(`XENIOS_E33_66_REPORT_REFUSAL: ${message}`);
}
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function nameDigest(names) {
  return digest([...names].sort().join('\n'));
}

function loadAndVerifyContract() {
  const raw = readFileSync(CONTRACT_URL);
  if (digest(raw) !== CONTRACT_BYTE_SHA256) refuse('reviewed identity contract byte pin mismatch');
  const contract = JSON.parse(raw.toString('utf8'));
  if (contract.candidate !== CANDIDATE_SHA
      || contract.combinedIdentitySha256 !== REVIEWED_COMBINED_SHA256
      || contract.postgresSkipTitle !== PG16_SKIP_TITLE
      || contract.expectedTotal !== 66 || contract.expectedPassed !== 65
      || contract.expectedSkip !== 1) refuse('reviewed identity contract header mismatch');
  const fileNames = Object.keys(contract.files ?? {});
  if (fileNames.length !== 3 || fileNames.some((name) => !(name in REVIEWED_HASHES))) {
    refuse('reviewed contract has unexpected suite paths');
  }
  const all = [], allSeen = new Set();
  for (const name of Object.keys(REVIEWED_HASHES)) {
    const file = contract.files[name];
    if (!Array.isArray(file?.fullNames)
        || file.fullNames.length !== file.count
        || file.expectedPassed + file.expectedSkip !== file.count) {
      refuse(`reviewed contract invalid for ${name}`);
    }
    if (nameDigest(file.fullNames) !== REVIEWED_HASHES[name]
        || file.identitySha256 !== REVIEWED_HASHES[name]) {
      refuse(`reviewed contract full-name identity mismatch for ${name}`);
    }
    for (const fullName of file.fullNames) {
      if (typeof fullName !== 'string' || !fullName || /[\r\n\0]/.test(fullName)
          || allSeen.has(fullName)) refuse('reviewed contract has invalid/duplicate full names');
      allSeen.add(fullName);
      all.push(fullName);
    }
  }
  if (all.length !== 66 || nameDigest(all) !== REVIEWED_COMBINED_SHA256) {
    refuse('reviewed contract combined digest mismatch');
  }
  return contract;
}

export const EXPECTED_FILES = Object.freeze(new Map([
  ['server/release-control-plane.test.ts', Object.freeze({ count: 55, passed: 54, skipped: 1 })],
  ['server/research/assisted-order/audit-store-sql.test.ts', Object.freeze({ count: 5, passed: 5, skipped: 0 })],
  ['server/research/inventory-admin/integration.test.ts', Object.freeze({ count: 6, passed: 6, skipped: 0 })],
]));
export const REVIEWED_IDENTITIES = loadAndVerifyContract();

function canonicalSuitePath(value) {
  if (typeof value !== 'string' || !value || /[\r\n\0]/.test(value)) refuse('invalid suite path');
  const normalized = value.replaceAll('\\', '/');
  const candidates = [...EXPECTED_FILES.keys()].filter((path) =>
    normalized === path || normalized.endsWith('/' + path));
  if (candidates.length !== 1) refuse(`unexpected suite path: ${value}`);
  return candidates[0];
}

export function validate66Report(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) refuse('report must be an object');
  if (!Array.isArray(report.testResults) || report.testResults.length !== 3) {
    refuse('exactly 3 test files are required');
  }
  for (const [key, expected] of Object.entries({
    numTotalTests: 66, numPassedTests: 65, numPendingTests: 1,
    numFailedTests: 0, numTodoTests: 0,
  })) {
    if (report[key] !== expected) refuse(`${key}: expected ${expected}, got ${report[key]}`);
  }
  if (report.success !== true) refuse('report success must be true');

  const observedFiles = new Set(), observedNames = new Set(), globalNames = [];
  let passed = 0, skipped = 0;
  for (const result of report.testResults) {
    if (!result || typeof result !== 'object') refuse('invalid test file result');
    const path = canonicalSuitePath(result.name);
    if (observedFiles.has(path)) refuse(`duplicate suite ${path}`);
    observedFiles.add(path);
    if (result.status !== 'passed') refuse(`${path}: suite status ${result.status} is not passed`);
    const expected = EXPECTED_FILES.get(path);
    if (!Array.isArray(result.assertionResults)
        || result.assertionResults.length !== expected.count) {
      refuse(`${path}: expected ${expected.count} results`);
    }
    let filePassed = 0, fileSkipped = 0;
    const fileNames = [];
    for (const assertion of result.assertionResults) {
      if (!assertion || typeof assertion !== 'object') refuse(`${path}: invalid assertion object`);
      const fullName = assertion.fullName;
      const title = assertion.title;
      if (typeof fullName !== 'string' || !fullName || /[\r\n\0]/.test(fullName)
          || typeof title !== 'string' || !title || /[\r\n\0]/.test(title)
          || !fullName.endsWith(` ${title}`)) {
        refuse(`${path}: missing or malformed full test identity`);
      }
      if (observedNames.has(fullName)) refuse(`globally duplicated full test identity: ${fullName}`);
      observedNames.add(fullName);
      globalNames.push(fullName);
      fileNames.push(fullName);
      if (assertion.status === 'passed') {
        filePassed++;
      } else if (assertion.status === 'pending' || assertion.status === 'skipped') {
        if (path !== 'server/release-control-plane.test.ts' || title !== PG16_SKIP_TITLE) {
          refuse(`${path}: unauthorized skip: ${title}`);
        }
        fileSkipped++;
      } else {
        refuse(`${path}: unexpected assertion status for ${fullName}: ${assertion.status}`);
      }
    }
    if (filePassed !== expected.passed || fileSkipped !== expected.skipped) {
      refuse(`${path}: expected ${expected.passed} passed, ${expected.skipped} skipped`);
    }
    if (nameDigest(fileNames) !== REVIEWED_HASHES[path]) {
      refuse(`${path}: full-name digest differs from reviewed identity`);
    }
    passed += filePassed;
    skipped += fileSkipped;
  }
  if (observedFiles.size !== 3 || observedNames.size !== 66 || passed !== 65 || skipped !== 1
      || nameDigest(globalNames) !== REVIEWED_COMBINED_SHA256) {
    refuse('global identity or outcome mismatch');
  }
  return Object.freeze({
    status: 'ACCEPTED_EXACT_66_REPORT',
    candidate: CANDIDATE_SHA,
    fileIdentities: REVIEWED_HASHES,
    combinedIdentitySha256: REVIEWED_COMBINED_SHA256,
    total: 66, passed: 65, skipped: 1,
    postgres: 'NOT_RUN (one exact named opt-in skip)',
    scope: 'offline JSON report only; does not authorize or prove database/browser/production actions',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) refuse('usage: node verify_vitest_66_report.mjs <vitest-json-report>');
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(JSON.stringify(validate66Report(report), null, 2) + '\n');
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
