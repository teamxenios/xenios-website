import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../ui/kit";
import type { Website3SurfaceState } from "./ProductCatalogExperience";

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
  launchInterestHref?: string;
};

export function PendingMetabolicCare({
  pathways,
  onJoinInterest,
  state = "ok",
  errorMessage,
  onRetry,
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
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
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
    <ResearchMemberShell
      eyebrow="Xenios Care"
      title="Clinician-guided metabolic care"
      lead="These pathways are separate from Research products and remain pending. Joining the interest list is not a clinical intake, evaluation, prescription, or guarantee."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Metabolic care pathways are not available right now."
        unavailableBody="Clinical and operational requirements are still being confirmed. No care service has been enabled."
      >
        <ResearchPendingPanel
          kind="coming_soon"
          title="Care pathways are being prepared"
          body="Clinicians must define eligibility, service, product, and follow-up details before any pathway is offered."
        />

        {pathways.length === 0 ? (
          <div className="mt-5">
            <ResearchEmptyState
              title="No pathways are published yet."
              body="Approved pathway descriptions will appear here when clinical review is complete."
            />
          </div>
        ) : (
          <ul className="mt-5 grid list-none gap-4 p-0 lg:grid-cols-3">
            {pathways.map((pathway) => (
              <li key={pathway.pathwayId} className="card flex min-w-0 flex-col">
                <ResearchStatusBadge label={pathway.publicStatus} tone="pending" />
                <h2 className="body-m font-700 mt-3">{pathway.publicName}</h2>
                <p className="body-s text-ink-2 mt-2 flex-1">{pathway.publicCopy}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href="#metabolic-interest"
                    onClick={() => setSelectedPathway(pathway.pathwayId)}
                    className="btn btn-secondary"
                  >
                    Join interest list
                  </a>
                  <Link href={pathway.actions.exploreCareHref} className="btn btn-ghost">Explore Care</Link>
                  <Link href={pathway.actions.askQuestionHref} className="btn btn-ghost">Ask a question</Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          id="metabolic-interest"
          onSubmit={(event) => void submit(event)}
          className="card mt-6"
          aria-labelledby="metabolic-interest-title"
        >
          <h2 id="metabolic-interest-title" className="body-l font-700">Join the interest list</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
            Share only the non-clinical details needed to receive pathway updates.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="form-label">Pathway *</span>
              <select
                className="input-field"
                value={selectedPathway}
                onChange={(event) => setSelectedPathway(event.target.value)}
                required
              >
                {pathways.map((pathway) => (
                  <option key={pathway.pathwayId} value={pathway.pathwayId}>{pathway.publicName}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="form-label">Current state *</span>
              <input
                className="input-field"
                value={currentState}
                onChange={(event) => setCurrentState(event.target.value.slice(0, 2))}
                placeholder="IL"
                pattern="[A-Za-z]{2}"
                autoComplete="address-level1"
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="form-label">General goal</span>
              <select
                className="input-field"
                value={generalGoalCategory}
                onChange={(event) => setGeneralGoalCategory(event.target.value)}
              >
                <option value="general_metabolic_health">General metabolic health</option>
                <option value="weight_management_interest">Weight-management interest</option>
                <option value="care_pathway_updates">Care pathway updates</option>
                <option value="other_general_goal">Other general goal</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="form-label">Preferred contact</span>
              <select
                className="input-field"
                value={preferredContact}
                onChange={(event) => setPreferredContact(event.target.value)}
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="text">Text</option>
              </select>
            </label>
          </div>
          <ResearchSecureNotice>
            This interest list records your account, state, general goal category, preferred contact,
            interest date, and attribution source. It does not collect symptoms, diagnoses,
            medications, or other clinical intake information.
          </ResearchSecureNotice>
          <button
            type="submit"
            className="btn btn-primary mt-5"
            disabled={!onJoinInterest || phase === "submitting" || pathways.length === 0}
          >
            {phase === "submitting" ? "Joining..." : "Join interest list"}
          </button>
          <div aria-live="polite" className="mt-3 body-s">
            {phase === "success" && (
              <p role="status">You are on the interest list. We will use your selected contact method for meaningful updates.</p>
            )}
            {phase === "error" && (
              <p role="alert">We could not save your interest. Your selections are preserved; try again.</p>
            )}
          </div>
        </form>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

export function SupplementComingSoon({
  supplements,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  supplements: SupplementCard[];
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  return (
    <ResearchMemberShell
      eyebrow="In review"
      title="Supplements"
      lead="Category placeholders remain unbranded and unpriced until product, quality, claims, stock, and channel approvals are complete."
      actions={
        <Link href={productRequestHref("supplements")} className="btn btn-secondary">
          Request a supplement
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Supplement information is not available right now."
        unavailableBody="No supplement is being presented as approved, stocked, or orderable."
      >
        <ResearchPendingPanel
          kind="coming_soon"
          title="Supplement categories are under review"
          body="Approved products will publish only after their quality, claims, inventory, and channel checks are complete."
        />

        {supplements.length === 0 ? (
          <div className="mt-5">
            <ResearchEmptyState
              title="No supplement categories are published yet."
              body="Approved category placeholders will appear here as review progresses."
            />
          </div>
        ) : (
          <ul className="mt-5 grid list-none gap-4 p-0 sm:grid-cols-2">
            {supplements.map((item) => (
              <li key={item.category} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="mono-label text-ink-mute">{item.category}</p>
                  <ResearchStatusBadge label={item.status} tone="pending" />
                </div>
                <h2 className="body-m font-700 mt-3">{item.label}</h2>
                <p className="body-s text-ink-2 mt-2">{item.description}</p>
                {item.launchInterestHref && (
                  <Link href={item.launchInterestHref} className="btn btn-secondary mt-4">
                    Register interest
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        <ResearchSecureNotice>
          No brand, price, stock, serving instruction, or benefit claim is implied by these placeholders.
        </ResearchSecureNotice>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
