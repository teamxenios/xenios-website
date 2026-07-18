import { useEffect } from "react";
import { Link, Route, Switch } from "wouter";
import { ResearchProvider } from "./core";
import ResearchLayout from "./layout";
import Overview from "./pages/Overview";
import Membership from "./pages/Membership";
import Framework from "./pages/Framework";
import Faq from "./pages/Faq";
import Apply from "./pages/Apply";
import ApplyStatus from "./pages/ApplyStatus";
import MemberWelcome from "./pages/MemberWelcome";
import Peptides from "./pages/Peptides";
import Quantum from "./pages/Quantum";
import Supplements from "./pages/Supplements";
import Programs from "./pages/Programs";
import Shop from "./pages/Shop";
import BuildASystem from "./pages/BuildASystem";
import Quality from "./pages/Quality";
import Learn from "./pages/Learn";
import Access from "./pages/Access";
import Wholesale from "./pages/Wholesale";
import CartPage from "./pages/CartPage";
import ProductDetail from "./pages/ProductDetail";
import PolicyPage from "./pages/PolicyPage";

// xenios research: the whole section is one lazy-loaded chunk mounted by the
// main router at /research*. While gated, mark it noindex client-side too (the
// server also sends X-Robots-Tag).

function ResearchNotFound() {
  return (
    <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <p className="mono-cap text-ink-mute mb-5">Not found</p>
      <h1 className="display-s">That page is not part of the research section.</h1>
      <Link href="/research" className="btn btn-secondary mt-8">Back to research</Link>
    </section>
  );
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
          <Route path="/research" component={Overview} />
          <Route path="/research/membership" component={Membership} />
          <Route path="/research/framework" component={Framework} />
          <Route path="/research/faq" component={Faq} />
          <Route path="/research/apply" component={Apply} />
          <Route path="/research/apply/review" component={Apply} />
          <Route path="/research/apply/success" component={Apply} />
          <Route path="/research/apply/status" component={ApplyStatus} />
          <Route path="/research/member/welcome" component={MemberWelcome} />
          <Route path="/research/professionals" component={Access} />
          <Route path="/research/peptides" component={Peptides} />
          <Route path="/research/quantum" component={Quantum} />
          <Route path="/research/supplements" component={Supplements} />
          <Route path="/research/programs" component={Programs} />
          <Route path="/research/shop" component={Shop} />
          <Route path="/research/build-a-system" component={BuildASystem} />
          <Route path="/research/quality" component={Quality} />
          <Route path="/research/learn" component={Learn} />
          <Route path="/research/access" component={Access} />
          <Route path="/research/access-gate" component={Overview} />
          <Route path="/research/wholesale" component={Wholesale} />
          <Route path="/research/cart" component={CartPage} />
          <Route path="/research/products/:slug" component={ProductDetail} />
          <Route path="/research/product/:slug" component={ProductDetail} />
          <Route path="/research/policies/:policy" component={PolicyPage} />
          <Route component={ResearchNotFound} />
        </Switch>
      </ResearchLayout>
    </ResearchProvider>
  );
}
