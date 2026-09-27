import { lazy, Suspense, useState } from "react";
import { Link, useLocation } from "wouter";
import { contactService } from "@/lib/waitlist-service";
import { readAssistedOrderToken } from "@/research/assisted-order/storage";
import InquiryForm from "./InquiryForm";
import {
  ActionRow,
  BoundaryNote,
  ContentSection,
  FaqList,
  InfoCard,
  InfoGrid,
  NumberedSteps,
  PublicPage,
} from "./primitives";

const SignInAuthorityPage = lazy(() => import("./AccountAuthorityPages").then((module) => ({ default: module.SignInAuthorityPage })));
const ActivationAuthorityPage = lazy(() => import("./AccountAuthorityPages").then((module) => ({ default: module.ActivationAuthorityPage })));

export const CARE_STEPS = [
  { title: "Send a Care request", body: "Share a few contact details and what kind of help you're looking for. This is not a medical intake." },
  { title: "A person reviews it", body: "Our Care team reviews your request and contacts you about the next step." },
  { title: "Continue securely if Care fits", body: "Any health information belongs in the secure Care system, not in the request form." },
] as const;

export const RESEARCH_STEPS = [
  { title: "Request an order", body: "Choose the exact research product and size in the supported ordering flow." },
  { title: "We confirm availability", body: "We review the request and email your quote and payment details." },
  { title: "We verify payment", body: "Every payment is checked by a person before an order is released." },
  { title: "We send tracking", body: "When an order ships, we email its tracking information." },
] as const;

export const PATHWAY_TILES = [
  { title: "Start Care", body: "Start with a short, non-clinical request. No account is needed to begin.", href: "/care/schedule", label: "Start Care" },
  { title: "Explore Research Products", body: "Learn how research ordering works. Products and Care stay separate.", href: "/products", label: "Explore Products" },
  { title: "For Practices", body: "Refer clients, understand the workspace, and ask about working with Xenios.", href: "/practices", label: "For Practices" },
] as const;

export function PathwayTiles() {
  return (
    <InfoGrid>
      {PATHWAY_TILES.map((tile) => (
        <InfoCard key={tile.title} title={tile.title}>
          <p>{tile.body}</p>
          <Link href={tile.href} className="clarity-card-link">{tile.label}</Link>
        </InfoCard>
      ))}
    </InfoGrid>
  );
}

export function IndividualsPage() {
  return (
    <PublicPage
      title="For Individuals"
      description="Choose the Xenios path that fits: Care or research products."
      path="/individuals"
      eyebrow="FOR INDIVIDUALS"
      heading="Care or research products — here's how to choose."
      lead="Care begins with a request for you. Research products are for research use. The paths are separate."
      actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }, { label: "Explore Products", href: "/products" }]}
    >
      <ContentSection title="Compare the two paths" intro="The same questions, answered side by side.">
        <InfoGrid className="clarity-grid-two">
          <InfoCard title="Care">
            <dl className="clarity-comparison">
              <div><dt>Who it's for</dt><dd>People looking to start a Care request.</dd></div>
              <div><dt>Account needed</dt><dd>No account is needed to send the first request.</dd></div>
              <div><dt>What happens next</dt><dd>A person reviews the request and contacts you.</dd></div>
              <div><dt>Cost to start</dt><dd>Submitting a Care request is free.</dd></div>
              <div><dt>Status</dt><dd>The Care team updates you using the contact method you choose.</dd></div>
            </dl>
            <Link href="/care/schedule" className="clarity-card-link">Start Care</Link>
          </InfoCard>
          <InfoCard title="Research products">
            <dl className="clarity-comparison">
              <div><dt>Who it's for</dt><dd>People requesting products for research use.</dd></div>
              <div><dt>Account needed</dt><dd>You can begin with your email; sign in to see account history.</dd></div>
              <div><dt>What happens next</dt><dd>We confirm availability before sending payment details.</dd></div>
              <div><dt>Cost to start</dt><dd>No public price is shown until an exact price is approved.</dd></div>
              <div><dt>Status</dt><dd>Use your reference or sign in to check an order.</dd></div>
            </dl>
            <Link href="/products" className="clarity-card-link">Explore Products</Link>
          </InfoCard>
        </InfoGrid>
        <BoundaryNote>Ordering a research product does not give you access to Care.</BoundaryNote>
      </ContentSection>
      <ContentSection tone="soft" title="Already started?">
        <ActionRow actions={[{ label: "Check Status", href: "/status", kind: "primary" }, { label: "Sign In", href: "/sign-in" }]} />
      </ContentSection>
    </PublicPage>
  );
}

