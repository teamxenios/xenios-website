import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { apiGet, apiPost } from "../../lib/api";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchEmptyState,
  ResearchFilterBar,
  ResearchRouteBoundary,
  ResearchSearch,
  ResearchStatusBadge,
  ResearchTabs,
  useDebounced,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Member Guide Library (/research/member/guides). The directory comes from
// GET /api/research/member/guides; when that endpoint is not published yet
// the page renders the honest "being prepared" state (dev builds may show
// typed fixtures via devFixture, production never does) and still offers the
// editorial topic-request form. Saved guides live in localStorage under
// research-saved-guides-v1; read state is written by the reader page under
// research-guide-read-v1. No server fact is ever invented here.
// ---------------------------------------------------------------------------

export interface GuideSummary {
  slug: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  evidenceLevel?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  readMinutes?: number | null;
  relatedToBlueprint?: boolean | null;
}

interface RequestedTopic {
  topic: string;
  requests?: number | null;
}

type GuidesPayload =
  | { guides?: GuideSummary[]; mostRequested?: RequestedTopic[] }
  | GuideSummary[];

function normalizeGuides(payload: GuidesPayload): GuideSummary[] {
  const list = Array.isArray(payload) ? payload : payload?.guides ?? [];
  return list.filter((g) => g && typeof g.slug === "string" && typeof g.title === "string");
}

function normalizeRequested(payload: GuidesPayload): RequestedTopic[] {
  if (Array.isArray(payload)) return [];
  return (payload?.mostRequested ?? []).filter((t) => t && typeof t.topic === "string");
}

// ---------------------------------------------------------------------------
// Saved and read state (browser-local only; never treated as a server fact)
// ---------------------------------------------------------------------------
const SAVED_KEY = "research-saved-guides-v1";
const READ_KEY = "research-guide-read-v1";

function readSlugSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === "string"));
    }
  } catch {
    // storage unavailable: saved/read state simply does not persist
  }
  return new Set();
}

function writeSlugSet(key: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // storage unavailable: ignore
  }
}

// ---------------------------------------------------------------------------
// Dev-only fixtures. devFixture returns null in production, so a live member
// can never see these. Content is deliberately editorial and process-focused,
// with no health or outcome claims.
// ---------------------------------------------------------------------------
function fixtureGuides(): GuideSummary[] {
  return [
    {
      slug: "reading-a-certificate-of-analysis",
      title: "How to read a certificate of analysis",
      summary:
        "What each line of a third-party certificate means, which numbers matter, and how to spot a document that does not say what it appears to say.",
      category: "Quality",
      evidenceLevel: "Reviewed",
      publishedAt: "2026-05-11",
      updatedAt: "2026-07-02",
      readMinutes: 8,
      relatedToBlueprint: true,
    },
    {
      slug: "storage-and-handling-basics",
      title: "Storage and handling basics",
      summary:
        "Temperature, light, and container practices that keep research materials in the state described on their documentation.",
      category: "Handling",
      evidenceLevel: "Reviewed",
      publishedAt: "2026-04-20",
      updatedAt: "2026-06-14",
      readMinutes: 6,
      relatedToBlueprint: false,
    },
    {
      slug: "understanding-evidence-levels",
      title: "Understanding evidence levels in this library",
      summary:
        "How the editorial team grades the strength of the sources behind each Guide, and what each label commits us to.",
      category: "Editorial",
      evidenceLevel: "Editorial",
      publishedAt: "2026-03-30",
      updatedAt: "2026-05-01",
      readMinutes: 4,
      relatedToBlueprint: false,
    },
  ];
}

function fixtureRequested(): RequestedTopic[] {
  return [
    { topic: "Reconstitution math walkthrough", requests: 14 },
    { topic: "Cold-chain shipping explained", requests: 9 },
  ];
}

