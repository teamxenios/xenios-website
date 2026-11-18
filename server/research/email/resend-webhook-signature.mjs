// Svix-signed Resend webhook verification, shared by every receipt channel.
// It authenticates the exact request bytes and parses them. It stores nothing
// and decides nothing about which message an event belongs to: each channel
// applies its own rules to the verified event. No mail is sent here.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';

const DELIVERY_KINDS=new Map([['email.sent','accepted'],['email.delivered','delivered'],['email.bounced','bounced']]);
const cleanId=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const b64=s=>typeof s==='string' && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && Buffer.from(s,'base64').toString('base64')===s;
const fail=()=>{throw Error('Invalid provider event.');};

/** The delivery kind a provider event type reports, or null for any other type. */
export function resendDeliveryKind(type){
 return DELIVERY_KINDS.get(type)??null;
}

// Pass an array of operator-approved endpoint secrets for bounded key overlap.
// Signed message id/timestamp/signature come only from exactly one physical header each.
export function resendWebhookVerifier({secrets,now=Date.now}){
 if(!Array.isArray(secrets)||!secrets.length||secrets.length>2)fail();
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
   return {eid,event,digest:createHash('sha256').update(bytes).digest('hex')};
 };
}
