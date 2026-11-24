import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createOwnerProtocolFixture, ownerFixtureProduct, OWNER_BASE, OWNER_APPROVAL, OWNER_MEDIA,
  OWNER_IDENTITY, OWNER_MEDIA_SHA256, OWNER_SOURCE_SHA256, OWNER_METADATA, EXPIRED_APPROVALS } from './publication-owner-fixture.mjs';
import { settledUnknown, assertOwnerWholeRun } from './publication-owner-observation.mjs';
import { assertOwnerViewport, assertNamedOwnerLabel } from './publication-owner-viewport.mjs';

const body=()=>JSON.stringify({expectedApprovalVersion:2,mediaId:OWNER_MEDIA,sourceSha256:OWNER_SOURCE_SHA256,
  expectedMediaSha256:OWNER_MEDIA_SHA256,...OWNER_METADATA});
test('construction is closed and source media carries no locator or provider authority',()=>{
  assert.throws(()=>createOwnerProtocolFixture('admin'));
  const p=ownerFixtureProduct();assert.equal(p.media[0].storageKey,null);
  const f=createOwnerProtocolFixture('owner').snapshot();
  for(const k of ['realAuth','realOwnerGrant','realRights','publication','storageWrite'])assert.equal(f[k],false);
});
test('ordinary staff reads current head but owner commands are absent/denied',()=>{
  const f=createOwnerProtocolFixture('staff');
  assert.deepEqual(f.respond('GET',OWNER_BASE).body.identity,OWNER_IDENTITY);
  const h=f.respond('GET',OWNER_APPROVAL);assert.equal(h.body.ownerAuthorized,false);assert.deepEqual(h.body.approvals,[]);
  assert.equal(f.respond('POST',OWNER_APPROVAL+'/preview',JSON.stringify({mediaId:OWNER_MEDIA})).status,403);
  assert.equal(f.snapshot().counts.approveCommits,0);
});
test('exact preview echo and no automatic media or revision writes',()=>{
  const f=createOwnerProtocolFixture('owner');const r=f.respond('POST',OWNER_APPROVAL+'/preview',JSON.stringify({mediaId:OWNER_MEDIA}));
  assert.equal(r.status,200);assert.deepEqual(r.body.identity,OWNER_IDENTITY);
  assert.equal(r.body.media.sha256,OWNER_MEDIA_SHA256);assert.equal(r.body.sourceSha256,OWNER_SOURCE_SHA256);
  assert.equal(f.snapshot().counts.approveCommits,0);
  assert.equal(f.respond('POST',OWNER_APPROVAL+'/preview',JSON.stringify({mediaId:OWNER_MEDIA,role:'owner'})).status,400);
});
test('committed synthetic503 plus same raw key/body replays once after head read',()=>{
  const f=createOwnerProtocolFixture('owner'), raw=body();
  assert.equal(f.respond('POST',OWNER_APPROVAL,raw,'synthetic-key-1').status,503);
  assert.equal(f.respond('GET',OWNER_APPROVAL).body.approvalVersion,3);
  const replay=f.respond('POST',OWNER_APPROVAL,raw,'synthetic-key-1');
  assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.approvalVersion,3);
  const s=f.snapshot();assert.equal(s.counts.approveCommits,1);assert.equal(s.counts.approveReplays,1);
  assert.equal(s.records[0].keySha256,s.records[1].keySha256);assert.equal(s.records[0].bodySha256,s.records[1].bodySha256);
  assert(!JSON.stringify(s).includes('synthetic-key-1'));assert(!JSON.stringify(s).includes('rightsEvidenceReference'));
});
test('same key with changed bytes is refused, not a second commit',()=>{
  const f=createOwnerProtocolFixture('owner');f.respond('POST',OWNER_APPROVAL,body(),'synthetic-key-1');
  assert.equal(f.respond('POST',OWNER_APPROVAL,body()+' ','synthetic-key-1').status,409);
  assert.equal(f.snapshot().counts.approveCommits,1);
});
test('wrong identity digest, stale version and unsafe version fail closed',()=>{
  for(const change of [{sourceSha256:'0'.repeat(64)},{expectedMediaSha256:'0'.repeat(64)},{expectedApprovalVersion:1},{expectedApprovalVersion:9007199254740992}]){
    const f=createOwnerProtocolFixture('owner'),value={...JSON.parse(body()),...change};
    assert.notEqual(f.respond('POST',OWNER_APPROVAL,JSON.stringify(value),'synthetic-key').status,503);
    assert.equal(f.snapshot().counts.approveCommits,0);
  }
});
test('expired recorded approval remains revocable without preview/rights assertion',()=>{
  const f=createOwnerProtocolFixture('owner');const head=f.respond('GET',OWNER_APPROVAL).body;
  assert(Date.parse(head.approvals[0].expiresAt)<Date.now());
  const r=f.respond('POST',OWNER_APPROVAL+'/'+EXPIRED_APPROVALS[0]+'/revoke',JSON.stringify({expectedApprovalVersion:2,reason:'SYNTHETIC revoke expired record'}),'synthetic-revoke');
  assert.equal(r.status,200);assert.equal(r.body.decision,'revoked');assert.equal(f.snapshot().counts.previews,0);
});
test('query, changed variant, non-finite write path and malformed body are refused',()=>{
  for(const target of [OWNER_BASE+'?role=owner',OWNER_APPROVAL.replace(OWNER_IDENTITY.variantId,'33333333-3333-4333-8333-333333333333'),OWNER_BASE+'/publish']){
    assert.equal(createOwnerProtocolFixture('owner').respond('POST',target,'{}','synthetic-key').status,404);
  }
  for(const raw of ['{','null','[]','x'.repeat(16385)])assert.notEqual(createOwnerProtocolFixture('owner').respond('POST',OWNER_APPROVAL,raw,'synthetic-key').status,503);
});
test('pending label alone and earlier phase503 cannot satisfy settled response',()=>{
  const origin='http://127.0.0.1:52941',r={url:origin+OWNER_APPROVAL,method:'POST',status:503},ready={pending:true,retryEnabled:true};
  assert.equal(settledUnknown([],0,origin,ready),false);
  assert.equal(settledUnknown([{...r,status:null}],0,origin,ready),false);
  assert.equal(settledUnknown([r],1,origin,ready),false);
  assert.equal(settledUnknown([r],0,origin,{pending:true,retryEnabled:false}),false);
  assert.equal(settledUnknown([r],0,origin,ready),true);
});
const final=()=>({counts:{writesRefused:0,unexpectedReads:0},protocol:{role:'staff',counts:{headReads:2,approvalReads:2,
  previews:0,approveAttempts:0,approveCommits:0,approveReplays:0,revokeAttempts:0,revokeCommits:0,unknownAcknowledgments:0,refusedWrites:0,unexpectedRequests:0}}});
