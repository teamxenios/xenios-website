// This module never fetches unless dispatch explicitly invokes an enabled transport.
export const TEAM='team@xeniostechnology.com';
export const PORTAL='https://xeniostechnology.com/earlyaccess/quotes';
export function verifiedAddress(e) {
  // One normalized, printable ASCII mailbox. Unusual RFC forms require manual handling.
  return typeof e==='string' && e.length<=254 && /^[a-z0-9._+%-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(e);
}
export function notice(to) {
  return noticeWithPortal(to, PORTAL);
}

function noticeWithPortal(to, portal) {
  if(!verifiedAddress(to))throw Error('No verified delivery address.');
  return {from:'Team Xenios <'+TEAM+'>',reply_to:TEAM,to:[to],subject:'A private update from Team Xenios',
    text:'You have a private update from Team Xenios. Open the secure portal using the same verified access used for your request: '+portal+
    '\n\nIf you need help accessing the portal, reply to this email. Please do not email personal health information.'};
}

function portalForOrigin(origin) {
  if (origin === undefined) return PORTAL;
  if (typeof origin !== 'string') return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || (origin !== url.origin && origin !== url.origin + '/')) return null;
    return new URL('/earlyaccess/quotes', url).href;
  } catch {
    return null;
  }
}

export function resendTransport({enabled=false,apiKey,verifiedSender,verifiedReplyTo,portalVerified=false,portalOrigin,fetchImpl=globalThis.fetch}) {
  // The composition owner supplies a verified deployment origin, independently of the request.
  const portal = portalForOrigin(portalOrigin);
  function ready(){return enabled===true && portalVerified===true && portal!==null && verifiedSender===TEAM && verifiedReplyTo===TEAM && typeof apiKey==='string' && apiKey.trim().length>0;}
  return {ready, async send(idempotencyKey,to){
    if(!ready()||!/^qd-[a-f0-9]{64}$/.test(idempotencyKey))throw Error('Quote transport is not enabled.');
    const body=noticeWithPortal(to, portal);
    const r=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',
      signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+apiKey,'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(body)});
    if(!r.ok)throw Error('Quote transport did not confirm acceptance.');
    const data=await r.json(); if(typeof data?.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(data.id))throw Error('No provider receipt.');
    return data.id;
  }};
}
