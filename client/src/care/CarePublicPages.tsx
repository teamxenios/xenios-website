import type { ReactNode } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import TebraPortalHandoff from "./TebraPortalHandoff";
import TebraSchedulingExperience from "./TebraSchedulingExperience";
import { useTebraPublicConfiguration } from "./useTebraPublicConfiguration";

export const CARE_PUBLIC_PATHS = {
  home: "/care",
  schedule: "/care/schedule",
  portal: "/care/portal",
  howItWorks: "/care/how-it-works",
  providerReview: "/care/provider-review",
  support: "/care/support",
} as const;

const careNavigation = [
  ["Care overview", CARE_PUBLIC_PATHS.home],
  ["Request an appointment", CARE_PUBLIC_PATHS.schedule],
  ["Patient Portal", CARE_PUBLIC_PATHS.portal],
  ["How it works", CARE_PUBLIC_PATHS.howItWorks],
  ["Provider review", CARE_PUBLIC_PATHS.providerReview],
  ["Support", CARE_PUBLIC_PATHS.support],
] as const;

function CareNavigation({ currentPath }: { currentPath: string }) {
  return (
    <nav className="container-x pb-10" aria-label="Care pages">
      <ul className="flex flex-wrap gap-3">
        {careNavigation.map(([label, href]) => (
          <li key={href}>
            <Link
              href={href}
              className={`btn min-h-11 ${currentPath === href ? "btn-primary" : "btn-secondary"}`}
              aria-current={currentPath === href ? "page" : undefined}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CarePage({
  path,
  eyebrow,
  title,
  description,
  intro,
  children,
}: {
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <SeoHead title={`${title}, xenios`} description={description} path={path} robots="noindex, nofollow" />
      <section className="container-x pt-24 md:pt-36 pb-10" aria-labelledby="care-page-title">
        <p className="mono-cap text-pulse mb-6">{eyebrow}</p>
        <h1 id="care-page-title" className="display-m text-balance max-w-[19ch]">{title}</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[68ch]">{intro}</p>
      </section>
      <CareNavigation currentPath={path} />
      {children}
      <EmergencyBoundary />
    </PageShell>
  );
}

function EmergencyBoundary() {
  return (
    <section className="container-x py-16 rule-top" aria-labelledby="care-emergency-title">
      <p className="mono-cap text-pulse mb-6">EMERGENCY BOUNDARY</p>
      <h2 id="care-emergency-title" className="display-s max-w-[18ch]">This site is not emergency care.</h2>
      <p className="mt-6 body-l text-ink-2 max-w-[62ch]">
        If you may be experiencing a medical emergency, call 911 in the United States or contact
        your local emergency services now. Do not wait for a response from Xenios or a Tebra appointment request.
      </p>
    </section>
  );
}

function CareAvailabilitySummary() {
  const { state, retry } = useTebraPublicConfiguration();
  if (state.kind === "loading") {
    return <p className="body-m text-ink-2" aria-live="polite">Checking the current Care configuration…</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert">
        <p className="body-m text-ink-2">Care configuration could not be verified, so every handoff remains unavailable.</p>
        <button type="button" className="btn btn-secondary min-h-11 mt-5" onClick={retry}>Try again</button>
      </div>
    );
  }
  return (
    <div aria-live="polite">
      <p className="body-l">
        {state.configuration.careAvailable === true
          ? "The Care capability is available. Scheduling and portal handoffs remain subject to their separately verified configuration."
          : "Xenios Care remains unavailable. No scheduling or portal access is enabled through this site."}
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
        <div><dt className="mono-label text-ink-mute">SCHEDULING</dt><dd className="body-m mt-1">{state.configuration.scheduling.status.replaceAll("_", " ")}</dd></div>
        <div><dt className="mono-label text-ink-mute">PATIENT PORTAL</dt><dd className="body-m mt-1">{state.configuration.portal.status.replaceAll("_", " ")}</dd></div>
      </dl>
    </div>
  );
}

export function CareHomePage() {
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.home}
      eyebrow="CARE · EXTERNAL HANDOFFS"
      title="Care starts with clear clinical boundaries."
      description="Understand Xenios Care boundaries and, when enabled, continue to reviewed Tebra scheduling and portal surfaces."
      intro="Xenios explains the handoff and keeps availability explicit. Appointment requests and patient-portal activity occur in Tebra and remain subject to the practice's review and configuration."
    >
      <section className="container-x pb-16" aria-labelledby="care-current-status">
        <aside className="card max-w-[820px]" style={{ borderLeftColor: "var(--pulse)", borderLeftWidth: 3 }}>
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-current-status" className="h2 mb-4">Verified before any handoff is shown.</h2>
          <CareAvailabilitySummary />
          <p className="body-m text-ink-2 mt-6">
            Care status is managed through the provider/Tebra workflow.
          </p>
        </aside>
      </section>
      <section className="container-x py-16 rule-y" aria-labelledby="care-boundaries-title">
        <p className="mono-cap text-ink-mute mb-6">WHAT THIS MEANS</p>
        <h2 id="care-boundaries-title" className="display-s max-w-[20ch]">A request is not a clinical decision.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          <article className="card">
            <h3 className="h3">Scheduling</h3>
            <p className="body-m text-ink-2 mt-3">When enabled, Tebra accepts an appointment request for practice review—not a guaranteed appointment.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href={CARE_PUBLIC_PATHS.schedule}>Check scheduling</Link>
          </article>
          <article className="card">
            <h3 className="h3">Provider review</h3>
            <p className="body-m text-ink-2 mt-3">A licensed provider independently determines eligibility, clinical appropriateness, treatment, and follow-up.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href={CARE_PUBLIC_PATHS.providerReview}>Understand review</Link>
          </article>
          <article className="card">
            <h3 className="h3">Patient Portal</h3>
            <p className="body-m text-ink-2 mt-3">Invited patients continue to Tebra. Xenios does not reproduce, embed, or bypass its secure portal.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href={CARE_PUBLIC_PATHS.portal}>Check the portal handoff</Link>
          </article>
        </div>
      </section>
    </CarePage>
  );
}

export function CareSchedulePage() {
  const { state, retry } = useTebraPublicConfiguration();
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.schedule}
      eyebrow="CARE · TEBRA SCHEDULING"
      title="Request an appointment through Tebra."
      description="Use a reviewed Tebra handoff to request an appointment when Xenios Care scheduling is enabled."
      intro="The practice reviews every request. Submitting a request does not confirm an appointment or determine clinical eligibility."
    >
      <section className="container-x pb-16" aria-label="Tebra scheduling handoff">
        <TebraSchedulingExperience state={state} onRetry={retry} />
      </section>
    </CarePage>
  );
}