test('whole-run first-phase violation survives later clean navigation',()=>{
  const page={network:[],networkBoundaryViolations:[{phase:'signed-out'}]};
  assert.throws(()=>assertOwnerWholeRun(page,final(),'staff','http://127.0.0.1:52941'),/NETWORK_BOUNDARY/);
  assert.throws(()=>assertOwnerWholeRun({...page,networkBoundaryViolations:[],network:[{url:'http://example.invalid/',method:'GET'}]},final(),'staff','http://127.0.0.1:52941'),/OFF_ORIGIN/);
});
test('final bad census and forbidden write cannot be hidden by happy-path state',()=>{
  const page={network:[],networkBoundaryViolations:[]};assertOwnerWholeRun(page,final(),'staff','http://127.0.0.1:52941');
  const wrong=final();wrong.protocol.counts.approveCommits=1;assert.throws(()=>assertOwnerWholeRun(page,wrong,'staff','http://127.0.0.1:52941'),/FINAL_approveCommits/);
  const refused=final();refused.counts.writesRefused=1;assert.throws(()=>assertOwnerWholeRun(page,refused,'staff','http://127.0.0.1:52941'));
  assert.throws(()=>assertOwnerWholeRun({network:[{url:'http://127.0.0.1:52941'+OWNER_BASE+'/publish',method:'POST'}],networkBoundaryViolations:[]},final(),'owner','http://127.0.0.1:52941'),/NON_FIXTURE_BROWSER_WRITE/);
});
const rect=(left=10,width=350)=>({left,right:left+width,top:10,bottom:40,width,height:30});
const sample=()=>({viewport:{left:0,right:375,width:375,documentWidth:582},panel:rect(),selector:rect(),status:rect(),article:null,retry:null,
  textRects:[rect()],limitExceeded:false,controls:[{tag:'BUTTON',disabled:false,rect:rect()}]});