export function ProductsPage() {
  return (
    <PublicPage
      title="Research products"
      description="Explore Xenios Care, research-product and practice pathways."
      path="/products"
      eyebrow="PRODUCT PATHWAYS"
      heading="Research products"
      lead="Research products are for research use. Choose one of the three clear paths below while exact public product information is reviewed."
      actions={[{ label: "Check Status", href: "/status", kind: "primary" }]}
    >
      <ContentSection title="Choose a pathway" intro="Care, research ordering, and practice referrals remain distinct.">
        <PathwayTiles />
      </ContentSection>
      <ContentSection tone="soft" title="Public product list">
        <div className="clarity-empty-state">
          <p className="body-l text-ink-2">We're preparing our public product list. Existing customers can <Link href="/sign-in" className="clarity-text-link">Sign In</Link> to see the full catalog.</p>
          <ActionRow actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }, { label: "Sign In", href: "/sign-in" }]} />
        </div>
      </ContentSection>
      <ContentSection title="Research-use boundary">
        <BoundaryNote>Research products are for research use only. Not for human consumption. Not medical advice.</BoundaryNote>
      </ContentSection>
    </PublicPage>
  );
}

export function ProductUnavailablePage() {
  return (
    <PublicPage
      title="Product not listed"
      description="That product is not in the approved Xenios public list."
      path="/products"
      robots="noindex, nofollow"
      eyebrow="RESEARCH PRODUCTS"
      heading="We couldn't find that product."
      lead="Only approved public product information appears here."
      actions={[{ label: "Explore Products", href: "/products", kind: "primary" }, { label: "Contact Support", href: "/support" }]}
    />
  );
}

export function ResearchOverviewPage() {
  return (
    <PublicPage
      title="How research orders work"
      description="Request, confirm, verify and track a Xenios research order."
      path="/research"
      eyebrow="RESEARCH ORDERS"
      heading="How research orders work"
      lead="Research products are sold for research use only. There's no clinical review, and nothing here is medical advice."
      actions={[{ label: "Explore Products", href: "/products", kind: "primary" }, { label: "Check Status", href: "/status" }]}
    >
      <ContentSection title="From request to tracking">
        <NumberedSteps steps={[...RESEARCH_STEPS]} />
      </ContentSection>
      <ContentSection tone="soft" title="Payment">
        <p className="body-l text-ink-2 clarity-copy-width">After we confirm your order, we email payment details. We verify every payment by hand before we release your order.</p>
      </ContentSection>
      <ContentSection title="Tracking">
        <p className="body-l text-ink-2 clarity-copy-width">When your order ships, we email its tracking information. No shipping time is promised.</p>
        <BoundaryNote>Research products are for research use only. Ordering them doesn't give you access to Care.</BoundaryNote>
      </ContentSection>
    </PublicPage>
  );
}

export const PRACTICE_ACCOUNT_TEXT = "Clients create and own their own accounts. Your practice is recorded as the referring practice. If a client uses Care, the Care clinician makes the medical decisions, and the client decides what to share with the practice.";
const PUBLIC_COMMISSION_TEXT = "Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds, and payout timing are in your partner agreement. Care services never earn commission.";