export function CarePortalPage() {
  const { state, retry } = useTebraPublicConfiguration();
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.portal}
      eyebrow="CARE · PATIENT PORTAL"
      title="Care records and Patient Portal activity stay in Tebra."
      description="Continue to the external Tebra Patient Portal when a reviewed portal handoff is enabled."
      intro="Portal access is managed by the practice and Tebra. It may require a practice invitation and separate sign-in. Xenios does not embed the portal or provide single sign-on."
    >
      <section className="container-x pb-16" aria-label="Tebra Patient Portal handoff">
        <TebraPortalHandoff state={state} onRetry={retry} />
      </section>
    </CarePage>
  );
}

export function CareHowItWorksPage() {
  const steps = [
    ["Check availability", "Xenios shows a Tebra handoff only after the Care capability and integration configuration pass their checks."],
    ["Send a request in Tebra", "You choose a visible time or request option and provide information directly to the practice through Tebra."],
    ["Wait for practice confirmation", "The practice reviews the tentative request and communicates whether it is confirmed or declined. The practice may contact you about changes."],
    ["Receive independent clinical review", "At the appropriate time, a licensed provider determines what care, if any, is clinically appropriate."],
  ] as const;
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.howItWorks}
      eyebrow="CARE · PROCESS"
      title="From request to provider review."
      description="See the boundaries between a Tebra appointment request, practice confirmation, and independent provider review."
      intro="Scheduling is an administrative first step. It does not decide eligibility, guarantee care, or authorize treatment, prescriptions, products, or pharmacy fulfillment."
    >
      <section className="container-x pb-16" aria-labelledby="care-process-title">
        <h2 id="care-process-title" className="display-s max-w-[20ch]">Four separate checkpoints.</h2>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          {steps.map(([title, detail], index) => (
            <li className="card" key={title}>
              <span className="tile-num text-pulse" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="h3 mt-7">{title}</h3>
              <p className="body-m text-ink-2 mt-3">{detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </CarePage>
  );
}

export function CareProviderReviewPage() {
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.providerReview}
      eyebrow="CARE · CLINICAL INDEPENDENCE"
      title="Providers make the clinical decisions."
      description="Understand the boundary between Xenios, Tebra scheduling, and independent licensed-provider review."
      intro="Xenios does not direct a clinician to diagnose, treat, or prescribe. A provider evaluates the information available to them, applies professional judgment, and may determine that care is not appropriate."
    >
      <section className="container-x pb-16" aria-labelledby="provider-review-boundaries">
        <h2 id="provider-review-boundaries" className="display-s max-w-[20ch]">What never establishes approval.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          {[
            ["An appointment request", "A request is tentative until the practice confirms it."],
            ["Research participation", "Research access, participation, results, or interest do not unlock Care."],
            ["Membership or product interest", "Membership, purchase history, product interest, or pharmacy availability do not imply eligibility, treatment, or prescription approval."],
            ["A completed form", "Providing information does not require a provider to accept a patient or recommend a particular course of care."],
          ].map(([title, detail]) => (
            <article className="card" key={title}>
              <h3 className="h3">{title}</h3>
              <p className="body-m text-ink-2 mt-3">{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </CarePage>
  );
}

export function CareSupportPage() {
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.support}
      eyebrow="CARE · SUPPORT"
      title="Use the right support channel."
      description="Find the appropriate support path for Xenios Care questions and Tebra portal or scheduling issues."
      intro="For questions about a Tebra request, portal invitation, appointment confirmation, clinical matter, or record, follow the practice's Tebra instructions. Xenios support cannot make clinical decisions or confirm appointments."
    >
      <section className="container-x pb-16" aria-labelledby="care-support-options">
        <h2 id="care-support-options" className="display-s max-w-[20ch]">Choose by responsibility.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          <article className="card">
            <h3 className="h3">Care practice support</h3>
            <p className="body-m text-ink-2 mt-3">Use the instructions on the Tebra surface for appointment requests, confirmations, portal invitations, sign-in, records, or practice communications.</p>
          </article>
          <article className="card">
            <h3 className="h3">Xenios site support</h3>
            <p className="body-m text-ink-2 mt-3">Contact Xenios for a broken Care page or handoff. Do not send medical information through the general contact page.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href="/contact">Contact Xenios</Link>
          </article>
        </div>
      </section>
    </CarePage>
  );
}

export function CareNotFoundPage() {
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.home}
      eyebrow="CARE · PAGE NOT FOUND"
      title="This Care page is not available."
      description="Return to the Xenios Care overview."
      intro="No appointment, account, treatment, or portal action was created. Return to the Care overview to use a currently supported path."
    >
      <section className="container-x pb-16">
        <Link className="btn btn-primary min-h-11" href={CARE_PUBLIC_PATHS.home}>Return to Care overview</Link>
      </section>
    </CarePage>
  );
}
