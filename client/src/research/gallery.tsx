import { lazy, Suspense, useContext, useMemo, type ComponentType } from "react";
import { useParams } from "wouter";
import { fixturesAllowed } from "./lib/fixtures";
import { ResearchLoadingState, ResearchEmptyState } from "./ui/kit";
import { ResearchContext, type ResearchContextValue } from "./core";

// DEVELOPMENT-ONLY visual gallery: renders member pages without RequireMember
// so the local screenshot workflow can capture them with fixture data. This
// is explicit fixture mode: in a production build fixturesAllowed() is a
// static false, the component renders nothing but an empty state, and
// devFixture data is null anyway (double protection, both test-pinned).

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
  guides: lazy(() => import("./pages/member/Guides")),
  orders: lazy(() => import("./pages/member/Orders")),
  subscriptions: lazy(() => import("./pages/member/SubscriptionsPage")),
  questions: lazy(() => import("./pages/member/Questions")),
  referrals: lazy(() => import("./pages/member/ReferralsUpgrade")),
};

export default function DevGallery() {
  const params = useParams<{ page: string }>();
  const real = useContext(ResearchContext);
  // A fixture ACTIVE member so member pages render their content states for
  // visual review. Dev builds only; the guard below and the static PROD
  // elimination in fixturesAllowed make this unreachable in production.
  const fixtureValue = useMemo<ResearchContextValue | null>(() => {
    if (!real || !fixturesAllowed()) return null;
    return {
      ...real,
      member: { firstName: "Jordan", status: "active", applicationStatus: "active" },
      memberToken: "dev-gallery-fixture-token",
      memberChecking: false,
    };
  }, [real]);

  if (!fixturesAllowed() || !fixtureValue) {
    return <ResearchEmptyState title="Not available." body="This development view does not exist in production." />;
  }
  const Page = PAGES[params.page ?? ""];
  if (!Page) {
    return <ResearchEmptyState title="Unknown gallery page." body={`Known pages: ${Object.keys(PAGES).join(", ")}`} />;
  }
  return (
    <ResearchContext.Provider value={fixtureValue}>
      <Suspense fallback={<ResearchLoadingState />}>
        <Page />
      </Suspense>
    </ResearchContext.Provider>
  );
}
