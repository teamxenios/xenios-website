import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
} from "../ui/kit";
import type { Website3SurfaceState } from "./ProductCatalogExperience";

export type ResearchEducationTopicView = {
  topicId: string;
  label: string;
  summary: string;
  href: string;
};

export type StorageSourceCardView = {
  sourceId: string;
  label: string;
  status: string;
  summary: string;
};

export function StorageAndOrganization({
  accessories,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  accessories: readonly string[];
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  return (
    <ResearchMemberShell
      eyebrow="Neutral accessories"
      title="Storage and organization"
      lead="Products for monitoring, privacy, transport, and recordkeeping. These are not human administration supplies and include no administration guidance."
      actions={
        <Link href={productRequestHref("products")} className="btn btn-secondary">
          Request an accessory
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Storage accessories are not available right now."
        unavailableBody="Only reviewed neutral accessories will appear in this area."
      >
        {accessories.length === 0 ? (
          <ResearchEmptyState
            title="No storage accessories are published yet."
            body="Reviewed accessories will appear here when their listing information is complete."
          />
        ) : (
          <ul className="card grid list-none gap-0 p-0 sm:grid-cols-2" aria-label="Storage accessories">
            {accessories.map((accessory) => (
              <li
                key={accessory}
                className="body-s font-700 px-4 py-4"
                style={{ borderBottom: "1px solid var(--rule)" }}
              >
                {accessory}
              </li>
            ))}
          </ul>
        )}
        <ResearchSecureNotice>
          Accessories in this area are for storage, monitoring, privacy, transport, or records only.
        </ResearchSecureNotice>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

export function SupportCenter({
  categories,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  categories: readonly string[];
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  return (
    <ResearchMemberShell
      eyebrow="Member support"
      title="Support Center"
      lead="Choose the topic that best matches your question. Sensitive details stay inside the private member area."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Support topics are not available right now."
        unavailableBody="You can still contact the Research support team while this directory is unavailable."
      >
        {categories.length === 0 ? (
          <ResearchEmptyState
            title="No support topics are published yet."
            body="Contact Research support if you need help now."
            action={<a href="mailto:research@xeniostechnology.com" className="btn btn-secondary">Contact support</a>}
          />
        ) : (
          <ul className="card grid list-none gap-0 p-0 sm:grid-cols-2" aria-label="Support topics">
            {categories.map((category) => (
              <li key={category} style={{ borderBottom: "1px solid var(--rule)" }}>
                <Link
                  href={`/research/support?topic=${encodeURIComponent(category)}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 body-s font-700"
                >
                  {category}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ResearchSecureNotice>
          Do not include passwords, payment information, or medical records in a general support message.
        </ResearchSecureNotice>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

export function ResearchEducationCenter({
  topics,
  storageSources,
  boundary,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  topics: readonly ResearchEducationTopicView[];
  storageSources: readonly StorageSourceCardView[];
  boundary: string;
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  return (
    <ResearchMemberShell
      eyebrow="Research education"
      title="Product documentation"
      lead="Understand product statuses, exact-lot documents, and the sources behind published storage information."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Research education is not available right now."
        unavailableBody="Published product records remain authoritative while this directory is unavailable."
      >
        <ResearchSecureNotice>{boundary}</ResearchSecureNotice>

        <section className="mt-7" aria-labelledby="education-topics-title">
          <h2 id="education-topics-title" className="body-l font-700">Education topics</h2>
          {topics.length === 0 ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="No education topics are published yet."
                body="Reviewed status and documentation guidance will appear here."
              />
            </div>
          ) : (
            <ul className="mt-4 grid list-none gap-4 p-0 lg:grid-cols-3">
              {topics.map((topic) => (
                <li
                  key={topic.topicId}
                  id={topic.topicId}
                  className="card flex flex-col scroll-mt-24"
                >
                  <h3 className="body-m font-700">{topic.label}</h3>
                  <p className="body-s text-ink-2 mt-2 flex-1">{topic.summary}</p>
                  <Link href={topic.href} className="btn btn-secondary mt-4">
                    Read explanation
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-9 pt-7" style={{ borderTop: "1px solid var(--rule)" }} aria-labelledby="storage-sources-title">
          <h2 id="storage-sources-title" className="body-l font-700">Storage information sources</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
            Each card identifies the authority and review state behind storage information.
          </p>
          <ul className="mt-4 grid list-none gap-4 p-0 lg:grid-cols-3">
            {storageSources.map((source) => (
              <li key={source.sourceId} className="card">
                <p className="mono-label text-ink-mute">{source.status}</p>
                <h3 className="body-m font-700 mt-2">{source.label}</h3>
                <p className="body-s text-ink-2 mt-2">{source.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
