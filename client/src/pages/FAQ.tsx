import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { content } from "@/lib/content";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function FAQ() {
  const f = content.faq;
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <Navbar />
      <article className="container mx-auto px-6 lg:px-16 py-20 lg:py-28 max-w-3xl" data-testid="page-faq">
        <h1 className="font-display text-5xl lg:text-6xl text-ink leading-tight mb-6" data-testid="text-faq-title">{f.h1}</h1>
        <p className="text-mono-500 text-lg mb-14">{f.subhead}</p>

        <Accordion type="multiple" className="space-y-2">
          {f.items.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="border border-hairline rounded-xl bg-paper-elevated px-5 data-[state=open]:bg-paper-elevated"
              data-testid={`faq-item-${i}`}
            >
              <AccordionTrigger className="text-left font-display text-lg lg:text-xl text-ink hover:no-underline py-5">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-mono-500 text-[15px] leading-relaxed pb-5">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </article>
      <Footer />
    </div>
  );
}
