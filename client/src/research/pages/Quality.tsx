import { CheckCircle2, Microscope, PackageSearch, ShieldCheck } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";

const KNOW_CARDS = [
  {
    icon: PackageSearch,
    title: "Know the source",
    body: "Map API origin, manufacturing, fill and finish, packaging, warehousing, and fulfillment.",
  },
  {
    icon: Microscope,
    title: "Know the test",
    body: "Review the original report, method, sample, laboratory, accreditation, limits, and chain of custody.",
  },
  {
    icon: ShieldCheck,
    title: "Know the release",
    body: "Do not sell a lot until legal, quality, processor, insurance, claims, buyer, and state gates are complete.",
  },
];

const STANDARDS = [
  { title: "Identity", body: "Does the tested material match the exact compound, sequence, salt, or molecular form represented?" },
  { title: "Purity", body: "What proportion of the detected material is the target compound, and what impurities remain?" },
  { title: "Assay", body: "How much active material is actually present relative to the label or specification?" },
  { title: "Sterility and endotoxin", body: "When a sterile or microbiological claim is made, what method, sample, specification, and result support it?" },
  { title: "Stability", body: "What data supports storage conditions, retest date, shelf life, and temperature excursions?" },
  { title: "Chain of custody", body: "Can the lot be traced from source through manufacture, testing, release, fulfillment, and customer?" },
];

export default function Quality() {
  return (
    <>
      <SeoHead
        title="Quality, xenios research"
        description="Quality language is not decoration. Every origin, facility, purity, sterility, certification, testing, and manufacturing claim needs exact documentary support."
        path="/research/quality"
      />
      <PageIntro
        eyebrow="The xenios standard"
        title="A label should be backed by a file."
        lead="Quality language is not decoration. Every origin, facility, purity, sterility, certification, testing, and manufacturing claim needs exact documentary support."
      />
      <NoticeBar>
        A certificate of analysis or a purity result does not establish sterility, potency, safety, or human suitability. Research materials are never for human or veterinary use.
      </NoticeBar>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">Before a product lists</p>
        <h2 className="display-s max-w-[22ch]">Three things we insist on knowing.</h2>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {KNOW_CARDS.map(({ icon: Icon, title, body }) => (
            <div className="card" key={title}>
              <Icon size={22} aria-hidden="true" className="text-pulse" />
              <h3 className="h3 mt-5 mb-3">{title}</h3>
              <p className="body-s text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <p className="mono-cap text-ink-mute mb-5">Six questions</p>
            <h2 className="display-s max-w-[20ch]">What the customer should be able to understand.</h2>
          </div>
          <p className="body-m text-ink-mute max-w-[46ch]">
            Each question maps to documentary evidence a batch must carry. A result that answers one question does not answer the others.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STANDARDS.map((item) => (
            <div className="card" key={item.title}>
              <CheckCircle2 size={18} aria-hidden="true" className="text-pulse" />
              <h3 className="h3 mt-4 mb-3">{item.title}</h3>
              <p className="body-s text-ink-2">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
