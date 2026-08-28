import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";
import "./public-editorial.css";

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Xenios Research?",
    answer:
      "Xenios Research is a product-access and operating platform for legitimate nonclinical research. It brings exact product identity, current access state, available documentation, requests, orders, fulfillment, documents, and support into one coherent customer experience.",
  },
  {
    question: "What does research use only mean?",
    answer:
      "Research-designated materials are for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not for human or veterinary use, and Xenios Research does not provide dosing, reconstitution, administration, injection, protocol, cycling, stacking, or personal-use guidance.",
  },
  {
    question: "How is Research different from Care?",
    answer:
      "Research handles nonclinical research materials and their operational lifecycle. Where configured and legally available, Care is a separate provider-governed pathway for scheduling, independent clinical review, protected clinical records, prescribing where appropriate, and pharmacy coordination. A Research action never establishes a Care decision.",
  },
  {
    question: "Does membership guarantee access to a product?",
    answer:
      "No. Membership or account access does not guarantee that an exact product or variant is available, orderable, or supported by a specific document. Research does not establish clinical appropriateness; that belongs exclusively to authorized provider review in the separate Care pathway. Every offering keeps its own current status and authorized next action.",
  },
  {
    question: "What do product status labels mean?",
    answer:
      "An offering may be live for an authorized action, request-only, provider-required, documentation-pending, held, unavailable, or unknown. Status controls the next action. A visible listing or price never creates purchase permission by itself.",
  },
  {
    question: "Does a submitted request become an order immediately?",
    answer:
      "Not necessarily. A request records what you asked Xenios to review. It becomes an order only through the authorized conversion path. Confirmation pages and account history keep requests, orders, payment, and fulfillment separate.",
  },
  {
    question: "How are payment and refunds shown?",
    answer:
      "Payment and refund status depends on durable amount-due, captured, and refunded evidence. Missing, incomplete, or contradictory evidence must remain unknown or unavailable rather than being presented as paid, zero-refund, or complete.",
  },
  {
    question: "How are shipping and tracking shown?",
    answer:
      "Shipped and delivered require different evidence. Tracking may appear only when an available authoritative source provides it. If that source is unavailable, the safe state withholds a carrier, tracking link, delivery event, and definitive zero-history result.",
  },
  {
    question: "What quality documents may be available?",
    answer:
      "An exact offering or lot may have approved specifications, COAs, or testing documentation. Availability varies by item and lot. Documents are shown only when the applicable source, access rules, and current approval support them.",
  },
  {
    question: "Does every item receive every type of testing?",
    answer:
      "No. Identity, purity, assay, sterility, endotoxin, microbial, heavy-metal, residual-solvent, or other testing may apply in different circumstances. Xenios describes only the testing actually associated with the exact offering or lot.",
  },
  {
    question: "How does Care scheduling work?",
    answer:
      "When a Care scheduling route is actually configured, the authorized provider system remains authoritative for schedules and appointments. An unavailable configuration stays unavailable, and scheduling does not guarantee treatment or a prescription.",
  },
  {
    question: "Where are clinical messages and records managed?",
    answer:
      "Protected clinical messages, health information, lab results, clinical documents, and provider-side statements remain in the authorized provider or patient-portal workflow that is actually supplied. Xenios does not recreate an electronic health record inside the Research account.",
  },
  {
    question: "What is Private Early Access?",
    answer:
      "Private Early Access is a separate passwordless request and ordering experience with an open entry route. Opening it does not establish approval for any later action or guarantee product availability, a completed order, payment, shipment, or a Care decision.",
  },
  {
    question: "Where can I review membership and billing?",
    answer:
      "Signed-in customers review access, billing, and renewal information in the account experience. Unknown renewal evidence stays unknown or unavailable; Xenios shows “Not scheduled” only when a durable source explicitly proves that state.",
  },
  {
    question: "How do organizations and professional buyers begin?",
    answer:
      "Organizations begin through the organization or business-support pathway with context, eligibility, and human review. An inquiry does not automatically create an account, approve commercial terms, or authorize any specific product.",
  },
  {
    question: "How do affiliates and partners work with Xenios?",
    answer:
      "Potential affiliates, clinics, providers, suppliers, and strategic partners use the applicable partner pathway. Approval, attribution, allowed claims, commission status, and resources remain governed. No partner can influence prescribing or clinical decisions.",
  },
  {
    question: "How is my information protected?",
    answer:
      "Access to private account and document data depends on server-authorized identity and scope. Review the public Privacy Policy for the currently served language and its publication status. Avoid placing passwords, tokens, clinical details, or unnecessary private information in public URLs or messages.",
  },
  {
    question: "How do I get help?",
    answer:
      "Use Research Support for account access, requests, orders, documents, organization inquiries, or operational questions. Support does not provide clinical advice; clinical questions stay with the authorized Care or provider workflow.",
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
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="shrink-0 text-ink-mute transition-transform"
            style={open ? { transform: "rotate(180deg)" } : undefined}
          />
        </button>
      </h2>
      {/*
        The panel stays in the DOM while collapsed so the trigger's
        aria-controls always resolves to an element; `hidden` removes it from
        layout and the accessibility tree until the trigger expands it.
      */}
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
      <SeoHead
        title="Frequently asked questions | Xenios Research"
        description="Plain answers about Research use, product status, orders, payment, fulfillment, quality documents, Care, scheduling, accounts, organizations, and support."
        path="/research/faq"
      />
      <PageIntro
        eyebrow="Questions, answered plainly"
        title="Understand the boundary before you continue."
        lead="Research access, Care, product status, documentation, requests, orders, billing, fulfillment, and support each mean something different."
      />
      <NoticeBar>
        Research-designated materials are for legitimate nonclinical research only, never for human or veterinary use. Clinical decisions belong to appropriately licensed providers.
      </NoticeBar>

      <section className="container-x section-y">
        <div className="grid grid-cols-1 gap-4 max-w-[900px]" style={{ minWidth: 0 }}>
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
            <p className="mono-cap text-ink-mute mb-4">Need a specific answer?</p>
            <h2 className="display-s max-w-[20ch]">A person can help route the question.</h2>
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="body-l text-ink-2 max-w-[52ch]">
              Use Research Support for account, product-access, document, order, or organization questions. Use Care for provider-governed clinical questions.
            </p>
            <div className="mt-8 public-editorial-actions">
              <Link href="/research/support" className="btn btn-primary public-editorial-action">Open Research Support</Link>
              <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Compare access paths</Link>
              <Link href="/care" className="btn btn-ghost public-editorial-action">Understand Care</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
