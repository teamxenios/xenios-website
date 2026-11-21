// V2 proposal: actual receipt bodies, primary provenance and inventory joins.
// The trusted manifest is an explicit Root-authenticated out-of-band input.
// Hashing cannot itself prove authentic authorship, independence or image viewing.
import assert from 'node:assert/strict';
const own=(o,k)=>o!==null&&typeof o==='object'&&Object.hasOwn(o,k);
export function at(o,path){assert(Array.isArray(path)&&path.length>0&&path.length<=8);for(const key of path){assert((typeof key==='string'||Number.isSafeInteger(key))&&!['__proto__','prototype','constructor'].includes(String(key)));assert(own(o,key));o=o[key];}return o;}
function principal(s){assert(typeof s==='string'&&s.length>0&&s.length<=256&&!/[\r\n\x00-\x1f]/.test(s));return s;}
function provenance(pin,spec,receiptSha){
 assert(spec&&spec.primary&&spec.reviewerPath&&spec.authorIdsPath&&spec.subjectReceiptSha256Path);const p=pin(spec.primary);
 const reviewer=principal(at(p,spec.reviewerPath)),authors=at(p,spec.authorIdsPath);assert(Array.isArray(authors)&&authors.length>0&&authors.length<=32);assert(authors.every(x=>principal(x)));assert(!authors.includes(reviewer));
 assert(Array.isArray(spec.designatedAuthorPrincipals)&&spec.designatedAuthorPrincipals.length>0);assert.equal(reviewer,spec.designatedReviewerPrincipal);assert.deepEqual([...authors].sort(),[...spec.designatedAuthorPrincipals].sort());assert.equal(at(p,spec.subjectReceiptSha256Path),receiptSha);
 // These identities must come from the genuine retained primary record. A
 // receipt's reviewer/kind strings or independent:true never satisfy this check.
 return reviewer;
}
export function trustedManifest(pin,root,p,hash,b){
 assert(/^[a-f0-9]{64}$/.test(hash));assert.equal(p.trustedEvidenceManifestSha256,hash);const t=pin({path:root+'/TRUSTED-EVIDENCE-MANIFEST.json',sha256:hash});
 for(const[k,v]of Object.entries({source:b.source,tree:b.tree,run:b.run,rootBase:b.rootBase}))assert.equal(t[k],v);
 assert(t.acceptanceAdapters&&typeof t.acceptanceAdapters==='object'&&!Array.isArray(t.acceptanceAdapters));assert(t.toolReview&&t.browserReview&&t.requiredImageScope);assert.equal(t.actionPacketSha256,p.actionPacketSha256);return t;
}
export function acceptingEndpoint(pin,t,descriptor,body,x){
 assert(own(t.acceptanceAdapters,descriptor.sha256));const spec=t.acceptanceAdapters[descriptor.sha256];assert.equal(spec.adapter,'ACTUAL_POSITIVE_RECEIPT_ENDPOINT_ROWS_V1');assert(body&&typeof body==='object');
 assert.equal(body.kind,spec.actualKind);assert.equal(at(body,spec.verdictPath),'SOURCE_ACCEPT');const findings=at(body,spec.findingsPath);assert(Array.isArray(findings)&&findings.length===0);
 const source=at(body,spec.sourcePath),tree=at(body,spec.treePath);assert.equal(source,x.reviewedSource);assert.equal(tree,x.reviewedTree);assert.equal(source,descriptor.reviewedSource);assert.equal(tree,descriptor.reviewedTree);
 const rows=at(body,spec.endpointRowsPath);assert(Array.isArray(rows)&&rows.length>0&&rows.length<=128);const names=rows.map(r=>at(r,spec.keys.path));assert.equal(new Set(names).size,names.length);const matches=rows.filter(r=>at(r,spec.keys.path)===x.path);assert.equal(matches.length,1);const r=matches[0];for(const[key,want]of Object.entries({mode:x.finalMode,blob:x.finalBlob,bytes:x.finalGitBytes,sha256:x.finalGitSha256}))assert.equal(at(r,spec.keys[key]),want);
 provenance(pin,spec.provenance,descriptor.sha256);return body;
}
export function toolReviewProvenance(pin,t,ref,body){
 const s=t.toolReview;assert.equal(ref.sha256,s.receiptSha256);assert.equal(body.kind,s.actualKind);assert.equal(at(body,s.verdictPath),'SOURCE_ACCEPT');const f=at(body,s.findingsPath);assert(Array.isArray(f)&&f.length===0);provenance(pin,s.provenance,ref.sha256);
}

