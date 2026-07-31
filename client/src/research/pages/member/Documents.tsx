import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanDocument } from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { acknowledgeDocument, fetchDocumentBlob, getDocuments, requestDocumentAccess, type DocumentsResponse } from "../../adapters/member";
import type { ApiResult } from "../../lib/api";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { ResearchMemberShell } from "../../ui/shells";

type Feedback = { kind: "success" | "error"; message: string };

export default function Documents() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<DocumentsResponse> | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const operation = useRef(0);
  const feedbackTarget = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setResult(null);
    setResult(await getDocuments(memberToken));
  }, [memberToken]);

  useEffect(() => {
    let current = true;
    ++operation.current;
    setOpeningId(null);
    setAcknowledgingId(null);
    setResult(null);
    void getDocuments(memberToken).then((next) => { if (current) setResult(next); });
    return () => { current = false; ++operation.current; };
  }, [memberToken]);

  const restoreFocus = (element: HTMLElement | null) => { if (element?.isConnected) element.focus(); };

  const openDocument = async (document: PlanDocument, control: HTMLButtonElement) => {
    const current = ++operation.current;
    setAcknowledgingId(null);
    setOpeningId(document.documentId);
    setFeedback(null);
    if (!memberToken) {
      setOpeningId(null);
      setFeedback({ kind: "error", message: "Please sign in again to open this private document." });
      restoreFocus(control);
      return;
    }
    const response = await requestDocumentAccess(document.documentId, memberToken);
    if (current !== operation.current) return;
    if (response.kind !== "ok") {
      setOpeningId(null);
      setFeedback({ kind: "error", message: "The private document could not be opened." });
      restoreFocus(control);
      return;
    }
    const downloaded = await fetchDocumentBlob(response.data.grant, memberToken);
    if (current !== operation.current) return;
    setOpeningId(null);
    if (downloaded.kind !== "ok") {
      setFeedback({ kind: "error", message: "The private document could not be opened." });
      restoreFocus(control);
      return;
    }
    const objectUrl = URL.createObjectURL(downloaded.data);
    const anchor = control.ownerDocument.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `document-${document.version}.pdf`;
    anchor.hidden = true;
    control.ownerDocument.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(objectUrl); }
    setFeedback({ kind: "success", message: "Your private document download has started." });
    restoreFocus(control);
  };

  const acknowledge = async (document: PlanDocument, control: HTMLButtonElement) => {
    const current = ++operation.current;
    setOpeningId(null);
    setAcknowledgingId(document.documentId);
    setFeedback(null);
    const response = await acknowledgeDocument(document.documentId, document.version, memberToken);
    if (current !== operation.current) return;
    if (response.kind !== "ok") {
      setAcknowledgingId(null);
      setFeedback({ kind: "error", message: "The document could not be acknowledged." });
      restoreFocus(control);
      return;
    }
    const refreshed = await getDocuments(memberToken);
    if (current !== operation.current) return;
    setAcknowledgingId(null);
    setResult(refreshed);
    if (refreshed.kind === "ok" && refreshed.data.documents.some((item) => item.documentId === document.documentId && item.acknowledgedAt === response.data.acknowledgedAt)) {
      setFeedback({ kind: "success", message: "Document acknowledged." });
    } else {
      setFeedback({ kind: "error", message: "The document status could not be refreshed." });
    }
    feedbackTarget.current?.focus();
  };

  const state = result === null ? "loading"
    : result.kind === "unauthorized" ? "unauthorized"
      : result.kind === "unavailable" || result.kind === "forbidden" || result.kind === "denied" ? "unavailable"
        : result.kind === "error" ? "error" : "ok";
  const documents = result?.kind === "ok" ? result.data.documents : [];

  return (
    <ResearchMemberShell title="Documents" lead="Your private, versioned plan documents.">
      <ResearchRouteBoundary state={state} errorMessage={result?.kind === "error" ? result.message : undefined}
        unavailableTitle="Documents are unavailable." unavailableBody="No document or download availability has been inferred." onRetry={() => void load()}>
        <div id="documents-feedback" ref={feedbackTarget} tabIndex={-1} aria-live={feedback?.kind === "error" ? "assertive" : "polite"}
          role={feedback?.kind === "error" ? "alert" : "status"} className={feedback ? "card body-s mb-4" : "sr-only"}>
          {feedback?.message ?? "Document action updates appear here."}
        </div>
        {documents.length === 0 ? <ResearchEmptyState title="No documents yet." body="Published plan documents will appear here." /> : (
          <div className="grid gap-4">
            {documents.map((document) => (
              <article className="card min-w-0" key={document.documentId}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0"><h2 className="body-m font-700 break-words">{document.title}</h2>
                    <p className="body-s text-ink-2 mt-1">Version {document.version} · Published {new Date(document.publishedAt).toLocaleDateString()}</p></div>
                  <ResearchStatusBadge label={document.status} tone={document.status === "current" ? "success" : "neutral"} />
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <button type="button" className="btn btn-secondary" aria-describedby="documents-feedback"
                    disabled={openingId === document.documentId} onClick={(event) => void openDocument(document, event.currentTarget)}>
                    {openingId === document.documentId ? "Opening securely…" : "Open securely"}
                  </button>
                  {document.status === "current" && !document.acknowledgedAt && (
                    <button type="button" className="btn btn-primary" aria-describedby="documents-feedback"
                      disabled={acknowledgingId === document.documentId} onClick={(event) => void acknowledge(document, event.currentTarget)}>
                      {acknowledgingId === document.documentId ? "Acknowledging…" : `Acknowledge version ${document.version}`}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
