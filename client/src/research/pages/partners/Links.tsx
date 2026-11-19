import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { REFERRAL_DESTINATIONS, normalizeReadableReferralCode, safeReferralDestination, type RecommendationLink, type RecommendationLinks, type RecommendationReadableAlias } from "@shared/research/referral-v1";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { createRecommendationLink, listRecommendationLinks, listReadableAliases, mutateReadableAlias, readableAliasSession, recommendationError, revokeRecommendationLink, validReadableCodeCommand, type ReadableCodeCommand } from "../../recommendation/api";
import { copyRecommendation, shareOutcomeMessage, shareRecommendation } from "../../recommendation/share";
import { createRecommendationQr, safeExportRecommendation, saveRecommendationQr, type RecommendationQr } from "../../recommendation/qr-export";
import { saveRecommendationPng } from "./recommendation-png";
import RecommendationPrintCard from "../../recommendation/RecommendationPrintCard";

const touch = { minHeight: 44 };
const stateLabels = { ready: "Active", revoked: "Revoked", expired: "Expired", partner_inactive: "Partner inactive", unavailable: "Unavailable" };
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString() : "Unavailable";
const count = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : "Unavailable";
type CodeAttempt = { command: ReadableCodeCommand; state: "pending" | "uncertain"; run: symbol };
type CodeJournal = { owner: string; active: boolean; mounted: boolean; retired: boolean; attempt: CodeAttempt | null; listeners: Set<() => void> };
const newCodeJournal = (owner: string): CodeJournal => ({ owner, active: false, mounted: false, retired: false, attempt: null, listeners: new Set() });
const notifyCode = (journal: CodeJournal) => journal.listeners.forEach(listener => listener());
const readyCodeLink = (link: RecommendationLink) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(link.id) && link.state === "ready"
  && link.revokedAt === null && Number.isFinite(Date.parse(link.expiresAt)) && Date.parse(link.expiresAt) > Date.now();

