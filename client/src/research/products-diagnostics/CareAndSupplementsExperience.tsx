import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight, HeartHandshake, MailQuestion, Sparkles } from "lucide-react";

export type PublicPathwayCard = {
  pathwayId: string;
  publicName: string;
  publicStatus: string;
  publicCopy: string;
  actions: {
    joinInterestHref: string;
    exploreCareHref: string;
    askQuestionHref: string;
  };
};

export type SupplementCard = {
  category: "foundational" | "performance" | "longevity" | "specialty";
  label: string;
  status: "Coming soon";
  description: string;
};

export function PendingMetabolicCare({
  pathways,
  onJoinInterest,
}: {
  pathways: PublicPathwayCard[];
  onJoinInterest?: (input: {
    pathwayId: string;
    currentState: string;
    generalGoalCategory: string;
    preferredContact: string;
    interestDate: string;
    attributionSource: string;
  }) => Promise<void>;
}) {
  const [selectedPathway, setSelectedPathway] = useState(pathways[0]?.pathwayId ?? "");
  const [currentState, setCurrentState] = useState("");
  const [generalGoalCategory, setGeneralGoalCategory] = useState("care_pathway_updates");
  const [preferredContact, setPreferredContact] = useState("email");
  const [phase, setPhase] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!onJoinInterest) return;
    setPhase("submitting");
    try {
      await onJoinInterest({
        pathwayId: selectedPathway,
        currentState: currentState.toUpperCase(),
        generalGoalCategory,
        preferredContact,
        interestDate: new Date().toISOString().slice(0, 10),
        attributionSource: "clinician_guided_metabolic_care",
      });
      setPhase("success");
    } catch {
      setPhase("error");
    }
  };

  return (
    <section aria-labelledby="metabolic-care-title" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Xenios Care</p>
          <h2 id="metabolic-care-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Clinician-Guided Metabolic Care
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            These pathways are separate from Research products and remain pending. Joining the
            interest list is not a clinical intake, evaluation, prescription, or guarantee.
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm leading-6 text-indigo-950">
          <HeartHandshake className="mb-3" aria-hidden="true" />
          Clinicians will define eligibility, service, product, and follow-up details before any
          pathway is offered.
        </div>
      </div>

      <ul className="mt-7 grid list-none gap-4 p-0 lg:grid-cols-3">
        {pathways.map((pathway) => (
          <li key={pathway.pathwayId} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="inline-flex w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
              {pathway.publicStatus}
            </span>
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">{pathway.publicName}</h3>
            <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{pathway.publicCopy}</p>
            <div className="mt-5 grid gap-2">
              <a
                href="#metabolic-interest"
                onClick={() => setSelectedPathway(pathway.pathwayId)}
                className="btn btn-primary justify-center"
              >
                Join interest list
              </a>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                <Link href={pathway.actions.exploreCareHref} className="text-sm font-bold text-indigo-700">Explore Care</Link>
                <Link href={pathway.actions.askQuestionHref} className="text-sm font-bold text-indigo-700">Ask a question</Link>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form id="metabolic-interest" onSubmit={(event) => void submit(event)} className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-semibold text-slate-800">
            Pathway
            <select className="input-field mt-2 w-full" value={selectedPathway} onChange={(event) => setSelectedPathway(event.target.value)} required>
              {pathways.map((pathway) => <option key={pathway.pathwayId} value={pathway.pathwayId}>{pathway.publicName}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Current state
            <input className="input-field mt-2 w-full" value={currentState} onChange={(event) => setCurrentState(event.target.value.slice(0, 2))} placeholder="IL" pattern="[A-Za-z]{2}" autoComplete="address-level1" required />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            General goal
            <select className="input-field mt-2 w-full" value={generalGoalCategory} onChange={(event) => setGeneralGoalCategory(event.target.value)}>
              <option value="general_metabolic_health">General metabolic health</option>
              <option value="weight_management_interest">Weight-management interest</option>
              <option value="care_pathway_updates">Care pathway updates</option>
              <option value="other_general_goal">Other general goal</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Preferred contact
            <select className="input-field mt-2 w-full" value={preferredContact} onChange={(event) => setPreferredContact(event.target.value)}>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="text">Text</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-xs leading-5 text-slate-600">
            This interest list records your member account, current state, general goal category,
            preferred contact, interest date, and attribution source. It does not collect symptoms,
            diagnoses, medications, or other clinical intake information.
          </p>
          <button type="submit" className="btn btn-primary shrink-0 justify-center" disabled={!onJoinInterest || phase === "submitting"}>
            {phase === "submitting" ? "Joining…" : "Join interest list"}
          </button>
        </div>
        <div aria-live="polite" className="mt-3 text-sm">
          {phase === "success" && <p className="text-emerald-800">You are on the interest list. We will use your selected contact method for meaningful updates.</p>}
          {phase === "error" && <p className="text-red-700">We could not save your interest right now. Try again.</p>}
        </div>
      </form>
    </section>
  );
}

export function SupplementComingSoon({ supplements }: { supplements: SupplementCard[] }) {
  return (
    <section aria-labelledby="supplements-title" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">In review</p>
          <h2 id="supplements-title" className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Supplements, coming soon</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Category placeholders remain unbranded and unpriced until product, quality, claims, stock,
            and channel approvals are complete.
          </p>
        </div>
        <Link href="/research/member/product-requests/new?source=supplements" className="btn btn-secondary shrink-0">
          Request a supplement <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {supplements.map((item) => (
          <li key={item.category} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <Sparkles className="text-indigo-700" aria-hidden="true" size={20} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.status}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-950">{item.label}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <MailQuestion className="mt-0.5 shrink-0 text-slate-700" size={18} aria-hidden="true" />
        No brand, price, stock, serving instruction, or benefit claim is implied by these placeholders.
      </div>
    </section>
  );
}

