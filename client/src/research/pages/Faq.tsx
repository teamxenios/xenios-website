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
    question: "What is Xenios?",
    answer:
      "Xenios is a U.S.-based health-access and product platform with two separate pathways. Xenios Care supports personal health through secure intake and independent review by U.S.-licensed clinicians. Xenios Research supports legitimate nonclinical work through exact product identity, evidence-aware education, quality documentation, controlled access, and Research operations.",
  },
  {
    question: "How does Xenios Care work?",
    answer:
      "Create or access your secure account, confirm your current location, and complete the health questionnaire. A U.S.-licensed clinician independently reviews the information and may request follow-up questions, records, laboratory work, or a phone or video visit. When treatment is clinically appropriate and serviceable, a prescription may be sent to a U.S.-based, state-licensed compounding pharmacy for fulfillment.",
  },
  {
    question: "Who reviews my health questionnaire?",
    answer:
      "An appropriately licensed clinician reviews the clinical information. Depending on the patient location, service, and clinical organization, that may be a physician, nurse practitioner, or physician assistant. Commercial staff, affiliates, trainers, and the software do not make the clinical decision.",
  },
  {
    question: "Does completing the intake guarantee a prescription?",
    answer:
      "No. Completing the intake creates information for clinical review. A clinician may approve an appropriate treatment, request more information, request records or labs, require a live visit, recommend another approach, decline the request, or refer the person elsewhere. No product, formulation, custom blend, or prescription is guaranteed.",
  },
  {
    question: "Is a video visit always required?",
    answer:
      "Not necessarily. Review may begin asynchronously. The clinician determines whether additional questions, records, laboratory work, a phone call, or a video visit is required based on clinical judgment, patient location, service rules, and applicable requirements.",
  },
  {
    question: "Is Xenios Care available nationwide?",
    answer:
      "Xenios Care is available nationwide. Exact services, formulations, clinician availability, and pharmacy fulfillment depend on the patient's current location, clinical eligibility, clinician authority, pharmacy serviceability, and current availability.",
  },
  {
    question: "How do compounding pharmacies fit into the process?",
    answer:
      "When a licensed clinician issues an appropriate prescription, a U.S.-based, state-licensed compounding pharmacy reviews the prescription and its ability to serve the patient and formulation. The pharmacy owns compounding or dispensing, prescription labeling, medication-specific quality controls, and shipment. Xenios supports the surrounding account, navigation, status, tracking, lifestyle, and customer-service experience.",
  },
  {
    question: "Is Xenios a pharmacy, and are compounded medications FDA-approved?",
    answer:
      "Xenios is not the dispensing pharmacy. Compounded medications are prepared by state-licensed compounding pharmacies when permitted and prescribed. Compounded drugs are not FDA-approved, and an FDA-approved use for an active ingredient does not make every compounded formulation, source, concentration, or use FDA-approved.",
  },
  {
    question: "Is every product available to every Care client?",
    answer:
      "No. Xenios Care supports a broad, clinician-governed formulary, but the exact option depends on the patient's location, history, goals, contraindications, clinical assessment, the pharmacy's formulary, ingredient eligibility, and current availability. A catalog listing or price never establishes clinical suitability.",
  },
  {
    question: "Can a custom formulation or custom blend be requested?",
    answer:
      "A custom formulation may be requested for clinician and pharmacy consideration. It is not guaranteed. A licensed clinician and the dispensing pharmacy must independently determine that the exact formulation is clinically appropriate, legally available, supportable, and serviceable for the patient.",
  },
  {
    question: "What is the First-Month Foundations Plan?",
    answer:
      "Eligible Xenios Care clients receive a personalized first-month nutrition, fitness, sleep, and recovery plan at no additional charge. A CSCS professional may provide training structure, exercise options, meal planning, grocery lists, recipes, location-aware restaurant guidance, travel adaptations, and one email check-in each week. The plan is nonclinical and does not replace medical care.",
  },
  {
    question: "What happens after the first month of lifestyle support?",
    answer:
      "The included first month ends after its initial four-week period. Eligible clients may choose optional continuation for $30 per month. Continuation is not automatic and should not begin without the client's clear choice and the applicable terms.",
  },
  {
    question: "What is Xenios Research?",
    answer:
      "Xenios Research is the separate nonclinical pathway for legitimate research materials and Research operations. It brings exact product and variant identity, evidence level, current status, available quality documentation, authorized requests or orders, fulfillment facts, account history, and Research support into one experience.",
  },
  {
    question: "What does Research use only mean?",
    answer:
      "Research-designated materials are for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not for human or veterinary use. Xenios Research does not provide dosing, reconstitution, administration, injection, protocol, cycling, stacking, or personal-use guidance.",
  },
  {
    question: "Why do product pages say people commonly discuss a compound for certain goals?",
    answer:
      "That section explains why the compound receives public, community, practitioner, or market interest. It may summarize commonly discussed goals such as healing, recovery, metabolism, skin, sleep, or focus. Those discussions and anecdotes are not proof of safety, effectiveness, or suitability. The page separately labels laboratory, animal, human, established, limited, and uncertain evidence.",
  },
  {
    question: "What does a certificate of analysis prove?",
    answer:
      "A COA may report information about the tested sample, such as identity, purity, quantity, method, laboratory, date, or other applicable results. It does not by itself prove clinical safety, effectiveness, sterility, stability, suitability for a particular person, or that every unit and contaminant class were tested. The exact item, lot, source, and report must match.",
  },
  {
    question: "How are pricing and availability shown?",
    answer:
      "Research pricing and availability come from the current server-authoritative product and price records. Clinical pricing may depend on the prescribed quantity, formulation, pharmacy, consultation, labs, shipping, state, and program structure, so it is shown only when the applicable source can support an exact amount or a clear pricing rule. Missing price is never shown as zero.",
  },
  {
    question: "How do I get help?",
    answer:
      "Use Xenios Care or the authorized provider workflow for clinical questions, symptoms, side effects, records, prescribing, or follow-up. Use Xenios Research Support for Research access, products, documents, orders, organizations, or operational questions. For a medical emergency, call 911 in the United States or contact local emergency services.",
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
        title="Frequently asked questions | Xenios Care + Research"
        description="Plain answers about the Xenios Care journey, pharmacy role, lifestyle support, Research boundaries, evidence, pricing, quality documents, and support."
        path="/research/faq"
      />
      <PageIntro
        eyebrow="Questions, answered plainly"
        title="Questions about Xenios Care + Research"
        lead="Understand the clinical journey, pharmacy role, lifestyle support, Research boundary, evidence labels, pricing, quality documents, and the next responsible step."
      />
      <NoticeBar>
        Care and Research are separate. Clinical decisions belong to appropriately licensed clinicians. Research-designated materials remain nonclinical and are not for human or veterinary use.
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
              <Link href="/care" className="btn btn-primary public-editorial-action">Begin clinical intake</Link>
              <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Explore Research</Link>
              <Link href="/research/support" className="btn btn-ghost public-editorial-action">Get support</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
