import { useCallback, useEffect, useState } from "react";
import SeoHead from "@/components/SeoHead";
import type { Policy } from "@shared/research/types";
import { fetchPolicies } from "../core";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchEmptyState, ResearchPendingPanel, ResearchRouteBoundary } from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";

// ---------------------------------------------------------------------------
// LegalPage (/research/privacy and /research/terms). One component, two
// kinds, rendering the EXISTING server policy content via fetchPolicies().
// Draft documents remain visibly draft and cannot be mistaken for approved
// acceptance documents.
// ---------------------------------------------------------------------------

export type LegalKind = "privacy" | "terms";

const KIND_META: Record<LegalKind, { key: string; title: string; path: string; description: string }> = {
  privacy: {
    key: "privacy",
    title: "Privacy Policy",
    path: ACCESS_ROUTES.privacy,
    description: "The privacy policy for the xenios research section.",
  },
  terms: {
    key: "terms",
    title: "Terms of Service",
    path: ACCESS_ROUTES.terms,
    description: "The terms of service for the xenios research section.",
  },
};

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; policy: Policy }
  | { phase: "missing" }
  | { phase: "unavailable" };

function isOperationalDraft(policy: Policy) {
  return policy.sections.some((section) => /draft status/i.test(section.heading ?? ""));
}

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const meta = KIND_META[kind];
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const policies = await fetchPolicies();
    if (!policies) {
      setState({ phase: "unavailable" });
      return;
    }
    const policy = policies[meta.key];
    if (!policy) {
      setState({ phase: "missing" });
      return;
    }
    setState({ phase: "ready", policy });
  }, [meta.key]);

  useEffect(() => {
    void load();
  }, [load]);

  const policy = state.phase === "ready" ? state.policy : null;
  const draft = policy ? isOperationalDraft(policy) : false;

  return (
    <>
      <SeoHead title={`${meta.title}, xenios research`} description={meta.description} path={meta.path} />
      <ResearchPublicShell
        eyebrow={draft ? "Documentation pending" : policy ? `Updated ${policy.updated}` : "Legal"}
        title={meta.title}
      >
        <ResearchRouteBoundary state={state.phase === "loading" ? "loading" : "ok"}>
          {state.phase === "unavailable" && (
            <ResearchEmptyState
              title="This documentation is temporarily unavailable."
              body={`The ${meta.title} could not be loaded. Try again, or contact support if you need help. No approval or acceptance is implied.`}
              action={
                <button type="button" className="btn btn-secondary" onClick={() => void load()}>
                  Try again
                </button>
              }
            />
          )}
          {state.phase === "missing" && (
            <ResearchEmptyState
              title="This document is not published yet."
              body={`The ${meta.title} has not been published to this page. If you need it now, contact research@xeniostechnology.com and a person will send it to you.`}
              action={
                <button type="button" className="btn btn-secondary" onClick={() => void load()}>
                  Check again
                </button>
              }
            />
          )}
          {policy && (
            <>
              {draft && (
                <ResearchPendingPanel
                  kind="samuel_review_pending"
                  title="Documentation pending"
                  body={`This ${meta.title} is operational draft material under legal review. It is not approved for acceptance or application submission.`}
                  testid="legal-documentation-pending"
                />
              )}
              <article
                aria-label={`${meta.title}${draft ? " operational draft" : ""}`}
                className="space-y-10 mt-8"
                style={{ maxWidth: "72ch" }}
                data-testid={draft ? "legal-operational-draft" : "legal-approved-document"}
              >
                {policy.sections.map((section) => (
                  <section key={section.heading}>
                    <h2 className="body-m font-700 mb-3">{section.heading}</h2>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph} className="body-m text-ink-2 mb-3">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && (
                      <ul className="mt-2 space-y-2" style={{ paddingLeft: 18, listStyle: "disc" }}>
                        {section.bullets.map((bullet) => (
                          <li key={bullet} className="body-s text-ink-2">
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </article>
            </>
          )}
        </ResearchRouteBoundary>
      </ResearchPublicShell>
    </>
  );
}
