import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is xenios research?",
    answer:
      "xenios research is a membership-based platform for research materials, the Quantum research category, supplements, and human-led programs. Research products are provided for legitimate nonclinical research only, and access to them runs through an application and review process rather than an open storefront.",
  },
  {
    question: "What does the $50 fee cover?",
    answer:
      "The $50 fee is a one-time membership fee, charged only after your application is approved. It covers the human review of your application and the preparation of your Whole-Life Blueprint, the educational document built from the information you share.",
  },
  {
    question: "Is the application free?",
    answer:
      "Yes. Submitting an application costs nothing. You are only asked to pay the one-time $50 membership fee after your application has been reviewed and approved. If you are not approved, you pay nothing.",
  },
  {
    question: "Is the fee recurring?",
    answer:
      "No. The $50 fee is charged once, after approval. There is no subscription, no renewal, and no recurring charge attached to membership.",
  },
  {
    question: "Does approval guarantee product access?",
    answer:
      "No. Approval makes you a member, but access to research products is reviewed separately and is never guaranteed. Individual products may require additional review, may be restricted to professional accounts, or may be unavailable while documentation is under review.",
  },
  {
    question: "How is my information used?",
    answer:
      "The information you provide is used for two purposes only: reviewing your application and preparing your Whole-Life Blueprint. It is never sold. You can update it at any time, and you can ask for your account to be closed by contacting support.",
  },
  {
    question: "What is the Whole-Life Blueprint?",
    answer:
      "The Whole-Life Blueprint is an educational document prepared for each approved member. It is built from the information you share in your application and reviewed by a human before it reaches you. It is meant to organize and educate, not to diagnose or prescribe.",
  },
  {
    question: "Is the Blueprint medical advice?",
    answer:
      "No. The Blueprint is educational material, reviewed by a human, and it is not medical advice. It does not diagnose, treat, or prescribe, and it is not a substitute for a relationship with a licensed clinician.",
  },
  {
    question: "Can I update my information?",
    answer:
      "Yes. Members can update their information at any time from their account, or by contacting support. Keeping your information current helps the review process and keeps your Blueprint accurate.",
  },
  {
    question: "Can I cancel or delete my account?",
    answer:
      "Yes. You can close your account at any time by contacting support. Because the membership fee is one-time rather than recurring, there is no subscription to cancel.",
  },
  {
    question: "What are research products?",
    answer:
      "Research products are materials provided for legitimate nonclinical research only. They are never for human or veterinary use, and xenios provides no personal-use guidance of any kind. Each listing presents specifications, evidence context, and batch documentation for research purposes.",
  },
  {
    question: "What is Quantum?",
    answer:
      "Quantum is a standalone research category within the platform, currently under documentation review. It has its own page and its own research access path, separate from peptides, supplements, and programs.",
  },
  {
    question: "How does xenios evaluate evidence?",
    answer:
      "Every claim is classified by the kind of evidence behind it: human evidence, early evidence, preclinical research, manufacturer-reported data, or unverified. Listings keep these distinctions visible so a research profile never blurs the line between what is established and what is not.",
  },
  {
    question: "How are quality documents handled?",
    answer:
      "Quality documents are batch-specific. Identity, purity, assay, and other required documentation are reviewed for each batch before a product goes live. Nothing is published as verified until it has passed that review.",
  },
  {
    question: "How do professionals apply?",
    answer:
      "Professionals apply through the same application as everyone else, marked as a professional application. The review considers the professional context you provide, and professional accounts may receive access appropriate to that context.",
  },
  {
    question: "How does wholesale review work?",
    answer:
      "Wholesale interest goes through the same application, marked as a professional application. The review covers your organization and intended research context, and wholesale terms are discussed only after approval. Approval does not guarantee access to any specific product.",
  },
];

function FaqAccordionItem({
  item,
  index,
  open,
  onToggle,
}: {
  item: FaqItem;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const buttonId = `faq-button-${index}`;
  const panelId = `faq-panel-${index}`;
  return (
    <div className="card" style={{ padding: 0 }}>
      <h3 className="h3" style={{ margin: 0 }}>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 text-left hover:text-pulse transition-colors"
          style={{ padding: "20px 24px", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
          data-testid={`button-faq-${index}`}
        >
          <span style={{ minWidth: 0 }}>{item.question}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="shrink-0 text-ink-mute transition-transform"
            style={open ? { transform: "rotate(180deg)" } : undefined}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={buttonId} style={{ padding: "0 24px 22px" }}>
          <p className="body-m text-ink-2 max-w-[68ch]">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <>
      <SeoHead
        title="Frequently asked questions, xenios research"
        description="Clear answers about membership, the one-time fee, the Whole-Life Blueprint, research products, Quantum, evidence classification, quality documents, and professional applications."
        path="/research/faq"
      />
      <PageIntro
        eyebrow="Questions, answered plainly"
        title="Frequently asked questions."
        lead="Membership, the application, the Blueprint, research products, and how review actually works. If something is not covered here, contact support and a person will answer."
      />
      <NoticeBar>
        Research products are for legitimate nonclinical research only, never for human or veterinary use. The Whole-Life Blueprint is educational and is not medical advice.
      </NoticeBar>

      <section className="container-x section-y">
        <div className="grid grid-cols-1 gap-4 max-w-[860px]" style={{ minWidth: 0 }}>
          {FAQ_ITEMS.map((item, index) => (
            <FaqAccordionItem
              key={item.question}
              item={item}
              index={index}
              open={openIndex === index}
              onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
            />
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
          <div style={{ minWidth: 0 }}>
            <p className="mono-cap text-ink-mute mb-4">Still deciding</p>
            <h2 className="display-s max-w-[20ch]">Apply when you are ready.</h2>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="body-l text-ink-2 max-w-[52ch]">
              The application is free, the review is human, and the one-time fee applies only after approval. Read how membership works, or start the application now.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-4">
              <Link href="/research/apply" className="btn btn-primary">Apply for Membership</Link>
              <Link href="/research/membership" className="btn btn-secondary">How membership works</Link>
              <Link href="/research/quality" className="btn btn-ghost">Quality standards</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
