import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { RecommendationLink } from "@shared/research/referral-v1";
import { safeExportRecommendation, type RecommendationQr } from "./qr-export";
import "./recommendation-print.css";

export default function RecommendationPrintCard({ link, qr, onClose, onPrint, printing }: {
  link: RecommendationLink; qr: RecommendationQr; onClose: () => void;
  onPrint: () => void; printing: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const valid = safeExportRecommendation(link) === qr.url;
  useEffect(() => {
    if (!valid) return;
    const previous = document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const expires = window.setTimeout(() => close.current(), Math.min(2_147_483_647, Math.max(0, Date.parse(link.expiresAt) - Date.now())));
    return () => { clearTimeout(expires); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [link.expiresAt, qr.url, valid]);
  if (!valid) return null;
  return createPortal(<div className="xr-recommendation-print-overlay" role="dialog" aria-modal="true" aria-labelledby="recommendation-print-heading" ref={panel}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
    <div className="xr-recommendation-print-preview">
      <div className="xr-recommendation-print-controls">
        <button type="button" style={{ minHeight: 44 }} className="btn btn-secondary" onClick={onClose}>Close preview</button>
        <button type="button" style={{ minHeight: 44 }} className="btn btn-primary" disabled={printing} onClick={() => {
          if (safeExportRecommendation(link) !== qr.url) { onClose(); return; }
          onPrint();
        }}>{printing ? "Checking link…" : "Print / Save as PDF"}</button>
        <p>This print button rechecks the link. Saved or printed copies cannot be recalled after sign-out or revocation.</p>
      </div>
      <section className="xr-recommendation-print-card" data-recommendation-print="true">
        <p className="xr-recommendation-print-brand">XENIOS HEALTH</p>
        <h2 id="recommendation-print-heading">An introduction to Xenios</h2>
        <p>Scan to explore the appropriate Care or nonclinical Research pathway.</p>
        <svg className="xr-recommendation-print-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Scan the Xenios recommendation link">
          <rect width={qr.size} height={qr.size} fill="white" /><path d={qr.path} fill="black" shapeRendering="crispEdges" />
        </svg>
        <p className="xr-recommendation-print-url">{qr.url}</p>
        <p>Shared by a Xenios partner. The partner may receive compensation for eligible activity.</p>
        <p>No medical, income, access, or commission guarantee. Availability is checked when the link is opened.</p>
        <p>Link expires: {new Date(link.expiresAt).toISOString().slice(0, 10)} (UTC). Stop using this card if the link is revoked or partner access changes.</p>
      </section>
    </div>
  </div>, document.body);
}
