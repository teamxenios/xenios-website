import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
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
  return <CatalogAdmissionGate key={sessionEpoch} api={api}>{children}</CatalogAdmissionGate>;
}

export function CatalogAdmissionGate({
  api, children, recheckOnRestore = false,
}: Pick<Props, "api" | "children"> & { recheckOnRestore?: boolean }) {
  const [attempt, retry] = useState(0);
  const [view, setView] = useState<CatalogAdmissionView | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "saving" | "error">("checking");
  const scope = useRef<AbortController | null>(null);

  useEffect(() => {
    function hide() {
      scope.current?.abort();
      setPhase("checking");
    }

    function check() {
      hide();
      if (recheckOnRestore && document.visibilityState === "hidden") return;
      const controller = new AbortController();
      scope.current = controller;
      void api.status(controller.signal).then(result => {
        if (controller.signal.aborted) return;
        if (!valid(result)) {
          setPhase("error");
          return;
        }
        setView(result);
        setPhase("ready");
      }, () => {
        if (!controller.signal.aborted) setPhase("error");
      });
    }

    if (recheckOnRestore) {
      document.addEventListener("visibilitychange", check);
      window.addEventListener("pagehide", hide);
      window.addEventListener("pageshow", check);
    }
    check();
    return () => {
      scope.current?.abort();
      if (recheckOnRestore) {
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("pagehide", hide);
        window.removeEventListener("pageshow", check);
      }
    };
  }, [api, attempt, recheckOnRestore]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signal = scope.current?.signal;
    if (!signal || signal.aborted || phase !== "ready" || !view || view.admitted) return;
    const data = new FormData(event.currentTarget);
    const fullLegalName = data.get("fullLegalName");
    const email = data.get("email");
    if (typeof fullLegalName !== "string" || typeof email !== "string") return;
    setPhase("saving");
    try {
      const result = await api.record({ fullLegalName, email, policyRevision: view.policyRevision }, signal);
      if (signal.aborted) return;
      if (!valid(result) || !result.admitted || result.policyRevision !== view.policyRevision) {
        setPhase("error");
        return;
      }
      setView(result);
      setPhase("ready");
    } catch {
      if (!signal.aborted) setPhase("error");
    }
  }

  if (phase === "error") {
    return <div role="alert">We couldn’t confirm your catalog access. <button type="button" onClick={() => retry(i => i + 1)}>Check again</button></div>;
  }
  if (!view) return <p role="status">Checking catalog access…</p>;
  // Keep the same owner's draft mounted while a restore is pending. A changed
  // owner/policy revision remounts the entire subtree, even if both are admitted.
  return <div key={view.policyRevision} hidden={phase === "checking"}>
    {view.admitted ? children : <ContactForm saving={phase === "saving"} onSubmit={save} />}
  </div>;
}

function ContactForm({ saving, onSubmit }: { saving: boolean; onSubmit(event: FormEvent<HTMLFormElement>): void }) {
  const staging = window.location.origin === "https://xenios-research-staging.onrender.com";
  return <form onSubmit={onSubmit} aria-label="Contact information for catalog access"
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
    <button disabled={saving} type="submit">{saving?"Saving…":"View catalog"}</button>
  </form>;
}
