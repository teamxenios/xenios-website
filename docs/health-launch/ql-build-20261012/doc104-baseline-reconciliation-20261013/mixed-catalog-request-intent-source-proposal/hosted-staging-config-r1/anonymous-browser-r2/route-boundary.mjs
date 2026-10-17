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

// Bounds actual network forwarding, not the browser's parallel request arrival.
// The caller retains total-request/POST limits and all policy assertions.
export function createForwardingQueue({capacity,maxPending,timeoutMs,deadlineAt=Infinity}) {
  if(!Number.isInteger(capacity)||capacity<1||capacity>8
    ||!Number.isInteger(maxPending)||maxPending<1||maxPending>400
    ||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>10000) throw Error('INFLIGHT_QUEUE_LIMITS');
  const pending=[];
  let active=0,peakActive=0,peakPending=0,closed=null;
  function cancel(code='FORWARDING_CANCELLED') {
    if(closed!==null)return;
    closed=code;
    for(const waiter of pending.splice(0)) {
      clearTimeout(waiter.timer);waiter.reject(Error(code));
    }
  }
  function drain() {
    while(closed===null && active<capacity && pending.length) {
      const waiter=pending.shift();
      clearTimeout(waiter.timer);
      if(Date.now()>=waiter.until) {
        waiter.reject(Error('INFLIGHT_WAIT_TIMEOUT'));cancel('INFLIGHT_WAIT_TIMEOUT');return;
      }
      active++;peakActive=Math.max(peakActive,active);
      let released=false;
      waiter.resolve(()=>{
        if(released)return;
        released=true;active--;drain();
      });
    }
  }
  return {
    acquire({requestDeadlineAt=Infinity}={}) {
      if(closed!==null)return Promise.reject(Error(closed));
      if(pending.length>=maxPending) {
        cancel('INFLIGHT_QUEUE_LIMIT');return Promise.reject(Error('INFLIGHT_QUEUE_LIMIT'));
      }
      const until=Math.min(Date.now()+timeoutMs,deadlineAt,requestDeadlineAt);
      if(until<=Date.now()) {
        cancel('INFLIGHT_WAIT_TIMEOUT');return Promise.reject(Error('INFLIGHT_WAIT_TIMEOUT'));
      }
      return new Promise((resolve,reject)=>{
        const waiter={resolve,reject,until,timer:null};
        waiter.timer=setTimeout(()=>cancel('INFLIGHT_WAIT_TIMEOUT'),until-Date.now());
        pending.push(waiter);peakPending=Math.max(peakPending,pending.length);
        drain();
      });
    },
    cancel,
    stats:()=>({capacity,active,pending:pending.length,peakActive,peakPending,closed})
  };
}
