import { Link } from "wouter";
import {
  productRequestHref,
  type ProductRequestEntryPoint,
} from "@shared/research/product-request-sources";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../ui/kit";

export type DemandQueueRow = {
  candidateId: string;
  normalizedCandidate: string;
  brand: string | null;
  category: string;
  uniqueMembers: number;
  totalRequests: number;
  firstRequestAt: string;
  latestRequestAt: string;
  urgency: "high" | "medium" | "low" | "not_provided";
  status: string;
};

function urgencyTone(urgency: DemandQueueRow["urgency"]): BadgeTone {
  if (urgency === "high") return "warning";
  if (urgency === "medium") return "info";
  return "neutral";
}

export function ProductRequestCallout({
  source,
  productName,
}: {
  source: ProductRequestEntryPoint;
  productName?: string;
}) {
  return (
    <aside className="card">
      <p className="mono-label text-ink-mute">Private product request</p>
      <h2 className="body-m font-700 mt-2">Cannot find what you need?</h2>
      <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
        Submit a private product request with an optional screenshot. Xenios stores the link for
        review but never fetches it. A submission does not create a product, inventory, order,
        payment, public page, availability promise, or clinical recommendation.
      </p>
      <Link href={productRequestHref(source, productName)} className="btn btn-primary mt-4">
        Start a product request
      </Link>
      <ResearchSecureNotice>
        Request details remain private to authorized members of the review team.
      </ResearchSecureNotice>
    </aside>
  );
}

function formatValue(value: string): string {
  return value.replace(/_/g, " ");
}

export function DemandQueue({ rows }: { rows: DemandQueueRow[] }) {
  return (
    <section aria-labelledby="demand-queue-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-cap text-pulse">Private admin queue</p>
          <h2 id="demand-queue-title" className="body-l font-700 mt-2">Member demand</h2>
        </div>
        <p className="body-s tabular text-ink-mute">{rows.length} candidates</p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <ResearchEmptyState
            title="No demand candidates yet."
            body="Submitted requests will aggregate here without exposing members to one another."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 hidden md:block">
            <ResearchDataTable
              caption="Member product demand"
              rows={rows}
              rowKey={(row) => row.candidateId}
              columns={[
                {
                  key: "candidate",
                  header: "Candidate",
                  render: (row) => (
                    <span>
                      <span className="font-700">{row.normalizedCandidate}</span>
                      {row.brand && <span className="block text-ink-mute mt-1">{row.brand}</span>}
                    </span>
                  ),
                },
                { key: "category", header: "Category", render: (row) => formatValue(row.category) },
                {
                  key: "demand",
                  header: "Demand",
                  render: (row) => `${row.uniqueMembers} members / ${row.totalRequests} requests`,
                },
                {
                  key: "urgency",
                  header: "Urgency",
                  render: (row) => (
                    <ResearchStatusBadge label={formatValue(row.urgency)} tone={urgencyTone(row.urgency)} />
                  ),
                },
                { key: "status", header: "Status", render: (row) => formatValue(row.status) },
                {
                  key: "latest",
                  header: "Latest",
                  render: (row) => new Date(row.latestRequestAt).toLocaleDateString(),
                },
              ]}
            />
          </div>

          <ul className="mt-5 grid list-none gap-3 p-0 md:hidden" aria-label="Member product demand">
            {rows.map((row) => (
              <li key={row.candidateId} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="body-m font-700">{row.normalizedCandidate}</p>
                    {row.brand && <p className="body-s text-ink-mute mt-1">{row.brand}</p>}
                  </div>
                  <ResearchStatusBadge label={formatValue(row.urgency)} tone={urgencyTone(row.urgency)} />
                </div>
                <dl className="mt-4 grid gap-3 body-s">
                  <div>
                    <dt className="mono-label text-ink-mute">Category</dt>
                    <dd className="mt-1">{formatValue(row.category)}</dd>
                  </div>
                  <div>
                    <dt className="mono-label text-ink-mute">Demand</dt>
                    <dd className="mt-1">{row.uniqueMembers} members / {row.totalRequests} requests</dd>
                  </div>
                  <div>
                    <dt className="mono-label text-ink-mute">Status</dt>
                    <dd className="mt-1">{formatValue(row.status)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
