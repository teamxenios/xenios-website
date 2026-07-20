import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useResearch } from "../../core";
import { fetchGuide, submitGuideCorrection } from "../../adapters/guides";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  ResearchTimeline,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Guide reader (/research/member/guides/:slug). The full reader presentation
// is driven by a typed Guide contract fetched from
// GET /api/research/member/guides/:slug. Every section renders ONLY from
// server data; a section the server has not published renders a calm
// "Pending editorial review." fallback, never invented content. Citations are
// rendered near the claims they support (per section). devFixture may supply
// one illustrative guide in development; production renders the honest
// pending state instead. The related-products row links member products and
// carries the required "Related does not equal recommended" disclosure.
// ---------------------------------------------------------------------------

interface GuideReviewer {
  name: string;
  role?: string | null;
}

interface GuideCitation {
  id: string;
  label: string;
  source?: string | null;
  year?: string | null;
  url?: string | null;
}

interface GuideSection {
  id: string;
  heading: string;
  paragraphs?: string[] | null;
  citationIds?: string[] | null;
}

interface GuideVersionEvent {
  at: string;
  title: string;
  detail?: string;
}

interface GuideRelatedProduct {
  slug: string;
  name?: string | null;
}

interface GuideRelatedGoal {
  slug: string;
  name?: string | null;
}

interface Guide {
  slug: string;
  title: string;
  category?: string | null;
  evidenceLevel?: string | null;
  reviewers?: GuideReviewer[] | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  oneMinuteSummary?: string | string[] | null;
  evidenceSummary?: string | null;
  sections?: GuideSection[] | null;
  citations?: GuideCitation[] | null;
  limitations?: string[] | null;
  quality?: string | string[] | null;
  safetyCategories?: string[] | null;
  regulatoryStatus?: string | null;
  unknowns?: string[] | null;
  relatedProducts?: GuideRelatedProduct[] | null;
  relatedGoals?: GuideRelatedGoal[] | null;
  versionHistory?: GuideVersionEvent[] | null;
  correctionRequest?: { path?: string | null; note?: string | null } | null;
}

type GuidePayload = { guide?: Guide } | Guide;

function normalizeGuide(payload: GuidePayload): Guide | null {
  const g = "guide" in (payload as object) ? (payload as { guide?: Guide }).guide : (payload as Guide);
  if (!g || typeof g.slug !== "string" || typeof g.title !== "string") return null;
  return g;
}

function asList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

// ---------------------------------------------------------------------------
// Read state (browser-local; the Guides directory reads the same key)
// ---------------------------------------------------------------------------
const READ_KEY = "research-guide-read-v1";

function markRead(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const set = new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
    if (set.has(slug)) return;
    set.add(slug);
    window.localStorage.setItem(READ_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // storage unavailable: read state simply does not persist
  }
}

// ---------------------------------------------------------------------------
// Dev-only fixture: ONE illustrative guide. devFixture returns null in
// production. Content is editorial and process-focused, with no health or
// outcome claims.
// ---------------------------------------------------------------------------
const FIXTURE_SLUG = "reading-a-certificate-of-analysis";

