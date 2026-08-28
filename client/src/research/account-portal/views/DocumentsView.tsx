import { useState } from "react";
import type { DocumentSummaryDto } from "@shared/research/customer-account/contract";
import { ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { formatAccountDate, safeAccountPath, sentenceCase } from "../format";

export function AccountDocumentsView({
  documents,
  onDownload,
}: {
  documents: readonly DocumentSummaryDto[];
  onDownload: (path: string) => Promise<"ok" | "denied" | "error">;
}) {
  const [downloadState, setDownloadState] = useState<Record<string, "loading" | "ok" | "denied" | "error">>({});

  async function download(document: DocumentSummaryDto) {
    const authorizedPath = safeAccountPath(document.downloadPath);
    if (!authorizedPath || downloadState[document.id] === "loading") return;
    setDownloadState((current) => ({ ...current, [document.id]: "loading" }));
    try {
      const result = await onDownload(authorizedPath);
      setDownloadState((current) => ({ ...current, [document.id]: result }));
    } catch {
      setDownloadState((current) => ({ ...current, [document.id]: "error" }));
    }
  }

  return (
    <div className="account-grid">
      <ResearchSecureNotice>
        Document links are account-authorized paths. Only approved customer-facing receipts, COAs, order records, membership records, and Care administration documents appear here.
      </ResearchSecureNotice>
      <section className="account-surface" aria-labelledby="account-documents-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="account-section-label">Document center</p><h2 id="account-documents-heading" className="account-section-title">Document records</h2></div>
          <ResearchStatusBadge label={documents.length ? `${documents.length} visible ${documents.length === 1 ? "record" : "records"}` : "Status unavailable"} tone="neutral" />
        </div>
        {documents.length ? (
          <div className="account-card-list mt-6">
            {documents.map((document) => {
              const downloadPath = safeAccountPath(document.downloadPath);
              const state = downloadState[document.id];
              const badge = !downloadPath
                ? { label: "Metadata available", tone: "neutral" as const }
                : state === "ok"
                  ? { label: "Download requested", tone: "success" as const }
                : state === "denied"
                  ? { label: "Access unavailable", tone: "warning" as const }
                  : state === "error"
                    ? { label: "Open unavailable", tone: "danger" as const }
                    : state === "loading"
                      ? { label: "Opening", tone: "neutral" as const }
                      : { label: "Authorized path recorded", tone: "neutral" as const };
              return (
                <article className="account-list-card" key={document.id}>
                  <div className="min-w-0">
                    <p className="mono-label text-ink-mute">{sentenceCase(document.kind)} · {formatAccountDate(document.issuedAt)}</p>
                    <h3 className="body-m font-700 mt-2 break-words">{document.title}</h3>
                  </div>
                  <div className="account-list-card-actions">
                    <ResearchStatusBadge label={badge.label} tone={badge.tone} />
                    {downloadPath ? (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        aria-label={`Open ${document.title}`}
                        onClick={() => void download(document)}
                        disabled={state === "loading"}
                      >
                        {state === "loading" ? "Opening" : "Open document"}
                      </button>
                    ) : <span className="body-s text-ink-mute">The document metadata is available, but its file cannot be opened from this account page.</span>}
                    <span className="body-s text-ink-mute" aria-live="polite">
                      {state === "ok" ? "The file was received and a download was requested." : null}
                      {state === "denied" ? "Document access was not granted." : null}
                      {state === "error" ? "Document could not be opened. No file was shown." : null}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="account-empty mt-6">No customer-facing documents are visible in this account view. Document-history completeness is not reported here.</div>}
      </section>
    </div>
  );
}