export function PracticesPage() {
  return (
    <PublicPage
      title="For Practices"
      description="Refer clients and learn how approved Xenios practice access works."
      path="/practices"
      eyebrow="FOR PRACTICES"
      heading="For practices: refer clients, keep your relationships."
      lead="For clinics, providers, coaches, trainers, gyms, med spas, behavioral-health practices, retreats and wellness teams."
      actions={[{ label: "Submit Inquiry", href: "/practices#inquiry", kind: "primary" }, { label: "Sign In", href: "/sign-in" }]}
    >
      <ContentSection title="How it works for your practice">
        <InfoGrid>
          <InfoCard title="Refer clients"><p>Share your practice link or code. Clients create their own accounts and place their own orders. Eligible orders are credited to your practice.</p><Link href="/practices/referrals" className="clarity-card-link">How referrals work</Link></InfoCard>
          <InfoCard title="Practice workspace"><p>Approved practices sign in to see referral counts, credited orders and commission. Staff access is limited by role.</p><Link href="/practices/workspace" className="clarity-card-link">About the workspace</Link></InfoCard>
          <InfoCard title="Care for your clients"><p>Clients can start their own Care request. Your practice does not approve treatment or receive Care information by default.</p><Link href="/practices/care" className="clarity-card-link">Care for your clients</Link></InfoCard>
        </InfoGrid>
      </ContentSection>
      <ContentSection tone="soft" title="Your clients and their accounts">
        <p className="body-l text-ink-2 clarity-copy-width">{PRACTICE_ACCOUNT_TEXT}</p>
      </ContentSection>
      <ContentSection title="Clear responsibilities">
        <InfoGrid className="clarity-grid-two">
          <InfoCard title="What Xenios handles"><ul className="clarity-list"><li>Research-product orders and fulfilment</li><li>Payment verification</li><li>Customer support for orders</li><li>The separate Care pathway when a client chooses it</li></ul></InfoCard>
          <InfoCard title="What your practice handles"><ul className="clarity-list"><li>Your coaching and client relationship</li><li>Helping clients understand which path they may want to explore</li><li>Your own professional and legal obligations</li></ul></InfoCard>
        </InfoGrid>
        <BoundaryNote>A practice account doesn't place orders for clients, edit client accounts or approve treatment. Each client accepts the research-use terms themselves.</BoundaryNote>
      </ContentSection>
      <ContentSection tone="soft" title="Commission">
        <p className="body-l text-ink-2 clarity-copy-width">{PUBLIC_COMMISSION_TEXT}</p>
      </ContentSection>
      <ContentSection title="In-clinic inventory">
        <p className="body-l text-ink-2 clarity-copy-width">In-clinic inventory is under review. Mention it in your inquiry if you are interested.</p>
      </ContentSection>
      <ContentSection title="What happens after you submit">
        <NumberedSteps steps={[
          { title: "Keep your reference", body: "A stored inquiry receives an INQ reference on screen." },
          { title: "We learn about your practice", body: "Someone from our team contacts you. We don't promise a response time." },
          { title: "Review the relationship", body: "If there's a fit, the next step may include a partner agreement." },
          { title: "Activate after approval", body: "Approved practices receive activation instructions and a referral link." },
        ]} />
      </ContentSection>
      <ContentSection id="inquiry" tone="soft">
        <InquiryForm kind="practice" />
      </ContentSection>
    </PublicPage>
  );
}

export function PracticeReferralsPage() {
  return (
    <PublicPage
      title="How referrals work"
      description="How Xenios practice referrals, credited orders and commission work."
      path="/practices/referrals"
      eyebrow="FOR PRACTICES"
      heading="How referrals work"
      lead="Your link leads to the client's own account and order. Eligible orders can then be credited to your practice."
      actions={[{ label: "Submit Inquiry", href: "/practices#inquiry", kind: "primary" }, { label: "Sign In", href: "/sign-in" }]}
    >
      <ContentSection title="The referral flow">
        <NumberedSteps steps={[
          { title: "Your practice is approved", body: "Referral links are issued only after review and approval." },
          { title: "You share your link", body: "Give the link or code to a client who wants to explore research products." },
          { title: "The client creates an account", body: "The account belongs to the client, not the practice." },
          { title: "The client submits an order", body: "Clients place their own orders and accept the research-use terms themselves." },
          { title: "The referral is recorded", body: "Eligible orders can be attributed or credited to your practice." },
          { title: "Your workspace summarizes activity", body: "Approved practices see safe commercial totals, not Care information." },
          { title: "Commission follows the agreement", body: "Rates, holds and payout timing stay in the partner agreement." },
        ]} />
      </ContentSection>
      <ContentSection tone="soft" title="What you can see">
        <p className="body-l text-ink-2 clarity-copy-width">Your workspace shows referral counts, credited orders and commission — and payout information once the program is active. Client names or client-level status require explicit client consent, which isn't available yet. Care information is never shared without written authorization and applicable authority.</p>
        <BoundaryNote>Care services never earn commission.</BoundaryNote>
      </ContentSection>
    </PublicPage>
  );
}

