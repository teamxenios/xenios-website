import { Link } from "wouter";
import { ArrowRight, Boxes, LifeBuoy, LockKeyhole, Thermometer } from "lucide-react";

export function StorageAndOrganization({
  accessories,
}: {
  accessories: readonly string[];
}) {
  return (
    <section aria-labelledby="storage-title" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Neutral accessories</p>
            <h2 id="storage-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Storage and Organization</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Products for monitoring, privacy, transport, and recordkeeping. These are not human
              administration supplies and include no administration guidance.
            </p>
          </div>
          <Link href="/research/member/product-requests/new?source=products&category=laboratory_supply" className="btn btn-secondary justify-center">
            Request an accessory <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {accessories.map((accessory, index) => (
            <li key={accessory} className="rounded-xl border border-slate-200 bg-white p-4">
              {index < 2 ? <Thermometer className="text-indigo-700" size={18} aria-hidden="true" /> : index < 5 ? <LockKeyhole className="text-indigo-700" size={18} aria-hidden="true" /> : <Boxes className="text-indigo-700" size={18} aria-hidden="true" />}
              <p className="mt-3 text-sm font-semibold text-slate-900">{accessory}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SupportCenter({ categories }: { categories: readonly string[] }) {
  return (
    <section aria-labelledby="support-title" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">One place to start</p>
          <h2 id="support-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Support Center</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Choose the topic that best matches your question. Sensitive details stay inside the private member area.</p>
        </div>
        <LifeBuoy className="text-indigo-700" size={32} aria-hidden="true" />
      </div>
      <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category}>
            <Link href={`/research/support?topic=${encodeURIComponent(category)}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-indigo-300 hover:bg-indigo-50">
              {category} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

