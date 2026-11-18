import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { careApiFetch } from "./api";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { createRequestIntentApi, type RequestIntentApi } from "../research/assisted-order/request-intent-api";
import { RequestIntentStaffReadback } from "../research/assisted-order/RequestIntentStaffReadback";
import { createStaffReviewCommandJournal, type StaffReviewCommandJournal } from "../research/assisted-order/StaffStartReviewControl";

export const CARE_REQUEST_INTENT_PATH = "/care/request-intents";

type SessionIdentity = Readonly<{ subject: string; sessionId: string; key: string }>;
type ReviewLifetime = {
  identity: SessionIdentity; instance: object; journal: StaffReviewCommandJournal;
  epoch: number; revoked: boolean;
};
type PageBinding = { lifetime: ReviewLifetime; active: boolean; matchesCredential: (token: string) => boolean };
type PageSession = Readonly<{ checked: boolean; binding: PageBinding | null }>;

// Browser-memory command coordination, not an Auth store or staff permission.
// Keep the same journal across page/child remounts, never tokens or persistence.
let reviewLifetime: ReviewLifetime | null = null;
let nextEpoch = 0;
const closedSessions = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionIdentity(session: Session | null): SessionIdentity | null {
  try {
    if (!session?.access_token || session.access_token.length > 65_536
      || !uuid.test(session.user?.id ?? "")) return null;
    const payload = session.access_token.split(".")[1];
    if (!payload || payload.length > 16_384) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims: unknown = JSON.parse(globalThis.atob(padded));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const { sub, session_id: sessionId } = claims as { sub?: unknown; session_id?: unknown };
    if (typeof sub !== "string" || typeof sessionId !== "string" || !uuid.test(sessionId)
      || sub.toLowerCase() !== session.user.id.toLowerCase()) return null;
    // Claims only partition local state. The server verifies the JWT, current
    // AAL2, roles, capabilities, scope and revision for every command.
    return { subject: sub.toLowerCase(), sessionId: sessionId.toLowerCase(),
      key: sub.toLowerCase() + ":" + sessionId.toLowerCase() };
  } catch { return null; }
}

function closeLifetime(identity?: SessionIdentity | null) {
  if (identity) closedSessions.add(identity.key);
  if (reviewLifetime) {
    reviewLifetime.revoked = true;
    closedSessions.add(reviewLifetime.identity.key);
    reviewLifetime = null;
  }
}

function lifetimeFor(identity: SessionIdentity): ReviewLifetime | null {
  if (closedSessions.has(identity.key)) return null;
  if (reviewLifetime && reviewLifetime.identity.key !== identity.key) closeLifetime();
  if (!reviewLifetime) {
    const instance = Object.freeze({});
    reviewLifetime = { identity, instance, journal: createStaffReviewCommandJournal(instance),
      epoch: ++nextEpoch, revoked: false };
  }
  return reviewLifetime;
}

/** Existing Care shell and canonical SDK transport. Client coordination only
 * narrows requests; it cannot authorize a staff read or processing command.
 */
