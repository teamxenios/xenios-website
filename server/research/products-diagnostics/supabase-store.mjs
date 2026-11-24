import { PublicationError,validateCommandReceipt } from './publication.mjs';

/** Existing server-only Supabase service client; never a browser client/key. */
export function createSupabasePublicationStore(client){
  if(!client||typeof client.rpc!=='function')throw new PublicationError('store_unavailable');
  async function call(name,args){
    let result;try{result=await client.rpc(name,args);}catch{throw new PublicationError('store_outcome_unconfirmed');}
    if(result?.error){
      const known=new Set(['publication_generation_conflict','publication_source_version_conflict','publication_idempotency_conflict',
        'publication_source_unavailable','publication_content_unavailable','publication_approval_required',
        'publication_not_found','publication_not_published','publication_revision_mismatch','publication_already_current',
        'publication_not_previously_published','publication_invalid_identity','publication_invalid_command','publication_reason_required']);
      if(result.error.code==='P0001'&&known.has(result.error.message))throw new PublicationError(result.error.message);
      throw new PublicationError('store_outcome_unconfirmed');
    }
    if(result===null||typeof result!=='object'||Array.isArray(result)||result.error!==null||!Object.hasOwn(result,'data')||result.data===undefined)throw new PublicationError('store_outcome_unconfirmed');
    return result.data;
  }
  function confirmed(value,intent,operations){
    if(!operations.includes(intent?.operation))throw new PublicationError('store_outcome_unconfirmed');
    return validateCommandReceipt(value,intent);
  }
  return Object.freeze({
    sourceSnapshot:(identity,mediaId)=>call('research_catalog_publication_source',{p_identity:identity,p_media_id:mediaId}),
    replay:async(actor,key,intent)=>{const value=await call('research_catalog_publication_replay',{p_actor:actor,p_key:key,p_intent:intent});return value===null?null:validateCommandReceipt(value,intent);},
    seal:async(actor,key,intent,evidence)=>confirmed(await call('research_catalog_publication_seal',{p_actor:actor,p_key:key,p_intent:intent,p_evidence:evidence}),intent,['seal']),
    transition:async(actor,key,intent)=>confirmed(await call('research_catalog_publication_transition',{p_actor:actor,p_key:key,p_intent:intent}),intent,['publish','withdraw','rollback']),
    current:identity=>call('research_catalog_publication_current',{p_identity:identity}),
    revision:(identity,revisionId)=>call('research_catalog_publication_revision',{p_identity:identity,p_revision_id:revisionId}),
  });
}
