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
    if (!safeAccountPath(document.downloadPath) || downloadState[document.id] === "loading") return;
    setDownloadState((current) => ({ ...current, [document.id]: "loading" }));
    const result = await onDownload(document.downloadPath);
    setDownloadState((current) => ({ ...current, [document.id]: result }));
  }

  return (
    <div className="account-grid">
      <ResearchSecureNotice>
        Document links are account-authorized paths. Only approved customer-facing receipts, COAs, order records, membership records, and Care administration documents appear here.
      </ResearchSecureNotice>
      <section className="account-surface" aria-labelledby="account-documents-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="account-section-label">Document center</p><h2 id="account-documents-heading" className="account-section-title">Available records</h2></div>
          <ResearchStatusBadge label={`${documents.length} documents`} tone="neutral" />
        </div>
        {documents.length ? (
          <div className="account-card-list mt-6">
            {documents.map((document) => {
              const downloadPath = safeAccountPath(document.downloadPath);
              return (
                <article className="account-list-card" key={document.id}>
                  <div className="min-w-0">
                    <p className="mono-label text-ink-mute">{sentenceCase(document.kind)} · {formatAccountDate(document.issuedAt)}</p>
                    <h3 className="body-m font-700 mt-2 break-words">{document.title}</h3>
                  </div>
                  <div className="account-list-card-actions">
                    <ResearchStatusBadge label="Available" tone="success" />
                    {downloadPath ? (
                      <button className="btn btn-ghost" type="button" onClick={() => void download(document)} disabled={downloadState[document.id] === "loading"}>
                        {downloadState[document.id] === "loading" ? "Opening" : "Open document"}
                      </button>
                    ) : <span className="body-s text-ink-mute">Download unavailable</span>}
                    <span className="body-s text-ink-mute" aria-live="polite">
                      {downloadState[document.id] === "denied" ? "Account access is required." : null}
                      {downloadState[document.id] === "error" ? "Document could not be opened." : null}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="account-empty mt-6">No customer-facing documents are available yet.</div>}
      </section>
    </div>
  );
}