export default function CareRequestIntentPage() {
  const [session, setSession] = useState<PageSession>({ checked: false, binding: null });
  const bindingRef = useRef<PageBinding | null>(null);
  const api = useMemo<RequestIntentApi | null>(() => {
    const binding = session.binding;
    if (!binding) return null;
    const isCurrent = () => binding.active && bindingRef.current === binding
      && reviewLifetime === binding.lifetime && !binding.lifetime.revoked;
    const transport = (path: string, init: RequestInit) => careApiFetch(path, init, (actual) =>
      isCurrent() && actual !== null && binding.matchesCredential(actual.access_token)
      && sessionIdentity(actual)?.key === binding.lifetime.identity.key);
    const source = createRequestIntentApi(() => null, transport);
    async function scoped<T>(operation: () => Promise<T>): Promise<T> {
      if (!isCurrent()) throw new Error("The current review session could not be confirmed.");
      const result = await operation();
      if (!isCurrent()) throw new Error("The current review session could not be confirmed.");
      return result;
    }
    return {
      config: () => scoped(source.config), catalog: (query) => scoped(() => source.catalog(query)),
      submit: (input) => scoped(() => source.submit(input)), recover: (key) => scoped(() => source.recover(key)),
      staff: (id) => scoped(() => source.staff(id)), staffQueue: (page) => scoped(() => source.staffQueue(page)),
      workflow: (id) => scoped(() => source.workflow!(id)), staffWorkflow: (id) => scoped(() => source.staffWorkflow!(id)),
      startReview: (id, command) => scoped(() => source.startReview!(id, command)),
    };
  }, [session.binding]);
  useEffect(() => {
    let current = true, dispose: (() => void) | undefined;
    let revision = 0, initial = true;
    const display = (lifetime: ReviewLifetime | null, observedToken?: string) => {
      if (!current) return;
      if (bindingRef.current) bindingRef.current.active = false;
      // An exact SDK-token comparison lives only in this transient binding.
      // The reusable journal/lifetime never stores or exposes credentials.
      const binding = lifetime && observedToken ? { lifetime, active: true,
        matchesCredential: (token: string) => token === observedToken } : null;
      // Revoke old callbacks synchronously, before React updates the screen.
      bindingRef.current = binding;
      setSession({ checked: true, binding });
    };
    const observe = (event: string, value: Session | null) => {
      if (!current || (event === "INITIAL_SESSION" && !initial)) return;
      const bootstrap = initial;
      initial = false;
      const identity = sessionIdentity(value);
      if (event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" || !value
        || !identity || isRecoveryAccessToken(value.access_token)) {
        closeLifetime(event === "PASSWORD_RECOVERY" || value && isRecoveryAccessToken(value.access_token) ? identity : null);
        display(null); return;
      }
      const same = reviewLifetime?.identity.key === identity.key && !reviewLifetime.revoked;
      // Token/user/MFA refresh may retain an established session, never
      // replace an identity or resurrect a signed-out workspace.
      if (!same && event !== "SIGNED_IN" && !bootstrap) {
        closeLifetime(); display(null); return;
      }
      display(lifetimeFor(identity), value.access_token);
    };
    void getSupabaseBrowser().then(async (client) => {
      if (!current) return;
      if (!client) { display(null); return; }
      const { data } = client.auth.onAuthStateChange((event, value) => {
        revision += 1; observe(event, value);
      });
      dispose = () => data.subscription.unsubscribe();
      const observed = revision;
      const result = await client.auth.getSession();
      if (current && revision === observed && initial) observe("INITIAL_SESSION", result.data.session);
    }).catch(() => { if (current) display(null); });
    return () => {
      current = false; dispose?.();
      if (bindingRef.current) bindingRef.current.active = false;
      bindingRef.current = null;
    };
  }, []);
  const lifetime = session.binding?.lifetime;
  return <PageShell><SeoHead title="Private request review, xenios"
    description="Authorized private readback of unapproved product requests." path={CARE_REQUEST_INTENT_PATH} robots="noindex, nofollow" />
    <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
      <p className="mono-cap text-pulse mb-6">CARE | PRIVATE REQUESTS</p>
      {!session.checked ? <p role="status">Checking your session...</p>
        : !lifetime || !api ? <section><h1>Authorized Care sign-in required</h1>
          <p>An ordinary account session must be confirmed. A website admin account alone does not grant clinical request access.</p>
          <a href={researchAuthPath("/research/sign-in", CARE_REQUEST_INTENT_PATH)} className="btn btn-primary">Sign in securely</a></section>
        : <RequestIntentStaffReadback key={lifetime.epoch} api={api}
          reviewSession={{ sessionInstance: lifetime.instance, journal: lifetime.journal }} />}
    </div></PageShell>;
}
