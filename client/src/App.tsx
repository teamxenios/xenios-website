import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Manifesto from "@/pages/Manifesto";
import Product from "@/pages/Product";
import Contact from "@/pages/Contact";
import Investors from "@/pages/Investors";
import Partners from "@/pages/Partners";
import Waitlist from "@/pages/Waitlist";
import About from "@/pages/About";
import Careers from "@/pages/Careers";
import FAQ from "@/pages/FAQ";
import Security from "@/pages/Security";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/manifesto" component={Manifesto} />
      <Route path="/product" component={Product} />
      <Route path="/contact" component={Contact} />
      <Route path="/investors" component={Investors} />
      <Route path="/partners" component={Partners} />
      <Route path="/waitlist" component={Waitlist} />
      <Route path="/about" component={About} />
      <Route path="/careers" component={Careers} />
      <Route path="/faq" component={FAQ} />
      <Route path="/security" component={Security} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
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
