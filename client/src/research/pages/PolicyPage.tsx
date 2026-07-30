import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import SeoHead from "@/components/SeoHead";
import type { Policy } from "@shared/research/types";
import { fetchPolicies } from "../core";
import { ResearchPublicShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchPendingPanel,
} from "../ui/kit";
import { ACCESS_ROUTES } from "../lib/routes";

function isOperationalDraft(policy: Policy): boolean {
  return policy.sections.some((section) => /^draft status$/i.test(section.heading.trim()));
}

export default function PolicyPage() {
  const params = useParams<{ policy: string }>();
  const [policies, setPolicies] = useState<Record<string, Policy> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPolicies().then((result) => {
      if (!alive) return;
      if (result) setPolicies(result);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const policy = params.policy && policies ? policies[params.policy] : undefined;

  if (failed || (policies && !policy)) {
    return (
      <ResearchPublicShell eyebrow="Documentation" title="That policy is not available.">
        <ResearchEmptyState
          title="No published document was found."
          body="Return to the Research gateway or contact support if you need help finding a document."
          action={
            <Link href={ACCESS_ROUTES.gateway} className="btn btn-secondary">
              Back to research
            </Link>
          }
        />
      </ResearchPublicShell>
    );
  }

  if (!policy) {
    return (
      <ResearchPublicShell eyebrow="Documentation" title="Policy status">
        <ResearchLoadingState label="Loading policy status" />
      </ResearchPublicShell>
    );
  }

  const draft = isOperationalDraft(policy);

  return (
    <>
      <SeoHead
        title={`${policy.title}, xenios research`}
        description={`${policy.title} for the xenios research section.`}
        path={`/research/policies/${params.policy}`}
      />
      <ResearchPublicShell
        eyebrow={draft ? "Documentation pending" : `Updated ${policy.updated}`}
        title={policy.title}
      >
        {draft && (
          <ResearchPendingPanel
            kind="samuel_review_pending"
            title="Documentation pending"
            body="This is starter language for operational review. It has not been approved for acceptance, enrollment, payment, or account creation."
            testid="policy-draft-status"
          />
        )}
        <article
          aria-label={`${policy.title}${draft ? " operational draft" : ""}`}
          className="space-y-10 mt-8"
          style={{ maxWidth: "72ch" }}
          data-testid={draft ? "policy-operational-draft" : "policy-approved-document"}
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
      </ResearchPublicShell>
    </>
  );
}
