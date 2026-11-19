import path from 'node:path';
import { runQualification, DEFAULT_SUBJECT } from './harness.mjs';

const args = process.argv.slice(2), options = { subjectRoot: DEFAULT_SUBJECT };
for (let i = 0; i < args.length; i += 2) {
  if (!['--subject-repo', '--out'].includes(args[i]) || !args[i + 1]) {
    console.error('Usage: node run.mjs [--subject-repo PATH] [--out RECEIPT.json]');
    process.exit(2);
  }
  options[args[i] === '--out' ? 'outputFile' : 'subjectRoot'] = path.resolve(args[i + 1]);
}
const receipt = await runQualification(options);
console.log(JSON.stringify({ status: receipt.status, subjectHead: receipt.subject?.head ?? null,
  sourceBaseline: receipt.subject?.baselineSha ?? null, nodeVersion: receipt.nodeVersion,
  scenarios: receipt.scenarios.map(scenario => ({ id: scenario.id, invariantPassed: scenario.invariantPassed,
    successfulClaims: scenario.successfulClaims })), allOwnedChildrenExited: receipt.allOwnedChildrenExited,
  receipt: receipt.outputFile }, null, 2));
process.exitCode = receipt.status === 'ALL_DECLARED_INVARIANTS_PASSED' ? 0
  : receipt.status === 'COORDINATION_INVARIANT_VIOLATION_OBSERVED' ? 1 : 2;
