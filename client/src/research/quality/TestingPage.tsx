import { Braces, CircleHelp, Microscope, ScanSearch } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";
import { TESTING_CATEGORIES } from "./content";
import { QualityNav } from "./QualityNav";
import "./quality.css";

const READING_CHECKS = [
  ["Exact sample", "Does the report identify the same SKU, material, and lot as the label—not merely a similar name?"],
  ["Method and scope", "What method was used, what was measured, and which questions remain outside that method?"],
  ["Dates and custody", "When was the sample collected, received, tested, issued, and reviewed, and who controlled it along the way?"],
  ["Specification", "Is there a stated acceptance criterion, unit, and result, with qualifiers and exceptions preserved?"],
  ["Issuing record", "Is the original approved report available, and does it identify the issuing laboratory or qualified party?"],
  ["Currentness", "Has the record been replaced, withdrawn, or superseded by a newer approved document?"],
] as const;

export default function TestingPage() {
  return (
    <div className="quality-page">
      <SeoHead
        title="Testing explained | Xenios Research"
        description="Understand identity, purity, assay, microbial, contaminant, and stability evidence—and the limits of every result."
        path="/research/testing"
      />
      <PageIntro
        eyebrow="Testing explained"
        title="One result answers one defined question."
        lead="Testing is useful when the sample, method, scope, specification, dates, and issuing record are clear. A strong number without that context is not a complete quality conclusion."
      />
      <NoticeBar>
        Third-party testing is used where applicable to the material and control plan. Xenios does not claim that every test category applies to every lot, or that any laboratory result establishes safety or human suitability.
      </NoticeBar>

      <section className="container-x section-y" aria-labelledby="testing-categories-title">
        <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-10 items-end mb-10">
          <div>
            <Microscope aria-hidden="true" size={22} style={{ color: "var(--quality-copper)" }} />
            <p className="mono-cap text-ink-mute mt-5 mb-4">Different questions</p>
            <h2 className="display-s" id="testing-categories-title">Do not let one test impersonate another.</h2>
          </div>
          <p className="body-l text-ink-2">
            The applicable panel depends on the material, its risks, the specification, and the documented control plan.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TESTING_CATEGORIES.map((item, index) => (
            <article className="card" key={item.title}>
              <span className="mono-label" style={{ color: "var(--quality-copper)" }}>0{index + 1}</span>
              <h3 className="h3 mt-8">{item.title}</h3>
              <p className="body-s text-ink-2 mt-3">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="quality-band" aria-labelledby="reading-record-title">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-[0.7fr_1.3fr] gap-12">
            <div>
              <ScanSearch aria-hidden="true" size={22} style={{ color: "#c98a5c" }} />
              <p className="mono-cap text-ink-mute mt-5 mb-4">Reading a record</p>
              <h2 className="display-s" id="reading-record-title">The context belongs beside the result.</h2>
            </div>
            <dl className="space-y-0">
              {READING_CHECKS.map(([term, description]) => (
                <div className="rule-top py-6 grid grid-cols-1 sm:grid-cols-[0.45fr_1.55fr] gap-3" key={term}>
                  <dt className="font-700">{term}</dt>
                  <dd className="body-s text-ink-mute m-0">{description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="container-x section-y" aria-labelledby="testing-limits-title">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <CircleHelp aria-hidden="true" size={22} style={{ color: "var(--quality-copper)" }} />
            <h2 className="h3 mt-5" id="testing-limits-title">What a COA is not.</h2>
          </div>
          <div className="card md:col-span-2">
            <Braces aria-hidden="true" size={20} className="text-ink-mute" />
            <p className="body-l mt-5">
              A COA is not a universal guarantee. It is a controlled record of identified tests, methods, specifications, and results for a stated sample or lot.
            </p>
            <p className="body-s text-ink-2 mt-4">
              It does not replace chain of custody, receiving inspection, release authority, storage controls, traceability, or exception handling. It also does not provide dosing or personal-use guidance.
            </p>
          </div>
        </div>
      </section>

      <QualityNav current="/research/testing" />
    </div>
  );
}
