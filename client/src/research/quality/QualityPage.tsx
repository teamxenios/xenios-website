import { AlertTriangle, CheckCircle2, FileSearch, PackageCheck } from "lucide-react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";
import { QUALITY_PROCESS } from "./content";
import { LotLookupForm } from "./LotLookupForm";
import { QualityNav } from "./QualityNav";
import "./quality.css";

const DECISIONS = [
  {
    icon: CheckCircle2,
    title: "Release",
    body: "Required evidence is present and the recorded review supports movement into released inventory for its authorized use.",
  },
  {
    icon: AlertTriangle,
    title: "Hold or quarantine",
    body: "Missing, inconsistent, damaged, or unresolved material stays out of released inventory while the exception is investigated.",
  },
  {
    icon: PackageCheck,
    title: "Trace through fulfillment",
    body: "The exact lot remains connected to storage, reservation, fulfillment, and any later withdrawal or exception record.",
  },
] as const;

export default function QualityPage() {
  return (
    <div className="quality-page">
      <SeoHead
        title="Quality system | Xenios Research"
        description="Learn how public lot records work and look up an exact approved record when one is available."
        path="/research/quality"
      />
      <PageIntro
        eyebrow="Quality"
        title="Look up the record for an exact lot."
        lead="Public results appear only when an exact approved lot record is available. An unavailable record is never presented as a passing result."
      />
      <NoticeBar>
        A public lookup is a limited record, not a promise that every product or lot has public documentation.
      </NoticeBar>

      <section className="container-x section-y" aria-labelledby="quality-process-title">
        <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-10 items-end mb-10">
          <div>
            <p className="mono-cap text-ink-mute mb-5">Lot control, end to end</p>
            <h2 className="display-s" id="quality-process-title">From receiving to a traceable decision.</h2>
          </div>
          <p className="body-l text-ink-2">
            These are distinct record types. This page does not claim that every product or lot has completed every step.
          </p>
        </div>
        <div className="quality-process">
          {QUALITY_PROCESS.map((step) => (
            <article key={step.title}>
              <h3 className="h3">{step.title}</h3>
              <p className="body-s text-ink-2 mt-3">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="quality-band" aria-labelledby="quality-decision-title">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-5">Decision integrity</p>
          <h2 className="display-s max-w-[18ch]" id="quality-decision-title">A missing record is a stop, not a shortcut.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            {DECISIONS.map(({ icon: Icon, title, body }) => (
              <article className="rule-top pt-6" key={title}>
                <Icon aria-hidden="true" size={20} style={{ color: "#c98a5c" }} />
                <h3 className="h3 mt-5">{title}</h3>
                <p className="body-s text-ink-mute mt-3">{body}</p>
              </article>
            ))}
          </div>
          <p className="body-m text-ink-mute rule-top mt-10 pt-6 max-w-[80ch]">
            When damage, a temperature excursion, a documentation gap, a complaint, or another deviation is recorded, the event stays attached to the exact lot’s exception trail. Investigation, disposition, and corrective or preventive action belong there when the event requires them.
          </p>
        </div>
      </section>

      <section className="container-x section-y" aria-labelledby="quality-verify-title">
        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-10">
          <div>
            <FileSearch aria-hidden="true" size={22} style={{ color: "var(--quality-copper)" }} />
            <p className="mono-cap text-ink-mute mt-5 mb-4">Public lot records</p>
            <h2 className="display-s" id="quality-verify-title">Start with the code on the label.</h2>
            <p className="body-m text-ink-2 mt-5">
              Verification returns only an exact, approved public match. It does not search approximately, expose a private source file, or treat a source outage as “not found.”
            </p>
          </div>
          <div className="card bg-paper-2">
            <LotLookupForm />
            <p className="body-s text-ink-mute mt-5">
              Need help with a record? <Link href="/research/support">Contact Support</Link>.
            </p>
          </div>
        </div>
      </section>

      <QualityNav current="/research/quality" />
    </div>
  );
}