export function PracticeWorkspacePage() {
  return (
    <PublicPage
      title="Practice workspace"
      description="What approved practices can see in their Xenios workspace."
      path="/practices/workspace"
      eyebrow="FOR PRACTICES"
      heading="Your practice workspace"
      lead="A clear view of referrals, credited orders and commission, with staff access limited by role."
      actions={[{ label: "Sign In", href: "/sign-in", kind: "primary" }, { label: "Submit Inquiry", href: "/practices#inquiry" }]}
    >
      <ContentSection title="What you see">
        <InfoGrid>
          <InfoCard title="Referral counts"><p>A summary of referral activity connected to your practice.</p></InfoCard>
          <InfoCard title="Credited orders"><p>Commercial order records attributed to your practice, without Care details.</p></InfoCard>
          <InfoCard title="Commission and payouts"><p>Commission entries and payout information when the program is active.</p></InfoCard>
        </InfoGrid>
      </ContentSection>
      <ContentSection tone="soft" title="Staff roles">
        <InfoGrid>
          <InfoCard title="Owner"><p>Manages the practice relationship and staff access.</p></InfoCard>
          <InfoCard title="Admin"><p>Supports approved workspace operations within assigned access.</p></InfoCard>
          <InfoCard title="Billing contact"><p>Sees only the commercial information needed for that role.</p></InfoCard>
        </InfoGrid>
        <BoundaryNote>The workspace doesn't place orders for clients, edit their accounts or expose Care information.</BoundaryNote>
        <p className="body-m text-ink-2 mt-6">The practice workspace is opening to approved practices. Until then, approved partners use their current dashboard for referrals and commission.</p>
      </ContentSection>
    </PublicPage>
  );
}

export function PracticeCarePage() {
  return (
    <PublicPage
      title="Care for your clients"
      description="Understand the boundary between a practice relationship and Xenios Care."
      path="/practices/care"
      eyebrow="FOR PRACTICES"
      heading="Care for your clients"
      lead="A client starts their own request. Care stays separate from research orders and from your practice workspace."
      actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }, { label: "Submit Inquiry", href: "/practices#inquiry" }]}
    >
      <ContentSection title="The Care boundary">
        <InfoGrid>
          <InfoCard title="The client chooses"><p>The client sends their own request and chooses what to share with your practice.</p></InfoCard>
          <InfoCard title="The practice doesn't approve treatment"><p>A referral does not give a practice clinical authority or access to Care information.</p></InfoCard>
          <InfoCard title="Care stays private"><p>Care information is never shared without written authorization and applicable authority.</p></InfoCard>
        </InfoGrid>
        <BoundaryNote>Care services never earn commission. Ordering research products never unlocks Care.</BoundaryNote>
      </ContentSection>
    </PublicPage>
  );
}

export function PartnersPage() {
  return (
    <PublicPage
      title="Partners"
      description="Learn about Xenios referral and strategic partnership paths."
      path="/partners"
      eyebrow="PARTNERS"
      heading="Become a Xenios partner"
      lead="For creators, coaches and professionals who want to recommend Xenios and earn commission on eligible orders."
      actions={[{ label: "Submit Inquiry", href: "/partners#inquiry", kind: "primary" }, { label: "Sign In", href: "/sign-in" }]}
    >
      <ContentSection title="Referral partners">
        <NumberedSteps steps={[
          { title: "Tell us you're interested", body: "Partner applications open soon. Submit an inquiry for now." },
          { title: "We review the fit", body: "An inquiry is not an application, account or approval." },
          { title: "Agreement and activation", body: "If approved later, you receive an agreement and account activation instructions." },
          { title: "Use your link", body: "Approved partners receive resources and a link for eligible referrals." },
          { title: "Track activity", body: "The partner workspace shows safe commercial activity and commission under the agreement." },
        ]} />
        <BoundaryNote>Partner applications open soon. Tell us you're interested and we'll contact you when they do.</BoundaryNote>
        <div id="inquiry" className="mt-10"><InquiryForm kind="partner_interest" /></div>
      </ContentSection>
      <ContentSection id="strategic" tone="soft" title="Strategic partnerships" intro="Distribution, technology, education or other business relationships.">
        <InquiryForm kind="strategic" />
      </ContentSection>
      <ContentSection title="Already approved?">
        <ActionRow actions={[{ label: "Activate Account", href: "/activate", kind: "primary" }, { label: "Sign In", href: "/sign-in" }]} />
      </ContentSection>
    </PublicPage>
  );
}

