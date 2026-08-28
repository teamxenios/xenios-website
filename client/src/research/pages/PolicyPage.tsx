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
import "./public-editorial.css";

function isOperationalDraft(policy: Policy): boolean {
  return policy.sections.some((section) => /^draft status$/i.test(section.heading.trim()));
}

// The current policy DTO carries no publication-status field. Research-use is
// consumed by a separate agreement contract, while Terms and Privacy identify
// themselves as drafts in their content. Shipping and Returns do neither, so
// the public reader must not infer approval from silence.
const POLICIES_WITHOUT_APPROVAL_METADATA = new Set(["shipping", "returns"]);

export default function PolicyPage() {
  const params = useParams<{ policy: string }>();
  const [policies, setPolicies] = useState<Record<string, Policy> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchPolicies()
      .then((result) => {
        if (!alive) return;
        if (result) setPolicies(result);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const policy = params.policy && policies ? policies[params.policy] : undefined;

  if (failed) {
    return (
      <ResearchPublicShell eyebrow="Documentation" title="Policy documentation is temporarily unavailable.">
        <ResearchEmptyState
          title="The public policy source could not be confirmed."
          body="Return to the Research gateway or contact support. This page will not substitute starter text or imply that an unavailable document is approved."
          action={
            <div className="public-editorial-actions">
              <Link href={ACCESS_ROUTES.gateway} className="btn btn-secondary public-editorial-action">
                Back to research
              </Link>
              <Link href={ACCESS_ROUTES.support} className="btn btn-primary public-editorial-action">
                Contact support
              </Link>
            </div>
          }
        />
      </ResearchPublicShell>
    );
  }

  if (policies && !policy) {
    return (
      <ResearchPublicShell eyebrow="Documentation" title="That policy is not available.">
        <ResearchEmptyState
          title="No published document was found."
          body="Return to the Research gateway or contact support if you need help finding a document."
          action={
            <Link href={ACCESS_ROUTES.gateway} className="btn btn-secondary public-editorial-action">
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
  const publicationStatusUnconfirmed = POLICIES_WITHOUT_APPROVAL_METADATA.has(params.policy ?? "");
  const pending = draft || publicationStatusUnconfirmed;

  return (
    <>
      <SeoHead
        title={`${policy.title}, xenios research`}
        description={`${policy.title} for the xenios research section.`}
        path={`/research/policies/${params.policy}`}
      />
      <ResearchPublicShell
        eyebrow={pending ? "Documentation status pending" : `Updated ${policy.updated}`}
        title={policy.title}
      >
        {pending && (
          <ResearchPendingPanel
            kind="samuel_review_pending"
            title={draft ? "Documentation pending" : "Publication status unconfirmed"}
            body={draft
              ? "This is starter language for operational review. It has not been approved for acceptance, enrollment, payment, or account creation."
              : "The source does not provide authoritative approval metadata for this document. It remains readable for review, but this page does not present it as an approved or final policy."}
            testid="policy-draft-status"
          />
        )}
        <article
          aria-label={`${policy.title}${pending ? " publication status pending" : ""}`}
          className="space-y-10 mt-8"
          style={{ maxWidth: "72ch" }}
          data-testid={pending ? "policy-operational-draft" : "policy-served-document"}
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
