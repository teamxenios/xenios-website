import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function NotFound() {
  return (
    <PageShell>
      <SeoHead {...PAGES.notFound} />
      <section className="container-x py-32 md:py-48 text-center">
        <p className="mono-cap text-ink-mute mb-6">404</p>
        <h1 className="display-l mb-6 max-w-[24ch] mx-auto">That page is not here.</h1>
        <p className="body-l text-ink-2 mb-10 max-w-[44ch] mx-auto">
          It moved, was renamed, or never existed. Let's get you back to the work.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/" className="btn btn-primary">Home</Link>
          <Link href="/product" className="btn btn-ghost">Product</Link>
        </div>
      </section>
    </PageShell>
  );
}
