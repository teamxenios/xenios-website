import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";
import "./public-editorial.css";

type FaqItem = { question: string; answer: string };

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What's the difference between Care and research products?",
    answer: "Care is a separate health pathway. Research products are sold for research use only, with no clinical review. Ordering research products doesn't give you access to Care.",
  },
  {
    question: "What does it cost to start Care?",
    answer: "Submitting a Care request is free. Care availability depends on your state. We confirm it after your request.",
  },
  {
    question: "How do research orders work?",
    answer: "Request an order for the exact product and size. We confirm availability and email payment details. We verify payment by hand, then email tracking when the order ships.",
  },
  {
    question: "When do I pay?",
    answer: "After we confirm your order, we email payment details. No payment is taken when you submit the order request.",
  },
  {
    question: "What happens after I submit something?",
    answer: "You'll see a reference number when the request is accepted. We email a copy only when email delivery succeeds. Keep the reference for questions about what you submitted.",
  },
  {
    question: "Can my practice order for me?",
    answer: "No. You create and own your account, submit your own order, and accept the research-use terms yourself. Your practice can refer you.",
  },
  {
    question: "What can a practice see?",
    answer: "Approved practices may see referral counts, credited orders, commission entries, and payout information when the program is active. Client-level details require explicit consent. Care information is never shared without written authorization and the required legal authority.",
  },
  {
    question: "Do research products include dosing instructions?",
    answer: "No. Xenios doesn't provide dosing, reconstitution, administration, injection, cycling, stacking, or personal-use guidance for research products.",
  },
  {
    question: "Where do I sign in?",
    answer: "Use Sign In for an existing account. If Xenios approved an account for you but you haven't set it up, use the activation link in your email first.",
  },
];

function FaqAccordionItem({ item, index, open, onToggle }: { item: FaqItem; index: number; open: boolean; onToggle: () => void }) {
  const buttonId = `faq-button-${index}`;
  const panelId = `faq-panel-${index}`;
  return (
    <div className="card" style={{ padding: 0 }}>
      <h2 className="h3" style={{ margin: 0 }}>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 text-left hover:text-pulse transition-colors"
          style={{ minHeight: 64, padding: "18px 24px", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
          data-testid={`button-faq-${index}`}
        >
          <span style={{ minWidth: 0 }}>{item.question}</span>
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-ink-mute transition-transform" style={open ? { transform: "rotate(180deg)" } : undefined} />
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} style={{ padding: "0 24px 22px" }}>
        <p className="body-m text-ink-2 max-w-[68ch]">{item.answer}</p>
      </div>
    </div>
  );
}

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <>
      <SeoHead title="Frequently asked questions | Xenios" description="Straight answers about Care, research products, orders, practices, accounts, and support." path="/research/faq" />
      <PageIntro eyebrow="FAQ" title="Straight answers" lead="Care, research products, practices, and accounts stay clearly separated." />
      <NoticeBar>Research products are for legitimate nonclinical research only and are not for human or veterinary use.</NoticeBar>
      <section className="container-x section-y">
        <div className="grid grid-cols-1 gap-4 max-w-[900px]" style={{ minWidth: 0 }}>
          {FAQ_ITEMS.map((item, index) => (
            <FaqAccordionItem key={item.question} item={item} index={index} open={openIndex === index} onToggle={() => setOpenIndex((current) => current === index ? null : index)} />
          ))}
        </div>
      </section>
      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2">
          <p className="mono-cap text-ink-mute mb-4">Need help?</p>
          <h2 className="display-s max-w-[20ch]">Choose the right next step.</h2>
          <div className="mt-8 public-editorial-actions">
            <Link href="/care/schedule" className="btn btn-primary public-editorial-action">Start Care</Link>
            <Link href="/products" className="btn btn-secondary public-editorial-action">Explore Products</Link>
            <Link href="/research/support" className="btn btn-ghost public-editorial-action">Contact Support</Link>
          </div>
        </div>
      </section>
    </>
  );
}
