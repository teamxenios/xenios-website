import { Switch, Route, Redirect, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Product from "@/pages/Product";
import CoachHowItWorks from "@/pages/HowItWorks";
import ForCoaches from "@/pages/ForCoaches";
import ForClients from "@/pages/ForClients";
import Storefront from "@/pages/Storefront";
import Network from "@/pages/Network";
import Ecosystem from "@/pages/Ecosystem";
import ForPractitioners from "@/pages/ForPractitioners";
import IcpPage from "@/pages/IcpPage";
import Manifesto from "@/pages/Manifesto";
import Careers, { CareersRole } from "@/pages/Careers";
import Waitlist from "@/pages/Waitlist";
import Contact from "@/pages/Contact";
import Security from "@/pages/Security";
import Compliance from "@/pages/Compliance";
import Investors from "@/pages/Investors";
import Press from "@/pages/Press";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Disclosures from "@/pages/Disclosures";
import EarlyInterest from "@/pages/EarlyInterest";
import Book from "@/pages/Book";
import Concepts from "@/pages/Concepts";
import MvpLab from "@/pages/MvpLab";
import ExternalRedirect from "@/components/ExternalRedirect";
import NotFound from "@/pages/not-found";
import WorkspaceHome from "@/clarity/WorkspaceHome";
import {
  AboutPage,
  ActivatePage,
  FaqPage,
  HowItWorksPage,
  IndividualsPage,
  PartnersPage,
  PracticeCarePage,
  PracticeReferralsPage,
  PracticesPage,
  PracticeWorkspacePage,
  ProductUnavailablePage,
  ProductsPage,
  QualityPage,
  ResearchOverviewPage,
  SignInPage,
  StatusPage,
  SuppliersPage,
  SupportPage,
} from "@/clarity/pages";

// The deployed Kairos MVP (synthetic only), served under the xenios domain at
// kairos.xeniostechnology.com (falls back to the Vercel URL until DNS propagates). /kairos sends
// here; /mvps is the launcher.
const KAIROS_APP_URL = "https://kairos.xeniostechnology.com";

// xenios research: the entire section is one lazy chunk so the main bundle does
// not grow. It carries no product data; the catalog comes from gated server APIs.
const ResearchSection = lazy(() => import("@/research/section"));
const RecommendationRecipient = lazy(() => import("@/research/recommendation/Recipient"));
// Admin dashboard: a large, rarely visited surface (waitlist/LOI/bookings/
// analytics/research tables). Its own lazy chunk keeps it out of the main
// public bundle.
const Admin = lazy(() => import("@/pages/Admin"));
// Research operations (Samuel admin presentation) — its own lazy chunk at
// /admin/research*. Presentation only; all authority is server-side.
const AdminResearchSection = lazy(() => import("@/research/adminx-section"));
const CareSection = lazy(() => import("@/care/section"));
const CareEligibility = lazy(() => import("@/care/EligibilityPendingPage"));
const CareConsent = lazy(() => import("@/care/CareConsentPendingPage"));
const CareAppointments = lazy(() => import("@/care/CareAppointmentsPage"));
const CarePrescriptions = lazy(() => import("@/care/CarePrescriptionsPage"));
const CarePharmacyOrders = lazy(() => import("@/care/CarePharmacyOrdersPage"));

function ResearchRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <ResearchSection />
    </Suspense>
  );
}

function AdminRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <Admin />
    </Suspense>
  );
}

function AdminResearchRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <AdminResearchSection />
    </Suspense>
  );
}

function CareRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CareSection />
    </Suspense>
  );
}

function CareEligibilityRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CareEligibility />
    </Suspense>
  );
}

function CareConsentRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CareConsent />
    </Suspense>
  );
}

function CareAppointmentRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CareAppointments />
    </Suspense>
  );
}

function CarePrescriptionRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CarePrescriptions />
    </Suspense>
  );
}

function CarePharmacyRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <CarePharmacyOrders />
    </Suspense>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    let frame = 0;
    const scrollForLocation = () => {
      window.cancelAnimationFrame(frame);
      const rawHash = window.location.hash.slice(1);
      if (!rawHash) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        return;
      }
      frame = window.requestAnimationFrame(() => {
        let targetId = rawHash;
        try { targetId = decodeURIComponent(rawHash); } catch { /* use the literal hash */ }
        const target = document.getElementById(targetId);
        if (!target) return;
        target.scrollIntoView({ block: "start" });
        const suppliedTabIndex = target.hasAttribute("tabindex");
        if (!suppliedTabIndex) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        if (!suppliedTabIndex) {
          target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
        }
      });
    };

    scrollForLocation();
    // Wouter dispatches pushState for client navigation, including same-page
    // fragment links whose pathname snapshot does not change.
    window.addEventListener("pushState", scrollForLocation);
    window.addEventListener("hashchange", scrollForLocation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pushState", scrollForLocation);
      window.removeEventListener("hashchange", scrollForLocation);
    };
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/individuals" component={IndividualsPage} />
      <Route path="/products/:slug" component={ProductUnavailablePage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/practices/referrals" component={PracticeReferralsPage} />
      <Route path="/practices/workspace" component={PracticeWorkspacePage} />
      <Route path="/practices/care" component={PracticeCarePage} />
      <Route path="/practices" component={PracticesPage} />
      <Route path="/partners/apply"><Redirect to="/partners#inquiry" /></Route>
      <Route path="/partners" component={PartnersPage} />
      <Route path="/suppliers" component={SuppliersPage} />
      <Route path="/quality" component={QualityPage} />
      <Route path="/faq" component={FaqPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/status" component={StatusPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/activate" component={ActivatePage} />
      <Route path="/workspace/how-it-works" component={CoachHowItWorks} />
      <Route path="/workspace" component={WorkspaceHome} />
      <Route path="/product" component={Product} />
      <Route path="/how-it-works" component={HowItWorksPage} />
      <Route path="/for-coaches" component={ForCoaches} />
      <Route path="/for-clients" component={ForClients} />
      <Route path="/storefront" component={Storefront} />
      <Route path="/network" component={Network} />
      <Route path="/ecosystem" component={Ecosystem} />
      <Route path="/for-practitioners" component={ForPractitioners} />
      <Route path="/for/:slug" component={IcpPage} />
      <Route path="/manifesto" component={Manifesto} />
      <Route path="/about" component={AboutPage} />
      <Route path="/careers/:slug" component={CareersRole} />
      <Route path="/careers" component={Careers} />
      <Route path="/waitlist" component={Waitlist} />
      <Route path="/contact" component={Contact} />
      <Route path="/security" component={Security} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/investors" component={Investors} />
      <Route path="/press" component={Press} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/disclosures" component={Disclosures} />
      <Route path="/early-interest" component={EarlyInterest} />
      <Route path="/book" component={Book} />
      <Route path="/concepts" component={Concepts} />
      <Route path="/admin" component={AdminRoutes} />
      {/* Research operations family (Samuel admin presentation, own chunk). */}
      <Route path="/admin/research" component={AdminResearchRoutes} />
      <Route path="/admin/research/*" component={AdminResearchRoutes} />
      <Route path="/health"><Redirect to="/" /></Route>
      <Route path="/r/:code">{({ code }) => <Suspense fallback={<div className="container-x" aria-busy="true" style={{ paddingTop: 96 }} />}><RecommendationRecipient code={code} /></Suspense>}</Route>
      {/* Public clarity entrypoints redirect legacy marketing URLs before the
          existing Research authority router handles its preserved subroutes. */}
      <Route path="/research/partners"><Redirect to="/partners" /></Route>
      <Route path="/research/affiliates"><Redirect to="/partners" /></Route>
      <Route path="/research/organizations"><Redirect to="/practices" /></Route>
      <Route path="/research/supplier-access"><Redirect to="/suppliers" /></Route>
      <Route path="/research/faq"><Redirect to="/faq" /></Route>
      <Route path="/research/quality"><Redirect to="/quality" /></Route>
      <Route path="/research/testing"><Redirect to="/quality#testing" /></Route>
      <Route path="/research/documents"><Redirect to="/quality#documents" /></Route>
      <Route path="/research/about"><Redirect to="/about" /></Route>
      <Route path="/research/how-it-works"><Redirect to="/how-it-works" /></Route>
      <Route path="/research/contact"><Redirect to="/support" /></Route>
      <Route path="/research/support"><Redirect to="/support" /></Route>
      <Route path="/research" component={ResearchOverviewPage} />
      <Route path="/research/*" component={ResearchRoutes} />
      <Route path="/care/eligibility" component={CareEligibilityRoutes} />
      <Route path="/care/consent" component={CareConsentRoutes} />
      <Route path="/care/appointments" component={CareAppointmentRoutes} />
      <Route path="/care/prescriptions" component={CarePrescriptionRoutes} />
      <Route path="/care/pharmacy" component={CarePharmacyRoutes} />
      <Route path="/care" component={CareRoutes} />
      <Route path="/care/*" component={CareRoutes} />
      {/* xenios MVP Lab + MVP routes */}
      <Route path="/mvps" component={MvpLab} />
      <Route path="/kairos">{() => <ExternalRedirect to={KAIROS_APP_URL} />}</Route>
      <Route path="/argos"><Redirect to="/mvps" /></Route>
      {/* Retired routes redirect to nearest v6 home */}
      <Route path="/telemedicine"><Redirect to="/product" /></Route>
      <Route path="/agents"><Redirect to="/product" /></Route>
      <Route path="/developers"><Redirect to="/ecosystem" /></Route>
      <Route path="/enterprise"><Redirect to="/practices" /></Route>
      <Route path="/ontology"><Redirect to="/product" /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ScrollToTop />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
