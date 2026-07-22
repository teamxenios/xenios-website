import { useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { getPartnerLinks } from "../../adapters/partner";
import { usePartnerResource, type BoundaryState } from "./shared";
import type { PartnerLinkDto } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Partner links (/research/partners/links). Every issued link comes from the
// frozen PartnerLinkDto list (GET /api/research/partner/links): the code, the
// copyable URL, the channel, the campaign when there is one, and whether a QR
// exists for it. Until links are issued the page shows an honest pending
// state; nothing scannable or shareable is ever faked.
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<PartnerLinkDto["channel"], string> = {
  signed_link: "Signed link",
  code: "Code",
  qr: "QR",
  campaign: "Campaign",
  organization: "Organization",
  event: "Event",
};

export default function Links() {
  const { memberToken } = useResearch();
  const { state, errorMessage, denied, data, reload } = usePartnerResource<{ links: PartnerLinkDto[] }>(
    getPartnerLinks,
    memberToken,
  );
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard unavailable: the value stays visible for manual copy.
    }
  };

  if (denied && (denied.code === "partner_not_found" || denied.code === "partner_not_active")) {
    return (
      <ResearchPartnerShell
        title="Your links"
        lead="One unique link and code per rep. Share them only alongside approved content, always with your rep relationship disclosed."
      >
        <ResearchDenialNotice code={denied.code} message={denied.message} />
      </ResearchPartnerShell>
    );
  }

  const boundaryState: BoundaryState = state === "unavailable" ? "ok" : state;
  const links = state === "ok" ? data?.links ?? [] : [];

  return (
    <ResearchPartnerShell
      title="Your links"
      lead="One unique link and code per rep. Share them only alongside approved content, always with your rep relationship disclosed."
    >
      <ResearchRouteBoundary state={boundaryState} errorMessage={errorMessage} onRetry={() => void reload()}>
        {state === "unavailable" && (
          <p className="mono-label text-ink-mute mb-4" role="status" aria-live="polite">
            The partner platform is being prepared. Your link is issued after certification.
          </p>
        )}

        {state === "ok" && links.length === 0 && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div>
              <ResearchStatusBadge label="Issued after certification" tone="pending" />
            </div>
            <p className="body-s text-ink-2 mt-2">
              Your unique link and code appear here once your application is approved and certification is complete.
            </p>
          </div>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {state !== "ok" && (
            <div className="card">
              <p className="mono-label text-ink-mute">Unique link</p>
              <div className="mt-2">
                <ResearchStatusBadge label="Issued after certification" tone="pending" />
              </div>
              <p className="body-s text-ink-2 mt-2">
                Your unique link appears here once your application is approved and certification is complete.
              </p>
            </div>
          )}

          {links.map((link) => (
            <div className="card" key={link.code} data-testid={`plk-link-${link.code}`}>
              <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
                <p className="mono-label text-ink-mute">{CHANNEL_LABEL[link.channel] ?? link.channel}</p>
                {link.campaign && <ResearchStatusBadge label={link.campaign} tone="info" />}
              </div>
              <p className="display-s tabular mt-2">{link.code}</p>
              <p className="body-m tabular mt-2" style={{ wordBreak: "break-all" }}>
                {link.url}
              </p>
              <div className="mt-3 flex gap-3 flex-wrap">
                <button type="button" className="btn btn-secondary" onClick={() => void copy(`url-${link.code}`, link.url)}>
                  {copied === `url-${link.code}` ? "Copied" : "Copy link"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void copy(`code-${link.code}`, link.code)}>
                  {copied === `code-${link.code}` ? "Copied" : "Copy code"}
                </button>
              </div>
              {link.qrSvgPath && (
                <p className="body-s text-ink-mute mt-3">A QR code is available for this link.</p>
              )}
            </div>
          ))}
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
