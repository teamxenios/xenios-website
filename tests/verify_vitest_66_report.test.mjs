import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  REVIEWED_IDENTITIES, validate66Report,
} from '../tools/verify_vitest_66_report.mjs';

const PG = REVIEWED_IDENTITIES.postgresSkipTitle;
const SUITES = [
  'release manifest validator',
  'migration DAG validator',
  'route uniqueness validator',
  'production state validator',
  'unapplied assisted-order audit-store candidate',
  'inventory Product Control integration',
].sort((a, b) => b.length - a.length);

// Actual reviewed names from the GitHub source, never arbitrary positive cases.
function makeReviewedReport() {
  const testResults = Object.entries(REVIEWED_IDENTITIES.files).map(([path, suite]) => {
    const assertionResults = suite.fullNames.map((fullName) => {
      const group = SUITES.find((name) => fullName.startsWith(name + ' '));
      assert.ok(group, `unknown real suite prefix in ${fullName}`);
      const title = fullName.slice(group.length + 1);
      return {
        ancestorTitles: [group], title, fullName,
        status: title === PG ? 'pending' : 'passed',
      };
    });
    return { name: `/home/runner/work/xenios/candidate/${path}`, status: 'passed', assertionResults };
  });
  return {
    success: true,
    numTotalTests: 66, numPassedTests: 65, numPendingTests: 1,
    numFailedTests: 0, numTodoTests: 0,
    testResults,
  };
}
function mutate(f) {
  const report = makeReviewedReport();
  f(report);
  return report;
}
function expectRefusal(report, code) {
  assert.throws(() => validate66Report(report), (error) =>
    error.message.startsWith('XENIOS_E33_66_REPORT_REFUSAL: ')
    && (!code || error.message.includes(code)));
}

const releaseFile = 'server/release-control-plane.test.ts';

describe('exact reviewed 66-case result validation', () => {
  it('accepts the 66 real fullName identities with 65 pass and the one named PostgreSQL skip', () => {
    const result = validate66Report(makeReviewedReport());
    assert.equal(result.status, 'ACCEPTED_EXACT_66_REPORT');
    assert.equal(result.total, 66);
    assert.equal(result.combinedIdentitySha256, REVIEWED_IDENTITIES.combinedIdentitySha256);
  });
  it('rejects 66 synthetic names even if all numeric outcomes are identical', () => {
    const report = mutate((r) => {
      let i = 0;
      for (const file of r.testResults) {
        for (const a of file.assertionResults) {
          if (a.title === PG) continue;
          a.title = `synthetic case ${++i}`;
          a.fullName = `synthetic suite ${a.title}`;
        }
      }
    });
    expectRefusal(report, 'digest');
  });
  it('rejects a single renamed passing test while preserving the 65+1 outcome', () => {
    const report = mutate((r) => {
      const a = r.testResults[0].assertionResults[0];
      a.title += ' changed'; a.fullName += ' changed';
    });
    expectRefusal(report, 'digest');
  });
  it('rejects one test duplicated within the same suite', () => {
    const report = mutate((r) => {
      r.testResults[0].assertionResults[1] = structuredClone(r.testResults[0].assertionResults[0]);
    });
    expectRefusal(report, 'globally duplicated');
  });
  it('rejects one test duplicated across different suites', () => {
    const report = mutate((r) => {
      r.testResults[1].assertionResults[0] = structuredClone(r.testResults[0].assertionResults[0]);
    });
    expectRefusal(report, 'globally duplicated');
  });
  it('rejects an arbitrary skipped test in place of the named PostgreSQL skip', () => {
    const report = mutate((r) => {
      const file = r.testResults.find((x) => x.name.endsWith(releaseFile));
      const pg = file.assertionResults.find((x) => x.title === PG);
      const substitute = file.assertionResults.find((x) => x.title !== PG);
      pg.status = 'passed'; substitute.status = 'pending';
    });
    expectRefusal(report, 'unauthorized skip');
  });
  it('rejects an added test even when aggregate totals are left unchanged', () => {
    const report = mutate((r) => r.testResults[0].assertionResults.push({
      title: 'extra', fullName: 'extra extra', status: 'passed',
    }));
    expectRefusal(report, 'expected 55 results');
  });
  it('rejects a missing test even with unchanged aggregate totals', () => {
    const report = mutate((r) => r.testResults[0].assertionResults.pop());
    expectRefusal(report, 'expected 55 results');
  });
  it('rejects a changed suite path or a fourth suite', () => {
    const report = mutate((r) => { r.testResults[0].name = '/tmp/forged.test.ts'; });
    expectRefusal(report, 'unexpected suite path');
  });
  it('rejects an extra file even if all known files remain present', () => {
    const report = mutate((r) => r.testResults.push({ name: '/tmp/extra.test.ts', status: 'passed', assertionResults: [] }));
    expectRefusal(report, 'exactly 3');
  });
  it('rejects a failed assertion rather than relabeling it as accepted', () => {
    const report = mutate((r) => { r.testResults[0].assertionResults[0].status = 'failed'; });
    expectRefusal(report, 'unexpected assertion status');
  });
  it('rejects a todo case', () => {
    const report = mutate((r) => { r.testResults[0].assertionResults[0].status = 'todo'; });
    expectRefusal(report, 'unexpected assertion status');
  });
  it('rejects an inconsistent reporter aggregate', () => {
    const report = mutate((r) => { r.numPassedTests = 66; });
    expectRefusal(report, 'numPassedTests');
  });
  it('rejects a false reporter success marker', () => {
    const report = mutate((r) => { r.success = false; });
    expectRefusal(report, 'success');
  });
  it('refuses missing or CR/LF/NUL-containing fullName identities', () => {
    const report = mutate((r) => { r.testResults[0].assertionResults[0].fullName += '\r'; });
    expectRefusal(report, 'malformed full test identity');
  });
  it('accepts alternate Vitest skip status spelling only for the same named PG16 case', () => {
    const report = mutate((r) => {
      const pg = r.testResults[0].assertionResults.find((x) => x.title === PG);
      pg.status = 'skipped';
    });
    assert.equal(validate66Report(report).skipped, 1);
  });
});
