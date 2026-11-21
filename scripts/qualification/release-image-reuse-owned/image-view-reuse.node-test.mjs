// AUTHORED_UNRUN. Pure fixed ledger/provenance fixtures; no FS/Git/provider/process access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { imageClosure } from './receipt-adapters.mjs';
const NAMES=["display-desktop1440-synthetic-catalog-details.png","display-desktop1440-synthetic-catalog-fedex-non-merchandise.png","display-desktop1440-synthetic-catalog-footer-contact.png","display-desktop1440-synthetic-catalog-hcg-hold.png","display-desktop1440-synthetic-catalog.png","display-phone320-200-synthetic-catalog.png","display-phone320-synthetic-catalog.png","display-phone375-200-synthetic-catalog-footer-contact.png","display-phone375-200-synthetic-catalog.png","display-phone375-synthetic-catalog-details.png","display-phone375-synthetic-catalog-optional-guide.png","display-phone375-synthetic-catalog.png","display-tablet768-synthetic-catalog.png"];
const ORIGINAL='INTERNAL_INDEPENDENT_ORIGINAL_PNG_VISUAL_REVIEW';
const REUSE='CURRENT_11F5_LEGACY13_INDEPENDENT_SCOPED_VISUAL_REVIEW';
const ID='LEGACY_EIGHT_SYNTHETIC_DISPLAY_ONLY';
const SCOPE='CURRENT_OWNED_LEGACY_EIGHT_SYNTHETIC_DISPLAY_ONLY';
const ACCEPTANCE='Current thirteen controlled legacy synthetic-display PNG files only, with the explicitly retained limitations below. No full-current-UI, MC10, all-catalog, accessibility-conformance or release qualification.';
const VIEW='PERSONALLY_VIEWED_CURRENT_NEW_ORIGINAL_ONCE',DUP='CURRENT_IDENTICAL_HASH_PERSONALLY_VIEWED_ONCE',PRIOR='EXACT_ACCEPTED_PRIOR_HASH_REUSE';
const hash=n=>n.toString(16).padStart(64,'0'),oid=n=>n.toString(16).padStart(40,'0');
const copy=x=>structuredClone(x);
const FACTS=NAMES.map((path,i)=>({path,bytes:200+(i===3?1:i),sha256:hash(200+(i===3?1:i))}));
function modern(subject,kind,reviewer,targetRef,targetBody){
 const rows=FACTS.map(row=>({...row,exactPriorAcceptedHashMatch:true,currentReviewEventPersonallyViewed:false,viewingPrincipal:null,accountingMode:PRIOR,
  reuseBasis:{priorReview:copy(targetRef),priorSource:targetBody.source,priorRun:targetBody.run,priorReviewerPrincipal:targetBody.reviewerPrincipal,imageSha256:row.sha256}}));
 return {kind,...subject,reviewerPrincipal:reviewer,acceptanceScope:ACCEPTANCE,verdict:'VISUAL_ACCEPT_OF_13',visualFindings:[],viewedImages:rows,
  actions:{originalImageViews:0},viewAccounting:{totalFilesAccounted:13,uniqueCurrentPngHashes:12,genuinelyNewUniqueOriginalsPersonallyViewedOnce:0,exactPriorHashReuseFiles:13,currentDuplicateHashReuseFiles:0,personalViewOrder:[],priorOriginalsReopened:0,duplicateCurrentImagesReopened:0,all13PersonallyOpenedThisReview:false},
  observationsAndLimits:['Synthetic legacy-only scope; not MC10 or live-actor acceptance.'],retainedHistoricalReviews:[]};
}
function fixture(){
 const records=new Map(),refs=new Map();let primaryId=1000;
 const ref=(n,label)=>({path:'/fixture/'+label+'.json',bytes:100+n,sha256:hash(n)});
 const remember=(r,body)=>{refs.set(r.sha256,r);records.set(r.sha256,body);};
 function proof(subjectRef,reviewer,author){
  const primary=ref(primaryId++,'primary-'+subjectRef.sha256);remember(primary,{reviewer,authors:[author],subject:subjectRef.sha256});
  return {primary,reviewerPath:['reviewer'],authorIdsPath:['authors'],subjectReceiptSha256Path:['subject'],designatedReviewerPrincipal:reviewer,designatedAuthorPrincipals:[author]};
 }
 function descriptor(r,body,profile){remember(r,body);return {receipt:r,actualKind:body.kind,profile,scopeId:ID,source:body.source,tree:body.tree,run:body.run,provenance:proof(r,body.reviewerPrincipal,'/fixture/author')};}
 const currentRef=ref(1,'current'),artifactRef=ref(2,'artifact'),scopeRef=ref(3,'scope'),priorRef=ref(4,'prior-11f5-shape'),olderRef=ref(5,'prior-3dbf-shape');
 const older={kind:ORIGINAL,source:oid(31),tree:oid(32),run:103,reviewerPrincipal:'/fixture/older',scope:SCOPE,verdict:'VISUAL_ACCEPT_OF_13',visualFindings:[],actions:{currentOriginalFilesPersonallyViewed:13},viewAccounting:{newCurrentViews:13},observationsAndLimits:['Known legacy count overlap remains; no whole accessibility claim.'],viewedImages:FACTS.map(x=>({...x,actuallyViewed:true,currentReviewEventPersonallyViewed:true,viewingPrincipal:'/fixture/older'}))};
 const olderSpec=descriptor(olderRef,older,'ORIGINAL_CURRENT_V1');
 const prior=modern({source:oid(21),tree:oid(22),run:102},REUSE,'/fixture/prior',olderRef,older);
 for(let i=0;i<13;i++)if(i!==2&&i!==3){Object.assign(prior.viewedImages[i],{accountingMode:VIEW,exactPriorAcceptedHashMatch:false,currentReviewEventPersonallyViewed:true,viewingPrincipal:prior.reviewerPrincipal,reuseBasis:null});}
 Object.assign(prior.viewedImages[3],{accountingMode:DUP,exactPriorAcceptedHashMatch:false,reuseBasis:{viewedCurrentFilename:NAMES[1],imageSha256:prior.viewedImages[3].sha256,viewingPrincipal:prior.reviewerPrincipal}});
 prior.actions.originalImageViews=11;Object.assign(prior.viewAccounting,{genuinelyNewUniqueOriginalsPersonallyViewedOnce:11,exactPriorHashReuseFiles:1,currentDuplicateHashReuseFiles:1,personalViewOrder:prior.viewedImages.filter(x=>x.accountingMode===VIEW).map(x=>x.path)});
 const priorSpec=descriptor(priorRef,prior,'EXACT_REUSE_V1');
 const browser=modern({source:oid(11),tree:oid(12),run:101},ORIGINAL,'/fixture/current',priorRef,prior);browser.rootEvidenceReceiptSha256=artifactRef.sha256;
 const currentSpec=descriptor(currentRef,browser,'EXACT_REUSE_V1');
 const scope={kind:'INDEPENDENT_REQUIRED_LEGACY_SCOPE',source:browser.source,tree:browser.tree,scopeId:ID,verdict:'SOURCE_ACCEPT',names:copy(NAMES)};remember(scopeRef,scope);
 const t={artifactAdapter:'ROOT_EVIDENCE_RECORDS_PNG_V1',browserReview:{...currentSpec,receiptSha256:currentRef.sha256,historicalReviews:[priorSpec,olderSpec]},requiredImageScope:{receipt:scopeRef,actualKind:scope.kind,verdictPath:['verdict'],sourcePath:['source'],treePath:['tree'],filenamesPath:['names'],scopeIdPath:['scopeId'],provenance:proof(scopeRef,'/fixture/scope-reviewer','/fixture/scope-author')}};
 const b={source:browser.source,tree:browser.tree,run:browser.run,browserReview:currentRef,browserArtifact:artifactRef,requiredBrowserImages:copy(NAMES)};
 const artifact={source:b.source,tree:b.tree,run:b.run,archivePersisted:true,imagesPersisted:true,artifact:501,archiveBytes:10000,archiveSha256:hash(500),records:FACTS.map(x=>({kind:'PNG',leaf:x.path,archiveName:x.path,bytes:x.bytes,sha256:x.sha256}))};remember(artifactRef,artifact);
 const reads=[];const pin=ref=>{assert(ref&&refs.has(ref.sha256),'untrusted fixture pin');assert.equal(ref.path,refs.get(ref.sha256).path);reads.push(ref.sha256);return records.get(ref.sha256);};
 const f={records,refs,ref,remember,descriptor,browser,prior,older,currentRef,priorRef,olderRef,artifactRef,priorSpec,olderSpec,t,b,artifact,scope,pin,reads};refresh(f);return f;
}
function refresh(f){f.browser.retainedHistoricalReviews=f.t.browserReview.historicalReviews.map(spec=>{const body=f.records.get(spec.receipt.sha256);return {receipt:copy(spec.receipt),scope:spec.profile==='ORIGINAL_CURRENT_V1'?body.scope:body.acceptanceScope,limitations:copy(body.observationsAndLimits)};});}
const run=f=>imageClosure(f.pin,f.t,f.b,f.browser,f.artifact);
function chained(extra){
 const f=fixture();let targetRef=f.olderRef,target=f.older;
 for(let i=0;i<extra;i++){const r=f.ref(50+i,'chain-'+i),body=modern({source:oid(100+i),tree:oid(200+i),run:200+i},ORIGINAL,'/fixture/chain-'+i,targetRef,target);const spec=f.descriptor(r,body,'EXACT_REUSE_V1');f.t.browserReview.historicalReviews.push(spec);targetRef=r;target=body;}
 f.prior=modern({source:f.prior.source,tree:f.prior.tree,run:f.prior.run},REUSE,f.prior.reviewerPrincipal,targetRef,target);f.remember(f.priorRef,f.prior);refresh(f);return f;
}

