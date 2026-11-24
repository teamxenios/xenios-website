import { createHash } from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const ZERO='00000000-0000-0000-0000-000000000000';
const IDS=['offeringId','offeringVariantId','productId','variantId'];
const REPRESENTATIONS=['proposed_carton','proposed_vial','catalog_reference'];
export class PublicationError extends Error {
  constructor(code){super(code);this.name='PublicationError';this.code=code;}
}
const need=(test,code)=>{if(!test)throw new PublicationError(code);};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function keys(v,allowed,required=allowed){need(record(v)&&Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'invalid_shape');}
function text(v,max){return typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(v);}
const uuid=v=>typeof v==='string'&&UUID.test(v)&&v!==ZERO;
export function exactIdentity(v){
  keys(v,IDS);need(typeof v.offeringId==='string'&&/^mo_[0-9a-f]+$/.test(v.offeringId)&&v.offeringId.length<=100,'invalid_identity');
  need(typeof v.offeringVariantId==='string'&&/^mov_[0-9a-f]+$/.test(v.offeringVariantId)&&v.offeringVariantId.length<=100&&uuid(v.productId)&&uuid(v.variantId),'invalid_identity');
  return Object.fromEntries(IDS.map(k=>[k,v[k]]));
}
function equalIdentity(a,b){return IDS.every(k=>a?.[k]===b?.[k]);}
function same(a,b){return canonicalJson(a)===canonicalJson(b);}
export function canonicalJson(v){
  if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
  if(typeof v==='number'){need(Number.isFinite(v),'invalid_json');return JSON.stringify(v);}
  if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']';
  need(record(v),'invalid_json');return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';
}
export const fingerprint=v=>createHash('sha256').update(canonicalJson(v)).digest('hex');
const priceFree=v=>!/[$€£¥]|\b(?:USD|EUR|GBP)\s*\d|\bprice\s*:/i.test(v);
function publicContent(v){
  keys(v,['summary','overview','storage'],['summary','overview']);
  for(const x of Object.values(v)){
    need(typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=20000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(x),'invalid_content');
    // A review remains necessary. These also refuse obvious accidental price
    // fields embedded in the deliberately small public plain-text projection.
    need(priceFree(x),'public_price_refused');
  }
  return structuredClone(v);
}
function snapshot(v,id){
  need(record(v)&&equalIdentity(v.identity,id)&&SHA.test(v.sourceSha256)&&SHA.test(v.contentSha256),'source_unavailable');
  need(Number.isSafeInteger(v.productVersion)&&v.productVersion>0&&Number.isSafeInteger(v.variantVersion)&&v.variantVersion>0,'source_unavailable');
  publicContent(v.content);const m=v.media;
  need(record(m)&&uuid(m.id)&&Number.isSafeInteger(m.version)&&m.version>0&&text(m.altText,1000)&&SHA.test(m.storageIdentitySha256),'media_unavailable');
  need(priceFree(m.altText),'public_price_refused');
  need(['image/png','image/jpeg','image/webp'].includes(m.contentType)&&Number.isSafeInteger(m.sizeBytes)&&m.sizeBytes>0&&m.sizeBytes<=10485760,'media_unavailable');
  return v;
}
function approvedEvidence(e,s,id,now){
  keys(e,['identity','sourceSha256','contentSha256','mediaId','mediaVersion','contentApprovalSha256','rightsApprovalSha256','mediaSha256','usage','state','expiresAt','width','height','representation','packagingDesign']);
  need(equalIdentity(e.identity,id)&&e.sourceSha256===s.sourceSha256&&e.contentSha256===s.contentSha256&&e.mediaId===s.media.id&&e.mediaVersion===s.media.version,'approval_binding_mismatch');
  need(e.state==='approved'&&e.usage==='public_catalog_display'&&SHA.test(e.contentApprovalSha256)&&SHA.test(e.rightsApprovalSha256)&&SHA.test(e.mediaSha256),'approval_required');
  need(e.expiresAt===null||typeof e.expiresAt==='string'&&Number.isFinite(Date.parse(e.expiresAt))&&Date.parse(e.expiresAt)>now,'approval_expired');
  need(Number.isSafeInteger(e.width)&&e.width>0&&e.width<=20000&&Number.isSafeInteger(e.height)&&e.height>0&&e.height<=20000,'invalid_dimensions');
  need(REPRESENTATIONS.includes(e.representation)&&typeof e.packagingDesign==='boolean','representation_required');
  return structuredClone(e);
}
function storedRevision(v,id){
  need(record(v)&&uuid(v.id)&&equalIdentity(v.identity,id)&&record(v.snapshot)&&record(v.evidence),'revision_unavailable');
  snapshot(v.snapshot,id);need(v.evidence.mediaId===v.snapshot.media.id,'revision_unavailable');return v;
}
function generation(v){need(Number.isSafeInteger(v)&&v>=0,'invalid_generation');return v;}
function command(input,operation){
  const common=['identity','key','expectedGeneration'];
  const rest=operation==='seal'?['mediaId','sourceSha256']:operation==='withdraw'?['reason']:operation==='rollback'?['revisionId','reason']:['revisionId'];
  keys(input,[...common,...rest]);const identity=exactIdentity(input.identity);
  need(text(input.key,200),'invalid_idempotency_key');generation(input.expectedGeneration);
  if(operation==='seal')need(uuid(input.mediaId)&&SHA.test(input.sourceSha256),'invalid_selection');
  if(operation==='publish'||operation==='rollback')need(uuid(input.revisionId),'invalid_revision');
  if(operation==='withdraw'||operation==='rollback')need(text(input.reason,1000),'reason_required');
  const {key,...intent}=structuredClone(input);return {key,intent:{operation,...intent,identity}};
}

