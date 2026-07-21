import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type { GuideSummaryDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { listGuides, requestGuideTopic } from "../../adapters/guides";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchFilterBar,
  ResearchRouteBoundary,
  ResearchSearch,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { GUIDE_STATUS_META, formatDate } from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Member Guide Library (/research/member/guides), driven by the frozen
// GET /api/research/guides (GuideSummaryDto).
//
// The unpublished rule, enforced structurally: a Guide in in_review,
// in_development, or coming_soon renders a status-only card with NO link into
// content and NO body teaser (the wire shape carries none, and this page adds
// none). Published and updated Guides link to the reader and show their
// publishedAt date.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; guides: GuideSummaryDto[] }
  | { phase: "denied"; code: string; message?: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

function guideHref(slug: string): string {
  return MEMBER_ROUTES.guide.replace(":slug", slug);
}

// ---------------------------------------------------------------------------
// Topic request form: editorial intake, tolerant of an unpublished endpoint.
// ---------------------------------------------------------------------------
type RequestFormStatus = "idle" | "sending" | "sent" | "unavailable" | "error";

function TopicRequestForm({ token }: { token: string | null }) {
  const [topic, setTopic] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<RequestFormStatus>("idle");
  const [message, setMessage] = useState<string | undefined>(undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("Please name the topic you want covered.");
      return;
    }
    setStatus("sending");
    setMessage(undefined);
    const result = await requestGuideTopic<{ ok?: boolean }>(
      { topic: trimmed, detail: detail.trim() || undefined },
      token,
    );
    if (result.kind === "ok") {
      setStatus("sent");
      setTopic("");
      setDetail("");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      setStatus("unavailable");
      return;
    }
    if (result.kind === "unauthorized") {
      setStatus("error");
      setMessage("Your session has ended. Sign in again to send a request.");
      return;
    }
    if (result.kind === "denied") {
      const p = denialPresentation(result.code, result.message);
      setStatus("error");
      setMessage(`${p.title} ${p.body}`);
      return;
    }
    setStatus("error");
    setMessage(result.message);
  }

  return (
    <section className="card mt-8" aria-labelledby="guide-topic-request">
      <h2 id="guide-topic-request" className="mono-label text-ink-mute">
        Request a topic
      </h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Tell the editorial team what you want a Guide on. Requests shape the publishing queue; the team
        reviews every one.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-4" style={{ maxWidth: 560 }}>
        <div>
          <label htmlFor="guide-request-topic" className="form-label">
            Topic
          </label>
          <input
            id="guide-request-topic"
            type="text"
            className="input-field"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={160}
            required
            data-testid="guide-request-topic"
          />
        </div>
        <div>
          <label htmlFor="guide-request-detail" className="form-label">
            What should it answer? (optional)
          </label>
          <textarea
            id="guide-request-detail"
            className="input-field"
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={1000}
            data-testid="guide-request-detail"
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-secondary" disabled={status === "sending"}>
            {status === "sending" ? "Sending..." : "Send request"}
          </button>
        </div>
        <p aria-live="polite" className="body-s" role="status">
          {status === "sent" && <span>Thank you. Your request reached the editorial team.</span>}
          {status === "unavailable" && (
            <span className="text-ink-2">
              Topic requests are not being collected automatically yet, so your request was not sent. Email{" "}
              <a href="mailto:research@xeniostechnology.com">research@xeniostechnology.com</a> with your topic
              and the team will queue it by hand.
            </span>
          )}
          {status === "error" && (
            <span className="text-ink-2">{message ?? "The request could not be sent. Please try again."}</span>
          )}
        </p>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Guide cards
// ---------------------------------------------------------------------------

function PublishedGuideCard({ guide }: { guide: GuideSummaryDto }) {
  const meta = GUIDE_STATUS_META[guide.status];
  const published = formatDate(guide.publishedAt);
  return (
    <div className="card h-full flex flex-col" data-testid={`guide-card-${guide.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="mono-label text-ink-mute">Guide</p>
        <ResearchStatusBadge label={meta.label} tone={meta.tone} />
      </div>
      <Link
        href={guideHref(guide.slug)}
        className="body-l font-700 mt-1 block"
        style={{ textDecoration: "none" }}
        data-testid={`guide-link-${guide.slug}`}
      >
        {guide.title}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2" style={{ marginTop: "auto", paddingTop: 16 }}>
        {published && <span className="mono-label text-ink-mute">Published {published}</span>}
        {guide.relatedProductSkus.length > 0 && (
          <span className="mono-label text-ink-mute">
            {guide.relatedProductSkus.length === 1
              ? "1 related product"
              : `${guide.relatedProductSkus.length} related products`}
          </span>
        )}
      </div>
    </div>
  );
}

// Status only. Deliberately: no link into content, no teaser, no dates that
// were never published. The title and its status are the whole card.
function UnpublishedGuideCard({ guide }: { guide: GuideSummaryDto }) {
  const meta = GUIDE_STATUS_META[guide.status];
  return (
    <div className="card h-full flex flex-col" data-testid={`guide-card-${guide.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="mono-label text-ink-mute">Guide</p>
        <ResearchStatusBadge label={meta.label} tone={meta.tone} />
      </div>
      <p className="body-l font-700 mt-1">{guide.title}</p>
      <p className="body-s text-ink-mute mt-2" style={{ marginTop: "auto", paddingTop: 16 }}>
        This Guide appears in your library the moment it is published.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Guides() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await listGuides(memberToken);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", guides: result.data.guides });
        return;
      case "denied":
        setState({ phase: "denied", code: result.code, message: result.message });
        return;
      case "unauthorized":
        setState({ phase: "unauthorized" });
        return;
      case "forbidden":
      case "unavailable":
        setState({ phase: "unavailable" });
        return;
      case "error":
        setState({ phase: "error", message: result.message });
        return;
    }
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const guides = state.phase === "ok" ? state.guides : [];

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return guides;
    return guides.filter((g) => g.title.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q));
  }, [guides, debouncedQuery]);

  const readable = filtered.filter((g) => GUIDE_STATUS_META[g.status].readable);
  const upcoming = filtered.filter((g) => !GUIDE_STATUS_META[g.status].readable);

  const boundaryState: "loading" | "unauthorized" | "ok" | "error" | "unavailable" =
    state.phase === "loading"
      ? "loading"
      : state.phase === "unauthorized"
        ? "unauthorized"
        : state.phase === "error"
          ? "error"
          : state.phase === "unavailable"
            ? "unavailable"
            : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Guide Library"
      title="Guides"
      lead="Plain-language, reviewed explainers from the research editorial team. Every Guide shows its evidence, its sources, and its correction history."
    >
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="The Guide library is being prepared."
        unavailableBody="Guides appear here as the editorial team publishes them. Nothing is wrong with your account."
      >
        {state.phase === "denied" ? (
          <ResearchDenialNotice code={state.code} message={state.message} />
        ) : (
          <>
            <ResearchFilterBar>
              <ResearchSearch value={query} onChange={setQuery} label="Search guides" placeholder="Search guides" />
            </ResearchFilterBar>

            {guides.length === 0 ? (
              <div className="mt-6">
                <ResearchEmptyState
                  title="No Guides are published yet."
                  body="Every Guide is written and reviewed by the editorial team before it appears here. Nothing is wrong with your account."
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-6">
                <ResearchEmptyState
                  title="No guides match that search."
                  action={
                    <button type="button" className="btn btn-secondary" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  }
                />
              </div>
            ) : (
              <>
                {readable.length > 0 && (
                  <section aria-labelledby="guides-published" className="mt-8">
                    <h2 id="guides-published" className="mono-cap text-ink-mute">
                      Published
                    </h2>
                    <ul
                      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-3"
                      style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}
                    >
                      {readable.map((g) => (
                        <li key={g.slug}>
                          <PublishedGuideCard guide={g} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {upcoming.length > 0 && (
                  <section aria-labelledby="guides-upcoming" className="mt-8">
                    <h2 id="guides-upcoming" className="mono-cap text-ink-mute">
                      In preparation
                    </h2>
                    <p className="body-s text-ink-mute mt-1 max-w-[56ch]">
                      These Guides are being written or reviewed. Each opens the moment it is published.
                    </p>
                    <ul
                      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-3"
                      style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}
                    >
                      {upcoming.map((g) => (
                        <li key={g.slug}>
                          <UnpublishedGuideCard guide={g} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            <TopicRequestForm token={memberToken} />
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