export function SuppliersPage() {
  return (
    <PublicPage
      title="Suppliers"
      description="Submit a supplier or fulfilment inquiry to Xenios."
      path="/suppliers"
      eyebrow="SUPPLIERS"
      heading="Supply or fulfil with Xenios"
      lead="For pharmacies, labs, manufacturers, distributors, diagnostic providers and fulfilment companies."
      actions={[{ label: "Submit Inquiry", href: "/suppliers#inquiry", kind: "primary" }, { label: "Contact Support", href: "/support" }]}
    >
      <ContentSection title="How it works">
        <NumberedSteps steps={[
          { title: "Submit an inquiry", body: "Tell us about your organization without uploading sensitive documents." },
          { title: "We review the fit", body: "We review documentation, quality processes and capacity." },
          { title: "Invitation follows review", body: "If there's a fit, we invite you to the restricted supplier workspace." },
        ]} />
        <BoundaryNote>Supplier access is by invitation, after we review your documentation. An inquiry doesn't create supplier access.</BoundaryNote>
      </ContentSection>
      <ContentSection id="inquiry" tone="soft"><InquiryForm kind="supplier" /></ContentSection>
    </PublicPage>
  );
}

export function HowItWorksPage() {
  return (
    <PublicPage
      title="How It Works"
      description="See the Care and research-product paths side by side."
      path="/how-it-works"
      eyebrow="HOW IT WORKS"
      heading="Two paths, with clear next steps."
      lead="Care starts with a short request. Research ordering starts with an exact product request. One never unlocks the other."
      actions={[{ label: "Start Care", href: "/care/schedule", kind: "primary" }, { label: "Explore Products", href: "/products" }]}
    >
      <ContentSection title="Start Care">
        <NumberedSteps steps={[...CARE_STEPS]} />
        <BoundaryNote>This request isn't a medical intake. Please don't include health details. Care availability depends on your state. We confirm availability after the request. Submitting a Care request is free.</BoundaryNote>
      </ContentSection>
      <ContentSection tone="soft" title="Request research products">
        <NumberedSteps steps={[...RESEARCH_STEPS]} />
        <BoundaryNote>Research products are for research use only. Not for human consumption. Not medical advice.</BoundaryNote>
      </ContentSection>
    </PublicPage>
  );
}

export function QualityPage() {
  const [, navigate] = useLocation();
  const [lotCode, setLotCode] = useState("");
  return (
    <PublicPage
      title="Quality and documentation"
      description="Learn how Xenios lot records and secure order documents work."
      path="/quality"
      eyebrow="QUALITY"
      heading="Quality and documentation"
      lead="Look up an exact lot code to see information approved for public display."
    >
      <ContentSection title="Look up a lot" intro="Exact codes only. No approximate match is returned.">
        <form className="clarity-inline-form" onSubmit={(event) => { event.preventDefault(); const code = lotCode.trim(); if (code) navigate(`/research/lots/${encodeURIComponent(code)}`); }}>
          <label className="clarity-field"><span>Lot code</span><input value={lotCode} onChange={(event) => setLotCode(event.target.value)} required /></label>
          <button className="btn btn-primary" type="submit">Look up a lot</button>
        </form>
      </ContentSection>
      <ContentSection tone="soft" title="What we publish and what we don't">
        <InfoGrid className="clarity-grid-two">
          <InfoCard title="Public lot records"><p>An exact lookup may show an approved status summary and documents explicitly cleared for public display.</p></InfoCard>
          <InfoCard title="Secure documents"><p>Order-specific documents remain in the customer's account and are not exposed by a public lookup.</p><Link href="/sign-in" className="clarity-card-link">Sign In</Link></InfoCard>
        </InfoGrid>
        <BoundaryNote>We don't make testing, certificate or documentation claims that have not been verified for public use.</BoundaryNote>
      </ContentSection>
    </PublicPage>
  );
}

