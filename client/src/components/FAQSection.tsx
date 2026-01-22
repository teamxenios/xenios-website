import Section from "./Section";
import Accordion from "./Accordion";

const FAQS = [
  { question: "What devices are compatible?", answer: "We support Oura, Whoop, Apple Watch, Garmin, and most major continuous glucose monitors (CGMs)." },
  { question: "Is my health data private?", answer: "Your data is encrypted end-to-end and stored in HIPAA-compliant vaults. We never sell your data to third parties." },
  { question: "Do I need a doctor's prescription?", answer: "No. Our platform is a wellness tool. However, we can generate reports to share with your healthcare provider." },
  { question: "How accurate are the biomarkers?", answer: "We only ingest data from clinically validated sensors. Our algorithms filter out noise to provide high-confidence metrics." },
  { question: "Can I use this for my family?", answer: "Yes, we offer family plans that allow you to manage multiple profiles under one billing account." },
  { question: "What is the battery impact on my phone?", answer: "Minimal. We use background fetch technologies that are optimized for efficiency." },
  { question: "Is there a contract?", answer: "No. You can cancel your subscription at any time with no penalties." },
  { question: "Do you offer coaching?", answer: "Yes, the Pro plan includes monthly sessions with a certified metabolic health coach." },
  { question: "Does it work with Android?", answer: "Yes, our Android app is fully featured and supports Google Fit integration." },
  { question: "How do I interpret the recovery score?", answer: "The recovery score aggregates HRV, sleep, and resting heart rate to give you a daily capacity percentage." }
];

export default function FAQSection() {
  return (
    <Section id="faq" className="py-24">
      <div className="flex flex-col md:flex-row gap-16">
        <div className="md:w-1/3">
           <h2 className="text-4xl font-display font-medium tracking-tight mb-6">
            Frequently <br /> Asked.
          </h2>
          <p className="text-muted-foreground mb-8">
            Can't find the answer you're looking for? Reach out to our support team.
          </p>
          <a href="mailto:support@mono.inc" className="inline-block border-b border-primary pb-1 hover:opacity-50 transition-opacity">
            Contact Support
          </a>
        </div>
        <div className="md:w-2/3">
          <Accordion items={FAQS} />
        </div>
      </div>
    </Section>
  );
}
