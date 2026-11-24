import {createPublicationService,exactIdentity,PublicationError} from './publication.mjs';

export const PUBLICATION_ADMIN_BASE='/api/admin/research/products/:productId/variants/:variantId/catalog-publication';
const bodyFields={preview:['mediaId'],seal:['expectedGeneration','mediaId','sourceSha256'],publish:['expectedGeneration','revisionId'],withdraw:['expectedGeneration','reason'],rollback:['expectedGeneration','revisionId','reason']};
const ordinary=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const bad=code=>{throw new PublicationError(code);};
function strictBody(v,fields){if(!ordinary(v)||Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))bad('invalid_shape');return v;}
function privateHeaders(res){res.set({'Cache-Control':'private, no-store',Pragma:'no-cache','Referrer-Policy':'no-referrer',Vary:'Authorization, Cookie'});}
const safeCodes=new Set(['invalid_shape','invalid_identity','invalid_selection','invalid_revision','invalid_generation','invalid_idempotency_key',
  'invalid_content','public_price_refused','source_unavailable','media_unavailable','authorization_required','binding_unavailable',
  'publication_held','approval_binding_mismatch','approval_required','approval_expired','invalid_dimensions','representation_required',
  'source_version_conflict','revision_unavailable','approval_changed','reason_required','store_outcome_unconfirmed',
  'publication_generation_conflict','publication_source_version_conflict','publication_idempotency_conflict','publication_source_unavailable',
  'publication_content_unavailable','publication_approval_required','publication_not_found','publication_not_published',
  'publication_revision_mismatch','publication_already_current','publication_not_previously_published','publication_invalid_identity',
  'publication_invalid_command','publication_reason_required']);
function failure(res,error){
  const code=error instanceof PublicationError&&safeCodes.has(error.code)?error.code:'publication_unavailable';
  const status=/^(?:invalid_|reason_required)/.test(code)?400:code==='authorization_required'?403:/conflict|not_previously|already_current|not_published/.test(code)?409:503;
  return res.status(status).json({error:code,operationConfirmed:false});
}

/** Protected existing ProductControl guard, not a parallel authentication system.
 * A nonserializable per-request context is issued only AFTER requireAdmin.
 * Public consumers receive the service's read methods; no external caller can
 * manufacture an actor by passing a JSON context to a mutation method.
 */
export function createProductControlPublicationAdmin({requireAdmin,identityFor,ports}){
  if(typeof requireAdmin!=='function'||typeof identityFor!=='function'||!ordinary(ports)||Object.hasOwn(ports,'authorize'))bad('configuration_required');
  const principals=new WeakMap(),registered=new WeakSet();
  const service=createPublicationService({...ports,authorize:async context=>principals.get(context)??null});
  const methods={seal:'createApprovedRevision',publish:'publish',withdraw:'withdraw',rollback:'rollback'};
  function register(app){
    if(!app||typeof app.post!=='function'||registered.has(app))bad('configuration_required');
    registered.add(app);
    for(const op of Object.keys(bodyFields)){
      const guarded=(req,res,next)=>{privateHeaders(res);return Promise.resolve().then(()=>requireAdmin(req,res,next)).catch(error=>failure(res,error));};
      app.post(PUBLICATION_ADMIN_BASE+'/'+op,guarded,async(req,res)=>{
        privateHeaders(res);let context;
        try{
          // Existing ProductControl requireAdmin supplies this server property.
          // req.body.adminEmail/actor/identity/rights are never consulted.
          const actor=req.adminEmail;
          if(typeof actor!=='string'||actor!==actor.trim()||!actor||actor.length>320||/[\x00-\x1f\x7f]/.test(actor))bad('authorization_required');
          const body=strictBody(req.body,bodyFields[op]);
          const id=exactIdentity(await identityFor(req.params.productId,req.params.variantId));
          if(id.productId!==req.params.productId||id.variantId!==req.params.variantId)bad('invalid_identity');
          context=Object.freeze({});principals.set(context,actor);
          if(op==='preview')return res.json(await service.previewCandidate(context,{identity:id,mediaId:body.mediaId}));
          const key=req.get('Idempotency-Key');
          return res.json(await service[methods[op]](context,{...body,identity:id,key}));
        }catch(error){return failure(res,error);}
        finally{if(context)principals.delete(context);}
      });
    }
  }
  return Object.freeze({service,register});
}