test('viewport comparator cannot use overflowing document as allowed right edge',()=>{
  assertOwnerViewport(sample(),{viewportWidth:375,articleExpected:false});
  const overflow=sample();overflow.panel=rect(10,560);assert.throws(()=>assertOwnerViewport(overflow,{viewportWidth:375,articleExpected:false}),/OUTSIDE_VISUAL_VIEWPORT/);
  const control=sample();control.controls[0].rect=rect(300,200);assert.throws(()=>assertOwnerViewport(control,{viewportWidth:375,articleExpected:false}),/OWNER_CONTROL_OUTSIDE/);
});
test('all authored source parses, including TS binding redeclarations',()=>{
  // Caller supplies an existing installed parser; no dependency installation or server import.
  assert(process.env.OWNER_PARSER_ROOT,'EXISTING_PARSER_REQUIRED');
  const req=createRequire(process.env.OWNER_PARSER_ROOT+'/package.json'),parser=req('@babel/parser');
  const paths=['../../preview-publication-owner.ts','../publication-owner-browser.mjs','./publication-owner-fixture.mjs',
    './publication-owner-observation.mjs','./publication-owner-viewport.mjs','./publication-owner-fixture.test.mjs'];
  for(const p of paths){const u=new URL(p,import.meta.url);parser.parse(readFileSync(u,'utf8'),{sourceType:'module',plugins:p.endsWith('.ts')?['typescript']:[]});}
  const driver=readFileSync(new URL('../publication-owner-browser.mjs',import.meta.url),'utf8');
  assert(driver.includes('navigateWholeRun(page,origin+PAGE)'));
  assert(!driver.includes('resetRecords:true'));
  assert(driver.includes("assert.equal(conn.ws?.readyState,3,'CDP_SOCKET_NOT_CLOSED')"));
  assert(driver.includes('OWNED_PAGE_STILL_PRESENT')&&driver.includes('OWNED_BROWSER_RELEASE_UNCONFIRMED'));
  assert(driver.includes("assert(Date.now()<deadline,'BROWSER_DEADLINE')"));
  assert.throws(()=>parser.parse('const failure=1;const failure=2',{sourceType:'module'}),/already been declared/);
});

const named='Record approval for this exact preview';
const labelSample=()=>({expected:named,actual:named,truncated:false,
  button:{left:20,right:350,top:400,bottom:444},content:{left:30,right:340,top:410,bottom:434},
  viewport:{left:0,right:375,top:0,bottom:900},textRects:[{left:35,right:335,top:413,bottom:431,width:300,height:18}],
  hits:Array.from({length:5},()=>({x:100,y:420,owned:true}))});
test('named long label fits actual control interior and selected capture viewport',()=>{
  assertNamedOwnerLabel(labelSample(),named);
  const text=labelSample();text.actual='Record approval';assert.throws(()=>assertNamedOwnerLabel(text,named),/MISSING_OR_CHANGED/);
  assert.throws(()=>assertNamedOwnerLabel(labelSample(),'other'),/CLOSED_NAMED_LABEL/);
});
test('old horizontal-only acceptance cannot hide internal clipping or vertical offscreen capture',()=>{
  const clipped=labelSample();clipped.content.right=320;
  assert.throws(()=>assertNamedOwnerLabel(clipped,named),/CLIPPED_INSIDE_BUTTON/);
  const offscreen=labelSample();offscreen.button.top=1000;offscreen.button.bottom=1044;
  assert.throws(()=>assertNamedOwnerLabel(offscreen,named),/OUTSIDE_CAPTURE_VIEWPORT/);
});
test('named label refuses obscured text, missing samples and truncated measurement',()=>{
  const occluded=labelSample();occluded.hits[0].owned=false;assert.throws(()=>assertNamedOwnerLabel(occluded,named),/OCCLUDED_OR_UNOBSERVED/);
  const missing=labelSample();missing.hits.pop();assert.throws(()=>assertNamedOwnerLabel(missing,named),/OCCLUDED_OR_UNOBSERVED/);
  const truncated=labelSample();truncated.truncated=true;assert.throws(()=>assertNamedOwnerLabel(truncated,named),/TRUNCATED/);
});
