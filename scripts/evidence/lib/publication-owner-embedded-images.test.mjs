import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { selectedOwnerEmbeddedImageDescriptors, selectedOwnerEmbeddedImageUri,
  verifyOwnerEmbeddedImageSource, ownerEmbeddedSourceVerified, matchSelectedOwnerEmbeddedImage,
  summarizeOwnerNetworkOrigins } from './publication-owner-embedded-images.mjs';
import { assertOwnerWholeRun } from './publication-owner-observation.mjs';
const origin='http://127.0.0.1:52943',uri=selectedOwnerEmbeddedImageUri('global-grain');
const row=(url=uri)=>({url,method:'GET',type:'Image',status:200});
const final=()=>({counts:{writesRefused:0,unexpectedReads:0},protocol:{role:'staff',counts:{headReads:2,approvalReads:2,
  previews:0,approveAttempts:0,approveCommits:0,approveReplays:0,revokeAttempts:0,revokeCommits:0,unknownAcknowledgments:0,refusedWrites:0,unexpectedRequests:0}}});
test('exact two compiled texture URIs match complete GET Image response and preserve digest',()=>{
  const ds=selectedOwnerEmbeddedImageDescriptors();assert.equal(ds.length,2);
  for(const d of ds){const r=row(selectedOwnerEmbeddedImageUri(d.id)),m=matchSelectedOwnerEmbeddedImage(r);
    assert.equal(m.id,d.id);assert.equal(m.uriSha256,createHash('sha256').update(r.url).digest('hex'));
    assert.equal(m.decodedSha256,d.decodedSha256);assert.equal(m.networkEndpoint,false);}
});
test('arbitrary data and null-origin schemes have no match',()=>{
  for(const url of ['data:image/svg+xml,<svg/>','data:text/html,<script/>','data:image/png;base64,AAAA',
    'about:blank','file:///tmp/x','blob:'+origin+'/x','null','https://outside.invalid/x'])assert.equal(matchSelectedOwnerEmbeddedImage(row(url)),null);
});
test('even one-byte or equivalent-encoding URI drift is refused',()=>{
  for(const value of [uri+' ',uri.replace('0.9','0.8'),uri.replace('%23n','#n'),uri.replace('<svg','%3Csvg')]){
    assert.equal(matchSelectedOwnerEmbeddedImage(row(value)),null);
  }
});
test('exact texture cannot hide POST HEAD wrong resource type or failed/pending status',()=>{
  for(const change of [{method:'POST'},{method:'HEAD'},{type:'Script'},{type:'Fetch'},{type:undefined},
    {status:404},{status:null},{targetType:'worker-or-child'}]){
    assert.equal(matchSelectedOwnerEmbeddedImage({...row(),...change}),null);
  }
});
test('full source verification rejects absent forged or stale compiled bytes',()=>{
  assert.equal(ownerEmbeddedSourceVerified({css:{sha256:'40ab'}}),false);
  assert.equal(ownerEmbeddedSourceVerified(null),false);
  assert.throws(()=>verifyOwnerEmbeddedImageSource(null,null),/SOURCE_BUFFERS/);
  assert.throws(()=>verifyOwnerEmbeddedImageSource(Buffer.alloc(6104),Buffer.alloc(142032)),/HTML_SHA/);
});
test('whole-run gate still refuses a matching texture without actual verified source',()=>{
  const page={network:[row()],networkBoundaryViolations:[]};
  assert.throws(()=>assertOwnerWholeRun(page,final(),'staff',origin),/OFF_ORIGIN_REQUEST/);
  assert.throws(()=>assertOwnerWholeRun(page,final(),'staff',origin,{css:{path:'assets/index-C84PvaFT.css'}}),/OFF_ORIGIN_REQUEST/);
});
test('unknown opaque and external HTTP rows retain whole-run refusal',()=>{
  for(const url of ['https://outside.invalid/','http://127.0.0.1:52944/','data:image/svg+xml,<svg/>','blob:'+origin+'/x']){
    assert.throws(()=>assertOwnerWholeRun({network:[row(url)],networkBoundaryViolations:[]},final(),'staff',origin),/OFF_ORIGIN_REQUEST|NON_HTTP_OPAQUE_REQUEST/);
  }
});
test('known HTTP path method and final census checks remain active',()=>{
  assertOwnerWholeRun({network:[row(origin+'/x')],networkBoundaryViolations:[]},final(),'staff',origin);
  assert.throws(()=>assertOwnerWholeRun({network:[{...row(origin+'/x'),method:'POST'}],networkBoundaryViolations:[]},final(),'staff',origin),/NON_FIXTURE_BROWSER_WRITE/);
  const bad=final();bad.protocol.counts.approveCommits=1;
  assert.throws(()=>assertOwnerWholeRun({network:[],networkBoundaryViolations:[]},bad,'staff',origin),/FINAL_approveCommits/);
});
test('earlier boundary violation cannot disappear behind an embedded-image match',()=>{
  assert.throws(()=>assertOwnerWholeRun({network:[row()],networkBoundaryViolations:[{}]},final(),'staff',origin),/NETWORK_BOUNDARY_VIOLATION/);
});
test('diagnostics retain scheme type SHA and bounded counts without URL or payload',()=>{
  const r=summarizeOwnerNetworkOrigins([row(),'data:secret'].map(x=>typeof x==='string'?row(x):x),origin,null);
  assert.equal(r.refusedRows,2);assert.equal(r.embeddedImages,0);assert.equal(r.diagnostics[0].scheme,'data:');
  assert.equal(r.diagnostics[0].type,'Image');assert.equal(r.diagnostics[0].uriBytes,Buffer.byteLength(uri));
  assert.equal(r.diagnostics[0].uriSha256,createHash('sha256').update(uri).digest('hex'));
  assert(!JSON.stringify(r).includes(uri));assert(!JSON.stringify(r).includes('data:secret'));
});
test('diagnostic size truncation is explicit and does not invent acceptance',()=>{
  const r=summarizeOwnerNetworkOrigins(Array.from({length:33},()=>row()),origin,null);
  assert.equal(r.diagnostics.length,32);assert.equal(r.droppedDiagnostics,1);assert.equal(r.refusedRows,33);
  assert.throws(()=>summarizeOwnerNetworkOrigins(Array(4097).fill(row()),origin,null),/BOUNDED_WHOLE_NETWORK/);
  const long=summarizeOwnerNetworkOrigins([row('data:'+'x'.repeat(16384))],origin,null).diagnostics[0];
  assert.equal(long.uriSha256,null);assert.equal(long.uriBoundExceeded,true);
});
