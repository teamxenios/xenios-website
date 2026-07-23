import { useEffect, useState } from "react";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { listSignedAgreements, type SignedAgreementDto } from "../../adapters/activation";
import {
  getEsignDocuments,
  isProviderBackedMode,
  type MemberEsignRequest,
  type SigningLinkStatus,
  type SigningMode,
} from "../../adapters/esign";

// ---------------------------------------------------------------------------
// Member document center (/research/member/documents-center). One calm place
// for the member to see what they have signed and what still needs signing:
//   - their native signed agreements (typed-signature and clickwrap records)
//   - their OpenSign requests: required, in progress, and signed
// A pending provider-backed request offers a secure signing link when one is
// live, with an honest note that the signature is confirmed only after the
// provider reports back. There is no false "signed" state before the server
// confirms. When either endpoint is disabled or empty, the page stays calm
// (no signed documents yet), never an error.
// ---------------------------------------------------------------------------

const STATUS_PRESENTATION: Record<SigningLinkStatus, { label: string; tone: BadgeTone }> = {
  created: { label: "Not started", tone: "warning" },
  viewed: { label: "In progress", tone: "info" },
  signed: { label: "Awaiting confirmation", tone: "info" },
  completed: { label: "Signed", tone: "success" },
  declined: { label: "Declined", tone: "warning" },
  revoked: { label: "Revoked", tone: "warning" },
  expired: { label: "Expired", tone: "warning" },
};

const MODE_LABEL: Record<SigningMode, string> = {
  view_only_public_policy: "Policy to read",
  clickwrap_acceptance: "Agreement to accept",
  typed_signature: "Agreement to sign",
  opensign_document: "Document to sign",
  opensign_packet: "Document packet to sign",
};

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type LoadState = "loading" | "ok" | "unauthorized";

export default function DocumentCenter() {
  const { member, memberChecking, memberToken } = useResearch();
  const [signed, setSigned] = useState<SignedAgreementDto[]>([]);
  const [requests, setRequests] = useState<MemberEsignRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    if (!member || !memberToken) return;
    let alive = true;
    (async () => {
      const [signedRes, esignRes] = await Promise.all([
        listSignedAgreements(memberToken),
        getEsignDocuments(memberToken),
      ]);
      if (!alive) return;

      if (signedRes.kind === "ok") {
        setSigned(signedRes.data.signed ?? []);
      } else if (signedRes.kind === "unauthorized") {
        setSessionEnded(true);
      }
      // Any other outcome (denied, disabled, unavailable, error) stays calm:
      // the list simply remains empty, never an error banner.

      if (esignRes.kind === "ok") {
        setRequests(esignRes.data.documents ?? []);
      } else if (esignRes.kind === "unauthorized") {
        setSessionEnded(true);
      }

      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [member, memberToken]);

  const state: LoadState = memberChecking
    ? "loading"
    : !member || sessionEnded
      ? "unauthorized"
      : !loaded
        ? "loading"
        : "ok";

  const hasNothing = signed.length === 0 && requests.length === 0;

  return (
    <ResearchMemberShell
      title="Documents"
      lead="Everything you have signed, and anything still waiting for your signature, in one place."
    >
      <ResearchRouteBoundary state={state}>
        {hasNothing ? (
          <ResearchEmptyState
            title="No signed documents yet."
            body="When you sign an agreement it appears here, along with anything still waiting for your signature. Nothing is wrong with your account."
          />
        ) : (
          <div className="grid gap-10">
            <EsignSection requests={requests} />
            <SignedAgreementsSection signed={signed} />
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

function EsignSection({ requests }: { requests: MemberEsignRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <section aria-label="E-signature requests">
      <h2 className="body-l font-700 mb-4">E-signature requests</h2>
      <div className="grid gap-4">
        {requests.map((request) => (
          <EsignRequestRow key={request.requestId} request={request} />
        ))}
      </div>
    </section>
  );
}

function EsignRequestRow({ request }: { request: MemberEsignRequest }) {
  const presentation = STATUS_PRESENTATION[request.status] ?? {
    label: request.status,
    tone: "neutral" as BadgeTone,
  };
  const isCompleted = request.status === "completed";
  const providerBacked = isProviderBackedMode(request.mode);
  // A pending provider-backed request can offer a live signing link ONLY when
  // the server includes one (it is provider-ephemeral, returned inline). We
  // never fabricate one, and we never show "signed" before completion.
  const canOpenSigning = providerBacked && !isCompleted && Boolean(request.signingUrl);

  return (
    <article className="card grid gap-3" data-testid={`esign-request-${request.requestId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="body-m font-700">{MODE_LABEL[request.mode] ?? request.mode}</p>
          {isCompleted && request.completedAt && (
            <p className="body-s text-ink-mute mt-1">Signed on {fmtDate(request.completedAt)}.</p>
          )}
        </div>
        <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />
      </div>

      {canOpenSigning && (
        <div className="grid gap-2">
          <a
            href={request.signingUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ justifySelf: "start" }}
            data-testid={`esign-open-signing-${request.requestId}`}
          >
            Open secure signing
          </a>
          <p className="body-s text-ink-mute max-w-[52ch]">
            This opens the secure signing page in a new tab. Your signature is confirmed after you finish and return;
            this page updates once the provider confirms it.
          </p>
        </div>
      )}

      {providerBacked && !isCompleted && !canOpenSigning && (
        <p className="body-s text-ink-mute max-w-[52ch]" data-testid={`esign-pending-note-${request.requestId}`}>
          This document is set up for secure signing. Your secure link is shown when you begin signing; it is confirmed
          only after the provider reports it complete.
        </p>
      )}
    </article>
  );
}

function SignedAgreementsSection({ signed }: { signed: SignedAgreementDto[] }) {
  if (signed.length === 0) return null;
  return (
    <section aria-label="Signed agreements">
      <h2 className="body-l font-700 mb-4">Signed agreements</h2>
      <div className="grid gap-4">
        {signed.map((item) => (
          <article
            key={item.signature.id}
            className="card grid gap-2"
            data-testid={`signed-agreement-${item.signature.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div style={{ minWidth: 0 }}>
                <p className="mono-label text-ink-mute">
                  {item.document?.category ?? item.signature.category} · v{item.signature.semver}
                </p>
                <p className="body-m font-700 mt-1">{item.document?.title ?? item.signature.category}</p>
              </div>
              <ResearchStatusBadge label="Signed" tone="success" />
            </div>
            <p className="body-s text-ink-mute">
              Signed by {item.signature.typedLegalName} on {fmtDate(item.signature.signedAt)}.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
