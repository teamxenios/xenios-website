import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";
import {
  EARLY_ACCESS_FAQ_GROUPS, EARLY_ACCESS_FAQ_ITEMS, filterEarlyAccessFaq,
  type EarlyAccessFaqGroup, type EarlyAccessFaqItem,
} from "../faq/early-access-faq";
import { EvidenceProvenance } from "../quality/EvidenceProvenance";
import { formatQualityDate } from "../quality/content";
import "./public-editorial.css";

function FaqAccordionItem({ item, open, onToggle }: {
  item: EarlyAccessFaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  const buttonId = `faq-button-${item.id}`;
  const panelId = `faq-panel-${item.id}`;
  return <div className="card" style={{ padding: 0, minWidth: 0, overflowWrap: "anywhere" }}>
    <h3 className="h3" style={{ margin: 0 }}>
      <button type="button" id={buttonId} aria-expanded={open} aria-controls={panelId}
        onClick={onToggle} data-testid={`button-faq-${item.id}`}
        className="w-full flex items-center justify-between gap-4 text-left hover:text-pulse transition-colors"
        style={{ minHeight: 64, padding: "18px 24px", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
        <span style={{ minWidth: 0 }}>{item.question}</span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-ink-mute transition-transform"
          style={open ? { transform: "rotate(180deg)" } : undefined} />
      </button>
    </h3>
    {/* Keep aria-controls resolvable while hidden removes the collapsed panel
        and its links from layout, keyboard navigation and the accessibility tree. */}
    <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} style={{ padding: "0 24px 22px" }}>
      <p className="body-m text-ink-2 max-w-[68ch]">{item.answer}</p>
      <p className="body-m text-ink-2 max-w-[68ch] mt-4">{item.detail}</p>
      <p className="body-s text-ink-mute mt-4">
        {item.publishingState === "company_confirmed"
          ? `Company confirmation · ${formatQualityDate(item.reviewedAt)}`
          : `Operational guidance · Source checked ${formatQualityDate(item.sourceCheckedAt)}`}
      </p>
      <ul className="body-s mt-4" aria-label={`Sources for ${item.question}`}>
        {item.sources.map((source) => <li key={source.href}>
          <a href={source.href} referrerPolicy="no-referrer">{source.title}</a>
        </li>)}
      </ul>
      <div className="public-editorial-actions mt-5">
        <Link href={item.cta.href} className="btn btn-secondary public-editorial-action">{item.cta.label}</Link>
      </div>
    </div>
  </div>;
}

export default function Faq() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<EarlyAccessFaqGroup | "all">("all");
  const [openId, setOpenId] = useState<string | null>(EARLY_ACCESS_FAQ_ITEMS[0].id);
  const items = filterEarlyAccessFaq(query, group);
  return <>
    <SeoHead title="Early Access FAQ | Xenios"
      description="Find answers about Early Access requests, intake, product categories, company-confirmed sourcing, documentation, quotes and support."
      path="/research/faq" />
    <PageIntro eyebrow="Questions, answered plainly" title="Early Access questions"
      lead="Find the current steps, understand the limits of a request, and choose a useful next action." />
    <NoticeBar>
      Care and Research are separate. Clinical decisions belong to appropriately licensed clinicians. Research-designated materials remain nonclinical and are not for human or veterinary use.
    </NoticeBar>

    <section className="container-x section-y" aria-labelledby="faq-questions-title" style={{ minWidth: 0 }}>
      <h2 id="faq-questions-title" className="display-s">Find an answer</h2>
      <fieldset className="mt-6" style={{ minWidth: 0, border: 0, padding: 0 }}>
        <legend className="body-s mb-4">Search the questions or choose a topic.</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))", gap: 16, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <label className="body-s" htmlFor="faq-search">Search FAQs</label>
            <input id="faq-search" type="search" value={query} maxLength={160} autoComplete="off"
              aria-controls="faq-results" onChange={(event) => setQuery(event.target.value)}
              className="mt-2" style={{ width: "100%", minWidth: 0, minHeight: 44, padding: 12, font: "inherit" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label className="body-s" htmlFor="faq-category">Topic</label>
            <select id="faq-category" value={group} aria-controls="faq-results"
              onChange={(event) => setGroup(event.target.value as EarlyAccessFaqGroup | "all")}
              className="mt-2" style={{ width: "100%", minWidth: 0, minHeight: 44, padding: 12, font: "inherit" }}>
              <option value="all">All topics</option>
              {EARLY_ACCESS_FAQ_GROUPS.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-ghost public-editorial-action mt-4"
          onClick={() => { setQuery(""); setGroup("all"); }}>
          Clear search and topic
        </button>
      </fieldset>
      <p role="status" aria-live="polite" aria-atomic="true" className="body-s text-ink-mute mt-6">
        {items.length} {items.length === 1 ? "answer" : "answers"} found.
      </p>
      <div id="faq-results" className="mt-6" style={{ minWidth: 0 }}>
        {items.length === 0 && <p className="body-m">No answers match. Clear the search or choose another topic. Support can help with a specific question.</p>}
        {EARLY_ACCESS_FAQ_GROUPS.map((category) => {
          const matches = items.filter((item) => item.group === category.id);
          return matches.length === 0 ? null : <section key={category.id} aria-labelledby={`faq-group-${category.id}`} className="mb-10">
            <h2 id={`faq-group-${category.id}`} className="h3 mb-4">{category.label}</h2>
            <div className="grid grid-cols-1 gap-4 max-w-[900px]" style={{ minWidth: 0 }}>
              {matches.map((item) => <FaqAccordionItem key={item.id} item={item} open={openId === item.id}
                onToggle={() => setOpenId((current) => current === item.id ? null : item.id)} />)}
            </div>
          </section>;
        })}
      </div>
    </section>

    <div className="container-x section-y rule-top"><EvidenceProvenance id="faq-company-quality" /></div>
    <section className="container-x section-y rule-top">
      <div className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
        <div style={{ minWidth: 0 }}>
          <p className="mono-cap text-ink-mute mb-4">Need a specific answer?</p>
          <h2 className="display-s max-w-[20ch]">A person can help route the question.</h2>
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="body-l text-ink-2 max-w-[52ch]">
            Use Research Support for account, product-access, document or request questions. Use Care to ask about the separate provider-governed clinical path.
          </p>
          <div className="mt-8 public-editorial-actions">
            <Link href="/care/schedule" className="btn btn-primary public-editorial-action">Start Care request</Link>
            <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Explore Research</Link>
            <Link href="/research/support" className="btn btn-ghost public-editorial-action">Get support</Link>
          </div>
        </div>
      </div>
    </section>
  </>;
}
