// Scoped exclusively to Resend delivery notices for this channel. No mail is sent here.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {TEAM,verifiedAddress} from './mail.mjs';
const allowed=new Map([['email.sent','accepted'],['email.delivered','delivered'],['email.bounced','bounced']]);
const cleanId=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
const fail=()=>{throw Error('Invalid provider event.');};
const b64=s=>typeof s==='string' && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && Buffer.from(s,'base64').toString('base64')===s;
const tag=(key,purpose,v)=>createHmac('sha256',key).update(JSON.stringify([purpose,v])).digest('hex');
// Pass an array of operator-approved endpoint secrets for bounded key overlap.
// Signed message id/timestamp/signature come only from exactly one physical header each.
export function signedQuoteReceiptVerifier({secrets,tagKey,now=Date.now}) {
 if(!Array.isArray(secrets)||!secrets.length||secrets.length>2||!Buffer.isBuffer(tagKey)||tagKey.length<32)fail();
 const keys=secrets.map(s=>{if(typeof s!=='string'||!s.startsWith('whsec_')||!b64(s.slice(6)))fail();
   const k=Buffer.from(s.slice(6),'base64');if(k.length<16||k.length>128)fail();return k;});
 return (bytes,headers)=>{
   if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>65536||!Array.isArray(headers)||headers.length%2)fail();
   const values={};
   for(let n=0;n<headers.length;n+=2){
     const key=String(headers[n]).toLowerCase();
     if(!['svix-id','svix-timestamp','svix-signature'].includes(key))continue;
     if(Object.hasOwn(values,key)||typeof headers[n+1]!=='string')fail();values[key]=headers[n+1];
   }
   const eid=values['svix-id'],ts=values['svix-timestamp'],sig=values['svix-signature'];
   if(!cleanId(eid)||!/^\d{1,12}$/.test(ts)||!Number.isSafeInteger(Number(ts))||!Number.isFinite(now())||
      Math.abs(Math.floor(now()/1000)-Number(ts))>300||typeof sig!=='string'||sig.length>2048)fail();
   const candidates=sig.split(' ').filter(s=>s.startsWith('v1,')).map(s=>s.slice(3))
     .filter(s=>s.length===44 && b64(s)).map(s=>Buffer.from(s,'base64'));
   const signed=keys.map(k=>createHmac('sha256',k).update(eid+'.'+ts+'.','ascii').update(bytes).digest());
   if(!signed.some(mac=>candidates.some(c=>c.length===32&&timingSafeEqual(c,mac))))fail();
   const event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!event||typeof event.type!=='string')fail();
   if(!allowed.has(event.type))return null;
   const d=event.data;
   if(!uuid(d?.email_id)||typeof d.from!=='string'||!Array.isArray(d.to))fail();
   if(![TEAM,'Team Xenios <'+TEAM+'>'].includes(d.from)||d.subject!=='A private update from Team Xenios')return null;
   if(d.to.length!==1||!verifiedAddress(d.to[0]))fail();
   // Persist no headers, addresses, subject, private products, raw event or optional bounce text.
   return {eid,pid:d.email_id.toLowerCase(),kind:allowed.get(event.type),digest:createHash('sha256').update(bytes).digest('hex'),addressTag:tag(tagKey,'resend-recipient',d.to[0])};
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
  if(!e)return {status:204};
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
export function attachResendReceiptDoor(router,{raw,receipts,reconcile}) {
 // Mount BEFORE global body parsing, using express.raw; reject compressed requests.
 const parse=raw({type:'application/json',inflate:false,limit:'64kb'});
 router.post('/api/webhooks/early-access/quote-delivery',(req,res,next)=>{
   if(!req.is('application/json'))return res.status(415).end();
   parse(req,res,err=>err?res.status(err.status===413?413:400).end():next());
 },async(req,res)=>{
  res.set('Cache-Control','no-store');
  const result=await receipts.receive(req.body,req.rawHeaders,reconcile);return res.status(result.status).end();
 });
}
