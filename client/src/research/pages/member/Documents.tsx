import { useCallback, useEffect, useRef, useState } from "react";
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

const DOCUMENT_KEYS = [
  "documentId", "type", "title", "version", "templateVersion", "checksumSha256",
  "status", "supersedesDocumentId", "reviewedBy", "publishedAt", "acknowledgedAt",
] as const;
const RESPONSE_KEYS = ["ok", "documents"] as const;
const ACCESS_KEYS = ["ok", "grant"] as const;
const GRANT_KEYS = ["documentId", "signedUrl", "expiresAt"] as const;
const ACKNOWLEDGMENT_KEYS = ["ok", "acknowledgedAt"] as const;

type BusyAction = { documentId: string; kind: "access" | "acknowledge" } | null;
type ActionNotice = { kind: "status" | "alert"; message: string } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableNonempty(value: unknown): value is string | null {
  return value === null || nonempty(value);
}

function canonicalTimestamp(value: unknown): value is string {
  if (!nonempty(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || canonicalTimestamp(value);
}

function documentValid(value: unknown): value is PlanDocument {
  if (!isRecord(value) || !hasExactKeys(value, DOCUMENT_KEYS)) return false;
  return nonempty(value.documentId)
    && typeof value.type === "string"
    && PLAN_DOCUMENT_TYPES.includes(value.type as PlanDocument["type"])
    && nonempty(value.title)
    && Number.isSafeInteger(value.version)
    && (value.version as number) > 0
    && nonempty(value.templateVersion)
    && typeof value.checksumSha256 === "string"
    && /^[a-f0-9]{64}$/i.test(value.checksumSha256)
    && (value.status === "current" || value.status === "archived")
    && nullableNonempty(value.supersedesDocumentId)
    && nullableNonempty(value.reviewedBy)
    && canonicalTimestamp(value.publishedAt)
    && nullableTimestamp(value.acknowledgedAt);
}

function responseValid(value: unknown): value is DocumentsResponse {
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS) || value.ok !== true || !Array.isArray(value.documents)) {
    return false;
  }
  const ids = new Set<string>();
  return value.documents.every((document) => {
    if (!documentValid(document) || ids.has(document.documentId)) return false;
    ids.add(document.documentId);
    return true;
  });
}

function accessPathValid(value: unknown, documentId: string): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const url = new URL(value, "https://member.invalid");
    if (url.origin !== "https://member.invalid"
      || url.pathname !== `/api/research/documents/${encodeURIComponent(documentId)}/download`
      || url.hash !== "") return false;
    const keys = Array.from(url.searchParams.keys());
    if (keys.length !== 2 || keys.sort().join(",") !== "exp,sig") return false;
    const exp = url.searchParams.getAll("exp");
    const sig = url.searchParams.getAll("sig");
    return exp.length === 1
      && sig.length === 1
      && /^[0-9]+$/.test(exp[0])
      && Number.isSafeInteger(Number(exp[0]))
      && nonempty(sig[0]);
  } catch {
    return false;
  }
}

function accessResponseValid(value: unknown, documentId: string, now = Date.now()): value is {
  ok: true;
  grant: { documentId: string; signedUrl: string; expiresAt: string };
} {
  if (!isRecord(value) || !hasExactKeys(value, ACCESS_KEYS) || value.ok !== true || !isRecord(value.grant)
    || !hasExactKeys(value.grant, GRANT_KEYS) || value.grant.documentId !== documentId
    || !canonicalTimestamp(value.grant.expiresAt) || !accessPathValid(value.grant.signedUrl, documentId)) return false;
  const url = new URL(value.grant.signedUrl, "https://member.invalid");
  const expiry = Number(url.searchParams.get("exp"));
  return expiry === Date.parse(value.grant.expiresAt) && expiry > now;
}

function acknowledgmentResponseValid(value: unknown): value is { ok: true; acknowledgedAt: string } {
  return isRecord(value)
    && hasExactKeys(value, ACKNOWLEDGMENT_KEYS)
    && value.ok === true
    && canonicalTimestamp(value.acknowledgedAt);
}

