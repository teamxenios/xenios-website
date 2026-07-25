import { Link } from "wouter";
import { ArrowUpRight, Inbox, LockKeyhole, Users } from "lucide-react";

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

export function ProductRequestCallout({
  source,
  productName,
}: {
  source: string;
  productName?: string;
}) {
  const params = new URLSearchParams({ source });
  if (productName) params.set("product", productName);
  return (
    <aside className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
      <div className="flex items-start gap-3">
        <LockKeyhole className="mt-0.5 shrink-0 text-indigo-700" aria-hidden="true" size={20} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">Cannot find what you need?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Submit a private product request with an optional screenshot. Xenios stores the link
            for review but never fetches it. A submission does not create a product, inventory,
            order, payment, public page, availability promise, or clinical recommendation.
          </p>
          <Link
            href={`/research/member/product-requests/new?${params.toString()}`}
            className="btn btn-primary mt-4"
          >
            Start a product request <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function DemandQueue({ rows }: { rows: DemandQueueRow[] }) {
  return (
    <section aria-labelledby="demand-queue-title" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Private admin queue</p>
          <h2 id="demand-queue-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Member demand</h2>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Inbox size={17} aria-hidden="true" /> {rows.length} candidates
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="font-semibold text-slate-900">No demand candidates yet.</p>
          <p className="mt-1 text-sm text-slate-600">Submitted requests will aggregate here without exposing members to one another.</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Candidate</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Demand</th>
                <th className="px-3 py-3">Urgency</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Latest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.candidateId} className="border-b border-slate-100">
                  <td className="px-3 py-4">
                    <p className="font-semibold text-slate-950">{row.normalizedCandidate}</p>
                    {row.brand && <p className="mt-1 text-xs text-slate-500">{row.brand}</p>}
                  </td>
                  <td className="px-3 py-4 text-slate-600">{row.category.replace(/_/g, " ")}</td>
                  <td className="px-3 py-4">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                      <Users size={15} aria-hidden="true" /> {row.uniqueMembers} members / {row.totalRequests} requests
                    </span>
                  </td>
                  <td className="px-3 py-4 capitalize text-slate-600">{row.urgency.replace(/_/g, " ")}</td>
                  <td className="px-3 py-4 capitalize text-slate-600">{row.status.replace(/_/g, " ")}</td>
                  <td className="px-3 py-4 text-slate-600">{new Date(row.latestRequestAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

