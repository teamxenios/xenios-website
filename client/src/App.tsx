import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Product from "@/pages/Product";
import HowItWorks from "@/pages/HowItWorks";
import ForCoaches from "@/pages/ForCoaches";
import ForClients from "@/pages/ForClients";
import Telemedicine from "@/pages/Telemedicine";
import Storefront from "@/pages/Storefront";
import Network from "@/pages/Network";
import Ecosystem from "@/pages/Ecosystem";
import ForPractitioners from "@/pages/ForPractitioners";
import IcpPage from "@/pages/IcpPage";
import Manifesto from "@/pages/Manifesto";
import About from "@/pages/About";
import Careers from "@/pages/Careers";
import Waitlist from "@/pages/Waitlist";
import Contact from "@/pages/Contact";
import Security from "@/pages/Security";
import Compliance from "@/pages/Compliance";
import Investors from "@/pages/Investors";
import Press from "@/pages/Press";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import NotFound from "@/pages/not-found";

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
      <Route path="/telemedicine" component={Telemedicine} />
      <Route path="/storefront" component={Storefront} />
      <Route path="/network" component={Network} />
      <Route path="/ecosystem" component={Ecosystem} />
      <Route path="/for-practitioners" component={ForPractitioners} />
      <Route path="/for/:slug" component={IcpPage} />
      <Route path="/manifesto" component={Manifesto} />
      <Route path="/about" component={About} />
      <Route path="/careers" component={Careers} />
      <Route path="/waitlist" component={Waitlist} />
      <Route path="/contact" component={Contact} />
      <Route path="/security" component={Security} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/investors" component={Investors} />
      <Route path="/press" component={Press} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      {/* Retired routes redirect to nearest v6 home */}
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
