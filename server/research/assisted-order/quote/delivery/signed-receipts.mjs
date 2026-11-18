// Scoped exclusively to Resend delivery notices for this channel. No mail is sent here.
// The signature, header, window and encoding checks are the shared verifier's;
// everything that decides whether an event is quote mail stays here.
import {createHmac} from 'node:crypto';
import {TEAM,verifiedAddress} from './mail.mjs';
import {resendDeliveryKind,resendWebhookVerifier} from '../../../email/resend-webhook-signature.mjs';
const cleanId=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
const fail=()=>{throw Error('Invalid provider event.');};
const tag=(key,purpose,v)=>createHmac('sha256',key).update(JSON.stringify([purpose,v])).digest('hex');
// Pass an array of operator-approved endpoint secrets for bounded key overlap.
// Signed message id/timestamp/signature come only from exactly one physical header each.
export function signedQuoteReceiptVerifier({secrets,tagKey,now=Date.now}) {
 if(!Buffer.isBuffer(tagKey)||tagKey.length<32)fail();
 const verify=resendWebhookVerifier({secrets,now});
 return (bytes,headers)=>{
   const {eid,event,digest}=verify(bytes,headers);
   const kind=resendDeliveryKind(event.type);
   if(!kind)return null;
   const d=event.data;
   if(!uuid(d?.email_id)||typeof d.from!=='string'||!Array.isArray(d.to))fail();
   if(![TEAM,'Team Xenios <'+TEAM+'>'].includes(d.from)||d.subject!=='A private update from Team Xenios')return null;
   if(d.to.length!==1||!verifiedAddress(d.to[0]))fail();
   // Persist no headers, addresses, subject, private products, raw event or optional bounce text.
   return {eid,pid:d.email_id.toLowerCase(),kind,digest,addressTag:tag(tagKey,'resend-recipient',d.to[0])};
 };
}
export function createResendReceipts({tenant,transact,verifier,tagKey}){
 if(!cleanId(tenant)||typeof transact!=='function'||typeof verifier!=='function'||!Buffer.isBuffer(tagKey)||tagKey.length<32)fail();
 async function save(event){
  const {eid,pid,kind,digest,addressTag}=event;
  return transact(tenant,'resend-event:'+eid,async q=>{
    await q("INSERT INTO qd_verified_receipts(tenant,eid,pid,kind,digest,address_tag,disposition) VALUES($1,$2,$3,$4,$5,$6,'pending') ON CONFLICT(tenant,eid) DO NOTHING",
      [tenant,eid,pid,kind,digest,addressTag]);
    const [row]=await q('SELECT digest,disposition FROM qd_verified_receipts WHERE tenant=$1 AND eid=$2',[tenant,eid]);
    if(row.digest!==digest)throw new Error('Conflicting event identity.');
    return row.disposition;
  });
 }
 async function match(tx,eid) {
  const [e]=await tx('SELECT eid,pid,kind,address_tag,disposition FROM qd_verified_receipts WHERE tenant=$1 AND eid=$2',[tenant,eid]);
  if(!e||e.disposition==='conflict')return null;
  // Bind by the provider ACK in the private ledger, never by email, webhook URL params, subject, or RFC Message-ID.
  const [r]=await tx('SELECT id,xri_id,state,provider_id FROM qd_notification_intents WHERE tenant=$1 AND provider_id=$2',[tenant,e.pid]);
  if(!r)return null;
  const deliveryKey='qd-'+tag(tagKey,'delivery',[tenant,r.xri_id,r.id]);
  const [job]=await tx("SELECT recipient FROM public.research_notification_outbox WHERE event_key=$1 AND template_key='ea_private_quote_notice_v1' AND event_type='ea_private_quote_notice_v1'",[deliveryKey]);
  const bad=!job||!verifiedAddress(job.recipient)||tag(tagKey,'resend-recipient',job.recipient)!==e.address_tag||
     (['delivered','bounced'].includes(r.state)&&e.kind!=='accepted'&&r.state!==e.kind);
  if(bad)return {conflict:true};
  return {xriId:r.xri_id,quoteId:r.id,deliveryKey,providerId:e.pid,state:e.kind,eventId:e.eid};
 }
 async function verifiedDispatchEvidence(tx,{tenant:t,xriId,quoteId,proof}){
  if(t!==tenant||!cleanId(proof?.receiptId))return null;
  const m=await match(tx,proof.receiptId);
  if(!m||m.conflict||m.xriId!==xriId||m.quoteId!==quoteId)return null;
  // This update and the existing desk's qd_events insertion/state transition commit or roll back together.
  await tx("UPDATE qd_verified_receipts SET disposition='applied' WHERE tenant=$1 AND eid=$2",[tenant,m.eventId]);
  return m;
 }
 async function processOne(eid,reconcile){
  const m=await transact(tenant,'resend-event:'+eid,async q=>{
    const result=await match(q,eid);
    if(result?.conflict)await q("UPDATE qd_verified_receipts SET disposition='conflict' WHERE tenant=$1 AND eid=$2 AND disposition='pending'",[tenant,eid]);
    return result;});
  if(!m)return 'pending';if(m.conflict)return 'conflict';
  await reconcile(tenant,m.xriId,m.quoteId,{receiptId:eid});return 'applied';
 }
 async function receive(bytes,headers,reconcile){
  let e;try{e=verifier(bytes,headers);}catch{return {status:400};}
  // Verified, but not quote mail or not a delivery event: another channel may claim it.
  if(!e)return {status:204,unclaimed:true};
  try{
    const d=await save(e);if(d==='pending')await processOne(e.eid,reconcile);
    return {status:204};
  }catch(err){return {status:err?.message==='Conflicting event identity.'?409:503};}
 }
 async function drainAfterAck(pid,reconcile){
  if(!uuid(pid))return 0;
  const rows=await transact(tenant,'resend-ack:'+pid,q=>q("SELECT eid FROM qd_verified_receipts WHERE tenant=$1 AND pid=$2 AND disposition='pending' ORDER BY eid LIMIT 25",[tenant,pid]));
  for(const r of rows)await processOne(r.eid,reconcile);
  return rows.length;
 }
 return {receive,drainAfterAck,verifiedDispatchEvidence};
}
export function attachResendReceiptDoor(router,{raw,receipts,reconcile,notices=null}) {
 if(notices!==null&&typeof notices?.receive!=='function')fail();
 // Mount BEFORE global body parsing, using express.raw; reject compressed requests.
 const parse=raw({type:'application/json',inflate:false,limit:'64kb'});
 router.post('/api/webhooks/early-access/quote-delivery',(req,res,next)=>{
   if(!req.is('application/json'))return res.status(415).end();
   parse(req,res,err=>err?res.status(err.status===413?413:400).end():next());
 },async(req,res)=>{
  res.set('Cache-Control','no-store');
  const result=await receipts.receive(req.body,req.rawHeaders,reconcile);
  // One endpoint: an event the quote channel verified but did not claim goes to the
  // customer-notice channel, which verifies the same bytes and matches by provider id only.
  if(result.status===204&&result.unclaimed===true&&notices){
   let next;try{next=await notices.receive(req.body,req.rawHeaders);}catch{next={status:503};}
   return res.status([204,400,409,503].includes(next?.status)?next.status:503).end();
  }
  return res.status(result.status).end();
 });
}
