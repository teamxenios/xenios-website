import { useState } from "react";
import { Link } from "wouter";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../ui/kit";
import type { Website3SurfaceState } from "./ProductCatalogExperience";

export type SuperpowerOfferView = {
  label: string;
  summary: string;
  status: "coming_soon" | "available" | "paused" | "unavailable";
  availability: string;
  collectionMethod: string | null;
  priceLabel: string | null;
  priceEffectiveDate: string | null;
  lastVerificationDate: string | null;
  lastReviewedDate?: string | null;
  verifiedPriceDate?: string | null;
  disclosure: string;
  interestHref?: string | null;
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

function offerStatusLabel(status: SuperpowerOfferView["status"]): string {
  if (status === "coming_soon") return "Coming soon";
  if (status === "available") return "Available";
  if (status === "paused") return "Paused";
  return "Unavailable";
}

export function SuperpowerDiagnostics({ offer }: { offer: SuperpowerOfferView }) {
  const isAvailable = offer.status === "available" && Boolean(offer.affiliateUrl);
  return (
    <section aria-labelledby="superpower-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-cap text-pulse">Diagnostics partner</p>
          <h2 id="superpower-title" className="body-l font-700 mt-2">{offer.label}</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[64ch]">{offer.summary}</p>
        </div>
        <ResearchStatusBadge
          label={offerStatusLabel(offer.status)}
          tone={offer.status === "available" ? "success" : offer.status === "unavailable" ? "warning" : "pending"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {isAvailable ? (
          <div className="card">
            <p className="mono-label text-ink-mute">Partner access</p>
            <p className="body-s text-ink-2 mt-2">{offer.researchBoundary}</p>
            <a href={offer.affiliateUrl ?? undefined} rel="nofollow sponsored noreferrer" className="btn btn-primary mt-4">
              View partner offer
            </a>
          </div>
        ) : (
          <ResearchPendingPanel
            kind={offer.status === "unavailable" ? "unavailable" : "coming_soon"}
            title="Partner offer not enabled"
            body={`${offer.researchBoundary} ${offer.disclosure}`}
            action={
              offer.interestHref ? (
                <Link href={offer.interestHref} className="btn btn-secondary">
                  Register interest
                </Link>
              ) : undefined
            }
          />
        )}

        <dl className="card grid gap-4 body-s">
          <div>
            <dt className="mono-label text-ink-mute">Availability</dt>
            <dd className="text-ink-2 mt-1">{offer.availability}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Collection method</dt>
            <dd className="text-ink-2 mt-1">{offer.collectionMethod ?? "Pending verification"}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Current price</dt>
            <dd className="text-ink-2 mt-1">{offer.priceLabel ?? "Not published"}</dd>
            {offer.priceEffectiveDate && <dd className="text-ink-mute mt-1">Effective {offer.priceEffectiveDate}</dd>}
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Last verified</dt>
            <dd className="text-ink-2 mt-1">{offer.lastVerificationDate ?? "Verification pending"}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Last reviewed</dt>
            <dd className="text-ink-2 mt-1">{offer.lastReviewedDate ?? "Review pending"}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Price verified</dt>
            <dd className="text-ink-2 mt-1">{offer.verifiedPriceDate ?? "No verified price"}</dd>
          </div>
        </dl>
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

  const activeIndex = BIOMARKER_STEPS.indexOf(record.state);

  return (
    <section aria-labelledby="biomarker-title" className="mt-10 pt-8" style={{ borderTop: "1px solid var(--rule)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-cap text-pulse">Private member diagnostics</p>
          <h2 id="biomarker-title" className="body-l font-700 mt-2">Biomarker Center</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[68ch]">
            Follow logistics and document status without automated medical interpretation. Results
            remain with the partner or in private storage until a qualified review is requested.
          </p>
        </div>
        <ResearchStatusBadge label={record.state} tone="info" />
      </div>

      <ol className="mt-5 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {BIOMARKER_STEPS.map((step, index) => {
          const complete = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li
              key={step}
              className="flex items-center gap-3 border-b py-3 body-s"
              style={{ borderColor: "var(--rule)" }}
              aria-current={current ? "step" : undefined}
            >
              <span className="mono-label text-ink-mute" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={current ? "font-700 text-pulse" : complete ? "text-ink" : "text-ink-mute"}>
                {step}{complete ? " — complete" : current ? " — current" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form className="card" onSubmit={(event) => { event.preventDefault(); void upload(); }}>
          <h3 className="body-m font-700">Upload a private report</h3>
          <p className="body-s text-ink-2 mt-2">
            PDF, JPEG, or PNG up to 15 MB. Files use private storage and short-lived signed access.
          </p>
          {!onUpload && (
            <p className="body-s text-ink-mute mt-3" role="status">
              Private report upload is not enabled yet.
            </p>
          )}
          <label className="grid gap-2 mt-5">
            <span className="form-label">Report file</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="input-field"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex items-start gap-3 mt-4 body-s text-ink-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I consent to storing this report privately for the Biomarker Center and understand
              that uploading it does not create an automated medical interpretation.
            </span>
          </label>
          <button
            type="submit"
            className="btn btn-primary mt-4"
            disabled={!file || !consent || !onUpload || phase === "uploading"}
          >
            {phase === "uploading" ? "Preparing private upload..." : "Upload report"}
          </button>
          <div aria-live="polite" className="mt-3 body-s">
            {phase === "success" && <p role="status">Your report upload is prepared and remains private.</p>}
            {phase === "error" && (
              <p role="alert">
                Private upload is unavailable right now. Your selection is preserved; try again.
              </p>
            )}
          </div>
        </form>

        <aside className="card">
          <p className="mono-label text-ink-mute">Review boundary</p>
          <h3 className="body-m font-700 mt-2">Qualified review only</h3>
          <p className="body-s text-ink-2 mt-2">
            Xenios does not auto-score or diagnose uploaded reports. Review remains separate from
            Research product commerce.
          </p>
          <Link href="/research/member/questions?topic=biomarker-review" className="btn btn-secondary mt-4">
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
  onUpload,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  offer: SuperpowerOfferView;
  biomarker: BiomarkerStateView;
  onUpload?: (input: { file: File; consentAccepted: boolean }) => Promise<void>;
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  return (
    <ResearchMemberShell
      eyebrow="Member diagnostics"
      title="Diagnostics"
      lead="Organize partner offers, collection status, private reports, and qualified review without implying that diagnostic results validate a Research product."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="Diagnostics are not available right now."
        unavailableBody="Partner access and private report workflows remain closed until their production gates are confirmed."
      >
        <ResearchSecureNotice>
          Diagnostics does not validate Research products or establish product quality, safety, or suitability.
        </ResearchSecureNotice>
        <div className="mt-6">
          <SuperpowerDiagnostics offer={offer} />
          <BiomarkerCenter record={biomarker} onUpload={onUpload} />
        </div>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
