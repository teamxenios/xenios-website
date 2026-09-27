import { Link, useSearch } from "wouter";
import AccountAccessChooser from "@/components/AccountAccessChooser";
import SeoHead from "@/components/SeoHead";
import { ResearchProvider } from "@/research/core";
import ApplyStatus from "@/research/pages/ApplyStatus";
import SignInAuthority from "@/research/pages/SignIn";
import PublicShell from "./PublicShell";
import { pageTitle } from "./brand";
import { ContentSection } from "./primitives";

export function SignInAuthorityPage() {
  return (
    <PublicShell>
      <ResearchProvider><SignInAuthority /></ResearchProvider>
      <SeoHead title={pageTitle("Sign in")} description="Return to an existing Xenios customer, practice or partner account." path="/sign-in" robots="noindex, nofollow" />
      <ContentSection tone="soft"><AccountAccessChooser /></ContentSection>
    </PublicShell>
  );
}

export function ActivationAuthorityPage() {
  const search = useSearch();
  const suppliedToken = new URLSearchParams(search).get("token")?.trim() || "";
  let storedToken = "";
  try { storedToken = window.sessionStorage.getItem("xr-application-token")?.trim() || ""; } catch { /* use the supplied link only */ }
  const hasClaimLink = suppliedToken.length >= 10 || storedToken.length >= 10;

  if (!hasClaimLink) {
    return (
      <PublicShell>
        <SeoHead title={pageTitle("Activate your account")} description="Activate an account Xenios already approved." path="/activate" robots="noindex, nofollow" />
        <section className="clarity-hero container-x">
          <p className="mono-cap text-pulse">ACCOUNT ACTIVATION</p>
          <h1 className="display-l text-balance">Activate your account</h1>
          <p className="body-l text-ink-2 clarity-lead">Activation needs the secure link Xenios emailed after approval. Open that link on this device to set up or confirm your account.</p>
          <div className="clarity-actions">
            <Link href="/support" className="btn btn-primary">Contact Support</Link>
            <Link href="/sign-in" className="btn btn-secondary">Sign In</Link>
          </div>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <ResearchProvider><ApplyStatus statusPath="/activate" /></ResearchProvider>
    </PublicShell>
  );
}
