import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "wouter";
import type { GuideDetailDto, GuideSummaryDto } from "@shared/research/commerce-api";
import { useResearch } from "../../core";
import { getGuide, listGuides, submitGuideCorrection } from "../../adapters/guides";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchRouteBoundary,
  ResearchStatusBadge,
  ResearchTimeline,
} from "../../ui/kit";
import { GUIDE_STATUS_META, formatDate } from "./commerce-presentation";

// ---------------------------------------------------------------------------
// Guide reader (/research/member/guides/:slug), driven by the frozen
// GET /api/research/guides/:slug (GuideDetailDto): sections, graded claims
// with their source ids, sources with citation and verification state,
// correction history, and the revision number.
//
// An unpublished Guide answers with the guide_not_published denial code, and
// this page renders the designed state for it: the canonical copy, made
// status-aware when the library list can supply this Guide's current status.
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "ok"; guide: GuideDetailDto }
  | { phase: "denied"; code: string; message?: string; listStatus?: GuideSummaryDto["status"] }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message?: string };

// ---------------------------------------------------------------------------
// Correction form (unavailable-tolerant; routes denials on code)
// ---------------------------------------------------------------------------
type CorrectionStatus = "idle" | "sending" | "sent" | "unavailable" | "error";

function CorrectionForm({ slug, token, sections }: { slug: string; token: string | null; sections: GuideDetailDto["sections"] }) {
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
    if (result.kind === "denied") {
      const p = denialPresentation(result.code, result.message);
      setStatus("error");
      setErrorText(`${p.title} ${p.body}`);
      return;
    }
    setStatus("error");
    setErrorText(result.message);
  }

  return (
    <section className="card mt-6" aria-labelledby="guide-correction">
      <h2 id="guide-correction" className="mono-cap text-ink-mute">
        Request a correction
      </h2>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Spotted something wrong, outdated, or unclear? Corrections go straight to the editorial team and are
        answered against the correction history above.
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
                <option key={s.heading} value={s.heading}>
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

export default function GuideReader() {
  const params = useParams<{ slug?: string }>();
  const slug = params.slug ?? "";
  const { memberToken } = useResearch();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    if (!slug) {
      setState({ phase: "denied", code: "guide_not_found" });
      return;
    }
    setState({ phase: "loading" });
    const result = await getGuide(memberToken, slug);
    switch (result.kind) {
      case "ok":
        setState({ phase: "ok", guide: result.data.guide });
        return;
      case "denied": {
        // Status-aware denial: when the library list knows this Guide, its
        // status makes the not-published state specific instead of generic.
        let listStatus: GuideSummaryDto["status"] | undefined;
        if (result.code === "guide_not_published") {
          const list = await listGuides(memberToken);
          if (list.kind === "ok") {
            listStatus = list.data.guides.find((g) => g.slug === slug)?.status;
          }
        }
        setState({ phase: "denied", code: result.code, message: result.message, listStatus });
        return;
      }
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
  }, [slug, memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const guide = state.phase === "ok" ? state.guide : null;
  const sourcesById = new Map((guide?.sources ?? []).map((s) => [s.id, s]));

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

  const statusMeta = guide ? GUIDE_STATUS_META[guide.status] : null;

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
      <ResearchRouteBoundary
        state={boundaryState}
        errorMessage={state.phase === "error" ? state.message : undefined}
        onRetry={() => void load()}
        unavailableTitle="This Guide is not available yet."
        unavailableBody="It is being prepared. Nothing is wrong with your account."
      >
        {state.phase === "denied" ? (
          <div className="grid gap-4" data-testid="ra-guide-denied">
            {state.listStatus && (
              <div className="flex items-center gap-3">
                <span className="mono-label text-ink-mute">Current status</span>
                <ResearchStatusBadge
                  label={GUIDE_STATUS_META[state.listStatus].label}
                  tone={GUIDE_STATUS_META[state.listStatus].tone}
                />
              </div>
            )}
            <ResearchDenialNotice code={state.code} message={state.message} />
            <div>
              <Link href={MEMBER_ROUTES.guides} className="btn btn-primary">
                Browse the Guide library
              </Link>
            </div>
          </div>
        ) : (
          guide && (
            <article aria-label={guide.title}>
              {/* Reader metadata: status, dates, revision. Server facts only. */}
              <div className="flex flex-wrap items-center gap-2">
                {statusMeta && <ResearchStatusBadge label={statusMeta.label} tone={statusMeta.tone} />}
                {guide.publishedAt && (
                  <span className="mono-label text-ink-mute">Published {formatDate(guide.publishedAt)}</span>
                )}
                <span className="mono-label text-ink-mute" data-testid="ra-guide-revision">
                  Revision {guide.revision}
                </span>
              </div>

              {/* Body sections. */}
              {guide.sections.map((section) => (
                <section key={section.heading} className="card mt-6" aria-label={section.heading}>
                  <h2 className="body-l font-700">{section.heading}</h2>
                  <p className="body-m text-ink-2 mt-3 max-w-[64ch]" style={{ whiteSpace: "pre-line" }}>
                    {section.body}
                  </p>
                </section>
              ))}

              {/* Claims: each carries its evidence grade and its sources. */}
              {guide.claims.length > 0 && (
                <section className="card mt-6" aria-labelledby="guide-claims">
                  <h2 id="guide-claims" className="mono-cap text-ink-mute">
                    Claims and their evidence
                  </h2>
                  <ul className="mt-3 grid gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {guide.claims.map((claim) => (
                      <li key={claim.id} data-testid={`ra-claim-${claim.id}`}>
                        <div className="flex flex-wrap items-start gap-3">
                          <ResearchStatusBadge label={`Grade ${claim.grade}`} tone="info" />
                          <p className="body-s text-ink-2 max-w-[60ch]" style={{ flex: 1, minWidth: 240 }}>
                            {claim.text}
                          </p>
                        </div>
                        {claim.sourceIds.length > 0 && (
                          <p className="body-s text-ink-mute mt-1">
                            Sources:{" "}
                            {claim.sourceIds.map((id, i) => (
                              <span key={id}>
                                {i > 0 && ", "}
                                <a href={`#guide-source-${id}`}>{sourcesById.get(id)?.citation ?? id}</a>
                              </span>
                            ))}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Sources: citation plus verification state, never color alone. */}
              {guide.sources.length > 0 && (
                <section className="card mt-6" aria-labelledby="guide-sources">
                  <h2 id="guide-sources" className="mono-cap text-ink-mute">
                    Sources
                  </h2>
                  <ul className="mt-3 grid gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {guide.sources.map((source) => (
                      <li key={source.id} id={`guide-source-${source.id}`} data-testid={`ra-source-${source.id}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          {source.url ? (
                            <a href={source.url} target="_blank" rel="noreferrer" className="body-s">
                              {source.citation}
                            </a>
                          ) : (
                            <span className="body-s text-ink-2">{source.citation}</span>
                          )}
                          <ResearchStatusBadge
                            label={source.verified ? "Verified" : "Verification pending"}
                            tone={source.verified ? "success" : "pending"}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Correction history: what changed and when. */}
              <section className="card mt-6" aria-labelledby="guide-corrections">
                <h2 id="guide-corrections" className="mono-cap text-ink-mute">
                  Correction history
                </h2>
                <div className="mt-3">
                  {guide.correctionHistory.length > 0 ? (
                    <ResearchTimeline
                      items={guide.correctionHistory.map((c) => ({
                        at: formatDate(c.at) ?? c.at,
                        title: c.note,
                      }))}
                    />
                  ) : (
                    <p className="body-s text-ink-mute">No corrections have been needed on this revision.</p>
                  )}
                </div>
              </section>

              <CorrectionForm slug={guide.slug} token={memberToken} sections={guide.sections} />
            </article>
          )
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
