import { useCallback, useEffect, useState } from "react";
import { useResearch } from "../../core";
import { getDocuments } from "../../adapters/member";
import { devFixture } from "../../lib/fixtures";
import { ResearchMemberShell } from "../../ui/shells";
import type { PlanDocument, PlanDocumentType } from "@shared/research/member-platform";
import {
  ResearchDocumentCard,
  ResearchDrawer,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTimeline,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Member Document Center (/research/member/documents). Every fact on this page
// comes from GET /api/research/documents (server/research/documents.ts:588).
//
// THE SERVER ENVELOPE, verbatim (documents.ts:594):
//     res.json({ ok: true, documents: rows.map(toPlanDocument) });
//
// and toPlanDocument (documents.ts:78) is the ONLY member-facing serializer:
//     {
//       documentId, type, title, version, templateVersion, checksumSha256,
//       status, supersedesDocumentId, reviewedBy, publishedAt, acknowledgedAt
//     }
//
// So there is no `id`, no `reviewer`, no boolean `acknowledged`, no `history`
// array and no `signedUrl` on this route. `version` is a NUMBER, `type` is a
// machine key (blueprint_pdf and friends), and acknowledgment is expressed as
// a nullable TIMESTAMP. Storage paths are absent by construction, which is
// why nothing here can render a file location.
//
// The page maps that shape and nothing else. Downloads are NOT wired: the
// bytes live behind POST /api/research/documents/:documentId/access, which
// mints a short-lived grant whose URL is itself guarded by requireActiveMember
// (a bearer session, not a cookie), so a plain link would fail. Until that
// call has an adapter, the honest state is "Download pending", never a
// fabricated link.
// ---------------------------------------------------------------------------

interface DocumentHistoryEvent {
  at: string;
  title: string;
  detail?: string;
}

// The page's own view model, derived only from fields the server actually
// sends. Nullable here means "the server may leave it out", never "invent it".
interface MemberDocument {
  documentId: string;
  title: string;
  typeLabel: string;
  version: number | null;
  templateVersion: string | null;
  checksumSha256: string | null;
  status: "current" | "archived" | null;
  supersedesDocumentId: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  acknowledgedAt: string | null;
}

// Exhaustive over PlanDocumentType: a new document type in the shared union
// fails this file's typecheck until member-facing copy exists for it.
const TYPE_LABELS: Record<PlanDocumentType, string> = {
  blueprint_pdf: "Blueprint",
  fitness_plan_pdf: "Fitness plan",
  nutrition_plan_pdf: "Nutrition plan",
  xenios90_roadmap_pdf: "Xenios 90 roadmap",
  other: "Document",
};

function typeLabelFor(value: unknown): string {
  const key = typeof value === "string" ? value : "";
  if (Object.prototype.hasOwnProperty.call(TYPE_LABELS, key)) {
    return TYPE_LABELS[key as PlanDocumentType];
  }
  // An unrecognized key is still shown, humanized, rather than dropped.
  const humanized = key.replace(/_pdf$/, "").replace(/_/g, " ").trim();
  if (!humanized) return "Document";
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// Dates arrive as ISO timestamps. Formatted in UTC so the rendered day never
// drifts with the reader's clock; an unparseable value is shown exactly as the
// server sent it rather than replaced with a guess.
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function versionText(doc: MemberDocument): string {
  return doc.version != null ? String(doc.version) : "unknown";
}

function statusLabel(status: MemberDocument["status"]): string | null {
  if (status === "current") return "current version";
  if (status === "archived") return "archived";
  return null;
}

// A current document that has not been acknowledged is a real call to action.
// An archived one is not: the server refuses to acknowledge a replaced
// document (documents.ts:332), so "Needs acknowledgment" would be a false
// prompt there. Unknown status yields no badge at all.
function acknowledgedFlag(doc: MemberDocument): boolean | null {
  if (doc.acknowledgedAt) return true;
  if (doc.status === "current") return false;
  return null;
}

function toMemberDocument(raw: unknown): MemberDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const documentId = text(row.documentId);
  if (!documentId) return null;
  const status = row.status === "current" || row.status === "archived" ? row.status : null;
  return {
    documentId,
    // The server column is not nullable, so this fallback names an absence
    // rather than filling one in.
    title: text(row.title) ?? "Untitled document",
    typeLabel: typeLabelFor(row.type),
    version: typeof row.version === "number" && Number.isFinite(row.version) ? row.version : null,
    templateVersion: text(row.templateVersion),
    checksumSha256: text(row.checksumSha256),
    status,
    supersedesDocumentId: text(row.supersedesDocumentId),
    reviewedBy: text(row.reviewedBy),
    publishedAt: text(row.publishedAt),
    acknowledgedAt: text(row.acknowledgedAt),
  };
}

type DocumentsPayload = { ok?: boolean; documents?: unknown } | unknown[];

// The real envelope is { ok, documents }. A bare array is tolerated so the
// page does not break if the envelope is ever unwrapped upstream.
export function normalizeDocuments(payload: DocumentsPayload): MemberDocument[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { documents?: unknown })?.documents)
      ? ((payload as { documents?: unknown }).documents as unknown[])
      : [];
  return rows.map(toMemberDocument).filter((doc): doc is MemberDocument => doc !== null);
}