/** Only a frozen command/key survives canonical checking; no bearer or Auth state. */
function ReadableCodeManagement({ token, links, journal }: { token: string; links: RecommendationLink[]; journal: CodeJournal }) {
  const [aliases, setAliases] = useState<RecommendationReadableAlias[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<{ kind: "assign" } | { kind: "reassign"; alias: RecommendationReadableAlias } | null>(null);
  const [code, setCode] = useState("");
  const [linkId, setLinkId] = useState("");
  const [reason, setReason] = useState("");
  const [, redraw] = useState(0);
  const alive = useRef(false);
  const read = useRef(0);
  const reads = useRef<AbortController | null>(null);
  const firstField = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const refreshControl = useRef<HTMLButtonElement | null>(null);
  const current = () => alive.current && journal.active && journal.mounted && !journal.retired;
  const attempt = journal.attempt;
  const ready = links.filter(readyCodeLink);
  const refresh = async () => {
    if (!current()) return;
    reads.current?.abort();
    const controller = new AbortController(); reads.current = controller;
    const version = ++read.current;
    setLoading(true); setAliases(null); setError("");
    const result = await listReadableAliases(token, { signal: controller.signal, current: () => current() && version === read.current });
    if (!current() || version !== read.current) return;
    setLoading(false);
    if (result.kind === "error") setError(recommendationError(result));
    else setAliases(result.data);
  };
  useLayoutEffect(() => {
    alive.current = true;
    const listener = () => { if (alive.current) redraw(value => value + 1); };
    journal.listeners.add(listener);
    return () => { alive.current = false; read.current++; reads.current?.abort(); journal.listeners.delete(listener); };
  }, [journal]);
  useEffect(() => { void refresh(); }, [token, journal]);
  useLayoutEffect(() => { if (form) firstField.current?.focus(); }, [form]);
  const closeForm = () => {
    setForm(null); setCode(""); setLinkId(""); setReason("");
    if (current()) (opener.current?.isConnected ? opener.current : refreshControl.current)?.focus();
  };
  const openForm = (next: NonNullable<typeof form>, control: HTMLButtonElement) => {
    if (!current() || journal.attempt || loading || !aliases) return;
    opener.current = control; setCode(next.kind === "reassign" ? next.alias.code : ""); setLinkId(""); setReason(""); setError(""); setNotice(""); setForm(next);
  };
  const execute = async (existing: CodeAttempt) => {
    if (!current() || journal.attempt !== existing || existing.state === "pending") return;
    existing.state = "pending"; existing.run = Symbol("readable-code-attempt");
    const run = existing.run;
    ++read.current; reads.current?.abort();
    setAliases(null); setLoading(false); setError(""); setNotice(""); notifyCode(journal);
    const result = await mutateReadableAlias(token, existing.command, { current });
    if (journal.retired || journal.attempt !== existing || existing.run !== run) return;
    // Completion on an old credential/frame never publishes or clears a command.
    if (!current()) { existing.state = "uncertain"; notifyCode(journal); return; }
    if (result.kind === "error" && (result.status === 0 || result.status >= 500)) {
      existing.state = "uncertain"; setError("We couldn’t confirm the code change. Retry the same change to check its result safely."); notifyCode(journal); return;
    }
    journal.attempt = null; notifyCode(journal); setForm(null);
    if (result.kind === "error") {
      setNotice(result.status === 409 ? "The code or target changed. Review the refreshed list before starting another change." : recommendationError(result));
    } else setNotice("Code change confirmed. Checking the current code list…");
    // A replay receipt may describe an earlier target. Never render it as current.
    await refresh();
    if (current()) refreshControl.current?.focus();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!current() || journal.attempt || !form || loading || !aliases) return;
    const selected = ready.find(link => link.id === linkId && !aliases.some(alias => alias.link.id === link.id));
    const normalized = normalizeReadableReferralCode(code);
    if (!selected || !normalized) { setError("Use 3–24 letters, numbers or hyphens and choose an active link."); return; }
    if (form.kind === "reassign" && !aliases.some(alias => alias.code === form.alias.code && alias.link.id === form.alias.link.id)) {
      setError("This code changed. Refresh the list before continuing."); return;
    }
    let key: string;
    try { key = crypto.randomUUID(); } catch { setError("This browser cannot safely start the change. Contact support."); return; }
    const command: ReadableCodeCommand = Object.freeze(form.kind === "assign"
      ? { kind: "assign", code: normalized, linkId: selected.id, key }
      : { kind: "reassign", code: form.alias.code, expectedLinkId: form.alias.link.id, linkId: selected.id, reason: reason.trim(), key });
    if (!validReadableCodeCommand(command)) { setError("Choose a different active link and enter a reason of 3–200 characters without control characters."); return; }
    const next: CodeAttempt = { command, state: "uncertain", run: Symbol("new-readable-code") };
    journal.attempt = next; void execute(next);
  };
  const shareAlias = async (alias: RecommendationReadableAlias, native: boolean) => {
    if (!current() || loading || journal.attempt || !readyCodeLink(alias.link)) return;
    const url = `${window.location.origin}/r/${alias.code}`;
    const result = native ? await shareRecommendation(url) : await copyRecommendation(url);
    if (current() && !journal.attempt) setNotice(shareOutcomeMessage(result));
  };
  return <section className="card" aria-labelledby="readable-codes-title" style={{ minWidth: 0 }}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="readable-codes-title" className="body-l">Your referral codes</h2>
      <button ref={refreshControl} type="button" className="btn btn-ghost" style={touch} disabled={loading || !!attempt} onClick={() => { setForm(null); void refresh(); }}>Refresh codes</button></div>
    <p className="body-s mt-2">Give an existing active link a memorable code. Moving a code is an explicit change; it does not renew or reactivate a link. Earlier referrals stay recorded.</p>
    {loading && <p role="status">Checking your referral codes…</p>}
    {error && <p role="alert" className="mt-3">{error}</p>}
    {notice && <p role="status" aria-live="polite" className="mt-3">{notice}</p>}
    {attempt ? <div className="mt-3"><p role="status">{attempt.state === "pending" ? "Confirming your code change…" : "A code change is awaiting confirmation. Its original code, target and request key are preserved."}</p>
      {attempt.state === "uncertain" && <button type="button" className="btn btn-secondary mt-3" style={touch} onClick={() => void execute(attempt)}>Retry same code change</button>}</div>
      : !loading && aliases && <>
        {aliases.length === 0 && <p className="body-s mt-3">You have no referral codes yet.</p>}
        <ul className="grid gap-4 mt-3" style={{ listStyle: "none", padding: 0 }}>{aliases.map(alias => <li key={alias.code} style={{ minWidth: 0 }}>
          <h3 className="body-m">{alias.code}</h3><p className="body-s">{alias.link.state === "ready" && Date.parse(alias.link.expiresAt) <= Date.now() ? "Expired" : stateLabels[alias.link.state]} · Assigned {date(alias.assignedAt)} · Expires {date(alias.link.expiresAt)}</p>
          <p className="body-s">Destination: {REFERRAL_DESTINATIONS.find(item => item.path === alias.link.destinationPath)?.label ?? "Research product"}</p>
          {readyCodeLink(alias.link) ? <><label className="body-s block mt-2" htmlFor={`readable-code-${alias.code}`}>Shareable code link</label>
            <input id={`readable-code-${alias.code}`} readOnly value={`${window.location.origin}/r/${alias.code}`} onFocus={event => event.target.select()} style={{ ...touch, width: "100%", minWidth: 0, fontSize: 16 }} />
            <div className="flex flex-wrap gap-3 mt-2"><button type="button" className="btn btn-secondary" style={touch} onClick={() => void shareAlias(alias, false)}>Copy code link</button>
              <button type="button" className="btn btn-secondary" style={touch} onClick={() => void shareAlias(alias, true)}>Share code link</button></div></> : <p className="body-s">This code is not available to share.</p>}
          <button type="button" className="btn btn-ghost mt-2" style={touch} disabled={!ready.some(link => !aliases.some(item => item.link.id === link.id))} onClick={event => openForm({ kind: "reassign", alias }, event.currentTarget)}>Move {alias.code} to another link</button>
        </li>)}</ul>
        {!form && <button type="button" className="btn btn-secondary mt-4" style={touch} disabled={!ready.some(link => !aliases.some(alias => alias.link.id === link.id))} onClick={event => openForm({ kind: "assign" }, event.currentTarget)}>Assign a referral code</button>}
        {ready.length === 0 && <p className="body-s mt-3">Create an active recommendation link before assigning a code.</p>}
      </>}
    {form && !attempt && !loading && aliases && <form className="mt-4" onSubmit={submit}>
      <h3 className="body-m">{form.kind === "assign" ? "Assign a code" : `Move ${form.alias.code}`}</h3>
      {form.kind === "assign" && <><label htmlFor="readable-code-input" className="body-s block mt-3">Referral code</label><input ref={element => { firstField.current = element; }} id="readable-code-input" value={code} maxLength={24} autoComplete="off" spellCheck={false} onChange={event => setCode(event.target.value)} style={{ ...touch, width: "100%", fontSize: 16 }} aria-describedby="readable-code-help" /><p id="readable-code-help" className="body-s">3–24 letters, numbers or hyphens. Codes are saved in uppercase.</p></>}
      <label htmlFor="readable-code-target" className="body-s block mt-3">Active recommendation link</label>
      <select ref={element => { if (form.kind === "reassign") firstField.current = element; }} id="readable-code-target" value={linkId} onChange={event => setLinkId(event.target.value)} style={{ ...touch, width: "100%", minWidth: 0, fontSize: 16 }}>
        <option value="">Choose a link</option>{ready.filter(link => !aliases.some(alias => alias.link.id === link.id)).map(link => <option key={link.id} value={link.id}>{REFERRAL_DESTINATIONS.find(item => item.path === link.destinationPath)?.label ?? "Research product"} · created {date(link.createdAt)} · expires {date(link.expiresAt)}</option>)}
      </select>
      {form.kind === "reassign" && <><label htmlFor="readable-code-reason" className="body-s block mt-3">Reason for moving this code</label><input id="readable-code-reason" value={reason} maxLength={200} onChange={event => setReason(event.target.value)} style={{ ...touch, width: "100%", fontSize: 16 }} /><p className="body-s mt-2">Confirm this move to a different active link. Previous referrals and the original link are unchanged. Do not include customer or health information.</p></>}
      <div className="flex flex-wrap gap-3 mt-3"><button type="submit" className="btn btn-primary" style={touch}>{form.kind === "assign" ? "Confirm code assignment" : "Confirm code move"}</button><button type="button" className="btn btn-ghost" style={touch} onClick={closeForm}>Cancel code change</button></div>
    </form>}
  </section>;
}
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
export function RecommendationLinksBody({ token, codeJournal }: { token: string; codeJournal?: CodeJournal | null }) {
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
  const [printCard, setPrintCard] = useState<{ link: RecommendationLink; qr: RecommendationQr } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const exportGeneration = useRef(0);
  const exporting = useRef(false);

  const clearExports = () => {
    exportGeneration.current++;
    exporting.current = false;
    setExportBusy(false);
    setPrintCard(null);
  };

  const refresh = async () => {
    if (!alive.current) return;
    clearExports();
    const current = ++generation.current;
    setLoading(true);
    setData(null);
    setShareStatus({});
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
    return () => { alive.current = false; generation.current++; exportGeneration.current++; };
  }, [token]);

  const mutate = async (id?: string) => {
    if (!alive.current || mutation.current || exporting.current || loading || !data?.eligible) return;
    if (id && !data.links.some(link => link.id === id && link.state === "ready")) return;
    const intent = id ? `revoke:${id}` : `create:${destination}`;
    let key = keys.current.get(intent);
    if (!key) {
      try { key = crypto.randomUUID(); }
      catch { setError("This browser cannot safely start the request. Use an updated browser or contact support."); return; }
      keys.current.set(intent, key);
    }
    mutation.current = true;
    clearExports();
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
    if (!alive.current || busy || loading || !data?.eligible || !safeExportRecommendation(link)) return;
    const outcome = native ? await shareRecommendation(link.url) : await copyRecommendation(link.url);
    if (alive.current) setShareStatus(previous => ({ ...previous, [link.id]: shareOutcomeMessage(outcome) }));
  };

  const exportLink = async (link: RecommendationLink, action: "download" | "png" | "preview" | "print") => {
    if (!alive.current || exporting.current || mutation.current || loading || !data?.eligible
      || !data.links.some(item => item.id === link.id && item.url === link.url && safeExportRecommendation(item))) return;
    const operation = ++exportGeneration.current;
    const current = () => alive.current && operation === exportGeneration.current;
    exporting.current = true;
    setExportBusy(true);
    setError("");
    try {
      // Re-read the canonical server projection before every export, including
      // print. A cached ready row does not authorize a current artifact.
      const result = await listRecommendationLinks(token);
      if (!current()) return;
      if (result.kind === "error") {
        setPrintCard(null); setData(null); setError(recommendationError(result)); return;
      }
      if (typeof result.data.eligible !== "boolean" || !Array.isArray(result.data.links)
        || !result.data.links.every(isRecommendationLink)
        || new Set(result.data.links.map(item => item.id)).size !== result.data.links.length) {
        setPrintCard(null); setData(null); setError("Your links could not be read safely. Refresh or contact support."); return;
      }
      setData(result.data);
      const verified = result.data.eligible ? result.data.links.find(item => item.id === link.id && item.url === link.url) : null;
      const qr = verified ? createRecommendationQr(verified) : null;
      if (!verified || !qr) {
        setPrintCard(null); setError("This link is no longer available to export. No export was started."); return;
      }
      const canSave = () => current() && safeExportRecommendation(verified) === qr.url;
      if (!canSave()) return;
      if (action === "download" || action === "png") {
        const saved = action === "download" ? saveRecommendationQr(qr, canSave) : await saveRecommendationPng(qr, canSave);
        if (current()) setShareStatus(previous => ({ ...previous, [link.id]: saved
          ? action === "download" ? "QR download requested. Your browser controls whether the file was saved." : "PNG download requested. Your browser controls whether the file was saved."
          : action === "download" ? "The QR download could not start. Refresh the link and try again." : "The PNG download could not start. Refresh the link and try again." }));
      } else {
        setPrintCard({ link: verified, qr });
        if (action === "print") {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          if (canSave()) window.print();
        }
      }
    } catch {
      if (current()) { setPrintCard(null); setError("The export could not be confirmed. Refresh your links before trying again."); }
    } finally {
      if (current()) { exporting.current = false; setExportBusy(false); }
    }
  };

  return <div className="grid gap-6" style={{ minWidth: 0 }}>
    {loading && <p role="status">Checking your referral access…</p>}
    {error && <div role="alert" className="card"><p>{error}</p><button type="button" className="btn btn-secondary mt-3" style={touch} disabled={loading || busy} onClick={() => void refresh()}>Refresh links</button></div>}
    {notice && <p role="status" aria-live="polite">{notice}</p>}
    {!loading && data && !data.eligible && <div className="card"><h2 className="body-l">Referral access is not active</h2><p className="body-s mt-2">This account cannot issue referral links. Opening this page does not enroll you as an affiliate. Contact support if you believe your access should be active.</p></div>}
    {data?.eligible && <>
      {codeJournal && <ReadableCodeManagement token={token} links={data.links} journal={codeJournal} />}
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
            const url = safeExportRecommendation(link);
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
                <div className="flex flex-wrap gap-3 mt-3"><button type="button" className="btn btn-secondary" style={touch} disabled={busy || loading || exportBusy} onClick={() => void exportLink(link, "download")}>Download QR (SVG)</button><button type="button" className="btn btn-secondary" style={touch} disabled={busy || loading || exportBusy} onClick={() => void exportLink(link, "png")}>Download QR (PNG)</button><button type="button" className="btn btn-secondary" style={touch} disabled={busy || loading || exportBusy} onClick={() => void exportLink(link, "preview")}>Preview print card</button></div>
                <p className="body-s text-ink-2 mt-2">Exports use this exact link and recheck its availability. Include your partner relationship disclosure wherever you use the QR. A saved or printed copy cannot be recalled; its destination still checks the link when opened.</p>
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
    {printCard && <RecommendationPrintCard link={printCard.link} qr={printCard.qr} printing={exportBusy}
      onClose={clearExports} onPrint={() => void exportLink(printCard.link, "print")} />}
  </div>;
}