function fixtureGuide(): Guide {
  return {
    slug: FIXTURE_SLUG,
    title: "How to read a certificate of analysis",
    category: "Quality",
    evidenceLevel: "Reviewed",
    reviewers: [
      { name: "Research editorial team", role: "Author" },
      { name: "Quality operations", role: "Reviewer" },
    ],
    publishedAt: "2026-05-11",
    updatedAt: "2026-07-02",
    oneMinuteSummary: [
      "A certificate of analysis (a lab report describing what a batch actually contains) is only as good as the lab and the methods behind it.",
      "Check four things in order: who ran the test, what method they used, which batch the document covers, and whether the reported values have stated acceptance ranges.",
      "A document that names no method, no batch, or no lab is a formatting exercise, not evidence.",
    ],
    evidenceSummary:
      "This Guide summarizes public method standards and the documentation practices of accredited third-party laboratories. It grades as Reviewed: the editorial team verified every claim against the cited standards documents.",
    sections: [
      {
        id: "what-it-is",
        heading: "What a certificate of analysis is",
        paragraphs: [
          "A certificate of analysis, usually shortened to CoA, is a document issued by a laboratory describing the tests run on a specific batch of material and the results of those tests.",
          "The key word is batch. A CoA speaks only for the batch identified on the document. A certificate for one batch says nothing about any other batch, however similar the label looks.",
        ],
        citationIds: ["iso17025"],
      },
      {
        id: "who-ran-it",
        heading: "Who ran the test",
        paragraphs: [
          "The first check is independence. A third-party laboratory has no stake in the result; an in-house test can be honest but cannot be independent.",
          "Accreditation matters because it means an outside body audits the lab's methods and record keeping on a schedule.",
        ],
        citationIds: ["iso17025", "a2la"],
      },
      {
        id: "method-and-ranges",
        heading: "Methods and acceptance ranges",
        paragraphs: [
          "A result without a named method is hard to interpret, because different methods answer different questions about the same material.",
          "Look for an acceptance range next to each result. A number with no stated range tells you what was measured but not whether the lab considered it acceptable.",
        ],
        citationIds: ["usp"],
      },
    ],
    citations: [
      {
        id: "iso17025",
        label: "ISO/IEC 17025",
        source: "General requirements for the competence of testing and calibration laboratories",
        year: "2017",
        url: null,
      },
      {
        id: "a2la",
        label: "A2LA accreditation overview",
        source: "American Association for Laboratory Accreditation",
        year: null,
        url: null,
      },
      {
        id: "usp",
        label: "USP general chapters",
        source: "United States Pharmacopeia, analytical method chapters",
        year: null,
        url: null,
      },
    ],
    limitations: [
      "This Guide covers how to read the document, not how to evaluate a laboratory's competence in person.",
      "Standards documents are revised; always check the version year on any standard a certificate cites.",
    ],
    quality: [
      "Claims verified against the cited standards documents by the editorial team.",
      "Reviewed by quality operations before publication.",
    ],
    safetyCategories: ["Documentation literacy", "Storage and handling"],
    regulatoryStatus:
      "Xenios Research materials are supplied for laboratory research use only and are not for human consumption. This Guide is educational documentation literacy content, not advice of any kind.",
    unknowns: [
      "Whether harmonized international CoA formatting will be adopted broadly; formats still vary widely between laboratories.",
    ],
    relatedProducts: [],
    relatedGoals: [],
    versionHistory: [
      { at: "2026-07-02", title: "Revision 1.1", detail: "Added the acceptance-range section after member questions." },
      { at: "2026-05-11", title: "First published", detail: "Initial editorial review completed." },
    ],
    correctionRequest: { path: null, note: null },
  };
}

// ---------------------------------------------------------------------------
// Section shell with the per-section pending fallback
// ---------------------------------------------------------------------------
function GuideSectionPanel({
  id,
  title,
  present,
  children,
}: {
  id: string;
  title: string;
  present: boolean;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="card mt-6">
      <h2 id={id} className="mono-cap text-ink-mute">
        {title}
      </h2>
      {present ? (
        <div className="mt-3">{children}</div>
      ) : (
        <p className="body-s text-ink-mute mt-3" role="note">
          Pending editorial review.
        </p>
      )}
    </section>
  );
}

