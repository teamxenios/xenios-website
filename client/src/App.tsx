import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Product from "@/pages/Product";
import Agents from "@/pages/Agents";
import Telemedicine from "@/pages/Telemedicine";
import Storefront from "@/pages/Storefront";
import Network from "@/pages/Network";
import Ontology from "@/pages/Ontology";
import Developers from "@/pages/Developers";
import Enterprise from "@/pages/Enterprise";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/product" component={Product} />
      <Route path="/agents" component={Agents} />
      <Route path="/telemedicine" component={Telemedicine} />
      <Route path="/storefront" component={Storefront} />
      <Route path="/network" component={Network} />
      <Route path="/ontology" component={Ontology} />
      <Route path="/developers" component={Developers} />
      <Route path="/enterprise" component={Enterprise} />
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
      {/* Retired v2 routes — redirect to nearest v5 home */}
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
