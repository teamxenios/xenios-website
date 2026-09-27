import { Link } from "wouter";

const PATHS = [
  { label: "Sign In", body: "Return to an existing customer, practice or partner account.", href: "/sign-in" },
  { label: "Activate Account", body: "First-time setup for an account Xenios already approved, using the link we emailed you.", href: "/activate" },
  { label: "Explore Products", body: "Learn about research ordering and use your email to request an order when a product is approved.", href: "/products" },
  { label: "Start Care", body: "Send a short, non-clinical Care request. No account is needed to begin.", href: "/care/schedule" },
  { label: "Become a Partner", body: "Learn about partner interest, review and approval.", href: "/partners" },
  { label: "For Practices", body: "Learn about referrals, practice visibility and the inquiry process.", href: "/practices" },
  { label: "Submit Inquiry", body: "Suppliers and fulfilment organizations can submit a reviewed business inquiry.", href: "/suppliers#inquiry" },
] as const;

export default function AccountAccessChooser({ compact = false }: { compact?: boolean }) {
  return (
    <section id="account-access" aria-labelledby="account-access-title">
      <p className="mono-cap text-pulse mb-4">ACCOUNT AND ACCESS</p>
      <h2 id="account-access-title" className={compact ? "display-s" : "display-m"}>Choose the action you actually need.</h2>
      <p className="body-m text-ink-2 mt-4 max-w-[68ch]">Sign-in, activation, Care, research orders and business inquiries are different actions. Each keeps its own review and permissions.</p>
      <div className="clarity-grid mt-8">
        {PATHS.map((path) => (
          <article key={`${path.label}-${path.href}`} className="clarity-card">
            <h3 className="h3">{path.label}</h3>
            <p className="body-m text-ink-2 clarity-card-body">{path.body}</p>
            <Link href={path.href} className="clarity-card-link">{path.label}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