// ---------------------------------------------------------------------------
// Topic request form (renders in both the ready and the pending state; the
// post is unavailable-tolerant and never pretends a request was recorded)
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
    const result = await apiPost<{ ok?: boolean }>(
      "/api/research/member/guide-topic-requests",
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
    setStatus("error");
    setMessage(result.kind === "error" ? result.message : undefined);
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
// Guide card
// ---------------------------------------------------------------------------
function guideHref(slug: string): string {
  return MEMBER_ROUTES.guide.replace(":slug", slug);
}

function GuideCard({
  guide,
  saved,
  read,
  onToggleSave,
}: {
  guide: GuideSummary;
  saved: boolean;
  read: boolean;
  onToggleSave: (slug: string) => void;
}) {
  return (
    <div className="card h-full flex flex-col" data-testid={`guide-card-${guide.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="mono-label text-ink-mute">{guide.category ?? "Guide"}</p>
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${guide.title} from saved guides` : `Save ${guide.title} for later`}
          onClick={() => onToggleSave(guide.slug)}
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <Link
        href={guideHref(guide.slug)}
        className="body-l font-700 mt-1 block"
        style={{ textDecoration: "none" }}
      >
        {guide.title}
      </Link>
      {guide.summary && <p className="body-s text-ink-2 mt-2">{guide.summary}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2" style={{ marginTop: "auto", paddingTop: 16 }}>
        {guide.evidenceLevel && <ResearchStatusBadge label={`Evidence: ${guide.evidenceLevel}`} tone="info" />}
        {read && <ResearchStatusBadge label="Read" tone="success" />}
        {guide.updatedAt && <span className="mono-label text-ink-mute">Updated {guide.updatedAt}</span>}
        {typeof guide.readMinutes === "number" && guide.readMinutes > 0 && (
          <span className="mono-label text-ink-mute">{guide.readMinutes} min read</span>
        )}
      </div>
    </div>
  );
}

function GuideRail({
  headingId,
  heading,
  note,
  guides,
  saved,
  read,
  onToggleSave,
}: {
  headingId: string;
  heading: string;
  note?: string;
  guides: GuideSummary[];
  saved: Set<string>;
  read: Set<string>;
  onToggleSave: (slug: string) => void;
}) {
  if (!guides.length) return null;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="mono-cap text-ink-mute">
        {heading}
      </h2>
      {note && <p className="body-s text-ink-mute mt-1 max-w-[56ch]">{note}</p>}
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-3" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {guides.map((g) => (
          <li key={g.slug}>
            <GuideCard guide={g} saved={saved.has(g.slug)} read={read.has(g.slug)} onToggleSave={onToggleSave} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Mode = "loading" | "ready" | "pending" | "error" | "unauthorized";

const PENDING_TITLE = "The Guide library is being prepared.";
const PENDING_BODY =
  "Every product receives a member Guide, written and reviewed by the editorial team before it appears here. Nothing is wrong with your account.";

export default function Guides() {
  const { memberToken } = useResearch();
  const [mode, setMode] = useState<Mode>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [requested, setRequested] = useState<RequestedTopic[]>([]);
  const [source, setSource] = useState<"server" | "fixture">("server");

  const [saved, setSaved] = useState<Set<string>>(() => readSlugSet(SAVED_KEY));
  const [read] = useState<Set<string>>(() => readSlugSet(READ_KEY));

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [category, setCategory] = useState("all");
  const [evidence, setEvidence] = useState("all");
  const [savedOnly, setSavedOnly] = useState(false);

  const load = useCallback(async () => {
    setMode("loading");
    setErrorMessage(undefined);
    const result = await apiGet<GuidesPayload>("/api/research/member/guides", memberToken);
    if (result.kind === "ok") {
      setGuides(normalizeGuides(result.data));
      setRequested(normalizeRequested(result.data));
      setSource("server");
      setMode("ready");
      return;
    }
    if (result.kind === "unauthorized") {
      setMode("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      const fixture = devFixture(fixtureGuides);
      if (fixture) {
        setGuides(fixture);
        setRequested(devFixture(fixtureRequested) ?? []);
        setSource("fixture");
        setMode("ready");
      } else {
        setMode("pending");
      }
      return;
    }
    setErrorMessage(result.message);
    setMode("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSave = useCallback((slug: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      writeSlugSet(SAVED_KEY, next);
      return next;
    });
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const g of guides) if (g.category) set.add(g.category);
    return Array.from(set).sort();
  }, [guides]);

  const evidenceLevels = useMemo(() => {
    const set = new Set<string>();
    for (const g of guides) if (g.evidenceLevel) set.add(g.evidenceLevel);
    return Array.from(set).sort();
  }, [guides]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return guides.filter((g) => {
      if (savedOnly && !saved.has(g.slug)) return false;
      if (category !== "all" && g.category !== category) return false;
      if (evidence !== "all" && g.evidenceLevel !== evidence) return false;
      if (!q) return true;
      const haystack = `${g.title} ${g.summary ?? ""} ${g.category ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [guides, debouncedQuery, category, evidence, savedOnly, saved]);

  const filtersActive =
    debouncedQuery.trim() !== "" || category !== "all" || evidence !== "all" || savedOnly;

  const recentlyUpdated = useMemo(
    () =>
      guides
        .filter((g) => g.updatedAt)
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 3),
    [guides],
  );

  const blueprintRelated = useMemo(() => guides.filter((g) => g.relatedToBlueprint === true), [guides]);

  const boundaryState =
    mode === "ready" || mode === "pending" ? "ok" : mode === "loading" ? "loading" : mode;

  return (
    <ResearchMemberShell
      eyebrow="Guide Library"
      title="Guides"
      lead="Plain-language, reviewed explainers from the research editorial team. Every product receives a member Guide, and every Guide shows its evidence, its limitations, and what is still unknown."
    >
      <ResearchRouteBoundary state={boundaryState} errorMessage={errorMessage} onRetry={() => void load()}>
        {mode === "pending" ? (
          <>
            <ResearchEmptyState title={PENDING_TITLE} body={PENDING_BODY} />
            <TopicRequestForm token={memberToken} />
          </>
        ) : (
          <>
            {source === "fixture" && (
              <p className="mono-label text-ink-mute mb-4" role="note">
                Development preview data. Production shows only Guides published by the editorial team.
              </p>
            )}

            <ResearchFilterBar>
              <ResearchSearch value={query} onChange={setQuery} label="Search guides" placeholder="Search guides" />
              {categories.length > 0 && (
                <ResearchTabs
                  label="Filter by category"
                  active={category}
                  onSelect={setCategory}
                  tabs={[{ key: "all", label: "All" }, ...categories.map((c) => ({ key: c, label: c }))]}
                />
              )}
              {evidenceLevels.length > 0 && (
                <div>
                  <label htmlFor="guides-evidence" className="sr-only">
                    Filter by evidence level
                  </label>
                  <select
                    id="guides-evidence"
                    className="input-field"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    data-testid="guides-evidence-filter"
                  >
                    <option value="all">All evidence levels</option>
                    {evidenceLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                className={`chip ${savedOnly ? "ra-chip-selected" : "text-ink-2"}`}
                aria-pressed={savedOnly}
                onClick={() => setSavedOnly((v) => !v)}
                data-testid="guides-saved-filter"
              >
                Saved only
              </button>
            </ResearchFilterBar>

            {!filtersActive && (
              <>
                <GuideRail
                  headingId="guides-recent"
                  heading="Recently updated"
                  guides={recentlyUpdated}
                  saved={saved}
                  read={read}
                  onToggleSave={toggleSave}
                />
                <GuideRail
                  headingId="guides-blueprint"
                  heading="Related to your Blueprint"
                  note="Flagged by the editorial team as relevant to the areas your Blueprint covers."
                  guides={blueprintRelated}
                  saved={saved}
                  read={read}
                  onToggleSave={toggleSave}
                />
              </>
            )}

            <section aria-labelledby="guides-all" className="mt-8">
              <h2 id="guides-all" className="mono-cap text-ink-mute">
                {filtersActive ? "Matching guides" : "All guides"}
              </h2>
              {filtered.length === 0 ? (
                <div className="mt-3">
                  <ResearchEmptyState
                    title="No guides match those filters."
                    body="Try a broader search, clear a filter, or request the topic below so the editorial team can queue it."
                    action={
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setQuery("");
                          setCategory("all");
                          setEvidence("all");
                          setSavedOnly(false);
                        }}
                      >
                        Clear filters
                      </button>
                    }
                  />
                </div>
              ) : (
                <ul
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-3"
                  style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}
                >
                  {filtered.map((g) => (
                    <li key={g.slug}>
                      <GuideCard
                        guide={g}
                        saved={saved.has(g.slug)}
                        read={read.has(g.slug)}
                        onToggleSave={toggleSave}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {requested.length > 0 && (
              <section aria-labelledby="guides-requested" className="mt-8">
                <h2 id="guides-requested" className="mono-cap text-ink-mute">
                  Most requested topics
                </h2>
                <p className="body-s text-ink-mute mt-1 max-w-[56ch]">
                  What other members have asked the editorial team to cover next.
                </p>
                <ul className="flex flex-wrap gap-2 mt-3" style={{ listStyle: "none", padding: 0 }}>
                  {requested.map((t) => (
                    <li key={t.topic}>
                      <span className="chip text-ink-2">
                        {t.topic}
                        {typeof t.requests === "number" && t.requests > 0 ? ` (${t.requests} requests)` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <TopicRequestForm token={memberToken} />
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
