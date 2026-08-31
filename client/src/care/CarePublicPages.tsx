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
  ["Begin intake", CARE_PUBLIC_PATHS.schedule],
  ["Care account", CARE_PUBLIC_PATHS.portal],
  ["How Care works", CARE_PUBLIC_PATHS.howItWorks],
  ["Clinical review", CARE_PUBLIC_PATHS.providerReview],
  ["Support", CARE_PUBLIC_PATHS.support],
] as const;

function careRobots(path: string): "index, follow" | "noindex, follow" {
  return path === CARE_PUBLIC_PATHS.home ||
    path === CARE_PUBLIC_PATHS.howItWorks ||
    path === CARE_PUBLIC_PATHS.providerReview
    ? "index, follow"
    : "noindex, follow";
}

function CareNavigation({ currentPath }: { currentPath: string }) {
  return (
    <nav className="container-x pb-10" aria-label="Care pages">
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
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
      <SeoHead title={`${title} | Xenios Care`} description={description} path={path} robots={careRobots(path)} />
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
          ? "The Xenios Care pathway is available. Intake, scheduling, provider review, portal, and pharmacy handoffs remain subject to their separately verified configuration and current source status."
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
      eyebrow="XENIOS CARE · U.S.-BASED CLINICAL PATHWAY"
      title="Start with a secure intake. Continue with licensed clinical review."
      description="Create an account, complete a health questionnaire, receive independent review by a U.S.-licensed clinician, and continue to pharmacy fulfillment when treatment is clinically appropriate."
      intro="Xenios Care is available nationwide. Create or access your secure account, confirm your current location, complete the health questionnaire, and receive independent review by a U.S.-licensed clinician. When treatment is clinically appropriate and serviceable, a prescription may be fulfilled through a U.S.-based, state-licensed compounding pharmacy."
    >
      <section className="container-x pb-16" aria-labelledby="care-current-status">
        <aside className="card max-w-[820px]" style={{ borderLeftColor: "var(--pulse)", borderLeftWidth: 3 }}>
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-current-status" className="h2 mb-4">Verified before any handoff is shown.</h2>
          <CareAvailabilitySummary />
          <p className="body-m text-ink-2 mt-6">
            Care status remains source-authoritative and is never inferred from this page.
          </p>
        </aside>
      </section>
      <section className="container-x py-16 rule-y" aria-labelledby="care-boundaries-title">
        <p className="mono-cap text-ink-mute mb-6">THE CARE JOURNEY</p>
        <h2 id="care-boundaries-title" className="display-s max-w-[20ch]">Separate checkpoints, one clear experience.</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
          <article className="card">
            <h3 className="h3">Secure intake</h3>
            <p className="body-m text-ink-2 mt-3">Create or access your account, confirm your current location, and provide health history, medications, allergies, goals, prior treatment, and other information required for clinical review.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href={CARE_PUBLIC_PATHS.schedule}>Begin intake</Link>
          </article>
          <article className="card">
            <h3 className="h3">Licensed clinical review</h3>
            <p className="body-m text-ink-2 mt-3">An appropriately licensed clinician independently reviews the information and may ask questions, request records or labs, require a visit, recommend another approach, approve appropriate treatment, or decline.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href={CARE_PUBLIC_PATHS.providerReview}>Understand clinical review</Link>
          </article>
          <article className="card">
            <h3 className="h3">Pharmacy, tracking, and follow-up</h3>
            <p className="body-m text-ink-2 mt-3">When prescribed and serviceable, a U.S.-based, state-licensed compounding pharmacy handles compounding or dispensing and shipment. Account status, tracking, support, and clinical follow-up remain separate and visible.</p>
            <Link className="btn btn-secondary min-h-11 mt-6" href={CARE_PUBLIC_PATHS.portal}>Continue to Care account</Link>
          </article>
        </div>
      </section>
      <section className="container-x py-16 rule-bottom" aria-labelledby="care-foundations-title">
        <p className="mono-cap text-pulse mb-6">FIRST-MONTH FOUNDATIONS</p>
        <h2 id="care-foundations-title" className="display-s max-w-[20ch]">Personalized support for the habits around your care.</h2>
        <p className="mt-6 body-l text-ink-2 max-w-[72ch]">
          Eligible Xenios Care clients receive a personalized First-Month Foundations Plan at no additional charge,
          created by a CSCS professional. The plan may include fitness programming, weekly training structure, home or
          gym alternatives, nutrition planning, protein and hydration guidance, grocery lists, recipes, location-aware
          restaurant recommendations, travel adaptations, sleep and recovery foundations, and one email check-in each
          week. Optional continuation is available for $30 per month and is never automatic.
        </p>
        <p className="mt-5 body-m text-ink-mute max-w-[68ch]">
          Lifestyle programming is nonclinical. CSCS professionals do not diagnose, prescribe, change medication, or replace the licensed clinical team.
        </p>
      </section>
    </CarePage>
  );
}

