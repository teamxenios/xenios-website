import { lazy, Suspense, useContext, useEffect, useMemo, useRef, type ComponentType } from "react";
import { useParams } from "wouter";
import { fixturesAllowed } from "./lib/fixtures";
import { ResearchLoadingState, ResearchEmptyState } from "./ui/kit";
import { ResearchContext, type ResearchContextValue } from "./core";

// DEVELOPMENT-ONLY visual gallery: renders member pages without RequireMember
// so the local screenshot workflow can capture them with fixture data. This
// is explicit fixture mode: in a production build fixturesAllowed() is a
// static false, the component renders nothing but an empty state, and
// devFixture data is null anyway (double protection, both test-pinned).

const ActivationPage = lazy(() => import("./pages/ActivationPage"));

const PAGES: Record<string, ComponentType<any>> = {
  dashboard: lazy(() => import("./pages/member/Dashboard")),
  membership: lazy(() => import("./pages/member/MembershipPage")),
  security: lazy(() => import("./pages/member/Security")),
  privacy: lazy(() => import("./pages/member/PrivacyControls")),
  profile: lazy(() => import("./pages/member/Profile")),
  assessment: lazy(() => import("./pages/member/Assessment")),
  blueprint: lazy(() => import("./pages/member/Blueprint")),
  "xenios-30": lazy(() => import("./pages/member/Xenios30")),
  "xenios-90": lazy(() => import("./pages/member/Xenios90")),
  documents: lazy(() => import("./pages/member/Documents")),
  tracker: lazy(() => import("./pages/member/Tracker")),
  goals: lazy(() => import("./pages/member/Goals")),
  products: lazy(() => import("./pages/member/Products")),
  cart: lazy(() => import("./pages/member/Cart")),
  checkout: lazy(() => import("./pages/member/Checkout")),
  guides: lazy(() => import("./pages/member/Guides")),
  orders: lazy(() => import("./pages/member/Orders")),
  subscriptions: lazy(() => import("./pages/member/SubscriptionsPage")),
  questions: lazy(() => import("./pages/member/Questions")),
  referrals: lazy(() => import("./pages/member/ReferralsUpgrade")),
};

function fixtureJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Development-only browser-review harness for the activation journey. It uses
 * the same page and adapters as production while supplying deterministic,
 * non-production wire responses. The entire gallery route is tree-shaken from
 * production by section.tsx and fixturesAllowed() fails closed there.
 */
