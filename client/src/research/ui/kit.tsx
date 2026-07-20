import { useEffect, useRef, useState, type ReactNode } from "react";
import { statusFor, type CapabilityStatus, type ResearchCapability } from "../lib/capabilities";

// ---------------------------------------------------------------------------
// Research UI kit (Supreme build). Primitives every route family composes.
// Design: the existing xenios system (card/btn/mono-cap/body-*) plus the
// scoped .research-app tokens in index.css. Rules baked in: honest states
// only (loading / empty / error / capability-pending are first-class), no
// color-only signaling, focus-visible everywhere, text alternatives for
// every metric.
// ---------------------------------------------------------------------------

export function ResearchLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="ra-state" data-testid="ra-loading">
      <p className="mono-cap text-ink-mute">{label}...</p>
    </div>
  );
}

export function ResearchErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  // Never repeat the heading: a message that merely restates it falls back to
  // the actionable default line.
  const body = message && !/^something went wrong/i.test(message.trim()) ? message : undefined;
  return (
    <div role="alert" className="ra-state" data-testid="ra-error">
      <p className="body-m font-700">Something went wrong.</p>
      <p className="body-s text-ink-2 mt-2">{body ?? "Please try again. If it keeps happening, contact support."}</p>
      <div className="mt-4 flex gap-3">
        {onRetry && (
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
        <a href="mailto:research@xeniostechnology.com" className="btn btn-ghost">Contact support</a>
      </div>
    </div>
  );
}

export function ResearchEmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="ra-state" data-testid="ra-empty">
      <p className="body-m font-700">{title}</p>
      {body && <p className="body-s text-ink-2 mt-2 max-w-[52ch]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Distinct, intentional pending vocabularies: the same generic panel
// everywhere reads as unfinished. Each kind carries its own eyebrow, tone,
// and framing so a pending state feels designed, not absent.
export type PendingKind =
  | "not_configured"
  | "credentials_pending"
  | "samuel_review_pending"
  | "coming_soon"
  | "supplier_pending"
  | "unavailable"
  | "empty";

const PENDING_PRESENTATION: Record<PendingKind, { eyebrow: string; tone: BadgeTone; badge: string }> = {
  not_configured: { eyebrow: "Being configured", tone: "pending", badge: "In setup" },
  credentials_pending: { eyebrow: "Provider connection pending", tone: "pending", badge: "Connecting" },
  samuel_review_pending: { eyebrow: "With the review team", tone: "info", badge: "In review" },
  coming_soon: { eyebrow: "Coming soon", tone: "info", badge: "Planned" },
  supplier_pending: { eyebrow: "Supplier confirmation pending", tone: "warning", badge: "Awaiting documentation" },
  unavailable: { eyebrow: "Temporarily unavailable", tone: "warning", badge: "Unavailable" },
  empty: { eyebrow: "Nothing here yet", tone: "neutral", badge: "Empty" },
};

export function ResearchPendingPanel({
  kind,
  title,
  body,
  action,
  testid,
}: {
  kind: PendingKind;
  title?: string;
  body: string;
  action?: ReactNode;
  testid?: string;
}) {
  const p = PENDING_PRESENTATION[kind];
  return (
    <section role="status" aria-live="polite" className={`card ra-pending ra-pending-${kind}`} data-testid={testid ?? `ra-pending-${kind}`}>
      <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <p className="mono-label text-ink-mute">{p.eyebrow}</p>
        <ResearchStatusBadge label={p.badge} tone={p.tone} />
      </div>
      {title && <p className="body-m font-700 mt-2">{title}</p>}
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

function pendingKindForState(state: CapabilityStatus["state"]): PendingKind {
  switch (state) {
    case "pending_credentials":
      return "credentials_pending";
    case "pending_approval":
      return "samuel_review_pending";
    case "pending_supplier_data":
      return "supplier_pending";
    case "misconfigured":
      return "unavailable";
    case "disabled":
      return "coming_soon";
    default:
      return "not_configured";
  }
}

// The reusable capability boundary: enabled renders children; anything else
// renders the DISTINCT pending panel for its state. Member copy stays
// minimal; admin surfaces may pass showAdminDetail to name missing
// configuration (names, never values).
export function ResearchCapabilityBoundary({
  status,
  children,
  showAdminDetail = false,
}: {
  status: CapabilityStatus;
  children: ReactNode;
  showAdminDetail?: boolean;
}) {
  if (status.state === "enabled") return <>{children}</>;
  const kind = pendingKindForState(status.state);
  const p = PENDING_PRESENTATION[kind];
  return (
    <section role="status" aria-live="polite" className={`card ra-capability ra-pending-${kind}`} data-testid={`ra-capability-${status.capability}`}>
      <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap", rowGap: 6 }}>
        <p className="mono-label text-ink-mute">{p.eyebrow}</p>
        <ResearchStatusBadge label={p.badge} tone={p.tone} />
      </div>
      <p className="body-m text-ink-2 mt-2 max-w-[56ch]">{status.publicMessage}</p>
      {showAdminDetail && (
        <div className="mt-3 body-s text-ink-mute">
          <p>State: {status.state.replace(/_/g, " ")}</p>
          {status.adminMessage && <p className="mt-1">{status.adminMessage}</p>}
          {status.missingEnvironmentVariables?.length ? (
            <p className="mt-1">Missing configuration: {status.missingEnvironmentVariables.join(", ")}</p>
          ) : null}
          {status.missingApprovals?.length ? (
            <p className="mt-1">Missing approvals: {status.missingApprovals.join(", ")}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function capabilityStatusOrPending(
  statuses: Map<ResearchCapability, CapabilityStatus> | null | undefined,
  capability: ResearchCapability,
): CapabilityStatus {
  return statusFor(statuses, capability);
}

// Status badge: label + tone, never color-only (the label IS the state).
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "pending";
export function ResearchStatusBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={`ra-badge ra-badge-${tone}`} data-testid="ra-badge">
      {label}
    </span>
  );
}

export function ResearchMetricCard({
  label,
  value,
  summary,
  children,
}: {
  label: string;
  value: string;
  summary: string;
  children?: ReactNode;
}) {
  return (
    <div className="card" data-testid="ra-metric">
      <p className="mono-label text-ink-mute">{label}</p>
      <p className="display-s tabular mt-1">{value}</p>
      {/* Every chart/metric requires a text summary (accessibility rule). */}
      <p className="body-s text-ink-2 mt-2">{summary}</p>
      {children}
    </div>
  );
}

export function ResearchDocumentCard({
  title,
  docType,
  version,
  publishedAt,
  acknowledged,
  reviewer,
  action,
}: {
  title: string;
  docType: string;
  version: string;
  publishedAt?: string | null;
  acknowledged?: boolean | null;
  reviewer?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-wrap items-start justify-between gap-4" data-testid="ra-document">
      <div style={{ minWidth: 0 }}>
        <p className="mono-label text-ink-mute">{docType} · v{version}</p>
        <p className="body-m font-700 mt-1">{title}</p>
        <p className="body-s text-ink-mute mt-1">
          {reviewer ? `Reviewed by ${reviewer}. ` : ""}
          {publishedAt ? `Published ${publishedAt}.` : "Not yet published."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {acknowledged != null && (
          <ResearchStatusBadge label={acknowledged ? "Acknowledged" : "Needs acknowledgment"} tone={acknowledged ? "success" : "warning"} />
        )}
        {action}
      </div>
    </div>
  );
}

export function ResearchTimeline({ items }: { items: Array<{ at: string; title: string; detail?: string }> }) {
  if (!items.length) return <ResearchEmptyState title="No history yet." />;
  return (
    <ol className="ra-timeline" data-testid="ra-timeline">
      {items.map((item, i) => (
        <li key={i} className="ra-timeline-item">
          <p className="mono-label text-ink-mute">{item.at}</p>
          <p className="body-m mt-1">{item.title}</p>
          {item.detail && <p className="body-s text-ink-2 mt-1">{item.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

// Accessible data table with an empty state; column defs keep pages terse.
export function ResearchDataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
}: {
  caption: string;
  columns: Array<{ key: string; header: string; render: (row: T) => ReactNode }>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}) {
  if (!rows.length) return <ResearchEmptyState title={empty ?? "Nothing here yet."} />;
  return (
    <div className="ra-table-wrap" data-testid="ra-table">
      <table className="ra-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="mono-label text-ink-mute">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className="body-s">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResearchFilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="ra-filterbar" role="group" aria-label="Filters" data-testid="ra-filterbar">
      {children}
    </div>
  );
}

export function ResearchSearch({
  value,
  onChange,
  label = "Search",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const id = useRef(`ra-search-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        className="input-field"
        value={value}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        data-testid="ra-search"
      />
    </div>
  );
}

export function ResearchTabs({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onSelect: (key: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="ra-tabs" data-testid="ra-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={active === t.key}
          className={`chip ${active === t.key ? "ra-chip-selected" : "text-ink-2"}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ResearchPagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center gap-3 mt-6" data-testid="ra-pagination">
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="body-s tabular text-ink-2" aria-live="polite">
        Page {page} of {pageCount}
      </span>
      <button type="button" className="btn btn-ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function ResearchSecureNotice({ children }: { children: ReactNode }) {
  return (
    <p className="ra-secure body-s" data-testid="ra-secure-notice">
      <span aria-hidden="true">🔒 </span>
      {children}
    </p>
  );
}

// Modal with focus containment; Confirmation composes it. Drawer is a styled
// modal variant (right-anchored) sharing the same behavior.
export function ResearchModal({
  open,
  title,
  onClose,
  children,
  variant = "modal",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "modal" | "drawer";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ra-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className={variant === "drawer" ? "ra-drawer" : "ra-modal"}
        data-testid={`ra-${variant}`}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="body-m font-700">{title}</p>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ResearchDrawer(props: Omit<Parameters<typeof ResearchModal>[0], "variant">) {
  return <ResearchModal {...props} variant="drawer" />;
}

export function ResearchConfirmation({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <ResearchModal open={open} title={title} onClose={onCancel}>
      <div className="body-s text-ink-2">{body}</div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          className={`btn ${danger ? "ra-btn-danger" : "btn-primary"}`}
          onClick={onConfirm}
          disabled={busy}
          data-testid="ra-confirm"
        >
          {busy ? "Working..." : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </ResearchModal>
  );
}

export function ResearchAgreementViewer({
  title,
  version,
  content,
  accepted,
  onAccept,
  busy = false,
}: {
  title: string;
  version: string;
  content: ReactNode;
  accepted?: boolean | null;
  onAccept?: () => void;
  busy?: boolean;
}) {
  return (
    <section className="card" aria-label={`${title} agreement`} data-testid="ra-agreement">
      <p className="mono-label text-ink-mute">Agreement · v{version}</p>
      <p className="body-m font-700 mt-1">{title}</p>
      <div className="ra-agreement-body body-s text-ink-2 mt-3">{content}</div>
      <div className="mt-4 flex items-center gap-3">
        {accepted ? (
          <ResearchStatusBadge label="Accepted" tone="success" />
        ) : onAccept ? (
          <button type="button" className="btn btn-primary" onClick={onAccept} disabled={busy}>
            {busy ? "Recording..." : "I agree"}
          </button>
        ) : (
          <ResearchStatusBadge label="Acceptance opens later" tone="pending" />
        )}
      </div>
    </section>
  );
}

// Lightweight command bar: a labeled action row for dense admin surfaces.
export function ResearchCommandBar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ra-commandbar" role="toolbar" aria-label={label} data-testid="ra-commandbar">
      {children}
    </div>
  );
}

// Route boundary: one component owning the loading/error/unavailable/
// unauthorized branching for data-backed pages.
export function ResearchRouteBoundary({
  state,
  errorMessage,
  onRetry,
  unavailableTitle = "This area is not available yet.",
  unavailableBody = "It is being prepared. Nothing is wrong with your account.",
  children,
}: {
  state: "loading" | "ok" | "error" | "unavailable" | "unauthorized";
  errorMessage?: string;
  onRetry?: () => void;
  unavailableTitle?: string;
  unavailableBody?: string;
  children: ReactNode;
}) {
  if (state === "loading") return <ResearchLoadingState />;
  if (state === "error") return <ResearchErrorState message={errorMessage} onRetry={onRetry} />;
  if (state === "unavailable") return <ResearchEmptyState title={unavailableTitle} body={unavailableBody} />;
  if (state === "unauthorized")
    return (
      <ResearchEmptyState
        title="Please sign in."
        body="Your session has ended. Sign in again to continue."
        action={<a href="/research/sign-in" className="btn btn-primary">Member Login</a>}
      />
    );
  return <>{children}</>;
}

// Selected-state card used by application/assessment forms (accepted Codex
// concept: purple text + border + soft background + visible check, never
// color alone).
export function ResearchSelectCard({
  selected,
  onSelect,
  label,
  description,
  disabled = false,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`ra-select-card ${selected ? "ra-select-card-on" : ""}`}
      data-testid="ra-select-card"
    >
      <span className="ra-select-check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
      <span>
        <span className="body-m font-700 block">{label}</span>
        {description && <span className="body-s text-ink-2 block mt-1">{description}</span>}
      </span>
    </button>
  );
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
