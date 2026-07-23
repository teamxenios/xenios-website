import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { Link, Redirect, Route, Switch } from "wouter";
import { ResearchProvider } from "./core";
import ResearchLayout from "./layout";
import Gateway from "./pages/Gateway";
import Apply from "./pages/Apply";
import ApplyStatus from "./pages/ApplyStatus";
import SignIn from "./pages/SignIn";
import ResetPassword from "./pages/ResetPassword";
import PolicyPage from "./pages/PolicyPage";
import { RequireMember } from "./pages/MemberArea";
import { ResearchLoadingState } from "./ui/kit";

// xenios research: the section router (Supreme build). Canonical route flow:
//   access family  -> gateway, apply, status, sign-in, reset, activate,
//                     support, privacy, terms, policies
//   member family  -> the full private member website under /research/member
//   partner family -> the Research Rep / affiliate portal under
//                     /research/partners (password-gated, own shell)
// The admin family mounts separately at /admin/research (App.tsx).
// Every deep page is code-split (React.lazy); legacy paths redirect to their
// canonical member equivalents. While gated, noindex client-side too.

// Access extras
const Support = lazy(() => import("./pages/Support"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const ActivationPage = lazy(() => import("./pages/ActivationPage"));
// The dynamic import itself sits behind the DEV flag, not just the route: a
// top-level lazy() emits the gallery chunk even when the route is compiled
// out, so the fixture code would still ship. With import.meta.env.DEV a
// static false in production, the whole branch is dead code and the chunk is
// never generated.
const DevGallery = import.meta.env.DEV ? lazy(() => import("./gallery")) : null;

// Member deep area
const MemberDashboard = lazy(() => import("./pages/member/Dashboard"));
const MembershipPage = lazy(() => import("./pages/member/MembershipPage"));
const SecurityPage = lazy(() => import("./pages/member/Security"));
const PrivacyControls = lazy(() => import("./pages/member/PrivacyControls"));
const MemberProfile = lazy(() => import("./pages/member/Profile"));
const MemberAssessment = lazy(() => import("./pages/member/Assessment"));
const BlueprintPage = lazy(() => import("./pages/member/Blueprint"));
const Xenios30Page = lazy(() => import("./pages/member/Xenios30"));
const Xenios90Page = lazy(() => import("./pages/member/Xenios90"));
const MemberDocuments = lazy(() => import("./pages/member/Documents"));
const MemberDocumentCenter = lazy(() => import("./pages/member/DocumentCenter"));
const MemberTracker = lazy(() => import("./pages/member/Tracker"));
const Goals = lazy(() => import("./pages/member/Goals"));
const GoalDetail = lazy(() => import("./pages/member/GoalDetail"));
const MemberProducts = lazy(() => import("./pages/member/Products"));
const MemberProductPage = lazy(() => import("./pages/member/ProductPage"));
const MemberGuides = lazy(() => import("./pages/member/Guides"));
const GuideReader = lazy(() => import("./pages/member/GuideReader"));
const MemberCart = lazy(() => import("./pages/member/Cart"));
const MemberCheckout = lazy(() => import("./pages/member/Checkout"));
const MemberOrders = lazy(() => import("./pages/member/Orders"));
const OrderDetail = lazy(() => import("./pages/member/OrderDetail"));
const SubscriptionsPage = lazy(() => import("./pages/member/SubscriptionsPage"));
const Questions = lazy(() => import("./pages/member/Questions"));
const ReferralsUpgrade = lazy(() => import("./pages/member/ReferralsUpgrade"));

// Partner portal
const PartnerLanding = lazy(() => import("./pages/partners/Landing"));
const PartnerApply = lazy(() => import("./pages/partners/Apply"));
const PartnerOnboarding = lazy(() => import("./pages/partners/Onboarding"));
const PartnerTraining = lazy(() => import("./pages/partners/Training"));
const PartnerDashboard = lazy(() => import("./pages/partners/Dashboard"));
const PartnerLinks = lazy(() => import("./pages/partners/Links"));
const PartnerCampaigns = lazy(() => import("./pages/partners/Campaigns"));
const PartnerEvents = lazy(() => import("./pages/partners/Events"));
const PartnerLeads = lazy(() => import("./pages/partners/Leads"));
const PartnerConversions = lazy(() => import("./pages/partners/Conversions"));
const PartnerCommissions = lazy(() => import("./pages/partners/Commissions"));
const PartnerPayouts = lazy(() => import("./pages/partners/Payouts"));
const PartnerOrganizations = lazy(() => import("./pages/partners/Organizations"));
const PartnerCompliance = lazy(() => import("./pages/partners/Compliance"));
const PartnerResources = lazy(() => import("./pages/partners/Resources"));
const PartnerSupport = lazy(() => import("./pages/partners/Support"));
const PartnerSecurity = lazy(() => import("./pages/partners/Security"));

function ResearchNotFound() {
  return (
    <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <p className="mono-cap text-ink-mute mb-5">Not found</p>
      <h1 className="display-s">That page is not part of the research section.</h1>
      <Link href="/research" className="btn btn-secondary mt-8">Back to research</Link>
    </section>
  );
}

function Member({ children }: { children: ReactNode }) {
  return <RequireMember>{children}</RequireMember>;
}

function L({ component: C, member = false, props }: { component: ComponentType<any>; member?: boolean; props?: Record<string, unknown> }) {
  const page = (
    <Suspense fallback={<ResearchLoadingState />}>
      <C {...(props ?? {})} />
    </Suspense>
  );
  return member ? <Member>{page}</Member> : page;
}

export default function ResearchSection() {
  useEffect(() => {
    let el = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !el;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("content");
    el.setAttribute("content", "noindex, nofollow");
    return () => {
      if (created) el!.remove();
      else if (prev) el!.setAttribute("content", prev);
    };
  }, []);

  return (
    <ResearchProvider>
      <ResearchLayout>
        <Switch>
          {/* The gateway */}
          <Route path="/research" component={Gateway} />

          {/* Access family */}
          <Route path="/research/apply" component={Apply} />
          <Route path="/research/apply/review" component={Apply} />
          <Route path="/research/apply/success" component={Apply} />
          <Route path="/research/apply/status" component={ApplyStatus} />
          <Route path="/research/application/status" component={ApplyStatus} />
          <Route path="/research/application-status" component={ApplyStatus} />
          <Route path="/research/sign-in" component={SignIn} />
          <Route path="/research/reset-password" component={ResetPassword} />
          <Route path="/research/activate">{() => <L component={ActivationPage} />}</Route>
          <Route path="/research/member/welcome"><Redirect to="/research/activate" /></Route>
          <Route path="/research/support">{() => <L component={Support} />}</Route>
          <Route path="/research/privacy">{() => <L component={LegalPage} props={{ kind: "privacy" }} />}</Route>
          <Route path="/research/terms">{() => <L component={LegalPage} props={{ kind: "terms" }} />}</Route>
          <Route path="/research/policies/:policy" component={PolicyPage} />

          {/* Development-only visual gallery (fixture mode). The route is
              compiled out of production entirely: import.meta.env.DEV is a
              static false there, so the bundler drops both the route and the
              gallery chunk rather than shipping inert fixture code. */}
          {DevGallery && (
            <Route path="/research/__gallery/:page">{() => <L component={DevGallery} />}</Route>
          )}


          {/* The private member website */}
          <Route path="/research/member">{() => <L member component={MemberDashboard} />}</Route>
          <Route path="/research/member/membership">{() => <L member component={MembershipPage} />}</Route>
          <Route path="/research/member/security">{() => <L member component={SecurityPage} />}</Route>
          <Route path="/research/member/privacy">{() => <L member component={PrivacyControls} />}</Route>
          <Route path="/research/member/profile">{() => <L member component={MemberProfile} />}</Route>
          <Route path="/research/member/assessment">{() => <L member component={MemberAssessment} />}</Route>
          <Route path="/research/member/blueprint">{() => <L member component={BlueprintPage} />}</Route>
          <Route path="/research/member/xenios-30">{() => <L member component={Xenios30Page} />}</Route>
          <Route path="/research/member/xenios-90">{() => <L member component={Xenios90Page} />}</Route>
          <Route path="/research/member/documents">{() => <L member component={MemberDocuments} />}</Route>
          <Route path="/research/member/documents-center">{() => <L member component={MemberDocumentCenter} />}</Route>
          <Route path="/research/member/tracker">{() => <L member component={MemberTracker} />}</Route>
          <Route path="/research/member/goals">{() => <L member component={Goals} />}</Route>
          <Route path="/research/member/goals/:slug">{() => <L member component={GoalDetail} />}</Route>
          <Route path="/research/member/products">{() => <L member component={MemberProducts} />}</Route>
          <Route path="/research/member/products/:slug">{() => <L member component={MemberProductPage} />}</Route>
          <Route path="/research/member/guides">{() => <L member component={MemberGuides} />}</Route>
          <Route path="/research/member/guides/:slug">{() => <L member component={GuideReader} />}</Route>
          <Route path="/research/member/cart">{() => <L member component={MemberCart} />}</Route>
          <Route path="/research/member/checkout">{() => <L member component={MemberCheckout} />}</Route>
          <Route path="/research/member/orders">{() => <L member component={MemberOrders} />}</Route>
          <Route path="/research/member/orders/:id">{() => <L member component={OrderDetail} />}</Route>
          <Route path="/research/member/subscriptions">{() => <L member component={SubscriptionsPage} />}</Route>
          <Route path="/research/member/questions">{() => <L member component={Questions} />}</Route>
          <Route path="/research/member/referrals">{() => <L member component={ReferralsUpgrade} />}</Route>

          {/* The partner portal (password-gated; its own shell) */}
          <Route path="/research/partners">{() => <L component={PartnerLanding} />}</Route>
          <Route path="/research/partners/apply">{() => <L component={PartnerApply} />}</Route>
          <Route path="/research/partners/onboarding">{() => <L component={PartnerOnboarding} />}</Route>
          <Route path="/research/partners/training">{() => <L component={PartnerTraining} />}</Route>
          <Route path="/research/partners/dashboard">{() => <L component={PartnerDashboard} />}</Route>
          <Route path="/research/partners/links">{() => <L component={PartnerLinks} />}</Route>
          <Route path="/research/partners/campaigns">{() => <L component={PartnerCampaigns} />}</Route>
          <Route path="/research/partners/events">{() => <L component={PartnerEvents} />}</Route>
          <Route path="/research/partners/leads">{() => <L component={PartnerLeads} />}</Route>
          <Route path="/research/partners/conversions">{() => <L component={PartnerConversions} />}</Route>
          <Route path="/research/partners/commissions">{() => <L component={PartnerCommissions} />}</Route>
          <Route path="/research/partners/payouts">{() => <L component={PartnerPayouts} />}</Route>
          <Route path="/research/partners/organizations">{() => <L component={PartnerOrganizations} />}</Route>
          <Route path="/research/partners/compliance">{() => <L component={PartnerCompliance} />}</Route>
          <Route path="/research/partners/resources">{() => <L component={PartnerResources} />}</Route>
          <Route path="/research/partners/support">{() => <L component={PartnerSupport} />}</Route>
          <Route path="/research/partners/security">{() => <L component={PartnerSecurity} />}</Route>

          {/* Legacy paths redirect to their canonical member equivalents */}
          <Route path="/research/products"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/products/peptides"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/products/supplements"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/products/quantum"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/products/:slug">
            {(params) => <Redirect to={`/research/member/products/${params.slug}`} />}
          </Route>
          <Route path="/research/product/:slug">
            {(params) => <Redirect to={`/research/member/products/${params.slug}`} />}
          </Route>
          <Route path="/research/guides"><Redirect to="/research/member/guides" /></Route>
          <Route path="/research/orders"><Redirect to="/research/member/orders" /></Route>
          <Route path="/research/subscriptions"><Redirect to="/research/member/subscriptions" /></Route>
          <Route path="/research/referrals"><Redirect to="/research/member/referrals" /></Route>
          <Route path="/research/profile"><Redirect to="/research/member/profile" /></Route>
          <Route path="/research/systems"><Redirect to="/research/member/goals" /></Route>
          <Route path="/research/peptides"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/supplements"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/quantum"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/shop"><Redirect to="/research/member/products" /></Route>
          <Route path="/research/build-a-system"><Redirect to="/research/member/goals" /></Route>
          <Route path="/research/learn"><Redirect to="/research/member/guides" /></Route>
          <Route path="/research/cart"><Redirect to="/research/member/cart" /></Route>
          <Route path="/research/membership"><Redirect to="/research/member/membership" /></Route>
          <Route path="/research/framework"><Redirect to="/research/member/blueprint" /></Route>
          <Route path="/research/faq"><Redirect to="/research/support" /></Route>
          <Route path="/research/quality"><Redirect to="/research/member/guides" /></Route>
          <Route path="/research/programs"><Redirect to="/research/member/goals" /></Route>
          <Route path="/research/professionals"><Redirect to="/research/partners" /></Route>
          <Route path="/research/access"><Redirect to="/research/partners" /></Route>
          <Route path="/research/wholesale"><Redirect to="/research/partners" /></Route>
          <Route path="/research/access-gate"><Redirect to="/research" /></Route>

          <Route component={ResearchNotFound} />
        </Switch>
      </ResearchLayout>
    </ResearchProvider>
  );
}