function CitationList({ citations }: { citations: GuideCitation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-4">
      <p className="mono-label text-ink-mute">Sources for this section</p>
      <ul className="body-s text-ink-2 mt-2 grid gap-1" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {citations.map((c) => (
          <li key={c.id}>
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.label}
              </a>
            ) : (
              <span className="font-700">{c.label}</span>
            )}
            {c.source ? `. ${c.source}` : ""}
            {c.year ? ` (${c.year})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Correction request form (unavailable-tolerant)
// ---------------------------------------------------------------------------
type CorrectionStatus = "idle" | "sending" | "sent" | "unavailable" | "error";

function CorrectionForm({
  slug,
  path,
  token,
  sections,
}: {
  slug: string;
  path: string | null | undefined;
  token: string | null;
  sections: GuideSection[];
}) {
  const [section, setSection] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<CorrectionStatus>("idle");
  const [errorText, setErrorText] = useState<string | undefined>(undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus("error");
      setErrorText("Please describe the correction.");
      return;
    }
    setStatus("sending");
    setErrorText(undefined);
    const result = await submitGuideCorrection<{ ok?: boolean }>(
      slug,
      { section: section || undefined, message: trimmed },
      token,
      path,
    );
    if (result.kind === "ok") {
      setStatus("sent");
      setSection("");
      setMessage("");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      setStatus("unavailable");
      return;
    }
    if (result.kind === "unauthorized") {
      setStatus("error");
      setErrorText("Your session has ended. Sign in again to send a correction.");
      return;
    }
    setStatus("error");
    setErrorText(result.kind === "error" ? result.message : undefined);
  }

  return (
    <section className="card mt-6" aria-labelledby="guide-correction">
      <h2 id="guide-correction" className="mono-cap text-ink-mute">
        Request a correction
      </h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Spotted something wrong, outdated, or unclear? Corrections go straight to the editorial team and are
        answered against the version history above.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-4" style={{ maxWidth: 560 }}>
        <div>
          <label htmlFor="guide-correction-section" className="form-label">
            Section (optional)
          </label>
          {sections.length > 0 ? (
            <select
              id="guide-correction-section"
              className="input-field"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="">Whole guide</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.heading}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="guide-correction-section"
              type="text"
              className="input-field"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              maxLength={160}
            />
          )}
        </div>
        <div>
          <label htmlFor="guide-correction-message" className="form-label">
            What needs correcting?
          </label>
          <textarea
            id="guide-correction-message"
            className="input-field"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            required
            data-testid="guide-correction-message"
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-secondary" disabled={status === "sending"}>
            {status === "sending" ? "Sending..." : "Send correction"}
          </button>
        </div>
        <p aria-live="polite" className="body-s" role="status">
          {status === "sent" && <span>Thank you. The editorial team received your correction.</span>}
          {status === "unavailable" && (
            <span className="text-ink-2">
              Corrections are not being collected automatically yet, so your note was not sent. Email{" "}
              <a href="mailto:research@xeniostechnology.com">research@xeniostechnology.com</a> and name this
              Guide; the team will handle it by hand.
            </span>
          )}
          {status === "error" && (
            <span className="text-ink-2">{errorText ?? "The correction could not be sent. Please try again."}</span>
          )}
        </p>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Mode = "loading" | "ready" | "pending" | "error" | "unauthorized";

function productHref(slug: string): string {
  return MEMBER_ROUTES.product.replace(":slug", slug);
}

function goalHref(slug: string): string {
  return MEMBER_ROUTES.goal.replace(":slug", slug);
}

export default function GuideReader() {
  const params = useParams<{ slug?: string }>();
  const slug = params.slug ?? "";
  const { memberToken, bySlug } = useResearch();
  const [mode, setMode] = useState<Mode>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [source, setSource] = useState<"server" | "fixture">("server");

  const load = useCallback(async () => {
    if (!slug) {
      setMode("pending");
      return;
    }
    setMode("loading");
    setErrorMessage(undefined);
    const result = await fetchGuide<GuidePayload>(slug, memberToken);
    if (result.kind === "ok") {
      const normalized = normalizeGuide(result.data);
      if (normalized) {
        setGuide(normalized);
        setSource("server");
        setMode("ready");
        markRead(normalized.slug);
      } else {
        setMode("pending");
      }
      return;
    }
    if (result.kind === "unauthorized") {
      setMode("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      const fixture = slug === FIXTURE_SLUG ? devFixture(fixtureGuide) : null;
      if (fixture) {
        setGuide(fixture);
        setSource("fixture");
        setMode("ready");
        markRead(fixture.slug);
      } else {
        setMode("pending");
      }
      return;
    }
    setErrorMessage(result.message);
    setMode("error");
  }, [slug, memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = guide?.sections ?? [];
  const citationsById = new Map((guide?.citations ?? []).map((c) => [c.id, c]));
  const oneMinute = asList(guide?.oneMinuteSummary);
  const qualityNotes = asList(guide?.quality);
  const relatedProducts = guide?.relatedProducts ?? [];
  const relatedGoals = guide?.relatedGoals ?? [];

  const boundaryState =
    mode === "ready" || mode === "pending" ? "ok" : mode === "loading" ? "loading" : mode;

  return (
    <ResearchMemberShell
      eyebrow="Guide Library"
      title={guide?.title ?? "Guide"}
      lead={
        guide
          ? undefined
          : "Guides are written and reviewed by the research editorial team before they appear here."
      }
      actions={
        <Link href={MEMBER_ROUTES.guides} className="btn btn-ghost">
          All guides
        </Link>
      }
    >
      <ResearchRouteBoundary state={boundaryState} errorMessage={errorMessage} onRetry={() => void load()}>
        {mode === "pending" || !guide ? (
          <ResearchEmptyState
            title="This Guide is being prepared."
            body="Every product receives a member Guide, and each one is reviewed before it is published to your library. Nothing is wrong with your account."
            action={
              <Link href={MEMBER_ROUTES.guides} className="btn btn-secondary">
                Browse the Guide library
              </Link>
            }
          />
        ) : (
          <article aria-label={guide.title}>
            {source === "fixture" && (
              <p className="mono-label text-ink-mute mb-4" role="note">
                Development preview data. Production shows only Guides published by the editorial team.
              </p>
            )}

            {/* Reader metadata: reviewers, dates, grading. Server facts only. */}
            <div className="flex flex-wrap items-center gap-2">
              {guide.category && <ResearchStatusBadge label={guide.category} tone="neutral" />}
              {guide.evidenceLevel ? (
                <ResearchStatusBadge label={`Evidence: ${guide.evidenceLevel}`} tone="info" />
              ) : (
                <ResearchStatusBadge label="Evidence grading pending" tone="pending" />
              )}
              {guide.publishedAt && <span className="mono-label text-ink-mute">Published {guide.publishedAt}</span>}
              {guide.updatedAt && <span className="mono-label text-ink-mute">Updated {guide.updatedAt}</span>}
            </div>
            <p className="body-s text-ink-mute mt-2">
              {guide.reviewers?.length
                ? `Reviewed by ${guide.reviewers
                    .map((r) => (r.role ? `${r.name} (${r.role})` : r.name))
                    .join(", ")}.`
                : "Reviewer attribution pending editorial review."}
            </p>

            <GuideSectionPanel id="guide-one-minute" title="The one-minute summary" present={oneMinute.length > 0}>
              <ul className="body-m text-ink-2 grid gap-2" style={{ listStyle: "disc", paddingLeft: 20, margin: 0 }}>
                {oneMinute.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel id="guide-evidence" title="Evidence summary" present={Boolean(guide.evidenceSummary)}>
              <p className="body-s text-ink-2 max-w-[64ch]">{guide.evidenceSummary}</p>
            </GuideSectionPanel>

            {sections.length > 1 && (
              <nav aria-label="Guide contents" className="card mt-6">
                <p className="mono-cap text-ink-mute">Contents</p>
                <ol className="body-s mt-3 grid gap-1" style={{ listStyle: "decimal", paddingLeft: 20, margin: 0 }}>
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#guide-section-${s.id}`}>{s.heading}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            {/* Body sections: citations render NEAR the claims they support. */}
            {sections.length === 0 ? (
              <GuideSectionPanel id="guide-body" title="Guide content" present={false} />
            ) : (
              sections.map((s) => {
                const sectionCitations = (s.citationIds ?? [])
                  .map((id) => citationsById.get(id))
                  .filter((c): c is GuideCitation => Boolean(c));
                return (
                  <section key={s.id} id={`guide-section-${s.id}`} aria-labelledby={`guide-h-${s.id}`} className="card mt-6">
                    <h2 id={`guide-h-${s.id}`} className="body-l font-700">
                      {s.heading}
                    </h2>
                    {(s.paragraphs ?? []).length > 0 ? (
                      <div className="mt-3 grid gap-3">
                        {(s.paragraphs ?? []).map((p, i) => (
                          <p key={i} className="body-m text-ink-2 max-w-[64ch]">
                            {p}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="body-s text-ink-mute mt-3" role="note">
                        Pending editorial review.
                      </p>
                    )}
                    <CitationList citations={sectionCitations} />
                  </section>
                );
              })
            )}

            <GuideSectionPanel id="guide-limitations" title="Limitations" present={(guide.limitations ?? []).length > 0}>
              <ul className="body-s text-ink-2 grid gap-2" style={{ listStyle: "disc", paddingLeft: 20, margin: 0 }}>
                {(guide.limitations ?? []).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel id="guide-quality" title="Quality and review" present={qualityNotes.length > 0}>
              <ul className="body-s text-ink-2 grid gap-2" style={{ listStyle: "disc", paddingLeft: 20, margin: 0 }}>
                {qualityNotes.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel
              id="guide-safety"
              title="Safety categories"
              present={(guide.safetyCategories ?? []).length > 0}
            >
              <ul className="flex flex-wrap gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(guide.safetyCategories ?? []).map((c) => (
                  <li key={c}>
                    <span className="chip text-ink-2">{c}</span>
                  </li>
                ))}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel id="guide-regulatory" title="Regulatory status" present={Boolean(guide.regulatoryStatus)}>
              <p className="body-s text-ink-2 max-w-[64ch]">{guide.regulatoryStatus}</p>
            </GuideSectionPanel>

            <GuideSectionPanel id="guide-unknowns" title="What is still unknown" present={(guide.unknowns ?? []).length > 0}>
              <ul className="body-s text-ink-2 grid gap-2" style={{ listStyle: "disc", paddingLeft: 20, margin: 0 }}>
                {(guide.unknowns ?? []).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel
              id="guide-related-products"
              title="Related products"
              present={relatedProducts.length > 0}
            >
              <p className="body-s text-ink-mute" role="note">
                Related does not equal recommended. These entries share subject matter with this Guide; they are
                not guidance to purchase or use anything.
              </p>
              <ul className="flex flex-wrap gap-3 mt-3" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                {relatedProducts.map((p) => {
                  const catalogProduct = bySlug.get(p.slug);
                  const name = p.name ?? catalogProduct?.name ?? p.slug;
                  return (
                    <li key={p.slug}>
                      {catalogProduct ? (
                        <Link href={productHref(p.slug)} className="btn btn-ghost">
                          {name}
                        </Link>
                      ) : (
                        <span className="chip text-ink-2">
                          {name} <ResearchStatusBadge label="Not in your catalog yet" tone="pending" />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel id="guide-related-goals" title="Related goals" present={relatedGoals.length > 0}>
              <ul className="flex flex-wrap gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {relatedGoals.map((g) => (
                  <li key={g.slug}>
                    <Link href={goalHref(g.slug)} className="btn btn-ghost">
                      {g.name ?? g.slug}
                    </Link>
                  </li>
                ))}
              </ul>
            </GuideSectionPanel>

            <GuideSectionPanel
              id="guide-versions"
              title="Version history"
              present={(guide.versionHistory ?? []).length > 0}
            >
              <ResearchTimeline
                items={(guide.versionHistory ?? []).map((v) => ({ at: v.at, title: v.title, detail: v.detail }))}
              />
            </GuideSectionPanel>

            <CorrectionForm
              slug={guide.slug}
              path={guide.correctionRequest?.path}
              token={memberToken}
              sections={sections}
            />
          </article>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
