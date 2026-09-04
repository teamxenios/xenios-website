import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { REFERRAL_DESTINATIONS, safeReferralDestination, type RecommendationLink, type RecommendationLinks } from "@shared/research/referral-v1";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { createRecommendationLink, listRecommendationLinks, recommendationError, revokeRecommendationLink } from "../../recommendation/api";
import { copyRecommendation, safeRecommendationUrl, shareOutcomeMessage, shareRecommendation } from "../../recommendation/share";

const touch = { minHeight: 44 };
const stateLabels = { ready: "Active", revoked: "Revoked", expired: "Expired", partner_inactive: "Partner inactive", unavailable: "Unavailable" };
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString() : "Unavailable";
const count = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : "Unavailable";
export function isRecommendationLink(value: unknown): value is RecommendationLink {
  if (!value || typeof value !== "object") return false;
  const row = value as RecommendationLink;
  return typeof row.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.id)
    && typeof row.state === "string" && Object.hasOwn(stateLabels, row.state)
    && safeReferralDestination(row.destinationPath) !== null
    && (row.url === null || typeof row.url === "string")
    && typeof row.createdAt === "string" && typeof row.expiresAt === "string"
    && (row.revokedAt === null || typeof row.revokedAt === "string");
}

/** Keyed by the principal at the composition boundary: old reads cannot cross accounts. */
export function RecommendationLinksBody({ token }: { token: string }) {
  const [data, setData] = useState<RecommendationLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [destination, setDestination] = useState<string>("/health");
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<Record<string, string>>({});
  const keys = useRef(new Map<string, string>());
  const alive = useRef(true);
  const generation = useRef(0);
  const mutation = useRef(false);

  const refresh = async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const result = await listRecommendationLinks(token);
    if (!alive.current || current !== generation.current) return;
    setLoading(false);
    if (result.kind === "error") {
      setData(null);
      setError(recommendationError(result));
    } else if (typeof result.data.eligible !== "boolean" || !Array.isArray(result.data.links)
      || !result.data.links.every(isRecommendationLink)) {
      setData(null);
      setError("Your links could not be read safely. Refresh or contact support.");
    } else setData(result.data);
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; generation.current++; };
  }, [token]);

  const mutate = async (id?: string) => {
    if (mutation.current || loading || !data?.eligible) return;
    if (id && !data.links.some(link => link.id === id && link.state === "ready")) return;
    const intent = id ? `revoke:${id}` : `create:${destination}`;
    let key = keys.current.get(intent);
    if (!key) {
      try { key = crypto.randomUUID(); }
      catch { setError("This browser cannot safely start the request. Use an updated browser or contact support."); return; }
      keys.current.set(intent, key);
    }
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const result = id ? await revokeRecommendationLink(token, id, key)
      : await createRecommendationLink(token, destination, key);
    mutation.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (result.kind === "error") { setError(recommendationError(result)); return; }
    if (!isRecommendationLink(result.data.link) || (id && (result.data.link.id !== id || result.data.link.state !== "revoked"))) {
      setError("We could not confirm the updated link. Retry the same action to check it safely.");
      return;
    }
    keys.current.delete(intent);
    setRevokeId(null);
    setNotice(id ? "Link revoked. New recipients cannot use it. Previously recorded referrals are unchanged." : result.data.link.state === "ready" ? "Your recommendation link is ready to share." : "The earlier request was confirmed. This link is no longer active.");
    await refresh();
  };

  const share = async (link: RecommendationLink, native: boolean) => {
    const outcome = native ? await shareRecommendation(link.url) : await copyRecommendation(link.url);
    if (alive.current) setShareStatus(previous => ({ ...previous, [link.id]: shareOutcomeMessage(outcome) }));
  };

  return <div className="grid gap-6" style={{ minWidth: 0 }}>
    {loading && <p role="status">Checking your referral access…</p>}
    {error && <div role="alert" className="card"><p>{error}</p><button type="button" className="btn btn-secondary mt-3" style={touch} disabled={loading || busy} onClick={() => void refresh()}>Refresh links</button></div>}
    {notice && <p role="status" aria-live="polite">{notice}</p>}
    {!loading && data && !data.eligible && <div className="card"><h2 className="body-l">Referral access is not active</h2><p className="body-s mt-2">This account cannot issue referral links. Opening this page does not enroll you as an affiliate. Contact support if you believe your access should be active.</p></div>}
    {data?.eligible && <>
      <section className="card" aria-labelledby="recommendation-create-title" style={{ minWidth: 0 }}>
        <p className="mono-label text-ink-mute">A helpful introduction</p>
        <h2 id="recommendation-create-title" className="body-l mt-2">Create a recommendation</h2>
        <p className="body-s text-ink-2 mt-2">Choose where the recipient starts. They will see context before choosing to continue.</p>
        <label htmlFor="recommendation-destination" className="body-s block mt-4">Where should this link lead?</label>
        <select id="recommendation-destination" value={destination} disabled={busy} onChange={event => setDestination(event.target.value)} style={{ ...touch, width: "100%", minWidth: 0, fontSize: 16 }} className="mt-2">
          {REFERRAL_DESTINATIONS.map(item => <option key={item.path} value={item.path}>{item.label}</option>)}
        </select>
        <button type="button" className="btn btn-primary mt-4" style={touch} disabled={loading || busy} onClick={() => void mutate()}>{busy && !revokeId ? "Creating…" : "Create recommendation link"}</button>
      </section>
      <section aria-labelledby="recommendation-links-title" style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="recommendation-links-title" className="body-l">Your recommendation links</h2><button type="button" className="btn btn-ghost" style={touch} disabled={loading || busy} onClick={() => void refresh()}>Refresh</button></div>
        {data.links.length === 0 && <p className="body-s text-ink-2 mt-3">You have no recommendation links yet. Create one above when you are ready.</p>}
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", minWidth: 0 }}>
          {data.links.map(link => {
            const url = link.state === "ready" ? safeRecommendationUrl(link.url) : null;
            return <article key={link.id} className="card" style={{ minWidth: 0 }}>
              <p className="mono-label">{stateLabels[link.state]}</p>
              <h3 className="body-m mt-2">{REFERRAL_DESTINATIONS.find(item => item.path === link.destinationPath)?.label ?? "Research product"}</h3>
              <p className="body-s text-ink-mute mt-2">Created {date(link.createdAt)} · Expires {date(link.expiresAt)}</p>
              {link.revokedAt && <p className="body-s text-ink-mute">Revoked {date(link.revokedAt)}</p>}
              <dl className="body-s grid gap-2 mt-3"><div><dt className="inline">Recorded opens: </dt><dd className="inline">{count(link.opens)}</dd></div><div><dt className="inline">Accounts linked: </dt><dd className="inline">{count(link.accountsLinked)}</dd></div></dl>
              {url ? <>
                <label className="body-s block mt-4" htmlFor={`recommendation-url-${link.id}`}>Shareable link</label>
                <input id={`recommendation-url-${link.id}`} readOnly value={url} onFocus={event => event.target.select()} style={{ ...touch, width: "100%", minWidth: 0, fontSize: 16 }} />
                <div className="flex flex-wrap gap-3 mt-3"><button type="button" className="btn btn-secondary" style={touch} disabled={busy || loading} onClick={() => void share(link, false)}>Copy link</button><button type="button" className="btn btn-secondary" style={touch} disabled={busy || loading} onClick={() => void share(link, true)}>Share</button></div>
              </> : <p className="body-s mt-3">This link is not available to share.</p>}
              {shareStatus[link.id] && <p className="body-s mt-3" role="status" aria-live="polite">{shareStatus[link.id]}</p>}
              {link.state === "ready" && (revokeId === link.id ? <div className="mt-4"><p className="body-s">Revoke this link? New recipients will not be able to use it. Existing attribution is not removed.</p><div className="flex flex-wrap gap-3 mt-3"><button type="button" className="btn btn-secondary" style={touch} disabled={busy || loading} onClick={() => void mutate(link.id)}>{busy ? "Revoking…" : "Confirm revoke"}</button><button type="button" className="btn btn-ghost" style={touch} disabled={busy} onClick={() => setRevokeId(null)}>Keep link</button></div></div>
                : <button type="button" className="btn btn-ghost mt-3" style={touch} disabled={busy || loading} onClick={() => setRevokeId(link.id)}>Revoke link</button>)}
            </article>;
          })}
        </div>
      </section>
    </>}
    <section className="card" aria-labelledby="recommendation-rules-title"><h2 id="recommendation-rules-title" className="body-m">What a recommendation means</h2><p className="body-s text-ink-2 mt-2">These are aggregate referral records, not recipient identities. An open or linked account does not mean an order, payment, clinical relationship, or earned commission.</p><p className="body-s text-ink-2 mt-2">Share only approved content and disclose your partner relationship in the message itself. Do not make medical, income, or recruitment claims.</p><div className="flex flex-wrap gap-3 mt-3"><Link href={PARTNER_ROUTES.compliance} className="btn btn-ghost" style={touch}>Sharing rules</Link><Link href={PARTNER_ROUTES.support} className="btn btn-ghost" style={touch}>Get support</Link></div></section>
  </div>;
}

export default function Links() {
  const { memberToken } = useResearch();
  return <ResearchPartnerShell title="Referral links" lead="Make a clear, thoughtful introduction to Xenios. Manage your own links and see the status the system can verify.">
    {memberToken ? <RecommendationLinksBody key={memberToken} token={memberToken} /> : <div className="card"><h2 className="body-l">Sign in to manage your links</h2><p className="body-s mt-2">Referral access is checked for your account. Signing in does not enroll you as an affiliate.</p><Link href={researchAuthPath("/research/sign-in", PARTNER_ROUTES.links)} className="btn btn-primary mt-3" style={touch}>Sign in</Link></div>}
  </ResearchPartnerShell>;
}
