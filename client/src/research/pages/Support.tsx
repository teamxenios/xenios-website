import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";

export const RESEARCH_SUPPORT_EMAIL = "research@xeniostechnology.com";

const supportPaths = [
  {
    title: "An order or request",
    body: "Use your reference and email to see the latest status the order system can confirm.",
    href: "/status",
    label: "Check Status",
  },
  {
    title: "Your account",
    body: "Sign in for account orders and documents, or use the activation link Xenios emailed after approval.",
    href: "/sign-in",
    label: "Sign In",
  },
  {
    title: "Care",
    body: "Start a Care request or use the secure instructions sent by your Care team. Don't send health details by email.",
    href: "/care/schedule",
    label: "Start Care",
  },
  {
    title: "A general question",
    body: "Email Xenios support about a website, product, account, or routing question.",
    href: `mailto:${RESEARCH_SUPPORT_EMAIL}`,
    label: "Contact Support",
  },
] as const;

export default function Support() {
  return (
    <>
      <SeoHead title="Support | Xenios" description="Choose the right support path for an order, account, Care request, or general question." path="/support" />
      <ResearchPublicShell eyebrow="Support" title="How can we help?" lead="Choose the path that matches your question so it reaches the right place." >
        <section className="grid gap-4 mt-8 md:grid-cols-2" aria-label="Support paths">
          {supportPaths.map((path) => (
            <article className="card flex flex-col" key={path.title}>
              <h2 className="body-l font-700">{path.title}</h2>
              <p className="body-s text-ink-2 mt-3">{path.body}</p>
              <div className="mt-5" style={{ marginTop: "auto", paddingTop: 20 }}>
                {path.href.startsWith("mailto:") ? (
                  <a href={path.href} className="btn btn-secondary public-editorial-action">{path.label}</a>
                ) : (
                  <Link href={path.href} className="btn btn-secondary public-editorial-action">{path.label}</Link>
                )}
              </div>
            </article>
          ))}
        </section>
        <section className="card bg-paper-2 mt-10" aria-labelledby="support-boundary">
          <h2 id="support-boundary" className="body-l font-700">Before you email</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">Don't send passwords, payment evidence, health details, or other sensitive information by email. We don't promise a response time.</p>
        </section>
      </ResearchPublicShell>
    </>
  );
}
