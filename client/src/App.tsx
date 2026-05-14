import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Product from "@/pages/Product";
import ForPractitioners from "@/pages/ForPractitioners";
import Ecosystem from "@/pages/Ecosystem";
import Network from "@/pages/Network";
import About from "@/pages/About";
import Careers from "@/pages/Careers";
import Waitlist from "@/pages/Waitlist";
import Contact from "@/pages/Contact";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/product" component={Product} />
      <Route path="/for-practitioners" component={ForPractitioners} />
      <Route path="/ecosystem" component={Ecosystem} />
      <Route path="/network" component={Network} />
      <Route path="/about" component={About} />
      <Route path="/careers" component={Careers} />
      <Route path="/waitlist" component={Waitlist} />
      <Route path="/contact" component={Contact} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      {/* Retired v2 routes — redirect to nearest v3 home */}
      <Route path="/manifesto"><Redirect to="/about" /></Route>
      <Route path="/investors"><Redirect to="/contact" /></Route>
      <Route path="/partners"><Redirect to="/ecosystem" /></Route>
      <Route path="/faq"><Redirect to="/product" /></Route>
      <Route path="/security"><Redirect to="/privacy" /></Route>
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