export function CareSchedulePage() {
  const { state, retry } = useTebraPublicConfiguration();
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.schedule}
      eyebrow="XENIOS CARE · SECURE INTAKE"
      title="Begin your clinical intake."
      description="Create or access your Care account, confirm your location, and submit the health information required for independent licensed clinical review."
      intro="Submitting the intake starts the review process. It does not confirm eligibility, guarantee an appointment, or guarantee a prescription. Review may begin asynchronously, and the clinician may request additional questions, records, laboratory work, or a phone or video visit."
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
      eyebrow="XENIOS CARE · ACCOUNT AND PORTAL"
      title="Follow the clinical journey through the authorized Care system."
      description="Use the authorized Care portal for clinical messages, records, appointments, review requests, pharmacy status, and follow-up when those capabilities are available."
      intro="Clinical records and provider communications remain in the authorized clinical system. Xenios may show operational status and handoffs, but it does not reproduce or bypass the provider's secure record system."
    >
      <section className="container-x pb-16" aria-label="Tebra Patient Portal handoff">
        <TebraPortalHandoff state={state} onRetry={retry} />
      </section>
    </CarePage>
  );
}

export function CareHowItWorksPage() {
  const steps = [
    ["Create your account and confirm location", "Provide identity, contact information, date of birth, current physical location, and the required notices and consent."],
    ["Complete the health questionnaire", "Share health history, current medications and supplements, allergies, goals, symptoms, prior treatment, relevant laboratory information, and safety questions required for review."],
    ["Receive licensed clinical review", "A U.S.-licensed clinician independently reviews the information. Additional questions, records, labs, or a phone or video visit may be required before a decision."],
    ["Continue when clinically appropriate", "When a prescription is appropriate and serviceable, a U.S.-based, state-licensed compounding pharmacy may fulfill it. Xenios supports account status, tracking, lifestyle programming, support, and follow-up around the separate clinical and pharmacy sources."],
  ] as const;
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.howItWorks}
      eyebrow="XENIOS CARE · PROCESS"
      title="From intake to clinician review, pharmacy, and follow-up."
      description="See the separate checkpoints in the active Xenios Care pathway."
      intro="The process is designed to feel simple without turning intake, product interest, payment, or pharmacy availability into automatic clinical approval."
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
      eyebrow="XENIOS CARE · CLINICAL INDEPENDENCE"
      title="Your clinician makes the medical decision."
      description="Understand what a licensed clinician reviews and why an intake, product interest, price, or pharmacy option never creates automatic approval."
      intro="The licensed clinician evaluates the information available, applies professional judgment, and determines whether more information, a visit, laboratory work, another form of care, a prescription, or no treatment is appropriate. Xenios does not direct the decision."
    >
      <section className="container-x pb-16" aria-labelledby="provider-review-boundaries">
        <h2 id="provider-review-boundaries" className="display-s max-w-[20ch]">What never establishes approval.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          {[
            ["A selected product", "Choosing or asking about a product does not establish that it is appropriate, available, or prescribable for the person."],
            ["A completed questionnaire", "The intake provides information for review. It does not require the clinician to approve treatment or accept the requested formulation."],
            ["Research access or purchase history", "Research membership, a Research request, an order, or product documentation never creates Care eligibility or a clinical relationship."],
            ["Pharmacy availability or price", "A pharmacy listing, formulation, estimate, or available ingredient does not replace the clinician's independent decision or the pharmacy's final prescription review."],
          ].map(([title, detail]) => (
            <article className="card" key={title}>
              <h3 className="h3">{title}</h3>
              <p className="body-m text-ink-2 mt-3">{detail}</p>
            </article>
          ))}
        </div>
        <p className="body-m text-ink-2 mt-8 max-w-[68ch]">
          The clinician may approve an appropriate treatment, ask follow-up questions, request records or laboratory work,
          require a live encounter, recommend a different option, decline the request, or refer the person elsewhere. No outcome is guaranteed.
        </p>
      </section>
    </CarePage>
  );
}

export function CareSupportPage() {
  return (
    <CarePage
      path={CARE_PUBLIC_PATHS.support}
      eyebrow="XENIOS CARE · SUPPORT"
      title="Use the support channel that owns the answer."
      description="Route clinical, pharmacy, account, shipment, and website questions to the source that can answer them safely."
      intro="Clinical symptoms, side effects, medical records, prescribing, and treatment questions belong to the authorized clinical team. Medication-specific dispensing and pharmacy-shipment questions belong to the pharmacy. Xenios support handles website access, pathway navigation, operational status, tracking visibility, lifestyle-program support, and escalation."
    >
      <section className="container-x pb-16" aria-labelledby="care-support-options">
        <h2 id="care-support-options" className="display-s max-w-[20ch]">Choose by responsibility.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          <article className="card">
            <h3 className="h3">Clinical and pharmacy support</h3>
            <p className="body-m text-ink-2 mt-3">Use the authorized clinical or pharmacy instructions for symptoms, side effects, medical records, prescribing, treatment, medication-specific dispensing, or pharmacy shipment questions.</p>
          </article>
          <article className="card">
            <h3 className="h3">Xenios site support</h3>
            <p className="body-m text-ink-2 mt-3">Contact Xenios for website access, pathway navigation, operational status, tracking visibility, lifestyle-program support, or escalation. Do not send medical information through the general contact page.</p>
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