// These are the genuine legacy13 ledger profiles, not an inferred view count.
const ORIGINAL_VISUAL_KIND='INTERNAL_INDEPENDENT_ORIGINAL_PNG_VISUAL_REVIEW';
const REUSE_VISUAL_KIND='CURRENT_11F5_LEGACY13_INDEPENDENT_SCOPED_VISUAL_REVIEW';
const LEGACY_SCOPE_ID='LEGACY_EIGHT_SYNTHETIC_DISPLAY_ONLY';
const LEGACY_SCOPE='CURRENT_OWNED_LEGACY_EIGHT_SYNTHETIC_DISPLAY_ONLY';
const REUSE_SCOPE='Current thirteen controlled legacy synthetic-display PNG files only, with the explicitly retained limitations below. No full-current-UI, MC10, all-catalog, accessibility-conformance or release qualification.';
const LEGACY_IMAGE_NAMES=Object.freeze(["display-desktop1440-synthetic-catalog-details.png","display-desktop1440-synthetic-catalog-fedex-non-merchandise.png","display-desktop1440-synthetic-catalog-footer-contact.png","display-desktop1440-synthetic-catalog-hcg-hold.png","display-desktop1440-synthetic-catalog.png","display-phone320-200-synthetic-catalog.png","display-phone320-synthetic-catalog.png","display-phone375-200-synthetic-catalog-footer-contact.png","display-phone375-200-synthetic-catalog.png","display-phone375-synthetic-catalog-details.png","display-phone375-synthetic-catalog-optional-guide.png","display-phone375-synthetic-catalog.png","display-tablet768-synthetic-catalog.png"]);
const VIEW_MODE='PERSONALLY_VIEWED_CURRENT_NEW_ORIGINAL_ONCE';
const DUP_MODE='CURRENT_IDENTICAL_HASH_PERSONALLY_VIEWED_ONCE';
const PRIOR_MODE='EXACT_ACCEPTED_PRIOR_HASH_REUSE';
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const leaf=s=>{assert(typeof s==='string');const n=s.replaceAll('\\','/').split('/').at(-1);assert(/^[A-Za-z0-9_.-]+\.png$/.test(n));return n;};
function sameImage(a,b){assert.equal(a.bytes,b.bytes);assert.equal(a.sha256,b.sha256);}
function sameReceipt(a,b){assert(a&&b&&digest(a.sha256)&&Number.isSafeInteger(a.bytes)&&a.bytes>0);assert.equal(a.sha256,b.sha256);assert.equal(a.bytes,b.bytes);assert.equal(a.path.replaceAll('\\','/'),b.path.replaceAll('\\','/'));}
function ledgerInfo(pin,ref,body,spec,subject){
 assert(spec&&spec.scopeId===LEGACY_SCOPE_ID&&digest(ref.sha256));
 assert.equal(body.kind,spec.actualKind);assert.equal(body.reviewerPrincipal,provenance(pin,spec.provenance,ref.sha256));
 for(const k of ['source','tree'])assert(typeof subject[k]==='string'&&/^[a-f0-9]{40}$/.test(subject[k])&&body[k]===subject[k]);
 assert(Number.isSafeInteger(subject.run)&&subject.run>0&&body.run===subject.run);
 assert(Array.isArray(body.viewedImages)&&body.viewedImages.length===13);assert.equal(body.verdict,'VISUAL_ACCEPT_OF_13');assert.deepEqual(body.visualFindings,[]);
 const limits=body.observationsAndLimits;assert(Array.isArray(limits)&&limits.length>0&&limits.length<=32&&limits.every(s=>typeof s==='string'&&s.length>0&&s.length<=4096));
 const rows=new Map();for(const row of body.viewedImages){const name=leaf(row.path);assert(!rows.has(name));assert(digest(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>0);rows.set(name,row);}
 assert.deepEqual([...rows.keys()].sort(),[...LEGACY_IMAGE_NAMES]);
 let views=0,scope;
 if(spec.profile==='ORIGINAL_CURRENT_V1'){
  assert.equal(body.kind,ORIGINAL_VISUAL_KIND);assert.equal(body.scope,LEGACY_SCOPE);scope=body.scope;
  for(const row of rows.values())assert(row.actuallyViewed===true&&row.currentReviewEventPersonallyViewed===true&&row.viewingPrincipal===body.reviewerPrincipal);
  assert(body.actions&&body.viewAccounting&&body.viewAccounting.newCurrentViews===13);
  const counts=['currentOriginalFilesPersonallyViewed','originalPngViews'].filter(k=>own(body.actions,k));assert(counts.length>0);for(const k of counts)assert.equal(body.actions[k],13);views=13;
 }else{
  assert.equal(spec.profile,'EXACT_REUSE_V1');assert([ORIGINAL_VISUAL_KIND,REUSE_VISUAL_KIND].includes(body.kind));assert.equal(body.acceptanceScope,REUSE_SCOPE);scope=body.acceptanceScope;
  const personal=[],hashes=new Set();let historical=0,duplicates=0;
  for(const [name,row]of rows){
   if(row.accountingMode===VIEW_MODE){assert(row.currentReviewEventPersonallyViewed===true&&row.viewingPrincipal===body.reviewerPrincipal);assert(!hashes.has(row.sha256));hashes.add(row.sha256);personal.push(name);}
   else{assert(row.currentReviewEventPersonallyViewed===false&&row.viewingPrincipal===null);if(row.accountingMode===PRIOR_MODE){assert.equal(row.exactPriorAcceptedHashMatch,true);historical++;}else{assert.equal(row.accountingMode,DUP_MODE);duplicates++;}}
  }
  views=personal.length;assert(body.actions&&body.actions.originalImageViews===views);const a=body.viewAccounting;assert(a&&a.totalFilesAccounted===13&&a.uniqueCurrentPngHashes===new Set([...rows.values()].map(x=>x.sha256)).size);
  assert.equal(a.genuinelyNewUniqueOriginalsPersonallyViewedOnce,views);assert.equal(a.exactPriorHashReuseFiles,historical);assert.equal(a.currentDuplicateHashReuseFiles,duplicates);
  assert(Array.isArray(a.personalViewOrder)&&a.personalViewOrder.length===views);assert.deepEqual([...a.personalViewOrder].sort(),personal.sort());
  assert(a.priorOriginalsReopened===0&&a.duplicateCurrentImagesReopened===0&&a.all13PersonallyOpenedThisReview===(views===13));
 }
 return {ref,body,spec,rows,views,scope,limits};
}
function genuineViewClosure(pin,t,b,browser){
 const currentSpec=t.browserReview;assert.equal(browser.kind,ORIGINAL_VISUAL_KIND);
 const current=ledgerInfo(pin,b.browserReview,browser,currentSpec,{source:b.source,tree:b.tree,run:b.run});
 const history=currentSpec.historicalReviews??[];assert(Array.isArray(history)&&history.length<=8);const trusted=new Map();
 for(const spec of history){assert(spec.receipt&&digest(spec.receipt.sha256)&&spec.receipt.sha256!==current.ref.sha256&&!trusted.has(spec.receipt.sha256));assert(Number.isSafeInteger(spec.receipt.bytes)&&spec.receipt.bytes>0);trusted.set(spec.receipt.sha256,spec);}
 const infos=new Map([[current.ref.sha256,current]]),resolved=new Map(),active=new Set();let steps=0;
 function historical(ref){
  const spec=trusted.get(ref.sha256);assert(spec,'Historical review is not Root-authenticated');sameReceipt(ref,spec.receipt);
  if(!infos.has(ref.sha256))infos.set(ref.sha256,ledgerInfo(pin,spec.receipt,pin(spec.receipt),spec,{source:spec.source,tree:spec.tree,run:spec.run}));return infos.get(ref.sha256);
 }
 function resolve(info,name,depth){
  assert(depth<=4,'Image history depth bound');assert(++steps<=512,'Image history work bound');const key=info.ref.sha256+':'+name;
  assert(!active.has(key),'Cyclic image history');if(resolved.has(key)){const cached=resolved.get(key);assert(depth+cached.chainDepth<=4,'Image history depth bound');return cached;}active.add(key);
  const row=info.rows.get(name);assert(row,'Missing covered image');let anchor;
  if(info.spec.profile==='ORIGINAL_CURRENT_V1'||row.accountingMode===VIEW_MODE){anchor={receiptSha256:info.ref.sha256,path:name,reviewerPrincipal:info.body.reviewerPrincipal,chainDepth:0};}
  else if(row.accountingMode===DUP_MODE){
   const basis=row.reuseBasis;assert(basis&&basis.viewingPrincipal===info.body.reviewerPrincipal&&basis.imageSha256===row.sha256);const targetName=leaf(basis.viewedCurrentFilename),target=info.rows.get(targetName);assert(targetName!==name&&target);sameImage(row,target);
   assert(info.spec.profile==='ORIGINAL_CURRENT_V1'||target.accountingMode===VIEW_MODE,'Duplicate anchor was not actually viewed');const child=resolve(info,targetName,depth+1);anchor={...child,chainDepth:child.chainDepth+1};
  }else{
   assert.equal(row.accountingMode,PRIOR_MODE);const basis=row.reuseBasis;assert(basis&&basis.priorReview&&basis.imageSha256===row.sha256);const target=historical(basis.priorReview);
   assert.equal(basis.priorSource,target.body.source);assert.equal(basis.priorRun,target.body.run);assert.equal(basis.priorReviewerPrincipal,target.body.reviewerPrincipal);const targetRow=target.rows.get(name);assert(targetRow);sameImage(row,targetRow);const child=resolve(target,name,depth+1);anchor={...child,chainDepth:child.chainDepth+1};
  }
  assert(depth+anchor.chainDepth<=4,'Image history depth bound');active.delete(key);resolved.set(key,anchor);return anchor;
 }
 for(const name of current.rows.keys())resolve(current,name,0);
 // Every reused row in every consumed ledger resolves, including its own reuse.
 for(const info of infos.values())for(const name of info.rows.keys())resolve(info,name,info===current?0:1);
 const retained=[...infos.values()].filter(x=>x!==current).map(x=>({receipt:x.ref,scope:x.scope,limitations:x.limits})).sort((a,b)=>a.receipt.sha256.localeCompare(b.receipt.sha256));
 if(current.spec.profile==='EXACT_REUSE_V1'){
  assert(Array.isArray(browser.retainedHistoricalReviews));const actual=[...browser.retainedHistoricalReviews];assert(actual.length===retained.length);actual.sort((a,b)=>a.receipt.sha256.localeCompare(b.receipt.sha256));assert.deepEqual(actual,retained,'Historical scope/limitations must remain attached');
 }
 return {originalPngViewActions:current.views,coveredFiles:current.rows.size,authenticatedHistoricalReviews:retained.length,retainedHistoricalReviews:retained};
}

export function imageClosure(pin,t,b,browser,artifact){
 const s=t.browserReview;assert.equal(s.receiptSha256,b.browserReview.sha256);assert.equal(browser.kind,s.actualKind);
 for(const x of[browser,artifact])for(const k of['source','tree','run'])assert.equal(x[k],b[k]);assert.equal(browser.rootEvidenceReceiptSha256,b.browserArtifact.sha256);
 // Recognized genuine Root extraction receipt: PNG records coexist with JSON
 // records. Only actual PNG rows form the image inventory; no invented field.
 assert.equal(t.artifactAdapter,'ROOT_EVIDENCE_RECORDS_PNG_V1');assert.equal(artifact.archivePersisted,true);assert.equal(artifact.imagesPersisted,true);assert(Number.isSafeInteger(artifact.artifact)&&artifact.artifact>0);assert(Number.isSafeInteger(artifact.archiveBytes)&&artifact.archiveBytes>0);assert(/^[a-f0-9]{64}$/.test(artifact.archiveSha256));assert(Array.isArray(artifact.records)&&artifact.records.length<=256);
 for(const row of artifact.records)if(typeof row.leaf==='string'&&/\.png$/i.test(row.leaf))assert.equal(row.kind,'PNG');const inventory=artifact.records.filter(r=>r.kind==='PNG');assert(inventory.length>0&&inventory.length<=64);const inv=new Map();for(const r of inventory){assert(/^[A-Za-z0-9_.-]+\.png$/.test(r.leaf));assert.equal(r.archiveName.replaceAll('\\','/').split('/').at(-1),r.leaf);assert(!inv.has(r.leaf));assert(Number.isSafeInteger(r.bytes)&&r.bytes>0&&/^[a-f0-9]{64}$/.test(r.sha256));inv.set(r.leaf,r);}
 // Required scope is separately fixed by authentic independent source/scope
 // evidence, never selected by the submitted binding or review's chosen N.
 const requiredSpec=t.requiredImageScope,scope=pin(requiredSpec.receipt);assert.equal(scope.kind,requiredSpec.actualKind);assert.equal(at(scope,requiredSpec.verdictPath),'SOURCE_ACCEPT');assert.equal(at(scope,requiredSpec.sourcePath),b.source);assert.equal(at(scope,requiredSpec.treePath),b.tree);provenance(pin,requiredSpec.provenance,requiredSpec.receipt.sha256);assert.equal(at(scope,requiredSpec.scopeIdPath),LEGACY_SCOPE_ID);
 const required=at(scope,requiredSpec.filenamesPath);assert(Array.isArray(required)&&required.length>0&&required.length<=64);assert(required.every(n=>/^[A-Za-z0-9_.-]+\.png$/.test(n)));assert.equal(new Set(required).size,required.length);
 const sorted=[...required].sort();assert.deepEqual([...b.requiredBrowserImages].sort(),sorted);assert.deepEqual([...inv.keys()].sort(),sorted);assert.deepEqual(browser.viewedImages.map(r=>r.path.replaceAll('\\','/').split('/').at(-1)).sort(),sorted);
 for(const r of browser.viewedImages){const name=r.path.replaceAll('\\','/').split('/').at(-1),actual=inv.get(name);assert(actual);assert.equal(r.bytes,actual.bytes);assert.equal(r.sha256,actual.sha256);}
 // Matching digests conserve recorded bytes. Actual viewing remains the
 // authentic independently designated review's claim, never a hash inference.
 return {requiredImageCount:required.length,inventoryJoinVerified:true,...genuineViewClosure(pin,t,b,browser)};
}
