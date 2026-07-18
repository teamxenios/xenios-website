import { Switch, Route, Redirect, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Product from "@/pages/Product";
import HowItWorks from "@/pages/HowItWorks";
import ForCoaches from "@/pages/ForCoaches";
import ForClients from "@/pages/ForClients";
import Storefront from "@/pages/Storefront";
import Network from "@/pages/Network";
import Ecosystem from "@/pages/Ecosystem";
import ForPractitioners from "@/pages/ForPractitioners";
import IcpPage from "@/pages/IcpPage";
import Manifesto from "@/pages/Manifesto";
import About from "@/pages/About";
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
import Admin from "@/pages/Admin";
import MvpLab from "@/pages/MvpLab";
import ExternalRedirect from "@/components/ExternalRedirect";
import NotFound from "@/pages/not-found";

// The deployed Kairos MVP (synthetic only), served under the xenios domain at
// kairos.xeniostechnology.com (falls back to the Vercel URL until DNS propagates). /kairos sends
// here; /mvps is the launcher.
const KAIROS_APP_URL = "https://kairos.xeniostechnology.com";

// xenios research: the entire section is one lazy chunk so the main bundle does
// not grow. It carries no product data; the catalog comes from gated server APIs.
const ResearchSection = lazy(() => import("@/research/section"));

function ResearchRoutes() {
  return (
    <Suspense fallback={<div className="container-x" style={{ paddingTop: 96 }} aria-busy="true" />}>
      <ResearchSection />
    </Suspense>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/product" component={Product} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/for-coaches" component={ForCoaches} />
      <Route path="/for-clients" component={ForClients} />
      <Route path="/storefront" component={Storefront} />
      <Route path="/network" component={Network} />
      <Route path="/ecosystem" component={Ecosystem} />
      <Route path="/for-practitioners" component={ForPractitioners} />
      <Route path="/for/:slug" component={IcpPage} />
      <Route path="/manifesto" component={Manifesto} />
      <Route path="/about" component={About} />
      <Route path="/careers/innovative-product-builder"><Redirect to="/careers/founding-senior-ai-software-engineer" /></Route>
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
      <Route path="/admin" component={Admin} />
      {/* xenios research (password-gated section, own chunk). The bare path and
          the multi-segment wildcard both mount the section's own router. */}
      <Route path="/research" component={ResearchRoutes} />
      <Route path="/research/*" component={ResearchRoutes} />
      {/* xenios MVP Lab + MVP routes */}
      <Route path="/mvps" component={MvpLab} />
      <Route path="/kairos">{() => <ExternalRedirect to={KAIROS_APP_URL} />}</Route>
      <Route path="/argos"><Redirect to="/mvps" /></Route>
      {/* Retired routes redirect to nearest v6 home */}
      <Route path="/telemedicine"><Redirect to="/product" /></Route>
      <Route path="/agents"><Redirect to="/product" /></Route>
      <Route path="/developers"><Redirect to="/ecosystem" /></Route>
      <Route path="/enterprise"><Redirect to="/contact" /></Route>
      <Route path="/ontology"><Redirect to="/product" /></Route>
      <Route path="/partners"><Redirect to="/ecosystem" /></Route>
      <Route path="/faq"><Redirect to="/product" /></Route>
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
