import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import PublicShell from "@/clarity/PublicShell";
import { pageTitle } from "@/clarity/brand";
import {
  ActionRow,
  BoundaryNote,
  ContentSection,
  FaqList,
  InfoCard,
  InfoGrid,
  NumberedSteps,
} from "@/clarity/primitives";
import { CARE_STEPS, PathwayTiles, PRACTICE_ACCOUNT_TEXT, RESEARCH_STEPS } from "@/clarity/pages";

const AUDIENCES = [
  { title: "I want Care", body: "Tell us what you're looking for. A person reviews your request and contacts you about secure next steps. No account is needed to start.", href: "/care/schedule", label: "Start Care" },
  { title: "I want research products", body: "Learn about ordering for research use. We confirm availability before sending payment details.", href: "/products", label: "Explore Products" },
  { title: "I run a practice", body: "Refer clients, understand what is visible in a practice workspace and keep ordering in each client's own account.", href: "/practices", label: "For Practices" },
  { title: "I want to refer people", body: "Approved partners can share Xenios and earn commission on eligible research-product orders under their agreement.", href: "/partners", label: "Become a Partner" },
  { title: "I supply or fulfil", body: "Supplier access is by invitation after a review of documentation, quality and capacity.", href: "/suppliers#inquiry", label: "Submit Inquiry" },
  { title: "I already have an account", body: "Return to your orders, documents or approved professional workspace.", href: "/sign-in", label: "Sign In" },
] as const;

const HOME_FAQ = [
  { question: "What's the difference between Care and research products?", answer: <>Care begins through its own request path. Research products are for research use only. The paths are separate, and one never unlocks the other.</> },
  { question: "What does it cost to start?", answer: <>Submitting a Care request is free. No research-product price appears publicly until the exact product, variant and price are approved.</> },
  { question: "What happens after I submit something?", answer: <>A stored Care, research order or business inquiry shows a reference on screen. A person handles the next step.</> },
  { question: "Can my practice order for me?", answer: <>No. You create and own your account, submit your own order and accept the research-use terms yourself. Your practice can refer you.</> },
  { question: "Where do I sign in?", answer: <>Use <Link href="/sign-in" className="clarity-text-link">Sign In</Link> at the top of every page. Approved accounts use the activation link sent by Xenios first.</> },
  { question: "Do you give dosing instructions?", answer: <>Not for research products. They are for research use only and are not medical advice.</> },
];

export default function Home() {
  return (
    <PublicShell>
      <SeoHead
        title={pageTitle("Care and research products")}
        description="Start a Xenios Care request or explore research products through two clearly separated paths."
        path="/"
      />
      <section className="clarity-hero clarity-home-hero container-x">
        <p className="mono-cap text-pulse">CARE · RESEARCH PRODUCTS · PRACTICES</p>
        <h1 className="display-l text-balance" data-testid="text-headline">Care and research products, clearly separated.</h1>
        <p className="body-l text-ink-2 clarity-lead">Start a Care request, or explore products for research use. Two different paths, with clear next steps.</p>
        <ActionRow actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }, { label: "Explore Products", href: "/products" }]} />
        <p className="body-m text-ink-2 mt-6">Already a customer? <Link href="/sign-in" className="clarity-text-link">Sign In</Link> <span aria-hidden="true">·</span> Have an order? <Link href="/status" className="clarity-text-link">Check Status</Link></p>
      </section>

      <ContentSection eyebrow="CHOOSE YOUR PATH" title="Where do you fit?" intro="Each tile tells you whether you need an account and what happens next.">
        <InfoGrid>
          {AUDIENCES.map((audience) => (
            <InfoCard key={audience.title} title={audience.title}>
              <p>{audience.body}</p>
              <Link href={audience.href} className="clarity-card-link">{audience.label}</Link>
            </InfoCard>
          ))}
        </InfoGrid>
      </ContentSection>

      <ContentSection tone="soft" eyebrow="PATHWAYS" title="Two ways to get what you need" intro="Choose Care or research products, or learn how practices can refer clients.">
        <PathwayTiles />
      </ContentSection>

      <ContentSection eyebrow="CARE" title="How Care works">
        <NumberedSteps steps={[...CARE_STEPS]} />
        <BoundaryNote>This request isn't a medical intake. Please don't include health details. Care availability depends on your state. We confirm it after your request. Submitting a Care request is free.</BoundaryNote>
        <ActionRow actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }]} />
      </ContentSection>

      <ContentSection tone="soft" eyebrow="RESEARCH PRODUCTS" title="How research orders work">
        <NumberedSteps steps={[...RESEARCH_STEPS]} />
        <BoundaryNote>Research products are for research use only. Not for human consumption. Not medical advice. Ordering them doesn't give you access to Care.</BoundaryNote>
        <ActionRow actions={[{ label: "Explore Products", href: "/products", kind: "primary" }]} />
      </ContentSection>

      <ContentSection eyebrow="FOR PRACTICES" title="Support your clients without taking over their accounts" intro={PRACTICE_ACCOUNT_TEXT}>
        <InfoGrid>
          <InfoCard title="Refer clients"><p>Share your practice link after approval. Eligible orders can be credited to your practice.</p></InfoCard>
          <InfoCard title="Practice workspace"><p>See safe commercial totals such as referral counts, credited orders and commission.</p></InfoCard>
          <InfoCard title="Care stays separate"><p>Your practice does not approve treatment or receive Care information by default.</p></InfoCard>
        </InfoGrid>
        <ActionRow actions={[{ label: "For Practices", href: "/practices", kind: "primary" }]} />
      </ContentSection>

      <ContentSection tone="soft" eyebrow="PARTNERS" title="Recommend Xenios to people who'd value it" intro="Approved partners receive a link, resources and commission on eligible research-product orders under their agreement.">
        <ActionRow actions={[{ label: "Become a Partner", href: "/partners", kind: "primary" }]} />
      </ContentSection>

      <ContentSection eyebrow="QUALITY" title="Look up information approved for public display" intro="Use an exact lot code. Secure order documents remain in your account.">
        <ActionRow actions={[{ label: "Quality", href: "/quality", kind: "text" }]} />
      </ContentSection>

      <ContentSection tone="soft" eyebrow="FAQ" title="Straight answers">
        <FaqList items={HOME_FAQ} />
        <div className="mt-8"><Link href="/faq" className="clarity-text-link">FAQ</Link></div>
      </ContentSection>

      <ContentSection tone="dark" title="Not sure where to start? Choose the path that fits you.">
        <ActionRow actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }, { label: "Explore Products", href: "/products" }, { label: "For Practices", href: "/practices" }]} />
      </ContentSection>
    </PublicShell>
  );
}
