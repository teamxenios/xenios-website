import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileLock2,
  FlaskConical,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export type SuperpowerOfferView = {
  label: string;
  summary: string;
  status: "coming_soon" | "available" | "paused" | "unavailable";
  availability: string;
  collectionMethod: string | null;
  priceLabel: string | null;
  priceEffectiveDate: string | null;
  lastVerificationDate: string | null;
  disclosure: string;
  affiliateUrl: string | null;
  researchBoundary: string;
};

export type BiomarkerStateView = {
  state:
    | "Not started"
    | "Coming soon"
    | "Test ordered"
    | "Collection scheduled"
    | "Results pending"
    | "Results available through partner"
    | "Report uploaded"
    | "Review requested"
    | "Qualified review complete"
    | "Follow-up due"
    | "Closed";
  updatedAt: string | null;
};

export function SuperpowerDiagnostics({ offer }: { offer: SuperpowerOfferView }) {
  const isAvailable = offer.status === "available";
  return (
    <section aria-labelledby="superpower-title" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[2rem] border border-indigo-200 bg-[radial-gradient(circle_at_top_right,#c7d2fe_0,transparent_36%),linear-gradient(135deg,#0f172a_0%,#1e1b4b_100%)] p-6 text-white shadow-xl sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-indigo-100">
                <Sparkles size={14} aria-hidden="true" /> Superpower
              </span>
              <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-slate-200">
                {offer.status === "coming_soon" ? "Coming soon" : offer.status.replace(/_/g, " ")}
              </span>
            </div>
            <h2 id="superpower-title" className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">{offer.label}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">{offer.summary}</p>
            <p className="mt-5 max-w-3xl rounded-xl border border-white/15 bg-white/5 p-4 text-sm leading-6 text-slate-200">
              {offer.researchBoundary}
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <dl className="grid gap-4 text-sm">
              <div>
                <dt className="text-slate-400">Availability</dt>
                <dd className="mt-1 font-semibold text-white">{offer.availability}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Collection method</dt>
                <dd className="mt-1 font-semibold text-white">{offer.collectionMethod ?? "Pending verification"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Current price</dt>
                <dd className="mt-1 font-semibold text-white">{offer.priceLabel ?? "Not published"}</dd>
                {offer.priceEffectiveDate && <dd className="mt-1 text-xs text-slate-400">Effective {offer.priceEffectiveDate}</dd>}
              </div>
              <div>
                <dt className="text-slate-400">Last verified</dt>
                <dd className="mt-1 font-semibold text-white">{offer.lastVerificationDate ?? "Verification pending"}</dd>
              </div>
            </dl>
            {isAvailable && offer.affiliateUrl ? (
              <a href={offer.affiliateUrl} rel="nofollow sponsored noreferrer" className="btn btn-primary mt-5 w-full justify-center">
                View partner offer <ArrowRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <button type="button" className="btn btn-secondary mt-5 w-full justify-center" disabled>
                Partner offer not enabled
              </button>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-300">{offer.disclosure}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const BIOMARKER_STEPS = [
  "Not started",
  "Coming soon",
  "Test ordered",
  "Collection scheduled",
  "Results pending",
  "Results available through partner",
  "Report uploaded",
  "Review requested",
  "Qualified review complete",
  "Follow-up due",
  "Closed",
] as const;

export function BiomarkerCenter({
  record,
  onUpload,
}: {
  record: BiomarkerStateView;
  onUpload?: (input: { file: File; consentAccepted: boolean }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "success" | "error">("idle");

  const upload = async () => {
    if (!file || !consent || !onUpload) return;
    setPhase("uploading");
    try {
      await onUpload({ file, consentAccepted: consent });
      setPhase("success");
    } catch {
      setPhase("error");
    }
  };

  return (
    <section aria-labelledby="biomarker-title" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Private member diagnostics</p>
          <h2 id="biomarker-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Biomarker Center</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Follow logistics and document status without automated medical interpretation. Results
            remain with the partner or in your private upload until a qualified review is requested.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-900">
          <CalendarClock size={16} aria-hidden="true" /> {record.state}
        </span>
      </div>

      <ol className="mt-6 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {BIOMARKER_STEPS.map((step, index) => {
          const activeIndex = BIOMARKER_STEPS.indexOf(record.state);
          const complete = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li key={step} className={`rounded-xl border p-3 text-sm ${current ? "border-indigo-500 bg-indigo-50 text-indigo-950" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-500"}`} aria-current={current ? "step" : undefined}>
              <span className="flex items-center gap-2 font-semibold">
                {complete ? <CheckCircle2 size={15} aria-hidden="true" /> : <span className="inline-grid h-5 w-5 place-items-center rounded-full border text-[10px]">{index + 1}</span>}
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <FileLock2 className="mt-0.5 shrink-0 text-indigo-700" aria-hidden="true" />
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Upload a private report</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                PDF, JPEG, or PNG up to 15 MB. The file uses private storage and short-lived signed access.
              </p>
            </div>
          </div>
          <label className="mt-5 block text-sm font-semibold text-slate-800">
            Report file
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="mt-2 block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I consent to storing this report privately for the Biomarker Center and understand that uploading it does not create an automated medical interpretation.</span>
          </label>
          <button type="button" className="btn btn-primary mt-4" onClick={() => void upload()} disabled={!file || !consent || !onUpload || phase === "uploading"}>
            {phase === "uploading" ? "Preparing private upload…" : "Upload report"}
          </button>
          <div aria-live="polite" className="mt-3 text-sm">
            {phase === "success" && <p className="text-emerald-800">Your report upload is prepared and remains private.</p>}
            {phase === "error" && <p className="text-red-700">Private upload is unavailable right now. Try again later.</p>}
          </div>
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <ShieldCheck className="text-slate-800" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-semibold text-slate-950">Qualified review only</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Xenios does not auto-score or diagnose uploaded reports. A review request goes to a
            qualified reviewer and remains separate from Research product commerce.
          </p>
          <Link href="/research/member/questions?topic=biomarker-review" className="btn btn-secondary mt-5 w-full justify-center">
            Ask about review
          </Link>
        </aside>
      </div>
    </section>
  );
}

export function DiagnosticsMemberHome({
  offer,
  biomarker,
}: {
  offer: SuperpowerOfferView;
  biomarker: BiomarkerStateView;
}) {
  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
          <FlaskConical className="shrink-0 text-indigo-700" aria-hidden="true" />
          Diagnostics organizes offers, collection, partner results, private reports, and review
          status. It does not validate Research products.
        </div>
      </div>
      <SuperpowerDiagnostics offer={offer} />
      <BiomarkerCenter record={biomarker} />
    </>
  );
}