const FAQ_ITEMS = [
  { question: "What's the difference between Care and research products?", answer: <>Care begins with a separate request and continues through the Care pathway. Research products are for research use only. One never unlocks the other.</> },
  { question: "What does it cost to start?", answer: <>Submitting a Care request is free. No research-product price appears publicly until the exact product, variant and price are approved.</> },
  { question: "What happens after I submit something?", answer: <>A stored Care, order or business request shows a reference on screen. A person handles the next step.</> },
  { question: "Can my practice order for me?", answer: <>No. You create and own your account, submit your own order and accept the research-use terms yourself. Your practice can refer you.</> },
  { question: "Where do I sign in?", answer: <>Use <Link href="/sign-in" className="clarity-text-link">Sign In</Link> at the top of every page. If Xenios approved an account for you, use the activation link in your email first.</> },
  { question: "How do I pay?", answer: <>After we confirm a research order, we email payment details. We verify every payment by hand.</> },
  { question: "Do you give dosing instructions?", answer: <>Not for research products. They are for research use only and are not medical advice.</> },
  { question: "Does Care earn practice commission?", answer: <>No. Care services never earn commission.</> },
];

export function FaqPage() {
  return (
    <PublicPage title="Questions" description="Straight answers about Xenios Care, research products, practices, partners and accounts." path="/faq" eyebrow="FAQ" heading="Questions" lead="Care, research products, orders and accounts each have a clear path.">
      <ContentSection><FaqList items={FAQ_ITEMS} /></ContentSection>
      <ContentSection tone="soft" title="Still need help?"><ActionRow actions={[{ label: "Contact Support", href: "/support", kind: "primary" }, { label: "Check Status", href: "/status" }]} /></ContentSection>
    </PublicPage>
  );
}

export function AboutPage() {
  return (
    <PublicPage
      title="About Xenios"
      description="Xenios builds Care, research-product and professional-support technology."
      path="/about"
      eyebrow="ABOUT"
      heading="About Xenios"
      lead="Xenios Technologies, Inc. builds technology for proactive health: Care, research products, and tools for the professionals who support people's health."
    >
      <ContentSection title="Clear paths, shared standards">
        <p className="body-l text-ink-2 clarity-copy-width">The public Xenios site helps people choose Care, research products, or a professional relationship without blending their permissions or responsibilities.</p>
      </ContentSection>
      <ContentSection tone="soft" title="Workspace for coaches">
        <p className="body-l text-ink-2 clarity-copy-width">The separate coach workspace helps health and performance professionals organize their work.</p>
        <ActionRow actions={[{ label: "Workspace for coaches", href: "/workspace", kind: "text" }]} />
      </ContentSection>
    </PublicPage>
  );
}

export function SupportPage() {
  return (
    <PublicPage title="Support" description="Find the right Xenios support path." path="/support" eyebrow="SUPPORT" heading="How can we help?" lead="Choose the type of help you need so you reach the right place.">
      <ContentSection title="Choose a support path">
        <InfoGrid>
          <InfoCard title="An order"><p>Use your reference to return to the supported order-status path.</p><Link href="/status" className="clarity-card-link">Check Status</Link></InfoCard>
          <InfoCard title="Care"><p>Use the Care support form for an existing Care request. Don't include health details in a general message.</p><Link href="/care/support" className="clarity-card-link">Contact Support</Link></InfoCard>
          <InfoCard title="My account"><p>Sign in, activate an approved account or reset your password.</p><Link href="/sign-in" className="clarity-card-link">Sign In</Link></InfoCard>
          <InfoCard title="A practice question"><p>Practices use the practice inquiry so the right request type is recorded.</p><Link href="/practices#inquiry" className="clarity-card-link">Submit Inquiry</Link></InfoCard>
          <InfoCard title="A partner question"><p>Referral and strategic partner inquiries start on the Partners page.</p><Link href="/partners#inquiry" className="clarity-card-link">Submit Inquiry</Link></InfoCard>
          <InfoCard title="A supplier question"><p>Suppliers and fulfilment organizations use the supplier inquiry.</p><Link href="/suppliers#inquiry" className="clarity-card-link">Submit Inquiry</Link></InfoCard>
        </InfoGrid>
      </ContentSection>
      <ContentSection tone="soft" title="Send a general message"><SupportForm /></ContentSection>
    </PublicPage>
  );
}