// The history the server can actually support today: it keeps one row per
// version with a published timestamp, an acknowledgment timestamp, and a
// pointer at the version this one replaced. Every event below is one of those
// stored facts restated, never a reconstructed edit log.
function historyFor(doc: MemberDocument): DocumentHistoryEvent[] {
  const events: Array<DocumentHistoryEvent & { sortKey: string }> = [];
  if (doc.publishedAt) {
    const detail = [
      doc.templateVersion ? `Template version ${doc.templateVersion}.` : null,
      doc.supersedesDocumentId ? "Replaces an earlier version." : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" ");
    events.push({
      at: formatDate(doc.publishedAt) ?? doc.publishedAt,
      title: `Version ${versionText(doc)} published`,
      sortKey: doc.publishedAt,
      ...(detail ? { detail } : {}),
    });
  }
  if (doc.acknowledgedAt) {
    events.push({
      at: formatDate(doc.acknowledgedAt) ?? doc.acknowledgedAt,
      title: "Acknowledged by you",
      sortKey: doc.acknowledgedAt,
    });
  }
  return events
    .sort((a, b) => (a.sortKey === b.sortKey ? 0 : a.sortKey < b.sortKey ? 1 : -1))
    .map(({ sortKey: _sortKey, ...event }) => event);
}

// Dev-only synthetic documents, written in the SERVER's shape so the preview
// exercises the same normalizer the live response does. devFixture returns
// null in production, so a live member can never see these.
function fixtureDocuments(): PlanDocument[] {
  return [
    {
      documentId: "fixture-blueprint-v2",
      type: "blueprint_pdf",
      title: "Your Blueprint",
      version: 2,
      templateVersion: "3",
      checksumSha256: "fixture0000000000000000000000000000000000000000000000000000000f",
      status: "current",
      supersedesDocumentId: "fixture-blueprint-v1",
      reviewedBy: "Samuel",
      publishedAt: "2026-06-02T09:00:00.000Z",
      acknowledgedAt: "2026-06-04T17:30:00.000Z",
    },
    {
      documentId: "fixture-nutrition-v1",
      type: "nutrition_plan_pdf",
      title: "Nutrition Plan",
      version: 1,
      templateVersion: "1",
      checksumSha256: "fixture1111111111111111111111111111111111111111111111111111111f",
      status: "current",
      supersedesDocumentId: null,
      reviewedBy: "Samuel",
      publishedAt: "2026-05-18T09:00:00.000Z",
      acknowledgedAt: null,
    },
    {
      documentId: "fixture-blueprint-v1",
      type: "blueprint_pdf",
      title: "Your Blueprint",
      version: 1,
      templateVersion: "2",
      checksumSha256: "fixture2222222222222222222222222222222222222222222222222222222f",
      status: "archived",
      supersedesDocumentId: null,
      reviewedBy: "Samuel",
      publishedAt: "2026-03-14T09:00:00.000Z",
      acknowledgedAt: null,
    },
  ];
}