/** A provider response is not confirmation until its complete receipt matches
 * the exact operation/identity/generation/revision requested. A replay remains
 * historical and never advances the caller's original intent or retry key. */
export function validateCommandReceipt(value,intent){
  const fail=()=>{throw new PublicationError('store_outcome_unconfirmed');};
  const fields=['operation','revisionId','generation','identity','replayed'];
  if(!record(value)||Object.keys(value).length!==fields.length||!fields.every(k=>Object.hasOwn(value,k)))fail();
  if(!record(intent)||!['seal','publish','withdraw','rollback'].includes(intent.operation)||!Number.isSafeInteger(intent.expectedGeneration)||intent.expectedGeneration<0)fail();
  try{exactIdentity(intent.identity);}catch{fail();}
  const expected=intent.expectedGeneration+(intent.operation==='seal'?0:1);
  if(!Number.isSafeInteger(expected)||value.operation!==intent.operation||!Number.isSafeInteger(value.generation)||value.generation!==expected||typeof value.replayed!=='boolean')fail();
  if(!record(value.identity)||Object.keys(value.identity).length!==IDS.length||!IDS.every(k=>Object.hasOwn(value.identity,k))||!equalIdentity(value.identity,intent.identity))fail();
  if(intent.operation==='withdraw'?value.revisionId!==null:!uuid(value.revisionId))fail();
  if(['publish','rollback'].includes(intent.operation)&&value.revisionId!==intent.revisionId)fail();
  return structuredClone(value);
}

/** Server construction only. No browser-supplied actor, approval or URL exists.
 * authorize must reuse the existing verified ProductControl admin boundary;
 * isEligible/assertBinding/resolveApproval are genuine current server ports.
 * Missing ports fail at construction. False/absent authority never defaults on.
 */
