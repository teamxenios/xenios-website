import { useCallback, useEffect, useState } from "react";
import { useResearch } from "../../core";
import { apiGet } from "../../lib/api";
import { devFixture } from "../../lib/fixtures";
import { ResearchMemberShell } from "../../ui/shells";
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
// Member Document Center (/research/member/documents). Every fact on this
// page comes from GET /api/research/member/documents; when that endpoint is
// not published yet the page renders an honest "documents appear after
// activation" state (dev builds may show typed fixtures via devFixture,
// production never does). Downloads use ONLY a server-provided signedUrl;
// a document without one shows "Download pending" and never a fabricated
// link.
// ---------------------------------------------------------------------------

interface DocumentHistoryEvent {
  at: string;
  title: string;
  detail?: string;
}

interface MemberDocument {
  id: string;
  title: string;
  type: string;
  version: string;
  templateVersion?: string | null;
  reviewer?: string | null;
  publishedAt?: string | null;
  acknowledged?: boolean | null;
  signedUrl?: string | null;
  history?: DocumentHistoryEvent[] | null;
}

type DocumentsPayload = { documents?: MemberDocument[] } | MemberDocument[];

function normalizeDocuments(payload: DocumentsPayload): MemberDocument[] {
  if (Array.isArray(payload)) return payload.filter((d) => d && d.id);
  return (payload?.documents ?? []).filter((d) => d && d.id);
}

// Dev-only synthetic documents. devFixture returns null in production, so a
// live member can never see these. No signedUrl is ever fabricated: fixture
// documents render the same "Download pending" state the real page shows
// until the server signs a URL.
function fixtureDocuments(): MemberDocument[] {
  return [
    {
      id: "fix-terms",
      title: "Research Terms of Participation",
      type: "Agreement",
      version: "2.1",
      templateVersion: "3",
      reviewer: "Research operations",
      publishedAt: "2026-06-02",
      acknowledged: true,
      signedUrl: null,
      history: [
        { at: "2026-06-02", title: "Version 2.1 published", detail: "Clarified data handling language. Template version 3." },
        { at: "2026-03-14", title: "Version 2.0 published", detail: "Annual review update." },
        { at: "2026-03-20", title: "Acknowledged by you" },
      ],
    },
    {
      id: "fix-privacy",
      title: "Member Privacy Notice",
      type: "Notice",
      version: "1.4",
      reviewer: "Research operations",
      publishedAt: "2026-05-18",
      acknowledged: false,
      signedUrl: null,
      history: [{ at: "2026-05-18", title: "Version 1.4 published", detail: "Added the media retention section." }],
    },
    {
      id: "fix-protocol",
      title: "Baseline Assessment Protocol",
      type: "Protocol",
      version: "1.0",
      publishedAt: null,
      acknowledged: null,
      signedUrl: null,
      history: [],
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
    const result = await apiGet<DocumentsPayload>("/api/research/member/documents", memberToken);
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
        setDocuments(fixture);
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
                key={doc.id}
                title={doc.title}
                docType={doc.templateVersion ? `${doc.type} · template v${doc.templateVersion}` : doc.type}
                version={doc.version}
                publishedAt={doc.publishedAt}
                acknowledged={doc.acknowledged}
                reviewer={doc.reviewer}
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setHistoryDoc(doc)}
                      aria-label={`View history for ${doc.title}`}
                    >
                      History
                    </button>
                    {doc.signedUrl ? (
                      <a
                        className="btn btn-secondary"
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Download ${doc.title}, version ${doc.version}`}
                      >
                        Download
                      </a>
                    ) : (
                      <ResearchStatusBadge label="Download pending" tone="pending" />
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
        <div className="mt-8">
          <ResearchSecureNotice>
            Documents are delivered through time-limited signed links generated by the server. If a download is marked
            pending, the file has not been signed for release yet.
          </ResearchSecureNotice>
        </div>
      </ResearchRouteBoundary>

      <ResearchDrawer
        open={historyDoc !== null}
        title={historyDoc ? `${historyDoc.title}: history` : "Document history"}
        onClose={() => setHistoryDoc(null)}
      >
        {historyDoc && (
          <div>
            <p className="mono-label text-ink-mute mb-4">
              {historyDoc.type} · v{historyDoc.version}
              {historyDoc.templateVersion ? ` · template v${historyDoc.templateVersion}` : ""}
            </p>
            <ResearchTimeline items={historyDoc.history ?? []} />
          </div>
        )}
      </ResearchDrawer>
    </ResearchMemberShell>
  );
}
