import { useCallback, useEffect, useState } from "react";
import type { PlanDocument } from "@shared/research/member-platform";
import { PLAN_DOCUMENT_TYPES } from "@shared/research/member-platform";
import { useResearch } from "../../core";
import {
  acknowledgeDocument,
  getDocuments,
  requestDocumentAccess,
  type DocumentsResponse,
} from "../../adapters/member";
import type { ApiResult } from "../../lib/api";
import { ResearchEmptyState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { ResearchMemberShell } from "../../ui/shells";

function documentValid(value: PlanDocument): boolean {
  return !!value
    && typeof value.documentId === "string"
    && PLAN_DOCUMENT_TYPES.includes(value.type)
    && typeof value.title === "string"
    && Number.isInteger(value.version)
    && value.version > 0
    && typeof value.templateVersion === "string"
    && /^[a-f0-9]{64}$/i.test(value.checksumSha256)
    && ["current", "archived"].includes(value.status)
    && typeof value.publishedAt === "string";
}

function responseValid(value: DocumentsResponse): boolean {
  return value?.ok === true && Array.isArray(value.documents) && value.documents.every(documentValid);
}

export default function Documents() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<DocumentsResponse> | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    setResult(await getDocuments(memberToken));
  }, [memberToken]);

  useEffect(() => {
    let current = true;
    setResult(null);
    void getDocuments(memberToken).then((next) => { if (current) setResult(next); });
    return () => { current = false; };
  }, [memberToken]);

  const openDocument = async (document: PlanDocument) => {
    setBusyId(document.documentId);
    setActionMessage(null);
    const response = await requestDocumentAccess(document.documentId, memberToken);
    setBusyId(null);
    if (response.kind !== "ok"
      || response.data.ok !== true
      || response.data.grant.documentId !== document.documentId
      || !response.data.grant.signedUrl.startsWith(`/api/research/documents/${encodeURIComponent(document.documentId)}/download?`)
      || Number.isNaN(Date.parse(response.data.grant.expiresAt))) {
      setActionMessage("The private document could not be opened.");
      return;
    }
    window.location.assign(response.data.grant.signedUrl);
  };

  const acknowledge = async (document: PlanDocument) => {
    setBusyId(document.documentId);
    setActionMessage(null);
    const response = await acknowledgeDocument(document.documentId, document.version, memberToken);
    setBusyId(null);
    if (response.kind !== "ok" || response.data.ok !== true || Number.isNaN(Date.parse(response.data.acknowledgedAt))) {
      setActionMessage("The document could not be acknowledged.");
      return;
    }
    setActionMessage("Document acknowledged.");
    await load();
  };

  const invalid = result?.kind === "ok" && !responseValid(result.data);
  const state = result === null ? "loading"
    : result.kind === "unauthorized" ? "unauthorized"
      : result.kind === "unavailable" || result.kind === "forbidden" || result.kind === "denied" ? "unavailable"
        : result.kind === "error" || invalid ? "error"
          : "ok";
  const documents = result?.kind === "ok" && !invalid ? result.data.documents : [];

  return (
    <ResearchMemberShell title="Documents" lead="Your private, versioned plan documents.">
      <ResearchRouteBoundary
        state={state}
        errorMessage={invalid ? "The documents response was incomplete." : result?.kind === "error" ? result.message : undefined}
        unavailableTitle="Documents are unavailable."
        unavailableBody="No document or download availability has been inferred."
        onRetry={() => void load()}
      >
        {actionMessage && <p role="status" aria-live="polite" className="card body-s mb-4">{actionMessage}</p>}
        {documents.length === 0 ? (
          <ResearchEmptyState title="No documents yet." body="Published plan documents will appear here." />
        ) : (
          <div className="grid gap-4">
            {documents.map((document) => (
              <article className="card" key={document.documentId}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="body-m font-700">{document.title}</h2>
                    <p className="body-s text-ink-2 mt-1">Version {document.version} · Published {new Date(document.publishedAt).toLocaleDateString()}</p>
                  </div>
                  <ResearchStatusBadge label={document.status} tone={document.status === "current" ? "success" : "neutral"} />
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <button type="button" className="btn btn-secondary" disabled={busyId === document.documentId} onClick={() => void openDocument(document)}>
                    Open securely
                  </button>
                  {document.status === "current" && !document.acknowledgedAt && (
                    <button type="button" className="btn btn-primary" disabled={busyId === document.documentId} onClick={() => void acknowledge(document)}>
                      Acknowledge version {document.version}
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
