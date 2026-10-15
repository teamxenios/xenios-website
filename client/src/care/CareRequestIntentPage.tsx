import { useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { careApiFetch } from "./api";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { createRequestIntentApi } from "../research/assisted-order/request-intent-api";
import { RequestIntentStaffReadback } from "../research/assisted-order/RequestIntentStaffReadback";

export const CARE_REQUEST_INTENT_PATH = "/care/request-intents";

/** Existing Care shell and canonical token transport, not the general admin
 * queue. Server Care permission and private DB role checks remain authoritative.
 */
export default function CareRequestIntentPage() {
  const [session, setSession] = useState({ checked: false, present: false, epoch: 0 });
  const api = useMemo(() => createRequestIntentApi(() => null, careApiFetch), []);
  useEffect(() => {
    let current = true, dispose: (() => void) | undefined;
    void getSupabaseBrowser().then(async (client) => {
      if (!current) return;
      if (!client) { setSession({ checked: true, present: false, epoch: 0 }); return; }
      let revision = 0;
      const update = (token: string | undefined) => {
        if (current) setSession((prior) => ({ checked: true,
          present: !!token && !isRecoveryAccessToken(token), epoch: prior.epoch + 1 }));
      };
      const { data } = client.auth.onAuthStateChange((_event, value) => {
        revision += 1; update(value?.access_token);
      });
      dispose = () => data.subscription.unsubscribe();
      const observedRevision = revision;
      const result = await client.auth.getSession();
      if (revision === observedRevision) update(result.data.session?.access_token);
    }).catch(() => { if (current) setSession({ checked: true, present: false, epoch: 0 }); });
    return () => { current = false; dispose?.(); };
  }, []);
  return <PageShell><SeoHead title="Private request review, xenios"
    description="Authorized private readback of unapproved product requests." path={CARE_REQUEST_INTENT_PATH} robots="noindex, nofollow" />
    <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
      <p className="mono-cap text-pulse mb-6">CARE | PRIVATE REQUESTS</p>
      {!session.checked ? <p role="status">Checking your session...</p>
        : !session.present ? <section><h1>Authorized Care sign-in required</h1>
          <p>A website admin account alone does not grant clinical request access.</p>
          <a href={researchAuthPath("/research/sign-in", CARE_REQUEST_INTENT_PATH)} className="btn btn-primary">Sign in securely</a></section>
        : <RequestIntentStaffReadback key={session.epoch} api={api} />}
    </div></PageShell>;
}
