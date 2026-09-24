import { Link } from "wouter";

const PATHS = [
  { label: "Sign in", body: "Use an existing Xenios Research account.", href: "/research/sign-in" },
  { label: "Activate approved setup", body: "Complete an activation that Xenios has already approved.", href: "/research/activate" },
  { label: "Order for Research", body: "Formal Research membership applications are not open yet. Use the supported ordering path for Research products now.", href: "/research/order" },
  { label: "Start Care request", body: "Send non-clinical routing details for human follow-up.", href: "/care/schedule" },
  { label: "Partner program", body: "Review the program, then sign in before submitting an application.", href: "/research/partners" },
  { label: "Business or organization", body: "Start a reviewed organization or strategic relationship inquiry.", href: "/research/organizations" },
  { label: "Supplier access", body: "Review invitation-only supplier, lab, and fulfillment access.", href: "/research/supplier-access" },
] as const;

export default function AccountAccessChooser({ compact = false }: { compact?: boolean }) {
  return (
    <section id="account-access" aria-labelledby="account-access-title">
      <p className="mono-cap text-pulse mb-4">Account and access</p>
      <h2 id="account-access-title" className={compact ? "display-s" : "display-m"}>Choose the action you actually need.</h2>
      <p className="body-m text-ink-2 mt-4 max-w-[68ch]">
        Sign-in, activation, access requests, applications, inquiries, and Care routing are different actions. Each path below keeps its own review and authority.
      </p>
      <p className="body-s text-ink-mute mt-3 max-w-[68ch]" data-testid="membership-closed-notice">
        Formal Research membership applications are not open yet. If you want Research products now, choose Order for Research.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {PATHS.map((path) => (
          <article key={path.href} className="rule-all rounded-[14px] p-5 bg-paper">
            <h3 className="body-m font-700">{path.label}</h3>
            <p className="body-s text-ink-2 mt-2">{path.body}</p>
            <Link href={path.href} className="inline-flex min-h-[44px] items-center mt-4 text-[14px] font-700 text-pulse hover:text-ink">
              Continue <span aria-hidden="true" className="ml-2">→</span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
