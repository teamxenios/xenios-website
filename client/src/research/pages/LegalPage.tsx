import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import type { Policy } from "@shared/research/types";
import { fetchPolicies } from "../core";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchEmptyState, ResearchRouteBoundary } from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";

// ---------------------------------------------------------------------------
// LegalPage (/research/privacy and /research/terms). One component, two
// kinds, rendering the EXISTING server policy content via fetchPolicies().
// The policies API is cookie-gated: outside the private gateway it answers
// without the policy body, and this page renders that truthfully (a calm
// "enter the gateway first" state with the gateway link), never a fabricated
// policy text.
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
  | { phase: "gated" };

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const meta = KIND_META[kind];
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const policies = await fetchPolicies();
    if (!policies) {
      // Non-200 from the cookie-gated policies API: the visitor has not
      // entered the private gateway (or the endpoint is unreachable).
      setState({ phase: "gated" });
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

  return (
    <>
      <SeoHead title={`${meta.title}, xenios research`} description={meta.description} path={meta.path} />
      <ResearchPublicShell
        eyebrow={policy ? `Updated ${policy.updated}` : "Legal"}
        title={meta.title}
      >
        <ResearchRouteBoundary state={state.phase === "loading" ? "loading" : "ok"}>
          {state.phase === "gated" && (
            <ResearchEmptyState
              title={`The ${meta.title} is available after you enter the private gateway.`}
              body="This section is private. Enter through the gateway first, then return here to read the full document."
              action={
                <Link href={ACCESS_ROUTES.gateway} className="btn btn-primary">
                  Go to the gateway
                </Link>
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
            <article aria-label={meta.title} className="space-y-10" style={{ maxWidth: "72ch" }}>
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
          )}
        </ResearchRouteBoundary>
      </ResearchPublicShell>
    </>
  );
}
