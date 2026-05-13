import { Link } from "wouter";
import PageShell from "@/components/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <section className="container-x py-32 text-center" data-testid="page-not-found">
        <p className="eyebrow text-orange-fire mb-6">404</p>
        <h1 className="display-md mb-8" style={{ textTransform: "none" }}>That page is not here.</h1>
        <Link href="/" className="btn btn-primary">Back home →</Link>
      </section>
    </PageShell>
  );
}