function ActivationGallery() {
  const originalFetch = useRef<typeof window.fetch | null>(null);
  if (originalFetch.current === null) {
    originalFetch.current = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const reviewStep = new URL(window.location.href).searchParams.get("step") ?? "payment";
      const steps = [
        "application",
        "claim",
        "email",
        "consents",
        "identity",
        "agreements",
        "obligation",
        "payment",
        "verification",
        "active",
      ].map((step) => ({
        step,
        state:
          step === reviewStep
            ? "action_required"
            : ["application", "claim", "email"].includes(step) ||
                (reviewStep === "payment" && ["consents", "identity", "agreements", "obligation"].includes(step))
              ? "complete"
              : "pending",
        detail: step === reviewStep ? "Continue from this saved step." : null,
      }));
      if (method === "GET" && url === "/api/research/activation/status") {
        return fixtureJson({
          ok: true,
          steps,
          currentStep: reviewStep,
          active: false,
          membershipStatus: "pending_activation",
          activatedAt: null,
          renewalDate: null,
          embeddedEsignEnabled: true,
          submissionContract:
            "Submitting this report does not activate or extend your membership. Xenios verifies every payment by hand before your membership changes.",
        });
      }
      if (method === "GET" && url === "/api/research/activation/identity/status") {
        return fixtureJson({ ok: true, case: null, guidance: ["Upload only the requested identity document."] });
      }
      if (method === "GET" && url === "/api/research/activation/agreements") {
        return fixtureJson({
          ok: true,
          agreements: [
            {
              category: "electronic_record_consent",
              title: "Electronic Records and Signatures Consent",
              documentVersionId: "gallery-consent-v1",
              semver: "1.0.0",
              requirement: "required",
              activationStep: 1,
              requiresSeparateAcknowledgment: false,
              jurisdiction: "US-TX",
              effectiveDate: "2026-07-25",
              content:
                "This deterministic development-only text stands in for the full published agreement during responsive visual review.",
              contentHash: "0123456789abcdef",
              signed: false,
              signedCurrentVersion: false,
            },
            {
              category: "founding_membership_agreement",
              title: "Founding Membership Agreement",
              documentVersionId: "gallery-membership-v1",
              semver: "1.0.0",
              requirement: "required",
              activationStep: 2,
              requiresSeparateAcknowledgment: false,
              jurisdiction: "US-TX",
              effectiveDate: "2026-07-25",
              content:
                "This deterministic development-only text stands in for the required membership agreement during responsive visual review.",
              contentHash: "abcdef0123456789",
              signed: false,
              signedCurrentVersion: false,
            },
            {
              category: "referral_store_credit_terms",
              title: "Optional Referral Terms",
              documentVersionId: "gallery-optional-v1",
              semver: "1.0.0",
              requirement: "optional",
              activationStep: 16,
              requiresSeparateAcknowledgment: false,
              jurisdiction: "US-TX",
              effectiveDate: "2026-07-25",
              content: "Optional development-only text.",
              contentHash: "fedcba9876543210",
              signed: false,
              signedCurrentVersion: false,
            },
          ],
          satisfied: false,
          blocking: [],
          formState: {
            affirmativeConsent: false,
            fullDocumentShown: false,
            separateAcknowledgment: false,
            typedLegalName: "",
          },
        });
      }
      if (method === "GET" && url === "/api/research/activation/payment/obligation") {
        return fixtureJson({
          ok: true,
          obligation: {
            xeniosRef: "XRM-GALLERY1",
            type: "activation_50",
            status: reviewStep === "verification" ? "submitted" : "due",
            expectedAmountCents: 5000,
            currency: "USD",
            description:
              "Founding membership activation, $50. Includes your first 30 calendar days of membership.",
            dueAt: "2026-08-05T00:00:00.000Z",
            methodId: "gallery-method",
            methodLabel: "Manual payment",
            submittedAt: reviewStep === "verification" ? "2026-07-25T20:00:00.000Z" : null,
            receiptRef: null,
          },
          submissionContract:
            "Submitting this report does not activate or extend your membership. Xenios verifies every payment by hand before your membership changes.",
        });
      }
      if (method === "GET" && url === "/api/research/activation/payment/methods") {
        return fixtureJson({
          ok: true,
          methods: [
            {
              methodId: "gallery-method",
              memberFacingName: "Manual payment",
              category: "manual_external_payment",
              currency: "USD",
              activationEligible: true,
              renewalEligible: true,
              minAmountCents: null,
              maxAmountCents: null,
              settlementTime: "same day",
              receivingInstructionsMasked: "••••11",
              mobileInstructions: "Open your payment app and follow the authenticated account instructions.",
              desktopInstructions: null,
              memoInstructions: "Include your XRM reference in the payment memo.",
              deepLinkRef: null,
              qrAssetRef: null,
              supportContactRef: null,
              memoReference: "XRM-GALLERY1",
            },
          ],
          memoReference: "XRM-GALLERY1",
          submissionContract:
            "Submitting this report does not activate or extend your membership. Xenios verifies every payment by hand before your membership changes.",
        });
      }
      return originalFetch.current!(input, init);
    };
  }
  useEffect(
    () => () => {
      if (originalFetch.current) window.fetch = originalFetch.current;
    },
    [],
  );
  return <ActivationPage />;
}

export default function DevGallery() {
  const params = useParams<{ page: string }>();
  const real = useContext(ResearchContext);
  // A fixture ACTIVE member so member pages render their content states for
  // visual review. Dev builds only; the guard below and the static PROD
  // elimination in fixturesAllowed make this unreachable in production.
  const fixtureValue = useMemo<ResearchContextValue | null>(() => {
    if (!real || !fixturesAllowed()) return null;
    const activation = params.page === "activation";
    return {
      ...real,
      member: activation
        ? { firstName: "Jordan", status: "pending_activation", applicationStatus: "approved" }
        : { firstName: "Jordan", status: "active", applicationStatus: "active" },
      memberToken: "dev-gallery-fixture-token",
      memberChecking: false,
    };
  }, [params.page, real]);

  if (!fixturesAllowed() || !fixtureValue) {
    return <ResearchEmptyState title="Not available." body="This development view does not exist in production." />;
  }
  const activation = params.page === "activation";
  const Page = PAGES[params.page ?? ""];
  if (!activation && !Page) {
    return <ResearchEmptyState title="Unknown gallery page." body={`Known pages: ${Object.keys(PAGES).join(", ")}`} />;
  }
  return (
    <ResearchContext.Provider value={fixtureValue}>
      <Suspense fallback={<ResearchLoadingState />}>
        {activation ? <ActivationGallery /> : <Page />}
      </Suspense>
    </ResearchContext.Provider>
  );
}
