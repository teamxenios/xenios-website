import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export type ReferralPassportVariant = "applicant" | "member";

export function BusinessPageHero({
  eyebrow,
  title,
  lead,
  primary,
  secondary,
  aside,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  aside?: ReactNode;
}) {
  return (
    <section className="container-x xr-page-hero">
      <div className={aside ? "xr-hero-grid" : "xr-hero-copy"}>
        <div>
          <p className="mono-cap text-pulse">{eyebrow}</p>
          <h1 className="display-l text-balance">{title}</h1>
          <p className="body-l text-ink-2">{lead}</p>
          {(primary || secondary) && (
            <div className="xr-hero-actions">
              {primary && <Link href={primary.href} className="btn btn-primary">{primary.label}</Link>}
              {secondary && <Link href={secondary.href} className="btn btn-ghost">{secondary.label}</Link>}
            </div>
          )}
        </div>
        {aside && <aside className="xr-hero-aside">{aside}</aside>}
      </div>
    </section>
  );
}

export function SectionLead({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="xr-section-lead">
      <p className="mono-cap text-ink-mute">{eyebrow}</p>
      <h2 className="display-s text-balance">{title}</h2>
      {body && <p className="body-m text-ink-2">{body}</p>}
    </div>
  );
}

export function NumberedJourney({
  steps,
  compact = false,
}: {
  steps: Array<{ title: string; body: string }>;
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "xr-journey xr-journey-compact" : "xr-journey"}>
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="mono-label text-pulse tabular">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3 className="h3">{step.title}</h3>
            <p className="body-s text-ink-2">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="xr-check-list">
      {items.map((item) => (
        <li key={item}>
          <Check size={16} aria-hidden="true" />
          <span className="body-m text-ink-2">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function safeShareUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {
    return "";
  }
  return "";
}

export function ReferralShareActions({
  url,
  message = "You were invited to xenios research. Applications are reviewed independently.",
  disabled = false,
}: {
  url: string;
  message?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const safeUrl = useMemo(() => safeShareUrl(url), [url]);
  const inactive = disabled || !safeUrl;
  const encoded = encodeURIComponent(`${message} ${safeUrl}`);

  async function copyLink() {
    if (inactive) return;
    try {
      await navigator.clipboard.writeText(safeUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function shareMore() {
    if (inactive || !navigator.share) return;
    try {
      await navigator.share({ title: "xenios research invitation", text: message, url: safeUrl });
    } catch {
      // Closing the native share sheet is an expected outcome, not an app error.
    }
  }

  const linkClass = inactive ? "xr-share-action is-disabled" : "xr-share-action";

  return (
    <div className="xr-share-actions" aria-label="Share invitation">
      <button type="button" className={linkClass} onClick={() => void copyLink()} disabled={inactive} data-testid="button-copy-invitation">
        <span className="xr-share-icon"><Copy size={19} aria-hidden="true" /></span>
        <span>{copied ? "Copied" : "Copy invitation"}</span>
      </button>
      <a className={linkClass} href={inactive ? undefined : `sms:?&body=${encoded}`} aria-disabled={inactive || undefined}>
        <span className="xr-share-icon"><MessageCircle size={19} aria-hidden="true" /></span>
        <span>Message</span>
      </a>
      <a className={linkClass} href={inactive ? undefined : `https://wa.me/?text=${encoded}`} target="_blank" rel="noreferrer" aria-disabled={inactive || undefined}>
        <span className="xr-share-icon">WA</span>
        <span>WhatsApp</span>
      </a>
      <a className={linkClass} href={inactive ? undefined : `https://x.com/intent/post?text=${encoded}`} target="_blank" rel="noreferrer" aria-disabled={inactive || undefined}>
        <span className="xr-share-icon">X</span>
        <span>X</span>
      </a>
      <a className={linkClass} href={inactive ? undefined : `mailto:?subject=${encodeURIComponent("An invitation to xenios research")}&body=${encoded}`} aria-disabled={inactive || undefined}>
        <span className="xr-share-icon"><Mail size={19} aria-hidden="true" /></span>
        <span>Email</span>
      </a>
      <button type="button" className={linkClass} onClick={() => void shareMore()} disabled={inactive || typeof navigator.share !== "function"}>
        <span className="xr-share-icon"><Share2 size={19} aria-hidden="true" /></span>
        <span>More</span>
      </button>
      <span className="sr-only" aria-live="polite">{copied ? "Invitation link copied." : ""}</span>
    </div>
  );
}

export function ReferralPassport({
  variant,
  reference,
  issued,
  code,
  invitationUrl,
  memberSince,
  preview = false,
  stateLabel,
  footerLabel,
  previewLabel,
}: {
  variant: ReferralPassportVariant;
  reference: string;
  issued: string;
  code?: string | null;
  invitationUrl?: string | null;
  memberSince?: string;
  preview?: boolean;
  stateLabel?: string;
  footerLabel?: string;
  previewLabel?: string;
}) {
  const qrValue = code && invitationUrl ? safeShareUrl(invitationUrl) : "";
  const active = variant === "member";

  return (
    <article className={`xr-passport xr-passport-${variant}`} data-testid="referral-passport">
      <div className="xr-passport-grid" aria-hidden="true" />
      <div className="xr-passport-registration" aria-hidden="true"><span /><span /><span /></div>
      <header className="xr-passport-header">
        <div>
          <p className="xr-passport-brand">xenios</p>
          <p className="mono-label">Research membership</p>
        </div>
        <p className="mono-label xr-passport-state">{stateLabel ?? (active ? "Active member" : "Application received")}</p>
      </header>

      <div className="xr-passport-message">
        <p className="mono-label">Private invitation</p>
        <h2>A better life is built through better systems.</h2>
      </div>

      <div className="xr-passport-data">
        <dl>
          <div>
            <dt>Reference</dt>
            <dd>{reference}</dd>
          </div>
          <div>
            <dt>{active ? "Member since" : "Issued"}</dt>
            <dd>{active ? memberSince || issued : issued}</dd>
          </div>
          <div>
            <dt>Invitation code</dt>
            <dd>{code || "Pending secure issue"}</dd>
          </div>
        </dl>
        <div className={qrValue ? "xr-passport-qr" : "xr-passport-qr is-pending"} aria-label={qrValue ? "QR code for the xenios invitation link" : "Invitation QR code pending"}>
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={116} level="M" bgColor="transparent" fgColor="#0E0E0E" marginSize={0} aria-hidden="true" />
          ) : (
            <span className="mono-label">QR issued with a verified link</span>
          )}
        </div>
      </div>

      <footer className="xr-passport-footer">
        <p className="mono-label">{footerLabel ?? "Invitation identity private"}</p>
        <p className="mono-label">No health data encoded</p>
      </footer>
      {preview && <span className="xr-passport-preview mono-label">{previewLabel ?? "UI preview - not production"}</span>}
    </article>
  );
}
