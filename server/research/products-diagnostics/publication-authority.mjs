import {PublicationError,exactIdentity,validateCommandReceipt} from './publication.mjs';
import {createProductControlPublicationAdmin,PUBLICATION_ADMIN_BASE} from './publication-admin.mjs';
import {createSupabasePublicationStore} from './supabase-store.mjs';
import {createPublicationApprovalService,createStoredApprovalResolver,validateApprovalState,validateApprovalReceipt} from './publication-approval.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const sameId=(a,b)=>['offeringId','offeringVariantId','productId','variantId'].every(k=>a?.[k]===b?.[k]);
const unconfirmed=()=>{throw new PublicationError('store_outcome_unconfirmed');};
function shape(v,keys){return object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
export function validateAdminState(value,identity){
  try{exactIdentity(identity);exactIdentity(value?.identity);}catch{unconfirmed();}
  if(!shape(value,['identity','generation','currentRevisionId','revisions','operations','historyTruncated'])||!sameId(value.identity,identity)||!Number.isSafeInteger(value.generation)||value.generation<0||!(value.currentRevisionId===null||uuid(value.currentRevisionId))||typeof value.historyTruncated!=='boolean')unconfirmed();
  if(!Array.isArray(value.revisions)||value.revisions.length>50||!Array.isArray(value.operations)||value.operations.length>50)unconfirmed();
  const ids=new Set();for(const r of value.revisions){if(!shape(r,['revisionId','previouslyPublished'])||!uuid(r.revisionId)||ids.has(r.revisionId)||typeof r.previouslyPublished!=='boolean')unconfirmed();ids.add(r.revisionId);}
  if(value.currentRevisionId!==null&&!value.revisions.some(r=>r.revisionId===value.currentRevisionId&&r.previouslyPublished===true))unconfirmed();
  for(const r of value.operations){if(!shape(r,['operation','revisionId','generation','at'])||!['seal','publish','withdraw','rollback'].includes(r.operation)||!Number.isSafeInteger(r.generation)||r.generation<0||r.generation>value.generation||!(r.operation==='withdraw'?r.revisionId===null:uuid(r.revisionId))||typeof r.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(r.at)||!Number.isFinite(Date.parse(r.at)))unconfirmed();if(r.operation!=='seal'&&r.generation===0)unconfirmed();}
  return structuredClone(value);
}

async function rpc(client,name,args){
  let result;try{result=await client.rpc(name,args);}catch{unconfirmed();}
  const known=new Set(['publication_generation_conflict','publication_source_version_conflict','publication_idempotency_conflict','publication_source_unavailable','publication_content_unavailable','publication_approval_required','publication_not_found','publication_not_published','publication_revision_mismatch','publication_already_current','publication_not_previously_published','publication_invalid_identity','publication_invalid_command','publication_reason_required','publication_approval_version_conflict','publication_approval_owner_required','publication_approval_not_found','publication_approval_already_revoked']);
  if(result?.error?.code==='P0001'&&known.has(result.error.message))throw new PublicationError(result.error.message);
  if(!object(result)||result.error!==null||!Object.hasOwn(result,'data')||result.data===undefined)unconfirmed();return result.data;
}
export function createSupabasePublicationAuthorityStore(client){
  const base=createSupabasePublicationStore(client);
  return Object.freeze({...base,async adminState(actor,identity){return validateAdminState(await rpc(client,'research_catalog_publication_admin_state',{p_actor:actor,p_identity:identity}),identity);},
    async seal(actor,key,intent,evidence){if(intent?.operation!=='seal')unconfirmed();return validateCommandReceipt(await rpc(client,'research_catalog_publication_seal_verified',{p_actor:actor,p_key:key,p_intent:intent,p_evidence:evidence}),intent);},
    async transition(actor,key,intent){if(!['publish','withdraw','rollback'].includes(intent?.operation))unconfirmed();return validateCommandReceipt(await rpc(client,'research_catalog_publication_transition_verified',{p_actor:actor,p_key:key,p_intent:intent}),intent);},
    async approvalState(actor,identity){return validateApprovalState(await rpc(client,'research_catalog_approval_state',{p_actor:actor,p_identity:identity}),identity,actor);},
    async approvalReplay(actor,key,intent){const value=await rpc(client,'research_catalog_approval_replay',{p_actor:actor,p_key:key,p_intent:intent});return value===null?null:validateApprovalReceipt(value,intent);},
    async approvalDecide(actor,key,intent,mediaSha256){return validateApprovalReceipt(await rpc(client,'research_catalog_approval_decide',{p_actor:actor,p_key:key,p_intent:intent,p_media_sha256:mediaSha256}),intent);},
    approvalForSource:(identity,sourceSha256,mediaId,mediaVersion)=>rpc(client,'research_catalog_approval_for_source',{p_identity:identity,p_source_sha256:sourceSha256,p_media_id:mediaId,p_media_version:mediaVersion})});
}

function headers(res){res.set({'Cache-Control':'private, no-store',Pragma:'no-cache','Referrer-Policy':'no-referrer',Vary:'Authorization, Cookie'});}
const safeCodes=new Set(['authorization_required','store_outcome_unconfirmed','invalid_shape','invalid_identity','invalid_generation','invalid_idempotency_key','invalid_selection','source_unavailable','media_unavailable','invalid_content','public_price_refused','approval_reference_required','approval_expired','invalid_dimensions','representation_required','reason_required','binding_unavailable','publication_held','media_reader_unavailable','media_bytes_mismatch','source_version_conflict','publication_approval_owner_required','publication_approval_version_conflict','publication_idempotency_conflict','publication_approval_not_found','publication_approval_already_revoked','publication_source_version_conflict']);
function failure(res,error){const code=error instanceof PublicationError&&safeCodes.has(error.code)?error.code:'publication_state_unavailable';return res.status(/authorization_required|approval_owner_required/.test(code)?403:/conflict|already_revoked/.test(code)?409:/^invalid_|reason_required|approval_reference_required/.test(code)?400:503).json({error:code,operationConfirmed:false});}
function queryFree(req){const length=req.get?.('Content-Length'),q=req.query,emptyQueryMap=q!==null&&typeof q==='object'&&!Array.isArray(q)&&[null,Object.prototype].includes(Object.getPrototypeOf(q))&&Reflect.ownKeys(q).length===0;if((typeof req.originalUrl==='string'&&req.originalUrl.includes('?'))||(q!==undefined&&!emptyQueryMap)||(length!==undefined&&length!==null&&length!=='0')||(req.body!==undefined&&req.body!==null&&(!object(req.body)||Object.keys(req.body).length)))throw new PublicationError('invalid_shape');}
async function selected(req,identityFor){const actor=req.adminEmail;if(typeof actor!=='string'||actor!==actor.trim()||!actor||actor.length>320||/[\x00-\x1f\x7f]/.test(actor))throw new PublicationError('authorization_required');const identity=exactIdentity(await identityFor(req.params.productId,req.params.variantId));if(identity.productId!==req.params.productId||identity.variantId!==req.params.variantId)throw new PublicationError('invalid_identity');return {actor,identity};}

/** Extends the same authenticated Product Control boundary. It does not use
 * public qualified/current-media reads to infer the actual admin head. */
export function createProductControlPublicationAuthorityAdmin({requireAdmin,identityFor,ports}){
  if(typeof requireAdmin!=='function'||typeof identityFor!=='function'||!object(ports)||typeof ports.store?.adminState!=='function'||Object.hasOwn(ports,'authorize')||Object.hasOwn(ports,'resolveApproval'))throw new PublicationError('configuration_required');
  const base=createProductControlPublicationAdmin({requireAdmin,identityFor,ports:{...ports,resolveApproval:createStoredApprovalResolver(ports.store,{now:ports.now??Date.now})}}),principals=new WeakMap(),approval=createPublicationApprovalService({...ports,authorize:async ctx=>principals.get(ctx)??null}),mounted=new WeakSet();
  function register(app){
    if(!app||typeof app.get!=='function'||mounted.has(app))throw new PublicationError('configuration_required');mounted.add(app);base.register(app);
    const guard=(req,res,next)=>{headers(res);return Promise.resolve().then(()=>requireAdmin(req,res,next)).catch(error=>failure(res,error));};
    app.get(PUBLICATION_ADMIN_BASE,guard,async(req,res)=>{headers(res);try{queryFree(req);const {actor,identity}=await selected(req,identityFor);return res.json(validateAdminState(await ports.store.adminState(actor,identity),identity));}catch(error){return failure(res,error);}});
    app.get(PUBLICATION_ADMIN_BASE+'/approval',guard,async(req,res)=>{headers(res);let context;try{queryFree(req);const {actor,identity}=await selected(req,identityFor);context=Object.freeze({});principals.set(context,actor);return res.json(await approval.readState(context,{identity}));}catch(error){return failure(res,error);}finally{if(context)principals.delete(context);}});
    const routes=[['/approval/preview','previewCandidate',['mediaId']],['/approval','approve',['expectedApprovalVersion','mediaId','sourceSha256','expectedMediaSha256','contentApprovalReference','rightsEvidenceReference','expiresAt','width','height','representation','packagingDesign']],['/approval/:approvalId/revoke','revoke',['expectedApprovalVersion','reason']]];
    for(const [suffix,method,fields]of routes)app.post(PUBLICATION_ADMIN_BASE+suffix,guard,async(req,res)=>{headers(res);let context;try{if(!shape(req.body,fields))throw new PublicationError('invalid_shape');const {actor,identity}=await selected(req,identityFor);context=Object.freeze({});principals.set(context,actor);const input={...req.body,identity,...(method==='previewCandidate'?{}:{key:req.get('Idempotency-Key')}),...(method==='revoke'?{approvalId:req.params.approvalId}:{})};return res.json(await approval[method](context,input));}catch(error){return failure(res,error);}finally{if(context)principals.delete(context);}});
  }
  return Object.freeze({register,service:base.service,approvalService:approval});
}
