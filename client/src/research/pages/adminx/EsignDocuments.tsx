import { useCallback, useState, type FormEvent } from "react";
import { ResearchEmptyState, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import {
  downloadEsignPacket,
  esignResendNotification,
  getEsignDownloadUrl,
  getEsignMemberDocuments,
  type AdminEsignArchive,
  type AdminEsignMemberDocuments,
  type AdminEsignRequest,
  type EsignDownloadWhich,
  type SigningLinkStatus,
  type SigningMode,
} from "../../adapters/esign";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/esign: the e-signature document center. Look up one member,
// then see their completed OpenSign requests and their signed archive: the
// documents signed, the provider status, the integrity hashes, and the
// provider event history when the server includes it. Every download link is
// short-lived and minted by the server on demand (getEsignDownloadUrl, then
// open the returned url). The packet .zip is fetched through the authenticated
// admin session. No raw storage path is ever rendered, and nothing is
// invented: a disabled capability or a missing member reads as an honest
// empty state.
// ---------------------------------------------------------------------------

const STATUS_PRESENTATION: Record<SigningLinkStatus, { label: string; tone: BadgeTone }> = {
  created: { label: "Created", tone: "info" },
  viewed: { label: "Viewed", tone: "info" },
  signed: { label: "Signed", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  declined: { label: "Declined", tone: "warning" },
  revoked: { label: "Revoked", tone: "warning" },
  expired: { label: "Expired", tone: "warning" },
};

const MODE_LABEL: Record<SigningMode, string> = {
  view_only_public_policy: "View-only policy",
  clickwrap_acceptance: "Clickwrap acceptance",
  typed_signature: "Typed signature",
  opensign_document: "OpenSign document",
  opensign_packet: "OpenSign packet",
};

function statusBadge(status: SigningLinkStatus) {
  return STATUS_PRESENTATION[status] ?? { label: status, tone: "neutral" as BadgeTone };
}

export default function EsignDocuments() {
  return (
    <AdminScreen
      title="E-signature documents"
      lead="Look up a member to see their completed OpenSign requests and signed archive: the documents signed, the provider status, the integrity hashes, and short-lived download links minted on demand. No storage path is ever shown."
    >
      {(token) => <EsignBody token={token} />}
    </AdminScreen>
  );
}

function EsignBody({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setMemberId(trimmed.length > 0 ? trimmed : null);
  };

  return (
    <div className="grid gap-6">
      <form
        className="card"
        onSubmit={onSubmit}
        aria-label="Member e-signature lookup"
        data-testid="form-esign-lookup"
      >
        <label htmlFor="esign-member-id" className="form-label">
          Member id
        </label>
        <p className="body-s text-ink-mute mt-1 max-w-[52ch]">
          Enter a member id to load their signing requests and archive. Documents are reached only through the audited
          download route.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            id="esign-member-id"
            type="text"
            className="input-field"
            style={{ maxWidth: 360 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="member id"
            autoComplete="off"
            data-testid="input-esign-member"
          />
          <button type="submit" className="btn btn-primary" data-testid="button-esign-search">
            Load documents
          </button>
        </div>
      </form>

      {memberId ? (
        <MemberEsignDocuments key={memberId} token={token} memberId={memberId} />
      ) : (
        <ResearchEmptyState
          title="Enter a member id to begin."
          body="Nothing loads until you look up a member. This surface shows one member at a time."
        />
      )}
    </div>
  );
}

function MemberEsignDocuments({ token, memberId }: { token: string; memberId: string }) {
  const load = useCallback((t: string) => getEsignMemberDocuments(t, memberId), [memberId]);
  const resource = useAdminResource<AdminEsignMemberDocuments>(token, load);
  const [packetNote, setPacketNote] = useState<string | null>(null);
  const [packetBusy, setPacketBusy] = useState(false);

  const requests = resource.data?.requests ?? [];
  const archive = resource.data?.archive ?? [];

  const onPacket = async () => {
    setPacketNote(null);
    setPacketBusy(true);
    const ok = await downloadEsignPacket(token, memberId);
    setPacketBusy(false);
    setPacketNote(
      ok
        ? "The signed packet download has started."
        : "The packet is not available for this member right now. Nothing was downloaded.",
    );
  };

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="The e-signature document center is not open."
      unavailableBody="E-signature is not enabled in this environment, so there are no signing documents to show."
    >
      <div className="grid gap-6" data-testid={`esign-member-${memberId}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="body-l font-700">
            Member <span className="mono-label text-ink-mute">{resource.data?.memberId ?? memberId}</span>
          </h2>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onPacket()}
              disabled={packetBusy}
              data-testid="button-esign-packet"
            >
              {packetBusy ? "Preparing..." : "Download packet (.zip)"}
            </button>
            {packetNote && (
              <p className="body-s text-ink-mute" role="status" data-testid="esign-packet-note">
                {packetNote}
              </p>
            )}
          </div>
        </div>

        <section aria-label="Signing requests">
          <h3 className="mono-label text-ink-mute mb-3">Completed signing requests</h3>
          {requests.length === 0 ? (
            <ResearchEmptyState
              title="No completed signing requests."
              body="Completed OpenSign requests for this member will appear here."
            />
          ) : (
            <div className="grid gap-4">
              {requests.map((request) => (
                <RequestCard key={request.requestId} token={token} request={request} />
              ))}
            </div>
          )}
        </section>

        <section aria-label="Signed archive">
          <h3 className="mono-label text-ink-mute mb-3">Signed archive</h3>
          {archive.length === 0 ? (
            <ResearchEmptyState
              title="No archived documents."
              body="Archived signed documents and completion certificates for this member will appear here."
            />
          ) : (
            <div className="grid gap-4">
              {archive.map((entry) => (
                <ArchiveCard key={entry.archiveId} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminBoundary>
  );
}

function HashRow({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="body-s text-ink-mute">
      {label}:{" "}
      {value ? (
        <span className="mono-label" style={{ overflowWrap: "anywhere" }}>
          {value}
        </span>
      ) : (
        <span>not recorded</span>
      )}
    </p>
  );
}

function RequestCard({ token, request }: { token: string; request: AdminEsignRequest }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | EsignDownloadWhich | "resend">(null);
  const badge = statusBadge(request.status);

  const onDownload = async (which: EsignDownloadWhich) => {
    setNote(null);
    setBusy(which);
    const result = await getEsignDownloadUrl(token, request.requestId, which);
    setBusy(null);
    if (result.kind === "ok") {
      // The URL is short-lived and minted by the server; open it, never store it.
      window.open(result.data.grant.signedUrl, "_blank", "noopener,noreferrer");
      setNote(`A short-lived ${which} link opened in a new tab.`);
    } else if (result.kind === "denied") {
      setNote(result.message ?? "That download was refused.");
    } else if (result.kind === "unavailable") {
      setNote("E-signature downloads are not available in this environment.");
    } else {
      setNote(`The ${which} document could not be opened. Please try again.`);
    }
  };

  const onResend = async () => {
    setNote(null);
    setBusy("resend");
    const result = await esignResendNotification(token, request.requestId);
    setBusy(null);
    if (result.kind === "ok" && result.data.resent) {
      setNote("The completion notification was resent.");
    } else if (result.kind === "denied") {
      setNote(result.message ?? "That request cannot be resent right now.");
    } else if (result.kind === "unavailable") {
      setNote("Resending is not available in this environment.");
    } else {
      setNote("The notification could not be resent. Please try again.");
    }
  };

  return (
    <article className="card grid gap-3" data-testid={`esign-request-${request.requestId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="body-m font-700">{MODE_LABEL[request.mode] ?? request.mode}</p>
          <p className="body-s text-ink-mute mt-1">
            Request <span className="mono-label">{request.requestId}</span>
          </p>
        </div>
        <ResearchStatusBadge label={badge.label} tone={badge.tone} />
      </div>

      <div className="grid gap-1">
        <p className="body-s text-ink-2">
          Document versions:{" "}
          <span className="mono-label" style={{ overflowWrap: "anywhere" }}>
            {request.documentVersionIds.join(", ")}
          </span>
        </p>
        <p className="body-s text-ink-mute">
          Completed: {request.completedAt ? fmtDateTime(request.completedAt) : "not completed"}
        </p>
        {request.providerDocumentId && (
          <p className="body-s text-ink-mute">
            Provider document: <span className="mono-label">{request.providerDocumentId}</span>
          </p>
        )}
        <HashRow label="Signed PDF hash" value={request.signedPdfHash} />
        <HashRow label="Certificate hash" value={request.certificateHash} />
      </div>

      {request.providerEventLog && request.providerEventLog.length > 0 && (
        <div data-testid={`esign-events-${request.requestId}`}>
          <p className="mono-label text-ink-mute mb-2">Provider events</p>
          <ul className="grid gap-1">
            {request.providerEventLog.map((event) => (
              <li key={event.eventId} className="body-s text-ink-mute">
                {event.type} · {fmtDateTime(event.occurredAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void onDownload("signed")}
          disabled={busy !== null}
          data-testid={`button-download-signed-${request.requestId}`}
        >
          {busy === "signed" ? "Opening..." : "Open signed document"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void onDownload("certificate")}
          disabled={busy !== null}
          data-testid={`button-download-certificate-${request.requestId}`}
        >
          {busy === "certificate" ? "Opening..." : "Open certificate"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void onResend()}
          disabled={busy !== null}
          data-testid={`button-resend-${request.requestId}`}
        >
          {busy === "resend" ? "Resending..." : "Resend notification"}
        </button>
      </div>

      {note && (
        <p className="body-s text-ink-mute" role="status" data-testid={`esign-request-note-${request.requestId}`}>
          {note}
        </p>
      )}
    </article>
  );
}

function ArchiveCard({ entry }: { entry: AdminEsignArchive }) {
  return (
    <article className="card grid gap-2" data-testid={`esign-archive-${entry.archiveId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="body-m font-700">
            Document version <span className="mono-label">{entry.documentVersionId}</span>
          </p>
          <p className="body-s text-ink-mute mt-1">
            Packet or document <span className="mono-label">{entry.packetOrDocumentId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ResearchStatusBadge label={entry.archiveStatus} tone="neutral" />
          <ResearchStatusBadge label={entry.accessClassification} tone="info" />
        </div>
      </div>
      <p className="body-s text-ink-mute">
        Completed: {entry.completedAt ? fmtDateTime(entry.completedAt) : "not recorded"}
      </p>
      <HashRow label="Signed PDF hash" value={entry.signedPdfHash} />
      <HashRow label="Certificate hash" value={entry.certificateHash} />
      <HashRow label="xenios source hash" value={entry.xeniosSourceHash} />
    </article>
  );
}
