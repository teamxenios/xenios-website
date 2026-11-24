// OFFLINE only: consumes QA's existing archive and Root-selected binding.
import { readFileSync, lstatSync, realpathSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { inspectHostedPreview, sha256 } from './lib/hosted-preview-import.mjs';
import { cssReferenceParser } from './lib/hosted-preview-css.mjs';
export function importHostedProductStudio({ archive, bindingFile, repo, out, inspectOnly = false }) {
  repo = realpathSync(repo); archive = resolve(archive); bindingFile = resolve(bindingFile);
  assert(lstatSync(archive).isFile() && !lstatSync(archive).isSymbolicLink(), 'REGULAR_QA_ARCHIVE_REQUIRED');
  assert(lstatSync(archive).size <= 128 * 1024 * 1024, 'ARCHIVE_SIZE');
  assert(lstatSync(bindingFile).isFile() && !lstatSync(bindingFile).isSymbolicLink() && lstatSync(bindingFile).size <= 65536, 'BINDING_FILE');
  const b = JSON.parse(readFileSync(bindingFile, 'utf8'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }).trim();
  assert.equal(git('rev-parse', b.source + '^{tree}'), b.tree);
  // The ephemeral hosted merge need not exist locally. Its exact identity is
  // selected by Root/QA's pinned receipt and must agree with the archived marker.
  // This is not a new authenticated GitHub runner-identity lookup.
  const require = createRequire(join(repo, 'package.json'));
  const parser = require('@babel/parser');
  const parseJavaScript = text => parser.parse(text, { sourceType: 'module', createImportExpressions: true });
  const parseCssReferences = cssReferenceParser(require('postcss'), require('postcss-value-parser'));
  const readReceipt = (path, expected) => {
    const stat = lstatSync(path); assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024, 'RECEIPT_FILE');
    const bytes = readFileSync(path); assert.equal(sha256(bytes), expected, 'RECEIPT_HASH'); return bytes;
  };
  const rootSelection = JSON.parse(readReceipt(b.rootSelectionPath, b.rootSelectionSha256));
  for (const key of ['source', 'tree', 'runner', 'node', 'archiveBytes', 'archiveSha256']) assert.equal(rootSelection[key], b[key], 'ROOT_SELECTION_IDENTITY');
  assert.equal(rootSelection.run, b.runId); assert.equal(rootSelection.attempt, b.attempt);
  assert.equal(rootSelection.job, b.jobId); assert.equal(rootSelection.artifact, b.artifactId);
  assert.equal(b.runnerSelectionEvidenceSha256, b.rootSelectionSha256);
  const artifactSelection = readReceipt(b.artifactEvidencePath, b.artifactEvidenceSha256);
  const progressRecord = readReceipt(b.progressEvidencePath, b.runEvidenceSha256);
  const plan = inspectHostedPreview(readFileSync(archive), b, { parseJavaScript, parseCssReferences, artifactSelection, progressRecord });
  const summary = { profile: plan.provenance.kind, source: b.source, tree: b.tree, run: b.runId, attempt: b.attempt,
    job: b.jobId, artifact: b.artifactId, archiveSha256: b.archiveSha256, importedFiles: plan.files.size,
    inventorySha256: plan.provenance.distInventorySha256, dependencyEdges: plan.provenance.dependencyEdges.length,
    mode: inspectOnly ? 'INSPECT_ONLY_NO_EXTRACTION' : 'MATERIALIZE_VERIFIED_STATIC_SUBSET', browserExecuted: false };
  if (inspectOnly) return summary;
  out = resolve(out); const parent = realpathSync(dirname(out));
  assert(parent.toLowerCase() === dirname(out).toLowerCase(), 'DIRECT_PHYSICAL_OUTPUT_PARENT');
  const inside = (a, root) => a.toLowerCase() === root.toLowerCase() || a.toLowerCase().startsWith(root.toLowerCase() + sep);
  assert(!inside(out, repo) && !existsSync(out), 'FRESH_EXTERNAL_OUTPUT_REQUIRED');
  // Everything is checked before the first write. Failure preserves any new partial directory.
  mkdirSync(out);
  for (const [name, bytes] of plan.files) {
    const target = join(out, 'public', ...name.split('/')); mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: 'wx' }); assert.equal(sha256(readFileSync(target)), sha256(bytes));
  }
  writeFileSync(join(out, 'evidence-provenance.json'), JSON.stringify(plan.provenance, null, 2) + '\n', { flag: 'wx' });
  // Summary goes to stdout, never into the immutable static-subset directory.
  return summary;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i]; assert(['--archive', '--binding', '--repo', '--out', '--inspect-only'].includes(k) && !Object.hasOwn(values, k), 'EXACT_ARGUMENTS');
    values[k] = k === '--inspect-only' ? true : args[++i];
  }
  assert(values['--archive'] && values['--binding'] && values['--repo'] && (values['--out'] || values['--inspect-only']), 'REQUIRED_ARGUMENTS');
  console.log(JSON.stringify(importHostedProductStudio({ archive: values['--archive'], bindingFile: values['--binding'], repo: values['--repo'], out: values['--out'], inspectOnly: Boolean(values['--inspect-only']) })));
}
