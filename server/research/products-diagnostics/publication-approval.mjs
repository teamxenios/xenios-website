import {createHash} from 'node:crypto';
import {PublicationError,exactIdentity,canonicalJson} from './publication.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const timestamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const sameId=(a,b)=>['offeringId','offeringVariantId','productId','variantId'].every(k=>a?.[k]===b?.[k]);
const need=(ok,code)=>{if(!ok)throw new PublicationError(code);};
const text=(s,max)=>typeof s==='string'&&s===s.trim()&&s.length>0&&s.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(s);
const keys=(v,names)=>object(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const priceFree=s=>!/[$\u20ac\u00a3\u00a5]|\b(?:USD|EUR|GBP)\s*\d|\bprice\s*:/i.test(s);
function source(value,identity,mediaId){
  need(object(value)&&sameId(value.identity,identity)&&sha(value.sourceSha256)&&sha(value.contentSha256),'source_unavailable');
  need(Number.isSafeInteger(value.productVersion)&&value.productVersion>0&&Number.isSafeInteger(value.variantVersion)&&value.variantVersion>0,'source_unavailable');
  const c=value.content,m=value.media;need(object(c)&&Object.keys(c).every(k=>['summary','overview','storage'].includes(k))&&Object.hasOwn(c,'summary')&&Object.hasOwn(c,'overview'),'invalid_content');
  for(const v of Object.values(c)){need(typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=20000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(v),'invalid_content');need(priceFree(v),'public_price_refused');}
  need(object(m)&&m.id===mediaId&&uuid(m.id)&&Number.isSafeInteger(m.version)&&m.version>0&&sha(m.storageIdentitySha256)&&text(m.altText,1000)&&['image/png','image/jpeg','image/webp'].includes(m.contentType)&&Number.isSafeInteger(m.sizeBytes)&&m.sizeBytes>0&&m.sizeBytes<=10485760,'media_unavailable');need(priceFree(m.altText),'public_price_refused');return value;
}
export function validateApprovalState(value,identity,actor){
  need(keys(value,['identity','approvalVersion','ownerCapability','approvals','historyTruncated'])&&sameId(value.identity,identity)&&Number.isSafeInteger(value.approvalVersion)&&value.approvalVersion>=0&&typeof value.historyTruncated==='boolean'&&Array.isArray(value.approvals)&&value.approvals.length<=50,'store_outcome_unconfirmed');
  const seen=new Set();for(const r of value.approvals){need(keys(r,['approvalId','recordedDecision','approvalVersion','sourceSha256','mediaId','mediaVersion','mediaSha256','expiresAt'])&&uuid(r.approvalId)&&!seen.has(r.approvalId)&&['approved','revoked'].includes(r.recordedDecision)&&Number.isSafeInteger(r.approvalVersion)&&r.approvalVersion>0&&r.approvalVersion<=value.approvalVersion&&sha(r.sourceSha256)&&uuid(r.mediaId)&&Number.isSafeInteger(r.mediaVersion)&&r.mediaVersion>0&&sha(r.mediaSha256)&&(r.expiresAt===null||timestamp(r.expiresAt)),'store_outcome_unconfirmed');seen.add(r.approvalId);}
  try{exactIdentity(value.identity);}catch{throw new PublicationError('store_outcome_unconfirmed');}
  const c=value.ownerCapability;if(c!==null){need(keys(c,['capabilityId','grantEventId','identity','actor','usage','expiresAt'])&&uuid(c.capabilityId)&&uuid(c.grantEventId)&&sameId(c.identity,identity)&&c.actor===actor&&c.usage==='public_catalog_display'&&timestamp(c.expiresAt),'store_outcome_unconfirmed');try{exactIdentity(c.identity);}catch{throw new PublicationError('store_outcome_unconfirmed');}}
  return structuredClone(value);
}
export function validateApprovalReceipt(value,intent){
  need(keys(value,['operation','identity','approvalId','approvalVersion','decision','replayed'])&&Number.isSafeInteger(intent.expectedApprovalVersion)&&intent.expectedApprovalVersion>=0&&intent.expectedApprovalVersion<Number.MAX_SAFE_INTEGER&&['approve','revoke'].includes(intent.operation)&&value.operation===intent.operation&&sameId(value.identity,intent.identity)&&uuid(value.approvalId)&&Number.isSafeInteger(value.approvalVersion)&&value.approvalVersion===intent.expectedApprovalVersion+1&&value.approvalVersion>0&&typeof value.replayed==='boolean'&&value.decision===(intent.operation==='approve'?'approved':'revoked'),'store_outcome_unconfirmed');
  try{exactIdentity(value.identity);}catch{throw new PublicationError('store_outcome_unconfirmed');}
  if(intent.operation==='revoke')need(value.approvalId===intent.approvalId,'store_outcome_unconfirmed');return structuredClone(value);
}
export function createStoredApprovalResolver(store,{now=Date.now}={}){
  need(typeof store?.approvalForSource==='function'&&typeof now==='function','configuration_required');
  return async({identity,snapshot})=>{
    try{const id=exactIdentity(identity),s=source(snapshot,id,snapshot?.media?.id),e=await store.approvalForSource(id,s.sourceSha256,s.media.id,s.media.version);
      if(e===null)return null;
      need(keys(e,['identity','sourceSha256','contentSha256','mediaId','mediaVersion','mediaSha256','contentApprovalSha256','rightsApprovalSha256','usage','state','expiresAt','width','height','representation','packagingDesign'])&&sameId(e.identity,id)&&e.sourceSha256===s.sourceSha256&&e.contentSha256===s.contentSha256&&e.mediaId===s.media.id&&e.mediaVersion===s.media.version&&[e.mediaSha256,e.contentApprovalSha256,e.rightsApprovalSha256].every(sha)&&e.usage==='public_catalog_display'&&e.state==='approved','approval_required');
      need(e.expiresAt===null||timestamp(e.expiresAt)&&Date.parse(e.expiresAt)>now(),'approval_expired');
      need(Number.isSafeInteger(e.width)&&e.width>0&&e.width<=20000&&Number.isSafeInteger(e.height)&&e.height>0&&e.height<=20000&&['proposed_carton','proposed_vial','catalog_reference'].includes(e.representation)&&typeof e.packagingDesign==='boolean','approval_required');return structuredClone(e);
    }catch{return null;}
  };
}
function command(input,operation){
  const common=['identity','key','expectedApprovalVersion'],fields=operation==='approve'?['mediaId','sourceSha256','expectedMediaSha256','contentApprovalReference','rightsEvidenceReference','expiresAt','width','height','representation','packagingDesign']:['approvalId','reason'];need(keys(input,[...common,...fields]),'invalid_shape');const id=exactIdentity(input.identity);need(text(input.key,200),'invalid_idempotency_key');need(Number.isSafeInteger(input.expectedApprovalVersion)&&input.expectedApprovalVersion>=0&&input.expectedApprovalVersion<Number.MAX_SAFE_INTEGER,'invalid_generation');
  if(operation==='approve'){
    need(uuid(input.mediaId)&&sha(input.sourceSha256)&&sha(input.expectedMediaSha256),'invalid_selection');for(const k of['contentApprovalReference','rightsEvidenceReference'])need(text(input[k],512)&&!/^https?:\/\//i.test(input[k]),'approval_reference_required');
    need(input.expiresAt===null||timestamp(input.expiresAt),'approval_expired');need(Number.isSafeInteger(input.width)&&input.width>0&&input.width<=20000&&Number.isSafeInteger(input.height)&&input.height>0&&input.height<=20000,'invalid_dimensions');need(['proposed_carton','proposed_vial','catalog_reference'].includes(input.representation)&&typeof input.packagingDesign==='boolean','representation_required');
  }else need(uuid(input.approvalId)&&text(input.reason,1000),'reason_required');
  const {key,...rest}=structuredClone(input);return {key,intent:{operation,...rest,identity:id,...(operation==='approve'?{usage:'public_catalog_display'}:{})}};
}

/** The real store looks up Root-installed, actor-specific capability events.
 * Generic Product Control admin access cannot grant that capability. */
export function createPublicationApprovalService(ports){
  for(const k of['authorize','assertBinding','isEligible'])need(typeof ports?.[k]==='function','configuration_required');
  for(const k of['approvalState','approvalReplay','approvalDecide','approvalForSource','sourceSnapshot'])need(typeof ports.store?.[k]==='function','configuration_required');const now=ports.now??Date.now;need(typeof now==='function','configuration_required');
  async function actor(ctx,op,id){const a=await ports.authorize(ctx,op,id);need(text(a,320),'authorization_required');return a;}
  async function state(a,id){return validateApprovalState(await ports.store.approvalState(a,id),id,a);}
  function owner(s){const c=s.ownerCapability;need(c!==null&&Date.parse(c.expiresAt)>now(),'publication_approval_owner_required');return c;}
  async function change(ctx,input,op){
    const {key,intent}=command(input,op),id=intent.identity,a=await actor(ctx,op,id),replay=await ports.store.approvalReplay(a,key,intent);
    if(replay!==null)return {...validateApprovalReceipt(replay,intent),replayed:true};
    const before=await state(a,id),cap=owner(before);need(before.approvalVersion===intent.expectedApprovalVersion,'publication_approval_version_conflict');let mediaSha=null;
    if(op==='approve'){
      need(await ports.assertBinding(id)===true,'binding_unavailable');need(await ports.isEligible(id)===true,'publication_held');need(intent.expiresAt===null||Date.parse(intent.expiresAt)>now(),'approval_expired');
      const s=source(await ports.store.sourceSnapshot(id,intent.mediaId),id,intent.mediaId);need(s.sourceSha256===intent.sourceSha256,'source_version_conflict');need(typeof ports.readApprovalMediaBytes==='function','media_reader_unavailable');
      const descriptor={identity:id,mediaId:s.media.id,mediaVersion:s.media.version,storageIdentitySha256:s.media.storageIdentitySha256,contentType:s.media.contentType,sizeBytes:s.media.sizeBytes};const bytes=await ports.readApprovalMediaBytes(structuredClone(descriptor));need(bytes instanceof Uint8Array&&bytes.byteLength===s.media.sizeBytes&&bytes.byteLength<=10485760,'media_bytes_mismatch');mediaSha=createHash('sha256').update(bytes).digest('hex');need(mediaSha===intent.expectedMediaSha256,'media_bytes_mismatch');
      const afterSource=source(await ports.store.sourceSnapshot(id,intent.mediaId),id,intent.mediaId);need(canonicalJson(afterSource)===canonicalJson(s),'source_version_conflict');const after=await state(a,id);need(canonicalJson(owner(after))===canonicalJson(cap),'publication_approval_owner_required');need(after.approvalVersion===before.approvalVersion,'publication_approval_version_conflict');
      need(await ports.assertBinding(id)===true,'binding_unavailable');need(await ports.isEligible(id)===true,'publication_held');
    }
    return validateApprovalReceipt(await ports.store.approvalDecide(a,key,intent,mediaSha),intent);
  }
  return Object.freeze({approve:(ctx,input)=>change(ctx,input,'approve'),revoke:(ctx,input)=>change(ctx,input,'revoke'),async readState(ctx,input){need(keys(input,['identity']),'invalid_shape');const id=exactIdentity(input.identity),a=await actor(ctx,'readApproval',id),s=await state(a,id);return {identity:id,approvalVersion:s.approvalVersion,ownerAuthorized:s.ownerCapability!==null&&Date.parse(s.ownerCapability.expiresAt)>now(),approvals:s.approvals,historyTruncated:s.historyTruncated};},async previewCandidate(ctx,input){need(keys(input,['identity','mediaId'])&&uuid(input.mediaId),'invalid_shape');const id=exactIdentity(input.identity),a=await actor(ctx,'previewApproval',id),s=await state(a,id);owner(s);need(await ports.assertBinding(id)===true,'binding_unavailable');need(await ports.isEligible(id)===true,'publication_held');const candidate=source(await ports.store.sourceSnapshot(id,input.mediaId),id,input.mediaId);need(typeof ports.readApprovalMediaBytes==='function','media_reader_unavailable');const bytes=await ports.readApprovalMediaBytes({identity:structuredClone(id),mediaId:candidate.media.id,mediaVersion:candidate.media.version,storageIdentitySha256:candidate.media.storageIdentitySha256,contentType:candidate.media.contentType,sizeBytes:candidate.media.sizeBytes});need(bytes instanceof Uint8Array&&bytes.byteLength===candidate.media.sizeBytes&&bytes.byteLength<=10485760,'media_bytes_mismatch');const mediaSha256=createHash('sha256').update(bytes).digest('hex'),again=source(await ports.store.sourceSnapshot(id,input.mediaId),id,input.mediaId),after=await state(a,id);need(canonicalJson(again)===canonicalJson(candidate),'source_version_conflict');need(canonicalJson(owner(after))===canonicalJson(owner(s)),'publication_approval_owner_required');need(after.approvalVersion===s.approvalVersion,'publication_approval_version_conflict');need(await ports.assertBinding(id)===true&&await ports.isEligible(id)===true,'publication_held');return {identity:id,approvalVersion:s.approvalVersion,sourceSha256:candidate.sourceSha256,content:structuredClone(candidate.content),media:{mediaId:candidate.media.id,mediaVersion:candidate.media.version,altText:candidate.media.altText,contentType:candidate.media.contentType,sizeBytes:candidate.media.sizeBytes,sha256:mediaSha256},ownerAuthorized:true};}});
}
