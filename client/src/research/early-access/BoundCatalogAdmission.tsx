import {useEffect,useMemo,useState,type ReactNode} from "react";
import {PreCatalogContact,type CatalogAdmissionApi} from "./PreCatalogContact";
/** Re-bind after a background/restore boundary. A guest literal or expiry timestamp
 * is never an identity: this challenge is derived from the authenticated owner and policy. */
export function BoundCatalogAdmission({api,children}:{api:CatalogAdmissionApi;children:ReactNode}) {
 const [visible,setVisible]=useState(false),[epoch,setEpoch]=useState(""),[failed,setFailed]=useState(false),[reload,refresh]=useState(0);
 useEffect(()=>{
  let pending:AbortController|null=null;let live=true;
  function hide(){pending?.abort();setVisible(false);setFailed(false)}
  function check(){
   hide();if(document.visibilityState==="hidden")return;
   const c=new AbortController();pending=c;
   void api.status(c.signal).then(v=>{if(live&&!c.signal.aborted&&/^[a-f0-9]{64}$/.test(v.policyRevision)){setEpoch(v.policyRevision);setVisible(true);}
    else if(live&&!c.signal.aborted)setFailed(true)},()=>{if(live&&!c.signal.aborted)setFailed(true)});
  }
  const changed=()=>document.visibilityState==="hidden"?hide():check();
  document.addEventListener("visibilitychange",changed);window.addEventListener("pageshow",check);window.addEventListener("pagehide",hide);check();
  return ()=>{live=false;pending?.abort();document.removeEventListener("visibilitychange",changed);window.removeEventListener("pageshow",check);window.removeEventListener("pagehide",hide)};
 },[api,reload]);
 const bound=useMemo<CatalogAdmissionApi>(()=>({
   status:async sig=>{const r=await api.status(sig);if(r.policyRevision!==epoch)throw Error("visitor changed");return r},
   record:async (v,sig)=>{if(v.policyRevision!==epoch)throw Error("visitor changed");const r=await api.record(v,sig);if(r.policyRevision!==epoch)throw Error("visitor changed");return r},
 }),[api,epoch]);
 if(failed)return <p role="alert">Catalog access could not be confirmed. <button type="button" onClick={()=>refresh(i=>i+1)}>Check again</button></p>;
 if(!epoch)return <p role="status">Checking your catalog access…</p>;
 return <div hidden={!visible}><PreCatalogContact sessionEpoch={epoch} api={bound}>{children}</PreCatalogContact></div>;
}
