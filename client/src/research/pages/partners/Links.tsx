import { useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchRouteBoundary, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerLinks } from "../../adapters/partner";
import { usePartnerResource, type BoundaryState } from "./shared";

// ---------------------------------------------------------------------------
// Partner links (/research/partners/links). The unique link, referral code,
// and QR come only from GET /api/research/partner/links. Until issued, each
// surface shows an honest pending state; the QR placeholder never fakes a
// scannable code.
// ---------------------------------------------------------------------------

interface LinksPayload {
  link?: string | null;
  code?: string | null;
  qrUrl?: string | null;
}

export default function Links() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<LinksPayload>(getPartnerLinks, memberToken);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const boundaryState: BoundaryState = state === "unavailable" ? "ok" : state;
  const issued = state === "ok" ? data : null;

  const copy = async (kind: "link" | "code", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable: the value stays visible for manual copy.
    }
  };

  return (
    <ResearchPartnerShell
      title="Your link"
      lead="One unique link and code per rep. Share them only alongside approved content, always with your rep relationship disclosed."
    >
      <ResearchRouteBoundary state={boundaryState} errorMessage={errorMessage} onRetry={() => void reload()}>
        {state === "unavailable" && (
          <p className="mono-label text-ink-mute mb-4" role="status" aria-live="polite">
            The partner platform is being prepared. Your link is issued after certification.
          </p>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="card">
            <p className="mono-label text-ink-mute">Unique link</p>
            {issued?.link ? (
              <>
                <p className="body-m tabular mt-2" style={{ wordBreak: "break-all" }}>
                  {issued.link}
                </p>
                <button type="button" className="btn btn-secondary mt-3" onClick={() => void copy("link", issued.link!)}>
                  {copied === "link" ? "Copied" : "Copy link"}
                </button>
              </>
            ) : (
              <>
                <div className="mt-2">
                  <ResearchStatusBadge label="Issued after certification" tone="pending" />
                </div>
                <p className="body-s text-ink-2 mt-2">
                  Your unique link appears here once your application is approved and certification is complete.
                </p>
              </>
            )}
          </div>

          <div className="card">
            <p className="mono-label text-ink-mute">Referral code</p>
            {issued?.code ? (
              <>
                <p className="display-s tabular mt-2">{issued.code}</p>
                <button type="button" className="btn btn-secondary mt-3" onClick={() => void copy("code", issued.code!)}>
                  {copied === "code" ? "Copied" : "Copy code"}
                </button>
              </>
            ) : (
              <>
                <div className="mt-2">
                  <ResearchStatusBadge label="Issued with your link" tone="pending" />
                </div>
                <p className="body-s text-ink-2 mt-2">
                  A short code for spoken settings (podcasts, events) where a link is awkward.
                </p>
              </>
            )}
          </div>

          <div className="card">
            <p className="mono-label text-ink-mute">QR code</p>
            {issued?.qrUrl ? (
              <img
                src={issued.qrUrl}
                alt={`QR code for your unique link${issued.code ? `, code ${issued.code}` : ""}`}
                className="mt-3"
                style={{ maxWidth: 180, width: "100%" }}
              />
            ) : (
              <>
                <div
                  className="mt-3 flex items-center justify-center"
                  style={{ width: 180, height: 180, border: "1px dashed currentColor", opacity: 0.5 }}
                  aria-hidden="true"
                >
                  <span className="mono-label">QR pending</span>
                </div>
                <p className="body-s text-ink-2 mt-2">QR generates when your link is issued.</p>
              </>
            )}
          </div>
        </div>

        <section aria-labelledby="plk-rules" className="mt-10">
          <h2 id="plk-rules" className="mono-cap text-ink-mute">
            Sharing rules
          </h2>
          <div className="card mt-4" style={{ maxWidth: 680 }}>
            <ul className="body-s text-ink-2 grid gap-2" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Share your link only with content from the approved library, or content compliance has cleared.</li>
              <li>Disclose the rep relationship on every share, in the share itself, not behind a click.</li>
              <li>Never attach your link to medical claims, income claims, or recruitment of other reps.</li>
            </ul>
            <div className="mt-4">
              <Link href={PARTNER_ROUTES.compliance} className="btn btn-ghost">
                Read the full compliance rules
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-8">
          <ResearchSecureNotice>
            Your link records aggregate clicks only. It never exposes who clicked, and it never carries member data.
          </ResearchSecureNotice>
        </div>
      </ResearchRouteBoundary>
    </ResearchPartnerShell>
  );
}
