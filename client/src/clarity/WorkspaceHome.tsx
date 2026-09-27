import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import PublicShell from "./PublicShell";
import { pageTitle } from "./brand";
import { ContentSection, InfoCard, InfoGrid } from "./primitives";

const MODULES = [
  { title: "One inbox", body: "Client messages, check-ins, reminders and follow-ups land in one queue instead of five tabs." },
  { title: "One client record", body: "Goals, history, notes, programs, context and progress stay attached to the person." },
  { title: "Xen drafts in your voice", body: "The professional-facing agent prepares a reply or next action. You approve it." },
  { title: "The Studio", body: "The Client Attention Queue shows who needs you today and what action is ready for review." },
  { title: "Hercules", body: "The weekly check-in engine prepares client updates grounded in each client's actual week." },
  { title: "Approval gate", body: "Nothing client-facing goes out unless the coach approves it." },
] as const;

export default function WorkspaceHome() {
  return (
    <PublicShell>
      <SeoHead title={pageTitle("Workspace for coaches")} description="The Xenios workspace for health and performance professionals." path="/workspace" />
      <section className="clarity-hero container-x">
        <p className="mono-cap text-pulse">WORKSPACE FOR COACHES</p>
        <h1 className="display-l text-balance">The AI workspace for serious coaches.</h1>
        <p className="body-l text-ink-2 clarity-lead">Xenios gives health and performance professionals one place to manage client context, follow-up, check-ins, drafts and the work that usually falls through the cracks.</p>
        <div className="clarity-actions"><Link href="/waitlist" className="btn btn-primary">Join Waitlist</Link><Link href="/workspace/how-it-works" className="btn btn-secondary">How It Works</Link></div>
      </section>
      <ContentSection title="One calm command center" intro="Bring the scattered parts of a client-based practice into one workspace.">
        <InfoGrid>{MODULES.map((item) => <InfoCard key={item.title} title={item.title}><p>{item.body}</p></InfoCard>)}</InfoGrid>
      </ContentSection>
      <ContentSection tone="soft" title="Built around professional judgment">
        <p className="body-l text-ink-2 clarity-copy-width">The AI drafts. The coach decides. The professional stays in front of the client relationship.</p>
        <div className="clarity-actions"><Link href="/waitlist" className="btn btn-primary">Join Waitlist</Link><Link href="/products" className="btn btn-secondary">Explore Products</Link></div>
      </ContentSection>
    </PublicShell>
  );
}