export default function Links() {
  const { memberToken, memberChecking, recovery, memberSessionStatus } = useResearch();
  const identity = readableAliasSession(memberToken);
  const journal = useRef<CodeJournal | null>(null);
  const ordinary = (!recovery || recovery === "none") && memberSessionStatus !== "verification_failed" && memberSessionStatus !== "signed_out";
  if (!ordinary || (!memberChecking && !identity)) {
    if (journal.current) { journal.current.retired = true; journal.current.active = false; journal.current.attempt = null; }
    journal.current = null;
  } else if (identity && (!journal.current || journal.current.owner !== identity)) {
    if (journal.current) { journal.current.retired = true; journal.current.active = false; journal.current.attempt = null; }
    journal.current = newCodeJournal(identity);
  }
  const activeJournal = journal.current;
  if (activeJournal) activeJournal.active = !memberChecking && ordinary && identity === activeJournal.owner;
  useLayoutEffect(() => {
    if (activeJournal) { activeJournal.mounted = true; activeJournal.active = !memberChecking && ordinary && identity === activeJournal.owner; }
    return () => { if (activeJournal) { activeJournal.mounted = false; activeJournal.active = false; } };
  }, [activeJournal]);
  return <ResearchPartnerShell title="Referral links" lead="Make a clear, thoughtful introduction to Xenios. Manage your own links and see the status the system can verify.">
    {memberChecking ? <p role="status">Checking your account…</p> : memberToken && ordinary ? <RecommendationLinksBody key={memberToken} token={memberToken} codeJournal={activeJournal} /> : <div className="card"><h2 className="body-l">Sign in to manage your links</h2><p className="body-s mt-2">Referral access is checked for your account. Signing in does not enroll you as an affiliate.</p><Link href={researchAuthPath("/research/sign-in", PARTNER_ROUTES.links)} className="btn btn-primary mt-3" style={touch}>Sign in</Link></div>}
  </ResearchPartnerShell>;
}
