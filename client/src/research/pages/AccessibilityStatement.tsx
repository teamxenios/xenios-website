import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { ACCESS_ROUTES } from "../lib/routes";
import { RESEARCH_SUPPORT_EMAIL } from "./Support";
import "./public-editorial.css";

// ---------------------------------------------------------------------------
// Accessibility Statement (/research/accessibility). UNMOUNTED at this head:
// section.tsx and lib/routes.ts are Lead-owned, so registration is a handoff
// snippet (see CONTROL/HANDOFFS/CLAUDE-HELPER-A11Y-EVIDENCE-HANDOFF.md):
//
//   lib/routes.ts   ACCESS_ROUTES.accessibility: "/research/accessibility",
//   section.tsx     <Route path="/research/accessibility">{() => <L component={AccessibilityStatement} />}</Route>
//   shared/research/paths.ts  add "/research/accessibility" to PUBLIC_RESEARCH_DOCUMENT_PATHS
//
// The statement makes no conformance claim it cannot back: the target standard
// is named, the automated evidence process is described, and known limits are
// listed as facts. Update the "known limitations" list from the evidence
// manifest on the frozen SHA before mounting.
// ---------------------------------------------------------------------------

export const ACCESSIBILITY_STATEMENT_PATH = "/research/accessibility";

export const ACCESSIBILITY_TARGET_STANDARD = "WCAG 2.2 Level AA";

export const ACCESSIBILITY_KNOWN_LIMITATIONS: ReadonlyArray<{ id: string; summary: string; status: string }> = [
  {
    id: "manual-review",
    summary: "Automated checks run on every release candidate; the manual assistive-technology review of the full member journey is still being completed.",
    status: "In progress",
  },
  {
    id: "third-party-scheduling",
    summary: "Care scheduling is provided by a third-party system whose interface we do not control; its accessibility is documented by that vendor.",
    status: "Vendor-dependent",
  },
];

export default function AccessibilityStatement() {
  return (
    <>
      <SeoHead
        title="Accessibility statement, xenios research"
        description="How xenios research is built to be usable with keyboards, screen readers, zoom and reduced motion, what we test on every release, and how to report a barrier."
        path={ACCESSIBILITY_STATEMENT_PATH}
      />
      <ResearchPublicShell
        eyebrow="Accessibility"
        title="Accessibility statement"
        lead={`xenios research is designed to meet ${ACCESSIBILITY_TARGET_STANDARD}. This page explains what that means in practice, what we verify before each release, what we know is not finished, and how to tell us about a barrier.`}
      >
        <section aria-labelledby="ra-a11y-commitment" className="card mt-6">
          <h2 id="ra-a11y-commitment" className="body-m font-700">
            What we build for
          </h2>
          <ul className="body-s text-ink-2 mt-2 max-w-[60ch] list-disc pl-5 space-y-1">
            <li>Every action is reachable and operable with a keyboard alone, with a visible focus indicator.</li>
            <li>Each page has one main landmark, a single top-level heading, and labelled form controls.</li>
            <li>Interactive targets are at least 44 by 44 CSS pixels.</li>
            <li>Layouts reflow at 320 CSS pixels and at 200 percent zoom without horizontal scrolling.</li>
            <li>Animation and scripted scrolling respect the reduced-motion preference; forced-colors mode keeps focus and current-page indicators.</li>
            <li>Loading, empty, unavailable and error states are announced to assistive technology.</li>
          </ul>
        </section>

        <section aria-labelledby="ra-a11y-verification" className="card mt-6">
          <h2 id="ra-a11y-verification" className="body-m font-700">
            How we verify it
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
            Before a release candidate is approved we run an automated browser matrix across eight viewport widths and a
            200 percent zoom equivalent on every public route, checking overflow, target size, landmarks, duplicate
            identifiers, focus order and focus visibility, reduced-motion and forced-colors renders, and the raw document
            metadata a crawler sees. Automated output alone is not treated as a pass: a person reviews the findings and
            the captured screens before the release is signed off.
          </p>
        </section>

        <section aria-labelledby="ra-a11y-limits" className="card mt-6">
          <h2 id="ra-a11y-limits" className="body-m font-700">
            Known limitations
          </h2>
          <ul className="body-s text-ink-2 mt-2 max-w-[60ch] space-y-2" data-testid="list-a11y-limitations">
            {ACCESSIBILITY_KNOWN_LIMITATIONS.map((item) => (
              <li key={item.id}>
                <span className="font-700">{item.status}.</span> {item.summary}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ra-a11y-feedback" className="card mt-6">
          <h2 id="ra-a11y-feedback" className="body-m font-700">
            Report a barrier
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[60ch]">
            If any part of xenios research is difficult to use with your assistive technology, tell us which page and what
            happened. We answer accessibility reports through Research Support and treat a blocking barrier as a defect.
          </p>
          <div className="mt-4">
            <a href={`mailto:${RESEARCH_SUPPORT_EMAIL}?subject=Accessibility%20report`} className="btn btn-primary ra-documentation-link" data-testid="link-a11y-report">
              Email an accessibility report
            </a>
          </div>
          <p className="body-s text-ink-mute mt-4">
            <Link href={ACCESS_ROUTES.support} className="underline ra-documentation-link">
              Other ways to reach support
            </Link>
          </p>
        </section>
      </ResearchPublicShell>
    </>
  );
}