test('genuine ledger shapes resolve zero current actions through actual prior views and duplicate ancestry',()=>{
 const f=fixture(),result=run(f);assert.equal(result.requiredImageCount,13);assert.equal(result.originalPngViewActions,0);assert.equal(result.coveredFiles,13);assert.equal(result.authenticatedHistoricalReviews,2);
 assert.equal(f.prior.actions.originalImageViews,11);assert.equal(f.older.actions.currentOriginalFilesPersonallyViewed,13);assert.equal(result.retainedHistoricalReviews.length,2);
});
test('original current-view ledger preserves thirteen genuinely recorded actions',()=>{
 const f=fixture(),original=copy(f.older);Object.assign(original,{source:f.b.source,tree:f.b.tree,run:f.b.run,rootEvidenceReceiptSha256:f.artifactRef.sha256});f.browser=original;f.remember(f.currentRef,original);
 const spec=f.descriptor(f.currentRef,original,'ORIGINAL_CURRENT_V1');f.t.browserReview={...spec,receiptSha256:f.currentRef.sha256,historicalReviews:[]};assert.equal(run(f).originalPngViewActions,13);
});
test('source tree and run must match both current review and artifact',()=>{
 for(const target of ['browser','artifact'])for(const field of ['source','tree','run']){const f=fixture();f[target][field]=field==='run'?999:oid(999);assert.throws(()=>run(f));}
});
test('one inventory must match every required name hash and byte length',()=>{
 for(const corrupt of [f=>{f.artifact.records[0].sha256=hash(999);},f=>{f.artifact.records[0].bytes++;},f=>{f.artifact.records.pop();},f=>{f.browser.viewedImages.pop();},f=>{f.artifact.records.push(copy(f.artifact.records[0]));},f=>{f.browser.rootEvidenceReceiptSha256=hash(999);}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('independent scope refuses wrong identity scope and composite scene names',()=>{
 for(const corrupt of [f=>{f.scope.source=oid(999);},f=>{f.scope.tree=oid(999);},f=>{f.scope.scopeId='MC10';},f=>{f.scope.names.pop();},f=>{f.scope.names[0]=f.scope.names[1];},f=>{const name='mc10-foreign.png';f.scope.names[0]=name;f.b.requiredBrowserImages[0]=name;f.browser.viewedImages[0].path=name;Object.assign(f.artifact.records[0],{leaf:name,archiveName:name});}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('primary provenance refuses self review wrong subject and mismatched reviewer',()=>{
 for(const corrupt of [f=>{f.records.get(f.t.browserReview.provenance.primary.sha256).authors=[f.browser.reviewerPrincipal];},f=>{f.records.get(f.t.browserReview.provenance.primary.sha256).subject=hash(999);},f=>{f.browser.reviewerPrincipal='/fixture/foreign';},f=>{f.records.get(f.priorSpec.provenance.primary.sha256).reviewer='/fixture/foreign';}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('historical references cannot read an untrusted or substituted receipt',()=>{
 const absent=fixture();absent.t.browserReview.historicalReviews=absent.t.browserReview.historicalReviews.filter(x=>x!==absent.priorSpec);assert.throws(()=>run(absent));assert(!absent.reads.includes(absent.priorRef.sha256));
 for(const corrupt of [f=>{f.browser.viewedImages[0].reuseBasis.priorReview.sha256=hash(999);},f=>{f.browser.viewedImages[0].reuseBasis.priorReview.bytes++;},f=>{f.browser.viewedImages[0].reuseBasis.priorSource=oid(999);},f=>{f.browser.viewedImages[0].reuseBasis.priorReviewerPrincipal='/fixture/foreign';}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('unsupported kinds profiles and accounting modes refuse',()=>{
 for(const corrupt of [f=>{f.browser.kind='UNSUPPORTED';f.t.browserReview.actualKind='UNSUPPORTED';},f=>{f.t.browserReview.profile='UNKNOWN';},f=>{f.prior.kind='UNSUPPORTED';f.priorSpec.actualKind='UNSUPPORTED';},f=>{f.browser.viewedImages[0].accountingMode='HASH_ONLY';}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('duplicate anchor must exist be covered and carry an actual current viewing',()=>{
 const missing=fixture();missing.prior.viewedImages[3].reuseBasis.viewedCurrentFilename='missing.png';assert.throws(()=>run(missing));
 const f=fixture(),row=f.prior.viewedImages[3],unviewed=f.prior.viewedImages[2];row.reuseBasis.viewedCurrentFilename=unviewed.path;row.reuseBasis.imageSha256=unviewed.sha256;row.sha256=unviewed.sha256;row.bytes=unviewed.bytes;
 Object.assign(f.browser.viewedImages[3],{sha256:row.sha256,bytes:row.bytes});f.browser.viewedImages[3].reuseBasis.imageSha256=row.sha256;Object.assign(f.artifact.records[3],{sha256:row.sha256,bytes:row.bytes});assert.throws(()=>run(f));
});
test('cycles in authenticated historical references refuse',()=>{
 const f=fixture(),r=f.ref(90,'cycle'),body=modern({source:oid(90),tree:oid(91),run:900},ORIGINAL,'/fixture/cycle',f.priorRef,f.prior),spec=f.descriptor(r,body,'EXACT_REUSE_V1');f.t.browserReview.historicalReviews.push(spec);
 f.prior=modern({source:f.prior.source,tree:f.prior.tree,run:f.prior.run},REUSE,f.prior.reviewerPrincipal,r,body);f.remember(f.priorRef,f.prior);refresh(f);assert.throws(()=>run(f));
});
test('depth bound accepts the adjacent bounded chain and rejects a longer chain',()=>{
 assert.equal(run(chained(2)).coveredFiles,13);assert.throws(()=>run(chained(3)));
});
test('history registry cannot grow beyond its fixed receipt bound',()=>{
 const f=fixture();for(let i=0;i<7;i++){const r=f.ref(100+i,'unused-'+i);f.t.browserReview.historicalReviews.push({...f.olderSpec,receipt:r});}assert.equal(f.t.browserReview.historicalReviews.length,9);assert.throws(()=>run(f));
});
test('action counts and false current view claims cannot be manufactured',()=>{
 for(const corrupt of [f=>{f.browser.actions.originalImageViews=13;},f=>{f.prior.actions.originalImageViews=13;},f=>{f.browser.viewedImages[0].currentReviewEventPersonallyViewed=true;},f=>{f.browser.viewAccounting.exactPriorHashReuseFiles=12;},f=>{f.browser.viewAccounting.personalViewOrder=[NAMES[0]];},f=>{f.older.actions.currentOriginalFilesPersonallyViewed=12;}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('historical limitations cannot be dropped widened or silently detached',()=>{
 for(const corrupt of [f=>{f.browser.retainedHistoricalReviews.pop();},f=>{f.browser.retainedHistoricalReviews[0].limitations=[];},f=>{f.browser.retainedHistoricalReviews[0].scope='FULL_RELEASE';},f=>{f.older.scope='FULL_RELEASE';},f=>{f.prior.observationsAndLimits=[];}]){const f=fixture();corrupt(f);assert.throws(()=>run(f));}
});
test('valid closure leaves ledgers and trusted authority objects unchanged',()=>{
 const f=fixture(),before=copy({b:f.b,t:f.t,browser:f.browser,artifact:f.artifact,records:[...f.records]});run(f);assert.deepEqual({b:f.b,t:f.t,browser:f.browser,artifact:f.artifact,records:[...f.records]},before);
});
