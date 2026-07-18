import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { NoticeBar, ProductGrid } from "../components";
import { BusinessPageHero, NumberedJourney, SectionLead } from "../business-components";

const PROGRAMS = [
  { title: "Body composition system", body: "Twelve weeks of training, nutrition structure, education, and accountability organized around a member's actual context." },
  { title: "Sleep and recovery reset", body: "A structured foundation for routines, environment, recovery literacy, and realistic progress tracking." },
  { title: "Performance foundation", body: "A coherent baseline for strength, readiness, nutrition, recovery, schedule, and professional-support questions." },
  { title: "Healthy aging foundation", body: "Whole-life education around movement, recovery, environment, relationships, purpose, and trusted support." },
  { title: "Executive health operating system", body: "A practical system for people balancing demanding work, travel, family, decision load, and long-term goals." },
  { title: "Austin or Houston collective", body: "A future local cohort that combines education, community, accountability, and carefully structured professional participation." },
];

export default function Programs() {
  const { products } = useResearch();
  const items = byCategory(products, "programs");

  return (
    <>
      <SeoHead
        title="Programs, xenios research"
        description="Outcome-oriented, human-led, non-clinical xenios programs built as the next logical step after whole-life context and the member Blueprint."
        path="/research/programs"
      />
      <BusinessPageHero
        eyebrow="Premium programs"
        title="Structure turns a Blueprint into something you can practice."
        lead="Programs combine education, human-led support, accountability, and progress around one clear member objective. They remain separate from research products and medical care."
        primary={{ label: "Apply for Membership", href: "/research/apply" }}
        secondary={{ label: "See the Blueprint", href: "/research/blueprint" }}
        aside={<div><p className="mono-cap text-pulse">Directional range</p><p className="h3 mt-4">$299–$999</p><p className="body-s text-ink-2 mt-4">Program scope, duration, team, outcomes language, and final price require review. No program checkout is live.</p></div>}
      />

      <NoticeBar>
        Programs have independent value and remain separate from research products. They are human-led, educational, and non-clinical. They do not contain research materials or medical care.
      </NoticeBar>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Program architecture" title="One member objective, seen in context." body="Every program begins after the member has context. It should connect to the Blueprint instead of becoming another disconnected plan." />
        <NumberedJourney compact steps={[
          { title: "Blueprint", body: "Understand priorities, constraints, environment, schedule, and existing support." },
          { title: "Fit", body: "Choose a program only when its objective and operating model fit the member." },
          { title: "Practice", body: "Use education, human-led accountability, and realistic actions across the program." },
          { title: "Review", body: "Measure progress honestly and decide what the next Blueprint update should change." },
        ]} />
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Concept portfolio" title="Programs worth testing." body="These are product concepts, not current availability or outcome promises." />
        <div className="xr-program-grid">
          {PROGRAMS.map((program, index) => (
            <article key={program.title} className="xr-surface">
              <p className="mono-label text-pulse">Concept {String(index + 1).padStart(2, "0")}</p>
              <h2 className="h3 mt-4">{program.title}</h2>
              <p className="body-s text-ink-2 mt-4">{program.body}</p>
            </article>
          ))}
        </div>
      </section>

      {items.length > 0 && (
        <section className="container-x xr-section">
          <SectionLead eyebrow="Catalog records" title="Program profiles already in the private catalog." />
          <div className="mt-10"><ProductGrid products={items} /></div>
        </section>
      )}
    </>
  );
}