function SupportForm() {
  const [state, setState] = useState<"idle" | "sending" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const data = new FormData(event.currentTarget);
    try {
      await contactService.submit({
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim().toLowerCase(),
        persona: "other",
        subject: "[Support] General support message",
        message: String(data.get("message") || "").trim(),
        website: String(data.get("website") || ""),
      });
      setState("accepted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We're not sure this went through. Please don't resend yet.");
      setState("error");
    }
  }
  if (state === "accepted") return <div className="clarity-confirmation" role="status"><h3 className="display-s">Your message was received.</h3><p className="body-m text-ink-2 mt-3">We don't promise a response time.</p></div>;
  return (
    <form className="clarity-form" onSubmit={submit}>
      {state === "error" && <div className="clarity-form-alert" role="alert">{message}</div>}
      <div className="clarity-form-grid"><label className="clarity-field"><span>Name</span><input name="name" required autoComplete="name" /></label><label className="clarity-field"><span>Email</span><input name="email" type="email" required autoComplete="email" /></label></div>
      <label className="clarity-field mt-5"><span>Message</span><textarea name="message" rows={6} required minLength={20} /></label>
      <div className="clarity-honeypot" aria-hidden="true"><label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <button className="btn btn-primary mt-6" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send message"}</button>
    </form>
  );
}

export function StatusPage() {
  const [, navigate] = useLocation();
  const [message, setMessage] = useState<{ kind: "care" | "inquiry" | "missing_access" | "invalid"; text: string } | null>(null);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reference = String(form.get("reference") || "").trim().toUpperCase();
    if (reference.startsWith("CARE-")) {
      setMessage({ kind: "care", text: "Care requests are updated directly by the Care team using the contact method you chose." });
      return;
    }
    if (reference.startsWith("INQ-")) {
      setMessage({ kind: "inquiry", text: "Business inquiries do not have a public status page. Keep your reference; our team will contact you at the email you provided." });
      return;
    }
    if (/^(?:XEA|XEC|XO)-[A-Z0-9-]{6,64}$/u.test(reference)) {
      setMessage({ kind: "missing_access", text: "This order belongs in your secure account. Sign in to view your orders, or contact support with the reference." });
      return;
    }
    if (!/^XRR-\d{8}-[0-9A-F]{10}$/u.test(reference)) {
      setMessage({ kind: "invalid", text: "That reference format is not recognized. Check your confirmation, or contact support." });
      return;
    }
    if (!readAssistedOrderToken(reference)) {
      setMessage({ kind: "missing_access", text: "This browser does not have the secure status credential for that order. Sign in to view your orders, or contact support with the reference." });
      return;
    }
    navigate(`/research/early-access/order-request/${encodeURIComponent(reference)}`);
  }
  return (
    <PublicPage title="Check status" description="Return to a Xenios order or request using its reference." path="/status" robots="noindex, nofollow" eyebrow="STATUS" heading="Check status" lead="Use the browser where you submitted an order, or sign in. A reference by itself never unlocks private order details.">
      <ContentSection>
        <form className="clarity-form clarity-form-narrow" onSubmit={submit}>
          <label className="clarity-field"><span>Order or request reference</span><input name="reference" required autoComplete="off" /></label>
          <button className="btn btn-primary mt-6" type="submit">Check Status</button>
        </form>
        {message && <div className="clarity-boundary mt-6" role={message.kind === "invalid" ? "alert" : "status"}>{message.text} <Link href={message.kind === "care" ? "/care/support" : "/support"} className="clarity-text-link">Contact Support</Link>.</div>}
        <p className="body-m text-ink-2 mt-8">Signed in? See all your orders in your account. <Link href="/sign-in" className="clarity-text-link">Sign In</Link></p>
      </ContentSection>
    </PublicPage>
  );
}

export function SignInPage() {
  return (
    <Suspense fallback={<div className="container-x clarity-section" aria-busy="true">Loading…</div>}><SignInAuthorityPage /></Suspense>
  );
}

export function ActivatePage() {
  return (
    <Suspense fallback={<div className="container-x clarity-section" aria-busy="true">Loading…</div>}><ActivationAuthorityPage /></Suspense>
  );
}
