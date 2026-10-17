// Fail-closed route boundary. Never expose request paths, queries or credentials.
export function sanitizedOrigin(raw) {
  try {
    const u=new URL(raw);
    if(!['http:','https:'].includes(u.protocol)) return 'non-http-origin';
    return u.origin.length<=256?u.origin:'oversized-origin';
  } catch {return 'invalid-origin';}
}
export function failureCode(error) {
  return /^[A-Z0-9_]{1,80}$/.test(error?.message??'')?error.message:'NETWORK_CHECK_FAILED';
}
export async function guardedRoute(route,{targetOrigin,isFailed,onFailure,onAllowed,onDenied=()=>{}}) {
  const report=(code,info)=>{try {onFailure(code,info);} catch {}};
  const deny=async(code,info)=>{
    if(code) report(code,info);
    try {onDenied(route);} catch(e) {report(failureCode(e));}
    try {await route.abort();} catch {}
  };
  try {
    if(isFailed()) {await deny();return;}
    const req=route.request(),u=new URL(req.url());
    if(u.protocol==='data:') {await route.continue();return;}
    if(u.origin!==targetOrigin) {await deny('OFF_ORIGIN_TRAFFIC',{url:req.url()});return;}
    await onAllowed(route,req,u);
  } catch(e) {await deny(failureCode(e));}
}
export function trackedRoute(promise,tasks,onFailure) {
  const handled=Promise.resolve(promise).catch(()=>{
    try {onFailure('NETWORK_HANDLER_FAILED');} catch {}
  });
  tasks.add(handled);
  void handled.then(()=>tasks.delete(handled));
  return handled;
}
