import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionFactory } from './fixtures.mjs';

test('fixture epoch stays stable across local clock changes and preserves explicit expiry', () => {
  let fixtureSeconds = 1800000000;
  let reads = 0;
  const makeSession = createSessionFactory(() => { reads++; return fixtureSeconds; });
  const original = makeSession('session-A', 'subject-A', 'aal2');

  fixtureSeconds += 17;
  assert.deepEqual(makeSession('session-A', 'subject-A', 'aal2'), original);
  assert.equal(makeSession('session-B', 'subject-A').expires_at, original.expires_at);
  assert.notEqual(makeSession('session-B', 'subject-A').access_token, original.access_token);
  assert.equal(reads, 1, 'session construction never re-reads the fixture clock');

  const explicitDeadline = fixtureSeconds - 30;
  const expired = makeSession('expired-A', 'subject-A', 'aal1', { expiresAt: explicitDeadline, expiresIn: 0 });
  const payload = JSON.parse(Buffer.from(expired.access_token.split('.')[1], 'base64url').toString());
  assert.equal(payload.exp, explicitDeadline);
  assert.equal(expired.expires_at, explicitDeadline);
  assert.equal(expired.expires_in, 0);
  assert.ok(expired.expires_at < fixtureSeconds);
  assert.deepEqual(makeSession('session-A', 'subject-A', 'aal2'), original);
});
