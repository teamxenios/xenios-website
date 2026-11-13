import { useEffect, useState, type ReactNode, type FormEvent } from "react";
export type CatalogAdmissionView = Readonly<{admitted: boolean;policyRevision:string}>;
type Input = Readonly<{fullLegalName:string;email:string;policyRevision:string}>;
export type CatalogAdmissionApi = Readonly<{
  status(signal:AbortSignal):Promise<CatalogAdmissionView>;
  record(contact:Input,signal:AbortSignal):Promise<CatalogAdmissionView>;
}>;
type Props = Readonly<{sessionEpoch:string;api:CatalogAdmissionApi;children:ReactNode}>;
function valid(v: CatalogAdmissionView) {
  return !!v && typeof v.admitted==="boolean" && typeof v.policyRevision==="string" && /^[a-f0-9]{64}$/.test(v.policyRevision);
}
/** Mount only after current waiver acceptance. sessionEpoch is a NON-SECRET render epoch
 * changed by the owner on principal change/logout; never use the actual session token. */
export function PreCatalogContact({sessionEpoch,api,children}:Props) {
  if(!sessionEpoch) return <p role="status">Sign in again to view the catalog.</p>;
  return <Gate key={sessionEpoch} api={api}>{children}</Gate>;
}
function Gate({api,children}: Pick<Props,"api"|"children">) {
  const [cycle,retry]=useState(0);
  const [state,set]=useState<"checking"|"form"|"saving"|"done"|"error">("checking");
  const [revision,setRevision]=useState("");
  const [scope,setScope]=useState<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setScope(controller);set("checking");
    void api.status(controller.signal).then(v=>{
      if(controller.signal.aborted)return;
      if(!valid(v)){set("error");return}
      setRevision(v.policyRevision);set(v.admitted?"done":"form");
    },()=>{if(!controller.signal.aborted)set("error")});
    return ()=>controller.abort();
  },[api,cycle]);
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!scope||scope.signal.aborted||state!=="form")return;
    const form=e.currentTarget;const data=new FormData(form);
    const fullLegalName=data.get("fullLegalName"),email=data.get("email");
    if(typeof fullLegalName!=="string"||typeof email!=="string")return;
    set("saving");
    try {
      const result=await api.record({fullLegalName,email,policyRevision:revision},scope.signal);
      if(scope.signal.aborted)return;
      if(!valid(result)||!result.admitted||result.policyRevision!==revision){set("error");return}
      set("done");
    } catch {if(!scope.signal.aborted)set("error")}
  }
  if(state==="done") return <>{children}</>;
  if(state==="error") return <div role="alert">We couldn’t confirm your catalog access. <button type="button" onClick={()=>{set("checking");retry(i=>i+1)}}>Check again</button></div>;
  if(state==="checking") return <p role="status">Checking catalog access…</p>;
  const staging = window.location.origin === "https://xenios-research-staging.onrender.com";
  return <form onSubmit={save} aria-label="Contact information for catalog access"
    aria-describedby={staging ? "staging-catalog-contact-notice" : undefined}>
    <h2>Before you view the catalog</h2>
    <p>Enter your name and email to continue. You can select items and request a private quote.</p>
    {staging && <p id="staging-catalog-contact-notice">
      For this staging test, we use your name and work email to give you catalog access.
      This temporary record expires after two hours. A cleanup job removes expired records every five minutes.
      If you submit a request, its contact details are stored separately with that request.
    </p>}
    <label>Full name<input name="fullLegalName" autoComplete="name" maxLength={200} required/></label>
    <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required/></label>
    <button disabled={state==="saving"} type="submit">{state==="saving"?"Saving…":"View catalog"}</button>
  </form>;
}