export function createPublicationService(ports){
  need(record(ports)&&ports.store!==null&&typeof ports.store==='object'&&!Array.isArray(ports.store),'configuration_required');
  for(const k of ['authorize','assertBinding','isEligible','resolveApproval'])need(typeof ports[k]==='function','configuration_required');
  for(const k of ['sourceSnapshot','replay','seal','transition','current','revision'])need(typeof ports.store[k]==='function','configuration_required');
  const now=ports.now??Date.now;need(typeof now==='function','configuration_required');
  async function actor(context,op,id){const a=await ports.authorize(context,op,id);need(text(a,320),'authorization_required');return a;}
  async function eligible(id){need(await ports.assertBinding(id)===true,'binding_unavailable');need(await ports.isEligible(id)===true,'publication_held');}
  async function evidence(s,id){return approvedEvidence(await ports.resolveApproval({identity:structuredClone(id),snapshot:structuredClone(s)}),s,id,now());}
  async function change(context,input,op){
    const {key,intent}=command(input,op),id=intent.identity,a=await actor(context,op,id);
    // A receipt is an historical accepted command, not a current-publication
    // claim. Retrieve it before re-reading edited drafts or revoked approvals.
    const replay=await ports.store.replay(a,key,intent);if(replay!==null)return {...validateCommandReceipt(replay,intent),replayed:true};
    if(op==='withdraw')return validateCommandReceipt(await ports.store.transition(a,key,intent),intent);
    await eligible(id);
    if(op==='seal'){
      const s=snapshot(await ports.store.sourceSnapshot(id,intent.mediaId),id);
      need(s.sourceSha256===intent.sourceSha256,'source_version_conflict');
      return validateCommandReceipt(await ports.store.seal(a,key,intent,await evidence(s,id)),intent);
    }
    const r=storedRevision(await ports.store.revision(id,intent.revisionId),id);
    const e=await evidence(r.snapshot,id);need(same(e,r.evidence),'approval_changed');
    return validateCommandReceipt(await ports.store.transition(a,key,intent),intent);
  }
  async function qualified(id){
    await eligible(id);const c=await ports.store.current(id);need(record(c),'publication_unavailable');generation(c.generation);
    if(c.revision===null)return null;const r=storedRevision(c.revision,id);
    const e=await evidence(r.snapshot,id);need(same(e,r.evidence),'approval_changed');return {generation:c.generation,revision:r};
  }
  return Object.freeze({
    async previewCandidate(context,selection){keys(selection,['identity','mediaId']);const id=exactIdentity(selection.identity);need(uuid(selection.mediaId),'invalid_selection');await actor(context,'preview',id);await eligible(id);const s=snapshot(await ports.store.sourceSnapshot(id,selection.mediaId),id);const e=await evidence(s,id);return {identity:id,sourceSha256:s.sourceSha256,content:publicContent(s.content),media:{mediaId:s.media.id,altText:s.media.altText,width:e.width,height:e.height,representation:e.representation,packagingDesign:e.packagingDesign},approvalAvailable:true};},
    createApprovedRevision:(ctx,input)=>change(ctx,input,'seal'),
    publish:(ctx,input)=>change(ctx,input,'publish'),
    withdraw:(ctx,input)=>change(ctx,input,'withdraw'),
    rollback:(ctx,input)=>change(ctx,input,'rollback'),
    async readPublishedRevision(selection){
      try{const id=exactIdentity(selection),c=await qualified(id);if(!c)return null;const r=c.revision,s=r.snapshot,e=r.evidence;
        return {revisionId:r.id,generation:c.generation,identity:id,content:publicContent(s.content),media:{primary:{href:`/api/research/catalog-media/${r.id}/${s.media.id}`,altText:s.media.altText,width:e.width,height:e.height},representation:e.representation,packagingDesign:e.packagingDesign},provenance:{contentSha256:s.contentSha256,mediaSha256:e.mediaSha256,rightsApprovalSha256:e.rightsApprovalSha256}};
      }catch{return null;}
    },
    async readPublishedAsset(selection){
      try{keys(selection,[...IDS,'revisionId','assetId']);const id=exactIdentity(Object.fromEntries(IDS.map(k=>[k,selection[k]])));need(uuid(selection.revisionId)&&uuid(selection.assetId),'invalid_asset');const c=await qualified(id);if(!c)return null;const r=c.revision,s=r.snapshot,e=r.evidence;
        need(r.id===selection.revisionId&&s.media.id===selection.assetId,'asset_not_current');
        const descriptor={identity:id,revisionId:r.id,generation:c.generation,assetId:s.media.id,mediaId:s.media.id,mediaVersion:s.media.version,storageIdentitySha256:s.media.storageIdentitySha256,contentType:s.media.contentType,sizeBytes:s.media.sizeBytes,sha256:e.mediaSha256,width:e.width,height:e.height,rightsApprovalSha256:e.rightsApprovalSha256};
        need(typeof ports.readMediaBytes==='function','media_reader_unavailable');
        // This server-only port resolves the canonical private key by mediaId,
        // verifies its version/storage identity, and returns bytes, never a URL.
        const bytes=await ports.readMediaBytes(structuredClone(descriptor));
        need(bytes instanceof Uint8Array&&bytes.byteLength===descriptor.sizeBytes&&bytes.byteLength<=10485760,'media_bytes_mismatch');
        need(createHash('sha256').update(bytes).digest('hex')===descriptor.sha256,'media_bytes_mismatch');
        // A withdrawal, rollback, rights revocation or media change while the
        // private download was pending must withhold those bytes entirely.
        const after=await qualified(id);need(after&&after.generation===c.generation&&same(after.revision,r),'asset_changed_during_read');
        const {storageIdentitySha256,...safe}=descriptor;
        return {...safe,bytes};
      }catch{return null;}
    },
  });
}
