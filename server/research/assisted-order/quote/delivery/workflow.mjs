// Domain engine and source-line checker are injected from the real PR431 modules.
// No dependency here on a particular web authentication middleware.
import {createHmac,randomUUID} from 'node:crypto';
import {verifiedAddress} from './mail.mjs';
import {enqueueSharedQuoteJob} from './shared-worker.mjs';
const id=s=>typeof s==='string'&&/^[-a-zA-Z0-9_.:]{1,180}$/.test(s);
const text=s=>typeof s==='string'&&s.trim()===s&&s.length>0;
const denied=()=>{throw Error('Request or quote is not available.');};
function need(v){if(!v)denied();}
function fields(o,allowed){need(o && Object.getPrototypeOf(o)===Object.prototype && Object.keys(o).every(k=>allowed.includes(k)));}
const normalize=xs=>xs.map(x=>JSON.stringify(x)).sort();
function validateIdentity(ctx,tenant,xriId,seller){
  need(ctx?.tenant===tenant && ctx.intent?.requestId===xriId && ctx.target?.sellerId===seller && id(ctx.target?.requestId)
    && ctx.binding?.requestId===ctx.target.requestId && text(ctx.binding.publicReference)
    && (text(ctx.binding.actorMemberId)||text(ctx.binding.earlyAccessSessionHash))
    && ctx.currentStanding===true);
}
function safeContact(ctx){
  need(ctx.contact?.verified===true && ctx.contact?.deliveryAllowed===true && ctx.contact?.requestId===ctx.intent.requestId &&
    id(ctx.contact.revision) && verifiedAddress(ctx.contact.email));
  return [ctx.contact.email,ctx.contact.revision];
}
function owned(viewer,binding){
  return viewer?.capabilities?.has('assisted_orders:read_own') &&
    ((text(viewer.memberId)&&viewer.memberId===binding.actorMemberId)||
    (text(viewer.earlyAccessSessionHash)&&viewer.earlyAccessSessionHash===binding.earlyAccessSessionHash));
}
export function makePrivateQuoteDesk({transact,authority,Engine,bind,transport,tagKey,clock=()=>new Date(),uuid=randomUUID,deferStagingNotice=false}) {
  if(!Buffer.isBuffer(tagKey)||tagKey.length<32)throw Error('Private stable tag key required.');
  const tag=(purpose,value)=>createHmac('sha256',tagKey).update(JSON.stringify([purpose,value])).digest('hex');
  const portalProof=(tenant,xriId,quoteId)=>'portal-'+tag('portal-proof',[tenant,xriId,quoteId]);
  function vetted(ctx,tenant,xriId,seller,desired){
    validateIdentity(ctx,tenant,xriId,seller); const wanted=new Set(desired);
    need(wanted.size===desired.length && wanted.size>0 && wanted.size<=200);
    const links=ctx.bindings.filter(l=>wanted.has(l.issueLineId));
    const lines=bind(ctx.intent,ctx.target,links);
    need(lines.length===wanted.size && lines.every(l=>wanted.has(l.requestLineId)));
    // Stamp all reviewed identities, source policy, and the actual evidence records.
    return tag('clearance',normalize(links.map(l=>[l.issueLineId,l.approvalEvidenceId,l.source.productId,l.source.variantId,l.source.sourceVariantId,
      l.source.quantity,l.source.catalogVersion,l.source.workflowMode,l.source.clinicalReviewRequired,l.source.researchUseOnly])));
  }
  const rowToRecord=r=>r?{...JSON.parse(r.snapshot),state:r.state}:null;
  function engine(q,tenant,xriId,ctx) {
    const target=ctx.target.requestId;
    const record=async e=>{
      // No amounts, clinical info, provider bodies, private notes or recipient in audit events.
      await q('INSERT INTO qd_audits(id,tenant,quote_id,kind,at_time) VALUES($1,$2,$3,$4,$5)',[uuid(),tenant,e.quoteId,e.type,clock().toISOString()]);
    };
    return new Engine({ids:{uuid},clock:{now:clock},audit:{record},
      requests:{bindingFor:async k=>k===target?ctx.binding:null,byPublicReference:async ref=>ref===ctx.binding.publicReference?ctx.binding:null},
      requestLines:{linesFor:async k=>k===target?ctx.target.lines:[]},
      repository:{
        byId:async k=>rowToRecord((await q('SELECT snapshot,state FROM qd_quotes WHERE tenant=$1 AND id=$2 AND target_id=$3 AND xri_id=$4',[tenant,k,target,xriId]))[0]),
        byRequest:async k=>k===target?(await q('SELECT snapshot,state FROM qd_quotes WHERE tenant=$1 AND target_id=$2 AND xri_id=$3 ORDER BY version',[tenant,k,xriId])).map(rowToRecord):[],
        create:async r=>{need(r.requestId===target && r.state==='issued');await q('INSERT INTO qd_quotes(tenant,id,target_id,xri_id,seller,version,state,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [tenant,r.quoteId,target,xriId,ctx.target.sellerId,r.version,r.state,JSON.stringify(r)]);},
        update:async r=>{
          // This facade only issues/reads/withdraws. It exposes no purchase or acceptance command.
          need(['superseded','expired','withdrawn'].includes(r.state));
          need((await q("UPDATE qd_quotes SET state=$1 WHERE tenant=$2 AND id=$3 AND version=$4 AND target_id=$5 AND xri_id=$6 AND state='issued' RETURNING id",
            [r.state,tenant,r.quoteId,r.version,target,xriId])).length===1);
        }
      }});
  }
  async function issue(viewer,input) {
    fields(input,['xriId','seller','attempt','expectedVersion','lines','validUntil']);
    const {xriId,seller,attempt,expectedVersion,lines,validUntil}=input;
    need(id(viewer?.tenant)&&id(viewer?.subject)&&viewer.capabilities?.has('assisted_orders:manage')&&id(xriId)&&id(seller)&&id(attempt)
      && Number.isSafeInteger(expectedVersion)&&expectedVersion>=0 && Array.isArray(lines)&&lines.length>0&&lines.length<=200 && typeof validUntil==='string');
    const normalized=lines.map(line=>{fields(line,['requestLineId','unitPriceCents','pricingBasis']);need(id(line.requestLineId)
      && (line.unitPriceCents===undefined||Number.isSafeInteger(line.unitPriceCents))
      && (line.pricingBasis===undefined||(text(line.pricingBasis)&&line.pricingBasis.length<=600)));
      return [line.requestLineId,line.unitPriceCents??null,line.pricingBasis??null];});
    const {tenant,subject}=viewer, fp=tag('issue-attempt',[subject,seller,expectedVersion,normalize(normalized),validUntil]);
    return transact(tenant,xriId,async q=>{
      const ctx=await authority.forIssue(q,viewer,xriId,seller);
      need(ctx?.issueAuthorized===true && ctx?.notifyAuthorized===true); // genuine current, separate permissions
      const bindingTag=vetted(ctx,tenant,xriId,seller,lines.map(l=>l.requestLineId));
      const contactTag=tag('contact',safeContact(ctx));
      const replay=(await q('SELECT fingerprint,id FROM qd_attempts WHERE tenant=$1 AND xri_id=$2 AND opkey=$3',[tenant,xriId,attempt]))[0];
      if(replay){
        if(replay.fingerprint!==fp)throw Error('Attempt conflict.');
        if(deferStagingNotice){
          let noticeReleased=false;
          if(transport.ready() && Date.parse(validUntil)>clock().getTime()){
            const proof=(await q("SELECT id FROM qd_audits WHERE id=$1 AND tenant=$2 AND quote_id=$3 AND kind='staging_portal_verified'",
              [portalProof(tenant,xriId,replay.id),tenant,replay.id]))[0];
            const pending=(await q("SELECT id FROM qd_notification_intents WHERE tenant=$1 AND xri_id=$2 AND id=$3 AND state='queued' AND contact_tag=$4 AND bindings_tag=$5",
              [tenant,xriId,replay.id,contactTag,bindingTag]))[0];
            if(proof&&pending){
              await enqueueSharedQuoteJob(q,{tenant,xriId,quoteId:replay.id,recipient:ctx.contact.email,
                eventKey:'qd-'+tag('delivery',[tenant,xriId,replay.id]),repeatRelease:true});
              noticeReleased=true;
            }
          }
          return {quoteId:replay.id,replay:true,noticeReleased};
        }
        return {quoteId:replay.id,replay:true};
      }
      const tid=ctx.target.requestId;
      await q('INSERT INTO qd_directory(tenant,target_id,xri_id,seller) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[tenant,tid,xriId,seller]);
      need((await q('SELECT target_id FROM qd_directory WHERE tenant=$1 AND target_id=$2 AND xri_id=$3 AND seller=$4',[tenant,tid,xriId,seller])).length===1);
      const prev=(await q('SELECT max(version) AS ver FROM qd_quotes WHERE tenant=$1 AND target_id=$2',[tenant,tid]))[0];
      if((prev.ver??0)!==expectedVersion)throw Error('Quote version changed.');
      const next=await engine(q,tenant,xriId,ctx).issue(viewer,{requestId:tid,lines,validUntil});
      await q('INSERT INTO qd_attempts(tenant,xri_id,opkey,fingerprint,id) VALUES($1,$2,$3,$4,$5)',[tenant,xriId,attempt,fp,next.quoteId]);
      await q("INSERT INTO qd_notification_intents(tenant,id,xri_id,contact_tag,bindings_tag,issuer,state) VALUES($1,$2,$3,$4,$5,$6,'queued')",
        [tenant,next.quoteId,xriId,contactTag,bindingTag,subject]);
      if(!deferStagingNotice)await enqueueSharedQuoteJob(q,{tenant,xriId,quoteId:next.quoteId,recipient:ctx.contact.email,eventKey:'qd-'+tag('delivery',[tenant,xriId,next.quoteId])});
      return deferStagingNotice?{quoteId:next.quoteId,replay:false,noticeReleased:false}:{quoteId:next.quoteId,replay:false};
    });
  }
  async function privateForCustomer(viewer,xriId,seller) {
    need(id(viewer?.tenant)&&id(xriId)&&id(seller));
    return transact(viewer.tenant,xriId,async q=>{
      const ctx=await authority.forCustomer(q,viewer,xriId,seller);
      validateIdentity(ctx,viewer.tenant,xriId,seller);
      need(owned(viewer,ctx.binding) && ctx.customerAuthorized===true);
      const records=await engine(q,viewer.tenant,xriId,ctx).forRequest(viewer,ctx.binding.publicReference);
      const output=[];
      for(const r of records.filter(r=>r.state==='issued')){
        const event=(await q('SELECT contact_tag,bindings_tag FROM qd_notification_intents WHERE tenant=$1 AND xri_id=$2 AND id=$3',[viewer.tenant,xriId,r.quoteId]))[0];
        // Material revocation fails closed for the private portal too.
        if(!event||tag('contact',safeContact(ctx))!==event.contact_tag)continue;
        try{if(vetted(ctx,viewer.tenant,xriId,seller,r.lines.map(x=>x.lineId))!==event.bindings_tag)continue;}catch{continue;}
        if(deferStagingNotice)await q("INSERT INTO qd_audits(id,tenant,quote_id,kind,at_time) VALUES($1,$2,$3,'staging_portal_verified',$4) ON CONFLICT(id) DO NOTHING",
          [portalProof(viewer.tenant,xriId,r.quoteId),viewer.tenant,r.quoteId,clock().toISOString()]);
        output.push(r);
      } return output;
    });
  }
  const eventRow=async(q,t,x,id)=>(await q('SELECT b.*,v.seller,v.state AS quote_state,v.snapshot FROM qd_notification_intents b JOIN qd_quotes v ON b.id=v.id AND b.tenant=v.tenant WHERE b.tenant=$1 AND b.xri_id=$2 AND b.id=$3',[t,x,id]))[0];
  const complete=async(tenant,xriId,quoteId,state,provider=null)=>transact(tenant,xriId,async q=>{
    const ok=await q("UPDATE qd_notification_intents SET state=$1,provider_id=$2 WHERE tenant=$3 AND xri_id=$4 AND id=$5 AND state='attempting' RETURNING id",
      [state,provider,tenant,xriId,quoteId]);if(ok.length===1)return state;
    const done=await eventRow(q,tenant,xriId,quoteId);
    need(done && ['accepted','bounced','delivered'].includes(done.state) && (!provider||provider===done.provider_id));
    return done.state; // An authenticated webhook may have settled before the HTTP response.
  });
  async function dispatch(tenant,xriId,quoteId,job) {
    need(id(tenant)&&id(xriId)&&id(quoteId)); if(!transport.ready())return 'disabled';
    const prep=await transact(tenant,xriId,async q=>{
      const row=await eventRow(q,tenant,xriId,quoteId);if(!row || row.state!=='queued')return {state:row?.state??'absent'};
      const record=JSON.parse(row.snapshot);
      let to=null;
      if(row.quote_state==='issued' && Date.parse(record.validUntil)>clock().getTime()){
        // A DB/authority outage throws before mutation; deliberate revoked state returns null or false.
        const ctx=await authority.forDispatch(q,{tenant,issuer:row.issuer,xriId,seller:row.seller});
        if(ctx?.dispatchAuthorized===true)try{
          const stamp=vetted(ctx,tenant,xriId,row.seller,record.lines.map(l=>l.lineId));
          if(stamp===row.bindings_tag && tag('contact',safeContact(ctx))===row.contact_tag && (!job || job.recipient===ctx.contact.email))to=ctx.contact.email;
        }catch{ /* changed binding; do not disclose */ }
      }
      const state=to?'attempting':'suppressed';
      need((await q("UPDATE qd_notification_intents SET state=$1 WHERE tenant=$2 AND xri_id=$3 AND id=$4 AND state='queued' RETURNING id",[state,tenant,xriId,quoteId])).length===1);
      return {state,to};
    });
    if(!prep.to)return prep.state;
    // COMMIT first. A crash here leaves 'attempting', never automatically resent.
    const key='qd-'+tag('delivery',[tenant,xriId,quoteId]);
    let receipt;
    try{receipt=await transport.send(key,prep.to);need(id(receipt));}
    catch{return complete(tenant,xriId,quoteId,'uncertain');}
    return complete(tenant,xriId,quoteId,'accepted',receipt);
  }
  async function handleQueuedJob(tenant,xriId,quoteId,eventKey,recipient) {
    need(verifiedAddress(recipient)&&eventKey==='qd-'+tag('delivery',[tenant,xriId,quoteId]));
    const state=await dispatch(tenant,xriId,quoteId,{recipient});
    const row=await transact(tenant,xriId,q=>eventRow(q,tenant,xriId,quoteId));
    return {state,providerId:row?.provider_id??null};
  }
  // This is an INTERNAL callback for already verified evidence, not an HTTP endpoint.
  async function reconcile(tenant,xriId,quoteId,proof){
    need(id(tenant)&&id(xriId)&&id(quoteId));
    return transact(tenant,xriId,async q=>{
      const r=await eventRow(q,tenant,xriId,quoteId);need(r);
      const s=await authority.verifiedDispatchEvidence(q,{tenant,xriId,quoteId,proof});
      need(s?.deliveryKey==='qd-'+tag('delivery',[tenant,xriId,quoteId]) && id(s.providerId) && id(s.eventId)
        && ['accepted','delivered','bounced'].includes(s.state));
      need(!r.provider_id||r.provider_id===s.providerId);
      need(['attempting','uncertain','accepted','delivered','bounced'].includes(r.state));
      const prior=(await q('SELECT provider_id,kind FROM qd_events WHERE eid=$1 AND tenant=$2',[s.eventId,tenant]))[0];
      if(prior){need(prior.provider_id===s.providerId && prior.kind===s.state);return r.state;}
      // A late accepted event cannot erase a terminal receipt. Opposed terminal reports require manual review.
      if(['delivered','bounced'].includes(r.state) && s.state!=='accepted' && r.state!==s.state)throw Error('Conflicting terminal evidence.');
      const state=['delivered','bounced'].includes(r.state)?r.state:s.state;
      await q('INSERT INTO qd_events(eid,provider_id,kind,tenant) VALUES($1,$2,$3,$4)',[s.eventId,s.providerId,s.state,tenant]);
      await q('UPDATE qd_notification_intents SET state=$1,provider_id=$2 WHERE tenant=$3 AND xri_id=$4 AND id=$5',[state,s.providerId,tenant,xriId,quoteId]);return state;
    });
  }
  // Authenticated receipt of a specific threaded reply. No subject, body, or recipient logged.
  async function recordReply(tenant,xriId,quoteId,proof) {
    need(id(tenant)&&id(xriId)&&id(quoteId));
    return transact(tenant,xriId,async q=>{
      const row=await eventRow(q,tenant,xriId,quoteId);
      need(row && ['delivered','accepted'].includes(row.state) && id(row.provider_id));
      const ev=await authority.verifiedReplyEvidence(q,{tenant,xriId,quoteId,proof});
      const ctx=await authority.forDispatch(q,{tenant,issuer:row.issuer,xriId,seller:row.seller});
      validateIdentity(ctx,tenant,xriId,row.seller);
      const [recipient,rev]=safeContact(ctx);
      need(ctx.dispatchAuthorized===true && tag('contact',[recipient,rev])===row.contact_tag
        && ev?.to==='team@xeniostechnology.com' && ev?.verifiedFrom===recipient
        && ev?.outboundProviderId===row.provider_id && ev?.threadVerified===true && id(ev.receiptId));
      await q('INSERT INTO qd_replies(tenant,quote_id,evidence_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[tenant,quoteId,ev.receiptId]);
      // Reject a reused proof pointing at a different quote.
      need((await q('SELECT quote_id FROM qd_replies WHERE tenant=$1 AND quote_id=$2 AND evidence_id=$3',[tenant,quoteId,ev.receiptId])).length===1);
      return 'reply_verified';
    });
  }
  return Object.freeze({issue,privateForCustomer,dispatch,handleQueuedJob,reconcile,recordReply});
}
