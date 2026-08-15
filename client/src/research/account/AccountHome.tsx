import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import type { AccountContextDto } from "@shared/research/account-identity";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { PageIntro } from "../components";
import { ACCOUNT_ROUTES, MEMBER_ROUTES } from "../lib/routes";
import { getAccountContext } from "./api";

export default function AccountHome() {
  const [, navigate] = useLocation();
  const [context, setContext] = useState<AccountContextDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    let alive = true;
    void getAccountContext().then((result) => {
      if (!alive) return;
      if (result.kind === "ok") setContext(result.data);
      else setError(result.message);
    });
    return () => { alive = false; };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const supabase = await getSupabaseBrowser();
      if (!supabase) {
        setError("Sign-out is not available right now.");
        return;
      }
      const result = await supabase.auth.signOut({ scope: "local" });
      if (result.error) {
        setError("Sign-out is not available right now.");
        return;
      }
      setContext(null);
      navigate(ACCOUNT_ROUTES.signIn);
    } catch {
      setError("Sign-out is not available right now.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <PageIntro eyebrow="Accounts" title="Your Xenios accounts." lead="Personal and organization access use one verified Supabase sign-in." />
      <section className="container-x pb-20">
        {!context && !error && <p className="body-s text-ink-mute" role="status">Loading account access…</p>}
        {error && <p className="body-s" role="alert" style={{ color: "var(--error)" }}>{error}</p>}
        {context && (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="body-s text-ink-mute">Signed in as {context.auth.email}</p>
              <button className="btn btn-ghost" type="button" onClick={() => void signOut()} disabled={signingOut}>
                {signingOut ? "Signing out" : "Sign out"}
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {context.personal && <Link className="card" href="/research/member"><h2 className="body-m font-700">Personal account</h2><p className="body-s text-ink-2 mt-2">Profile, security, orders, invoices, and tracking.</p></Link>}
              {context.organizations.map((organization) => (
                <Link key={organization.id} className="card" href={`/research/account/organizations/${organization.id}`}>
                  <h2 className="body-m font-700">{organization.displayName}</h2>
                  <p className="body-s text-ink-2 mt-2">{organization.roles.join(" · ")}</p>
                </Link>
              ))}
              <Link className="card" href="/research/account/claim-history"><h2 className="body-m font-700">Claim prior history</h2><p className="body-s text-ink-2 mt-2">Attach a verified customer reference and its existing orders.</p></Link>
            </div>
            {context.personal && (
              <section aria-labelledby="buyer-commerce">
                <h2 id="buyer-commerce" className="body-l font-700">Buyer commerce</h2>
                <p className="body-s text-ink-2 mt-1">Your existing member catalog, cart, requests, and canonical order history.</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <Link className="card" href={MEMBER_ROUTES.fullCatalog}><h3 className="body-m font-700">Full catalog</h3><p className="body-s text-ink-2 mt-2">See the canonical member-safe master catalog and authoritative pricing.</p></Link>
                  <Link className="card" href={MEMBER_ROUTES.cart}><h3 className="body-m font-700">Cart</h3><p className="body-s text-ink-2 mt-2">Review quantities and directly purchasable items.</p></Link>
                  <Link className="card" href={MEMBER_ROUTES.productRequests}><h3 className="body-m font-700">Product requests</h3><p className="body-s text-ink-2 mt-2">Request other available research products.</p></Link>
                  <Link className="card" href={MEMBER_ROUTES.orders}><h3 className="body-m font-700">Order history</h3><p className="body-s text-ink-2 mt-2">Orders, payment status, shipment status, and tracking.</p></Link>
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </>
  );
}
