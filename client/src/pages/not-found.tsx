import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";

export default function NotFound() {
  return (
    <PageShell>
      <SeoHead title="Not found — xenios." description="The page you're looking for hasn't been written yet." path="/404" />
      <section className="grad grad-06-horizon section-y" data-testid="section-404">
        <div className="container-x text-center">
          <p className="mono-cap text-paper/80 mb-8">404</p>
          <h1 className="display-l text-paper text-balance max-w-3xl mx-auto" style={{ fontWeight: 800 }}>This page hasn't been written yet.</h1>
          <p className="body-l text-paper/85 mt-8 max-w-xl mx-auto">Most of what we're building lives behind the waitlist. Pick a door:</p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/" className="btn btn-primary btn-on-dark w-full sm:w-auto" data-testid="button-404-home">back to home →</Link>
            <Link href="/waitlist" className="btn btn-secondary btn-on-dark w-full sm:w-auto" data-testid="button-404-waitlist">join the waitlist →</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
