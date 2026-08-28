import type { TebraConfigurationLoadState } from "./useTebraPublicConfiguration";

interface Props {
  state: TebraConfigurationLoadState;
  onRetry: () => void;
}

export default function TebraPortalHandoff({ state, onRetry }: Props) {
  if (state.kind === "loading") {
    return (
      <aside className="card max-w-[760px]" aria-live="polite" aria-busy="true">
        <p className="mono-label text-pulse mb-3">CHECKING PORTAL HANDOFF</p>
        <h2 className="h2">Verifying the official Tebra portal link…</h2>
      </aside>
    );
  }

  if (state.kind === "error") {
    return (
      <aside className="card max-w-[760px]" role="alert">
        <p className="mono-label text-pulse mb-3">PORTAL LINK UNAVAILABLE</p>
        <h2 className="h2">The Tebra portal link could not be verified.</h2>
        <p className="body-m text-ink-2 mt-4">No account or portal session has been created here.</p>
        <button type="button" className="btn btn-secondary min-h-11 mt-5" onClick={onRetry}>
          Try again
        </button>
      </aside>
    );
  }

  const portal = state.configuration.portal;
  if (portal.status !== "ready") {
    const summary = portal.status === "care_unavailable"
      ? "Xenios Care is not available."
      : portal.status === "configuration_invalid"
        ? "The portal handoff is unavailable while its configuration is reviewed."
        : "The portal handoff has not been configured.";
    return (
      <aside className="card max-w-[760px]" role="status" data-tebra-portal-status={portal.status}>
        <p className="mono-label text-pulse mb-3">PORTAL UNAVAILABLE</p>
        <h2 className="h2">{summary}</h2>
        <p className="body-m text-ink-2 mt-4">
          Xenios does not create a Tebra portal account or bypass the practice invitation process.
        </p>
      </aside>
    );
  }

  return (
    <aside className="card max-w-[760px]" data-tebra-portal-handoff="external-only">
      <p className="mono-label text-pulse mb-3">EXTERNAL SECURE HANDOFF</p>
      <h2 className="h2">Continue to the Tebra Patient Portal.</h2>
      <p className="body-m text-ink-2 mt-4">
        The portal is operated by Tebra. New portal access begins with a practice invitation;
        activated patients sign in separately. This link does not create an account, sign you in,
        or confirm that portal access is active. Payments appear only if the practice has activated
        Tebra Payments or Patient Collect.
      </p>
      <p className="body-m text-ink-2 mt-4">
        Depending on the practice configuration and what has been shared, the portal may contain
        secure communications, health information, lab results, clinical documents, statements,
        and enabled payment tools.
      </p>
      <a
        className="btn btn-primary min-h-11 mt-6"
        href={portal.url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        Open the Tebra Patient Portal
      </a>
      <p className="body-s text-ink-mute mt-3">
        Opens Tebra in a new tab. Care records, Patient Portal activity, secure communications,
        statements, and any enabled payments stay in Tebra.
      </p>
    </aside>
  );
}