function denialMessage(result: ApiResult<unknown>, fallback: string): string {
  if (result.kind === "unauthorized") return "Your session has ended. Sign in again to continue.";
  if (result.kind === "forbidden" || result.kind === "denied") return "You do not have access to this document.";
  if (result.kind === "unavailable") return "Document access is unavailable right now.";
  return fallback;
}

export default function Documents() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<DocumentsResponse> | null>(null);
  const [notice, setNotice] = useState<ActionNotice>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const mounted = useRef(true);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setResult(null);
    const next = await getDocuments(memberToken);
    if (mounted.current) setResult(next);
  }, [memberToken]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const runAction = async (
    action: Exclude<BusyAction, null>,
    operation: () => Promise<void>,
  ) => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(action);
    setNotice(null);
    try {
      await operation();
    } finally {
      if (mounted.current) {
        setBusy(null);
        requestAnimationFrame(() => {
          if (focused?.isConnected) focused.focus();
        });
      }
    }
  };

  const openDocument = (document: PlanDocument) => runAction(
    { documentId: document.documentId, kind: "access" },
    async () => {
      const response = await requestDocumentAccess(document.documentId, memberToken);
      if (response.kind !== "ok" || !accessResponseValid(response.data, document.documentId)) {
        setNotice({ kind: "alert", message: denialMessage(response, "The private document could not be opened.") });
        return;
      }
      window.location.assign(response.data.grant.signedUrl);
    },
  );

  const acknowledge = (document: PlanDocument) => runAction(
    { documentId: document.documentId, kind: "acknowledge" },
    async () => {
      const response = await acknowledgeDocument(document.documentId, document.version, memberToken);
      if (response.kind !== "ok" || !acknowledgmentResponseValid(response.data)) {
        setNotice({ kind: "alert", message: denialMessage(response, "The document could not be acknowledged.") });
        return;
      }
      setNotice({ kind: "status", message: `Version ${document.version} acknowledged.` });
      await load(false);
    },
  );

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
        errorMessage={invalid ? "The documents response was invalid." : result?.kind === "error" ? result.message : undefined}
        unavailableTitle="Documents are unavailable."
        unavailableBody="No document or download availability has been inferred."
        onRetry={() => void load()}
      >
        {notice && (
          <p
            role={notice.kind}
            aria-live={notice.kind === "alert" ? "assertive" : "polite"}
            className="card body-s mb-4"
          >
            {notice.message}
          </p>
        )}
        {documents.length === 0 ? (
          <ResearchEmptyState title="No documents yet." body="Published plan documents will appear here." />
        ) : (
          <div className="grid gap-4">
            {documents.map((document) => {
              const accessBusy = busy?.documentId === document.documentId && busy.kind === "access";
              const acknowledgeBusy = busy?.documentId === document.documentId && busy.kind === "acknowledge";
              const documentBusy = busy?.documentId === document.documentId;
              return (
                <article className="card" key={document.documentId} style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div style={{ minWidth: 0 }}>
                      <h2 className="body-m font-700">{document.title}</h2>
                      <p className="body-s text-ink-2 mt-1">
                        Version {document.version} · Published {new Date(document.publishedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <ResearchStatusBadge label={document.status === "current" ? "Current" : "Archived"} tone={document.status === "current" ? "success" : "neutral"} />
                  </div>
                  <div className="flex flex-wrap gap-3 mt-4">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={documentBusy}
                      aria-busy={accessBusy}
                      onClick={() => void openDocument(document)}
                    >
                      {accessBusy ? "Opening securely…" : "Open securely"}
                    </button>
                    {document.status === "current" && !document.acknowledgedAt && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={documentBusy}
                        aria-busy={acknowledgeBusy}
                        onClick={() => void acknowledge(document)}
                      >
                        {acknowledgeBusy ? "Acknowledging…" : `Acknowledge version ${document.version}`}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
