import { useEffect } from "react";
import { Link, Redirect, Route, Switch } from "wouter";
import { ResearchProvider } from "./core";
import ResearchLayout from "./layout";
import Gateway from "./pages/Gateway";
import Membership from "./pages/Membership";
import Framework from "./pages/Framework";
import Faq from "./pages/Faq";
import Apply from "./pages/Apply";
import ApplyStatus from "./pages/ApplyStatus";
import MemberWelcome from "./pages/MemberWelcome";
import SignIn from "./pages/SignIn";
import ResetPassword from "./pages/ResetPassword";
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
import { MemberHome, ProfilePage, ReferralsPage, RequireMember, Subscriptions } from "./pages/MemberArea";

// xenios research: the whole section is one lazy-loaded chunk mounted by the
// main router at /research*. Canonical route flow:
//   /research                      the minimal private gateway
//   /research/apply                membership application
//   /research/sign-in              member login
//   /research/application/status   applicant status (alias of /apply/status)
//   /research/activate             approved-member activation only
//   /research/member ...           the full private member website
// Everything content-bearing sits behind RequireMember (presentation) AND
// member-authed APIs (authorization). While gated, noindex client-side too.

function ResearchNotFound() {
  return (
    <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <p className="mono-cap text-ink-mute mb-5">Not found</p>
      <h1 className="display-s">That page is not part of the research section.</h1>
      <Link href="/research" className="btn btn-secondary mt-8">Back to research</Link>
    </section>
  );
}

function Member({ children }: { children: React.ReactNode }) {
  return <RequireMember>{children}</RequireMember>;
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

          {/* Pre-member flows: application, status, login, activation, policies */}
          <Route path="/research/apply" component={Apply} />
          <Route path="/research/apply/review" component={Apply} />
          <Route path="/research/apply/success" component={Apply} />
          <Route path="/research/apply/status" component={ApplyStatus} />
          <Route path="/research/application/status" component={ApplyStatus} />
          <Route path="/research/sign-in" component={SignIn} />
          <Route path="/research/reset-password" component={ResetPassword} />
          <Route path="/research/activate" component={MemberWelcome} />
          <Route path="/research/member/welcome"><Redirect to="/research/activate" /></Route>
          <Route path="/research/policies/:policy" component={PolicyPage} />

          {/* The private member website */}
          <Route path="/research/member"><Member><MemberHome /></Member></Route>
          <Route path="/research/products"><Member><Shop /></Member></Route>
          <Route path="/research/products/peptides"><Member><Peptides /></Member></Route>
          <Route path="/research/products/supplements"><Member><Supplements /></Member></Route>
          <Route path="/research/products/quantum"><Member><Quantum /></Member></Route>
          <Route path="/research/products/:slug"><Member><ProductDetail /></Member></Route>
          <Route path="/research/product/:slug"><Member><ProductDetail /></Member></Route>
          <Route path="/research/systems"><Member><BuildASystem /></Member></Route>
          <Route path="/research/guides"><Member><Learn /></Member></Route>
          <Route path="/research/orders"><Member><CartPage /></Member></Route>
          <Route path="/research/subscriptions"><Member><Subscriptions /></Member></Route>
          <Route path="/research/referrals"><Member><ReferralsPage /></Member></Route>
          <Route path="/research/profile"><Member><ProfilePage /></Member></Route>

          {/* Legacy member-content paths: canonical redirects or member-gated */}
          <Route path="/research/peptides"><Redirect to="/research/products/peptides" /></Route>
          <Route path="/research/supplements"><Redirect to="/research/products/supplements" /></Route>
          <Route path="/research/quantum"><Redirect to="/research/products/quantum" /></Route>
          <Route path="/research/shop"><Redirect to="/research/products" /></Route>
          <Route path="/research/build-a-system"><Redirect to="/research/systems" /></Route>
          <Route path="/research/learn"><Redirect to="/research/guides" /></Route>
          <Route path="/research/cart"><Redirect to="/research/orders" /></Route>
          <Route path="/research/membership"><Member><Membership /></Member></Route>
          <Route path="/research/framework"><Member><Framework /></Member></Route>
          <Route path="/research/faq"><Member><Faq /></Member></Route>
          <Route path="/research/programs"><Member><Programs /></Member></Route>
          <Route path="/research/quality"><Member><Quality /></Member></Route>
          <Route path="/research/professionals"><Member><Access /></Member></Route>
          <Route path="/research/access"><Member><Access /></Member></Route>
          <Route path="/research/wholesale"><Member><Wholesale /></Member></Route>
          <Route path="/research/access-gate"><Redirect to="/research" /></Route>

          <Route component={ResearchNotFound} />
        </Switch>
      </ResearchLayout>
    </ResearchProvider>
  );
}
