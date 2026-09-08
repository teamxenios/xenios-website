import { useEffect, useMemo, useRef, useState } from "react";
import type { RecommendationLink, RecommendationLinks } from "@shared/research/referral-v1";
import { listRecommendationLinks, recommendationError } from "./api";
import { createRecommendationQr, safeExportRecommendation } from "./qr-export";
import { recommendationPng, saveLocalFile } from "./qr-png";
import { PrincipalFence } from "../full-platform/transport";
import "../full-platform/workspace.css";

export interface DashboardShareCardProps { token: string; checking?: boolean }
function validList(value: unknown): value is RecommendationLinks {
  if (!value || typeof value !== "object") return false;
  const p = value as RecommendationLinks;
  return typeof p.eligible === "boolean" && Array.isArray(p.links) && p.links.length <= 500 && p.links.every(l => l && typeof l.id === "string" && l.id.length <= 128 && ["ready", "revoked", "expired", "partner_inactive", "unavailable"].includes(l.state) && typeof l.destinationPath === "string" && typeof l.expiresAt === "string" && (l.revokedAt === null || typeof l.revokedAt === "string") && (l.url === null || typeof l.url === "string"));
}
/** No link creation, price discount or attribution authority is introduced by this card. */
export function DashboardShareCard({ token, checking = false }: DashboardShareCardProps) {
  const fence = useRef(new PrincipalFence()); fence.current.bind(checking ? null : token);
  const [payload, setPayload] = useState<{ token: string; data: RecommendationLinks } | null>(null);
  const [selected, setSelected] = useState(""); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const [tick, setTick] = useState(0); const [large, setLarge] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { if (large && dialog.current && !dialog.current.open) dialog.current.showModal(); else if (!large && dialog.current?.open) dialog.current.close(); }, [large]);
  const list = payload?.token === token && !checking ? payload.data : null;
  const active = list?.eligible ? list.links.filter(l => safeExportRecommendation(l) !== null) : [];
  const chosen = active.find(l => l.id === selected) ?? active[0];
  const qr = useMemo(() => chosen ? createRecommendationQr(chosen) : null, [chosen, tick]);
  const selectedRef = useRef<string | null>(null); selectedRef.current = chosen?.id ?? null;
  const load = async () => {
    const current = fence.current.ticket(); setLoading(true); setError("");
    const result = await listRecommendationLinks(token);
    if (!current()) return;
    setLoading(false);
    if (result.kind !== "ok") { setPayload(null); setError(recommendationError(result)); return; }
    if (!validList(result.data)) { setPayload(null); setError("Referral information could not be verified. Refresh to retry."); return; }
    setPayload({ token, data: result.data });
  };
  useEffect(() => { setPayload(null); setSelected(""); setNotice(""); setBusy(false); setLarge(false); if (!checking) void load(); return () => fence.current.invalidate(); }, [token, checking]);
  useEffect(() => { const timer = window.setInterval(() => setTick(n => n + 1), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const focus = () => { fence.current.invalidate(); setNotice(""); setBusy(false); if (!checking) void load(); };
    const hide = () => { if (document.hidden) { fence.current.invalidate(); setNotice(""); setBusy(false); } else focus(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", hide); fence.current.invalidate(); };
  }, [token, checking]);
  const fresh = async (link: RecommendationLink, current: () => boolean) => {
    const result = await listRecommendationLinks(token);
    if (!current() || result.kind !== "ok" || !validList(result.data)) return null;
    setPayload({ token, data: result.data });
    const next = result.data.eligible ? result.data.links.find(l => l.id === link.id) : null;
    return next && next.url === link.url && next.expiresAt === link.expiresAt && safeExportRecommendation(next) ? next : null;
  };
  const action = async (kind: "copy" | "png" | "share" | "print") => {
    if (busy || !chosen || !qr) return;
    const identityCurrent = fence.current.ticket(); const id = chosen.id;
    const current = () => identityCurrent() && selectedRef.current === id && safeExportRecommendation(chosen) === qr.url;
    setBusy(true); setNotice(""); setError("");
    try {
      if (!await fresh(chosen, current)) { if (identityCurrent()) setError("This link is no longer confirmed. Refresh before sharing."); return; }
      if (kind === "copy") {
        if (!current()) return;
        await navigator.clipboard.writeText(qr.url);
        if (current()) setNotice("Link copied.");
      } else if (kind === "png") {
        const blob = await recommendationPng(qr, current);
        if (!blob || !current()) return;
        // Encode can be asynchronous; check current server eligibility again before initiating the save.
        if (!await fresh(chosen, current)) { if (identityCurrent()) setError("The link changed before export. Refresh and try again."); return; }
        if (saveLocalFile(blob, "xenios-referral-qr.png", current) && current()) setNotice("PNG save requested in your browser.");
      } else if (kind === "print") {
        if (current()) window.print();
      } else {
        if (!navigator.share) { if (current()) setNotice("Device sharing is unavailable. Use Copy link or Download PNG."); return; }
        if (!current()) return;
        await navigator.share({ title: "Xenios Health", text: "Explore Xenios Health", url: qr.url });
        if (current()) setNotice("Share dialog completed. Recipient delivery is not confirmed here.");
      }
    } catch (e) {
      if (current()) setError(e instanceof DOMException && e.name === "AbortError" ? "Sharing cancelled." : "The browser could not complete this action. Use the visible link or try again.");
    } finally { if (identityCurrent()) setBusy(false); }
  };
  return <section className="xh-workspace xh-share" aria-labelledby="xh-share-title">
    <header><div><p className="xh-eyebrow">YOUR PARTNER TOOLS</p><h2 id="xh-share-title">Share Xenios Health</h2></div><button type="button" onClick={() => { fence.current.invalidate(); setBusy(false); void load(); }} disabled={checking}>Refresh</button></header>
    {(checking || loading) && <p role="status">Checking your referral access…</p>}
    {error && <p className="xh-error" role="alert">{error}</p>}
    {!checking && !loading && !error && !list?.eligible && <p>Referral sharing is not enabled for this account. Your customer account is separate.</p>}
    {!checking && !loading && list?.eligible && !chosen && <p>No active referral link is available. <a href="/research/partners/links">Manage referral links</a> to create one explicitly or review its status.</p>}
    {qr && chosen && <div className="xh-share-grid">
      <div className="xh-qr"><svg aria-label="Your referral QR code" role="img" viewBox={`0 0 ${qr.size} ${qr.size}`} width="220" height="220"><rect width={qr.size} height={qr.size} fill="white"/><path d={qr.path} fill="black" shapeRendering="crispEdges"/></svg><button type="button" onClick={() => setLarge(true)}>Enlarge QR</button></div>
      <div className="xh-min"><label>Referral destination<select aria-label="Referral destination" value={chosen.id} onChange={e => { fence.current.invalidate(); setSelected(e.target.value); setBusy(false); setNotice(""); }}>{active.map(l => <option key={l.id} value={l.id}>{l.destinationPath}</option>)}</select></label>
        <label>Your referral link<input aria-label="Your referral link" readOnly value={qr.url}/></label>
        <p>Expires {new Date(chosen.expiresAt).toLocaleString()}. This link does not promise a discount.</p>
        <div className="xh-actions"><button disabled={busy} onClick={() => void action("copy")}>Copy link</button><button disabled={busy} onClick={() => void action("share")}>Share</button><button disabled={busy} className="xh-primary" onClick={() => void action("png")}>Download PNG</button><button disabled={busy} onClick={() => void action("print")}>Print</button></div>
        <p role="status" aria-live="polite">{notice}</p><a href="/research/partners/links">Manage and revoke referral links</a>
      </div></div>}
    {qr && <dialog ref={dialog} aria-label="Enlarged referral QR" className="xh-modal" onCancel={() => setLarge(false)} onClose={() => setLarge(false)}><div><button autoFocus type="button" onClick={() => setLarge(false)}>Close QR</button><svg role="img" aria-label="Enlarged QR code" viewBox={`0 0 ${qr.size} ${qr.size}`}><rect width={qr.size} height={qr.size} fill="white"/><path d={qr.path} fill="black"/></svg><p>{qr.url}</p></div></dialog>}
  </section>;
}
