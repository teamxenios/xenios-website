// Shared, honest presentation pieces for the Care admin console.
//
// Two rules are enforced here rather than repeated in every surface:
//   1. Nothing is ever shown that the server did not return. An area with no
//      contract gets a pending panel naming the exact missing contract.
//   2. A consequential clinical control is rendered so the workflow is legible,
//      and it is always disabled with a plain reason. It carries no click
//      handler at all, so there is no path by which it can fire.

import type { ReactNode } from "react";
import type { CareAdminActionContract, CareAdminArea } from "./contracts";

export type CareAdminLoadState<TData> =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "care_disabled"; message: string }
  | { kind: "error" }
  | { kind: "ready"; data: TData };

export function CareAdminPanel({
  title,
  id,
  busy,
  children,
}: {
  title: string;
  id: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="mt-10 max-w-[860px]"
      aria-labelledby={id}
      aria-live="polite"
      aria-busy={busy === true}
    >
      <h2 id={id} className="h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function CareAdminNote({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="card mt-6">
      <p className="mono-label text-ink-mute mb-3">{label}</p>
      <div className="body-m text-ink-2">{children}</div>
    </div>
  );
}

/** The four states every wired surface must be able to render. */
export function CareAdminLoadStates({
  state,
  loadingLabel,
  emptyLabel,
  onRetry,
}: {
  state: CareAdminLoadState<unknown>;
  loadingLabel: string;
  emptyLabel?: string;
  onRetry: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="card mt-6" data-care-admin-state="loading">
        <p className="body-m text-ink-mute">{loadingLabel}</p>
      </div>
    );
  }
  if (state.kind === "unauthorized") {
    return (
      <div className="card mt-6" data-care-admin-state="unauthorized">
        <p className="body-m text-ink-2">
          This account cannot read this record. Nothing is shown and nothing was
          changed.
        </p>
      </div>
    );
  }
  if (state.kind === "care_disabled") {
    return (
      <div className="card mt-6" data-care-admin-state="care_disabled">
        <p className="body-m text-ink-2">{state.message}</p>
        <p className="body-m text-ink-2 mt-3">
          The server refuses this read while Care is off, so there is nothing to
          display.
        </p>
        <button type="button" className="btn btn-secondary mt-6" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="card mt-6" data-care-admin-state="error">
        <p className="body-m text-ink-2">
          This read did not complete. Nothing was shown and nothing was changed.
        </p>
        <button type="button" className="btn btn-secondary mt-6" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (emptyLabel) {
    return (
      <div className="card mt-6" data-care-admin-state="empty">
        <p className="body-m text-ink-2">{emptyLabel}</p>
      </div>
    );
  }
  return null;
}

/**
 * The honest state for an area with no server contract. It names exactly what
 * is missing and shows no record of any kind.
 */
export function CareAdminPendingContract({ area }: { area: CareAdminArea }) {
  return (
    <div className="card mt-6" data-care-admin-state="pending_contract">
      <p className="mono-label text-pulse mb-3">NO SERVER CONTRACT</p>
      <strong className="body-l">
        This area has no endpoint to read, so nothing is shown.
      </strong>
      <p className="body-m text-ink-2 mt-3">
        No record is displayed here, real or placeholder. What is missing:
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-3">
        {area.missing.map((gap) => (
          <li className="body-m text-ink-2" key={gap}>
            {gap}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Missing pieces listed under a surface that IS partially wired. */
export function CareAdminKnownGaps({ area }: { area: CareAdminArea }) {
  if (area.missing.length === 0) return null;
  return (
    <div className="card mt-4" data-care-admin-state="known_gaps">
      <p className="mono-label text-ink-mute mb-3">KNOWN GAPS</p>
      <ul className="grid grid-cols-1 gap-3">
        {area.missing.map((gap) => (
          <li className="body-m text-ink-2" key={gap}>
            {gap}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A consequential clinical control. Always disabled, always explained, and
 * deliberately handler-free so it cannot call anything.
 */
export function CareAdminBlockedAction({
  action,
}: {
  action: CareAdminActionContract;
}) {
  return (
    <article className="card min-w-0" data-care-clinical-action={action.label}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled
        aria-disabled="true"
        aria-describedby={`care-blocked-${slug(action.label)}`}
      >
        {action.label}
      </button>
      <p
        className="body-m text-ink-2 mt-4"
        id={`care-blocked-${slug(action.label)}`}
      >
        {action.blockedBecause}
      </p>
      <p className="mono-label text-ink-mute mt-4 break-words">
        {action.method} {action.path}
      </p>
    </article>
  );
}

export function CareAdminBlockedActions({ area }: { area: CareAdminArea }) {
  if (area.actions.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby={`care-actions-${area.key}`}>
      <p className="mono-label text-pulse mb-3">CLINICAL CONTROLS, ALL CLOSED</p>
      <h3 id={`care-actions-${area.key}`} className="h3">
        These actions exist on the server and cannot be run from here.
      </h3>
      <div className="mt-6 grid grid-cols-1 gap-3">
        {area.actions.map((action) => (
          <CareAdminBlockedAction action={action} key={action.path} />
        ))}
      </div>
    </section>
  );
}

/** The contracts a surface reads, printed so an operator can verify them. */
export function CareAdminContractList({ area }: { area: CareAdminArea }) {
  if (area.reads.length === 0) return null;
  return (
    <div className="card mt-4">
      <p className="mono-label text-ink-mute mb-3">READS</p>
      <ul className="grid grid-cols-1 gap-2">
        {area.reads.map((contract) => (
          <li className="mono-label text-ink break-words" key={contract.path}>
            {contract.method} {contract.path} · {contract.permission}
          </li>
        ))}
      </ul>
    </div>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
