import assert from 'node:assert/strict';
import { OWNER_APPROVAL, EXPIRED_APPROVALS } from './publication-owner-fixture.mjs';
import { ownerEmbeddedSourceVerified, matchSelectedOwnerEmbeddedImage } from './publication-owner-embedded-images.mjs';

// A pending label is visible before a command settles. Require a NEW completed
// response from this phase and the actual enabled retry control as well.
export function settledUnknown(rows, from, origin, { pending, retryEnabled }) {
  return Number.isSafeInteger(from) && from >= 0 && from <= rows.length && pending === true && retryEnabled === true
    && rows.slice(from).some(r => r.url === origin + OWNER_APPROVAL && r.method === 'POST' && r.status === 503);
}
export function assertOwnerWholeRun(page, final, role, origin, embeddedSource = null) {
  assert(['owner','staff'].includes(role), 'ROLE_REQUIRED');
  assert(page && Array.isArray(page.network) && Array.isArray(page.networkBoundaryViolations), 'WHOLE_RUN_MISSING');
  assert.equal(page.networkBoundaryViolations.length, 0, 'NETWORK_BOUNDARY_VIOLATION');
  const posts = [OWNER_APPROVAL, OWNER_APPROVAL+'/preview', ...EXPIRED_APPROVALS.map(id=>OWNER_APPROVAL+'/'+id+'/revoke')];
  for (const row of page.network) {
    if(ownerEmbeddedSourceVerified(embeddedSource)&&matchSelectedOwnerEmbeddedImage(row)){
      assert(page.network.some(r=>r.url===origin+'/'+embeddedSource.css.path&&r.method==='GET'
        &&r.type==='Stylesheet'&&r.status===200),'EMBEDDED_DECLARING_STYLESHEET_NOT_OBSERVED');
      continue;
    }
    const u = new URL(row.url); assert.equal(u.origin, origin, 'OFF_ORIGIN_REQUEST');
    assert.equal(u.protocol,'http:','NON_HTTP_OPAQUE_REQUEST');
    assert(['GET','HEAD'].includes(row.method) || role === 'owner' && row.method === 'POST'
      && !u.search && posts.includes(u.pathname), 'NON_FIXTURE_BROWSER_WRITE');
  }
  assert(final?.counts && final?.protocol?.counts, 'FINAL_CENSUS_MISSING');
  assert.equal(final.protocol.role, role, 'ROLE_CHANGED');
  assert.equal(final.counts.writesRefused, 0); assert.equal(final.counts.unexpectedReads, 0);
  const c = final.protocol.counts;
  assert.equal(c.refusedWrites, 0); assert.equal(c.unexpectedRequests, 0);
  for (const key of ['headReads','approvalReads']) assert(Number.isSafeInteger(c[key]) && c[key]>=2 && c[key]<=64, 'READ_CENSUS');
  const expected = role==='owner'
    ? {previews:2,approveAttempts:4,approveCommits:2,approveReplays:2,revokeAttempts:2,revokeCommits:2,unknownAcknowledgments:2}
    : {previews:0,approveAttempts:0,approveCommits:0,approveReplays:0,revokeAttempts:0,revokeCommits:0,unknownAcknowledgments:0};
  for (const [key,value] of Object.entries(expected)) assert.equal(c[key],value,'FINAL_'+key);
  assert.equal(page.network.filter(r=>r.method==='POST').length, role==='owner'?8:0, 'POST_CENSUS');
  return true;
}
