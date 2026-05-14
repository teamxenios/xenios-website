import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function NotFound() {
  return (
    <PageShell>
      <SeoHead title={PAGES.notFound.title} description={PAGES.notFound.description} canonical="/404" />
      <section className="grad grad-06-horizon section-y" style={{ minHeight: "60vh" }}>
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">404</p>
          <h1 className="display-xl text-paper text-balance" style={{ maxWidth: "20ch" }}>
            The page you're looking for hasn't been written yet.
          </h1>
          <p className="body-l mt-8 text-paper/85 max-w-2xl">
            xenios is in stealth. The site is small on purpose. Try the waitlist — that's the front door.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/" className="btn btn-primary btn-on-dark">go home →</Link>
            <Link href="/waitlist" className="btn btn-secondary btn-on-dark">join the waitlist</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
