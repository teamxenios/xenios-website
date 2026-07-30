import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import type { Policy } from "@shared/research/types";
import { fetchPolicies } from "../core";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchEmptyState, ResearchPendingPanel, ResearchRouteBoundary } from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";

// ---------------------------------------------------------------------------
// LegalPage (/research/privacy and /research/terms). One component, two
// kinds, rendering the EXISTING public server policy content via
// fetchPolicies(). If that public document cannot be loaded, the page offers a
// truthful retry and support path rather than implying private-gateway access.
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

function isOperationalDraft(policy: Policy): boolean {
  return policy.sections.some((section) => /^draft status$/i.test(section.heading.trim()));
}

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const meta = KIND_META[kind];
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    let policies: Awaited<ReturnType<typeof fetchPolicies>>;
    try {
      policies = await fetchPolicies();
    } catch {
      setState({ phase: "unavailable" });
      return;
    }
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
              title="Documentation temporarily unavailable"
              body={`The public ${meta.title} could not be loaded. Try again, or contact Research support if you need help.`}
              action={
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn btn-primary" onClick={() => void load()}>
                    Try again
                  </button>
                  <Link href={ACCESS_ROUTES.support} className="btn btn-secondary">
                    Contact support
                  </Link>
                </div>
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
                  body="This is starter language for operational review. It has not been approved for acceptance, enrollment, payment, or account creation."
                  testid="legal-draft-status"
                />
              )}
              <article
                aria-label={`${meta.title}${draft ? " operational draft" : ""}`}
                className="space-y-10 mt-8"
                style={{ maxWidth: "72ch" }}
                data-testid={draft ? "legal-operational-draft" : "legal-approved-document"}
              >
                {policy.sections.map((section) => {
                  const draftStatus = /^draft status$/i.test(section.heading.trim());
                  return (
                    <section key={section.heading} className={draftStatus ? "card bg-paper-2" : undefined}>
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
                  );
                })}
              </article>
            </>
          )}
        </ResearchRouteBoundary>
      </ResearchPublicShell>
    </>
  );
}