type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

const UNAVAILABLE_TITLE = "Your documents appear after activation.";
const UNAVAILABLE_BODY =
  "Agreements, notices, and protocol documents are published here by the research team as your membership becomes active. Nothing is wrong with your account.";

export default function Documents() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [documents, setDocuments] = useState<MemberDocument[]>([]);
  const [source, setSource] = useState<"server" | "fixture">("server");
  const [historyDoc, setHistoryDoc] = useState<MemberDocument | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    const result = await getDocuments<DocumentsPayload>(memberToken);
    if (result.kind === "ok") {
      setDocuments(normalizeDocuments(result.data));
      setSource("server");
      setState("ok");
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      // Endpoint not published (or not yet granted). Dev builds may render
      // typed fixtures; production renders the honest pending state.
      const fixture = devFixture(fixtureDocuments);
      if (fixture) {
        setDocuments(normalizeDocuments({ ok: true, documents: fixture }));
        setSource("fixture");
        setState("ok");
      } else {
        setState("unavailable");
      }
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ResearchMemberShell
      title="Documents"
      lead="Your agreements, notices, and protocol documents, with their version history and acknowledgment status."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void load()}
        unavailableTitle={UNAVAILABLE_TITLE}
        unavailableBody={UNAVAILABLE_BODY}
      >
        {source === "fixture" && (
          <p className="mono-label text-ink-mute mb-4" role="note">
            Development preview data. Production shows only documents published by the research team.
          </p>
        )}
        {documents.length === 0 ? (
          <ResearchEmptyState title={UNAVAILABLE_TITLE} body={UNAVAILABLE_BODY} />
        ) : (
          <div className="grid gap-4">
            {documents.map((doc) => (
              <ResearchDocumentCard
                key={doc.documentId}
                title={doc.title}
                docType={doc.templateVersion ? `${doc.typeLabel} · template v${doc.templateVersion}` : doc.typeLabel}
                version={versionText(doc)}
                publishedAt={formatDate(doc.publishedAt)}
                acknowledged={acknowledgedFlag(doc)}
                reviewer={doc.reviewedBy}
                action={
                  <div className="flex items-center gap-2" data-testid={`document-actions-${doc.documentId}`}>
                    {doc.status === "archived" && <ResearchStatusBadge label="Archived" tone="neutral" />}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setHistoryDoc(doc)}
                      aria-label={`View history for ${doc.title}`}
                    >
                      History
                    </button>
                    {/* This route serves records, not bytes. A download needs a
                        separate signed grant, so the pending badge stands until
                        that call is wired. Never a fabricated link. */}
                    <ResearchStatusBadge label="Download pending" tone="pending" />
                  </div>
                }
              />
            ))}
          </div>
        )}
        <div className="mt-8">
          <ResearchSecureNotice>
            Your documents are stored privately and released only through short-lived signed links generated by the
            server. Downloading from this page is not open yet, so every file is marked pending here.
          </ResearchSecureNotice>
        </div>
      </ResearchRouteBoundary>

      <ResearchDrawer
        open={historyDoc !== null}
        title={historyDoc ? `${historyDoc.title}: history` : "Document history"}
        onClose={() => setHistoryDoc(null)}
      >
        {historyDoc && (
          <div data-testid={`document-history-${historyDoc.documentId}`}>
            <p className="mono-label text-ink-mute mb-2">
              {historyDoc.typeLabel} · v{versionText(historyDoc)}
              {historyDoc.templateVersion ? ` · template v${historyDoc.templateVersion}` : ""}
              {statusLabel(historyDoc.status) ? ` · ${statusLabel(historyDoc.status)}` : ""}
            </p>
            {historyDoc.checksumSha256 && (
              <p className="body-s text-ink-mute mb-4">
                Checksum (SHA-256): <span className="mono-label">{historyDoc.checksumSha256}</span>
              </p>
            )}
            <ResearchTimeline items={historyFor(historyDoc)} />
          </div>
        )}
      </ResearchDrawer>
    </ResearchMemberShell>
  );
}
