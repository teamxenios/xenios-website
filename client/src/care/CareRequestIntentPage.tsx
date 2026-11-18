import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { careApiFetch } from "./api";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { createRequestIntentApi } from "../research/assisted-order/request-intent-api";
import { RequestIntentStaffReadback } from "../research/assisted-order/RequestIntentStaffReadback";
import { StaffSessionAssurance } from "./StaffSessionAssurance";

export const CARE_REQUEST_INTENT_PATH = "/care/request-intents";

/** Existing Care shell and canonical token transport, not the general admin
 * queue. Server Care permission and private DB role checks remain authoritative.
 */
export default function CareRequestIntentPage() {
  const [session, setSession] = useState({ checked: false, subject: null as string | null,
    epoch: 0, credentialRevision: 0 });
  // Refresh reads with the canonical transport without discarding this person's
  // workspace/drafts when the SDK rotates a token (including MFA verification).
  const api = useMemo(() => createRequestIntentApi(() => null, careApiFetch), [session.credentialRevision]);
  const onVerified = useCallback(() => {
    setSession((prior) => prior.subject === session.subject && prior.subject
      ? { ...prior, credentialRevision: prior.credentialRevision + 1 } : prior);
  }, [session.subject]);
  const onSessionInvalid = useCallback(() => {
    setSession((prior) => prior.subject === session.subject && prior.subject
      ? { ...prior, subject: null, epoch: prior.epoch + 1 } : prior);
  }, [session.subject]);
  useEffect(() => {
    let current = true, dispose: (() => void) | undefined;
    void getSupabaseBrowser().then(async (client) => {
      if (!current) return;
      if (!client) { setSession((prior) => ({ ...prior, checked: true, subject: null })); return; }
      let revision = 0;
      let recoveryPurpose = false;
      const update = (value: Session | null, event?: string) => {
        const candidate = event !== "SIGNED_OUT" && !recoveryPurpose && value?.access_token && !isRecoveryAccessToken(value.access_token)
          && value.user?.id ? value.user.id : null;
        if (current) setSession((prior) => {
          // Credential rotation cannot establish another identity or resurrect a
          // signed-out view if an earlier MFA request resolves late in the SDK.
          const mayEstablish = !event || event === "SIGNED_IN" || (event === "INITIAL_SESSION" && !prior.checked);
          const subject = mayEstablish || candidate === prior.subject ? candidate : null;
          return { checked: true, subject, epoch: prior.epoch + (prior.subject !== subject ? 1 : 0),
            credentialRevision: prior.credentialRevision + 1 };
        });
      };
      const { data } = client.auth.onAuthStateChange((event, value) => {
        revision += 1;
        if (event === "PASSWORD_RECOVERY") recoveryPurpose = true;
        else if (event === "SIGNED_IN") recoveryPurpose = false;
        update(value, event);
      });
      dispose = () => data.subscription.unsubscribe();
      const observedRevision = revision;
      try {
        const result = await client.auth.getSession();
        if (revision === observedRevision) update(result.error ? null : result.data.session);
      } catch { if (revision === observedRevision) update(null); }
    }).catch(() => { if (current) setSession((prior) => ({ checked: true, subject: null,
      epoch: prior.epoch + 1, credentialRevision: prior.credentialRevision + 1 })); });
    return () => { current = false; dispose?.(); };
  }, []);
  return <PageShell><SeoHead title="Private request review, xenios"
    description="Authorized private readback of unapproved product requests." path={CARE_REQUEST_INTENT_PATH} robots="noindex, nofollow" />
    <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
      <p className="mono-cap text-pulse mb-6">CARE | PRIVATE REQUESTS</p>
      {!session.checked ? <p role="status">Checking your session...</p>
        : !session.subject ? <section><h1>Authorized Care sign-in required</h1>
          <p>A website admin account alone does not grant clinical request access.</p>
          <a href={researchAuthPath("/research/sign-in", CARE_REQUEST_INTENT_PATH)} className="btn btn-primary">Sign in securely</a></section>
        : <div key={session.epoch}>
          <StaffSessionAssurance subjectId={session.subject} credentialRevision={session.credentialRevision}
            onVerified={onVerified} onSessionInvalid={onSessionInvalid} />
          <RequestIntentStaffReadback api={api} />
        </div>}
    </div></PageShell>;
}
