import Section from "./Section";
import Accordion from "./Accordion";
import { content } from "@/lib/content";

export default function FAQSection() {
  return (
    <Section id="faq" className="py-24">
      <div className="flex flex-col md:flex-row gap-16">
        <div className="md:w-1/3">
           <h2 className="text-4xl font-display font-medium tracking-tight mb-6">
            {content.faq.headline}
          </h2>
          <p className="text-muted-foreground mb-8">
            {content.faq.description}
          </p>
          <a href={`mailto:${content.contact.email}`} className="inline-block border-b border-primary pb-1 hover:opacity-50 transition-opacity">
            Contact Support
          </a>
        </div>
        <div className="md:w-2/3">
          <Accordion items={content.faq.items} />
        </div>
      </div>
    </Section>
  );
}
