import { useId, useState } from "react";
import {
  EARLY_ACCESS_CATEGORY_FAMILY, type EarlyAccessCatalogCategory,
} from "../../../../shared/research/assisted-order/catalog-category";
import {
  GUIDE_AUDIENCES, GUIDE_INTERESTS, GUIDE_NEXT, GUIDE_STYLES, GUIDE_TOPICS,
  catalogGuideResult, type GuideAnswers, type GuideCard,
} from "../../../../shared/research/assisted-order/catalog-guide";
import { EARLY_ACCESS_FAQ_GROUPS } from "../faq/early-access-faq";
import { catalogPresentationLabel } from "../master-offerings/catalog-presentation-labels";
import { MASTER_OFFERING_FAMILY_LABELS, type MasterOfferingFamily } from "../../../../shared/research/master-offerings/contract";

/**
 * Optional "help me find a starting point" panel beside the full catalog.
 * Answers stay in this component's state. It never writes a URL, storage,
 * analytics or the request, and never selects an item: the only effect it can
 * have on the catalog is onApplyView, the same view change the family control
 * and the topical view already make.
 */
const AUDIENCE_LABEL: Readonly<Record<typeof GUIDE_AUDIENCES[number], string>> = {
  self: "For myself", organization: "For an organization", browsing: "Just browsing",
};
const INTEREST_LABEL: Readonly<Record<typeof GUIDE_INTERESTS[number], string>> = {
  clinical: "Clinical options", supplements: "Supplements", topicals: "Skincare and topicals",
  laboratory: "Laboratory research", unsure: "Not sure",
};
const TOPIC_LABEL: Readonly<Record<typeof GUIDE_TOPICS[number], string>> = {
  "product-basics": "Product basics", quality: "Quality and sourcing", handling: "Storage and handling",
  "quotes-payment": "Quotes and payment", availability: "Availability", "delivery-refunds": "Delivery and refunds",
};
const STYLE_LABEL: Readonly<Record<typeof GUIDE_STYLES[number], string>> = {
  read: "Reading the details", explore: "Exploring categories", talk: "Speaking with the team",
};
const NEXT_LABEL: Readonly<Record<typeof GUIDE_NEXT[number], string>> = {
  suggestions: "Suggested categories", full_catalog: "The full catalog", help: "Help from the team",
};
// Family views use the same labels the family control shows. Topicals is a view, not a family.
const familyLabel = (family: MasterOfferingFamily) => catalogPresentationLabel(family, MASTER_OFFERING_FAMILY_LABELS[family]);
const CATEGORY_LABEL: Readonly<Record<EarlyAccessCatalogCategory, string>> = {
  clinical: familyLabel(EARLY_ACCESS_CATEGORY_FAMILY.clinical),
  research_peptides: familyLabel(EARLY_ACCESS_CATEGORY_FAMILY.research_peptides),
  supplements: familyLabel(EARLY_ACCESS_CATEGORY_FAMILY.supplements),
  topicals: "Topical products",
};
// FAQ card headings are the FAQ's own section names, so they cannot drift from the page.
const FAQ_LABEL: Readonly<Record<string, string>> = Object.fromEntries(EARLY_ACCESS_FAQ_GROUPS.map((group) => [group.id, group.label]));

function cardIsShown(card: GuideCard, availableFamilies: readonly string[]): boolean {
  if (card.kind !== "category" || card.category === "topicals") return true;
  return availableFamilies.includes(EARLY_ACCESS_CATEGORY_FAMILY[card.category]);
}

export function CatalogStartingPointGuide({ availableFamilies, onApplyView, onBrowseAll }: Readonly<{
  availableFamilies: readonly string[];
  onApplyView: (category: EarlyAccessCatalogCategory | null) => void;
  onBrowseAll: () => void;
}>) {
  const headingId = useId();
  const resultsHeadingId = useId();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<GuideAnswers>({});
  const [shown, setShown] = useState(false);
  // The view this guide last applied, so the customer can clear it from here too.
  const [applied, setApplied] = useState<EarlyAccessCatalogCategory | null>(null);

  const close = () => { setOpen(false); setShown(false); };
  const browseAll = () => { close(); setApplied(null); onApplyView(null); onBrowseAll(); };
  const applyView = (category: EarlyAccessCatalogCategory) => { close(); setApplied(category); onApplyView(category); };

  if (!open) {
    return <section className="xenios-order-panel" aria-labelledby={headingId} data-testid="catalog-guide">
      <h2 id={headingId}>Help me find a starting point</h2>
      {applied === null && <>
        <p>Five optional questions. Your answers stay on this page and are not sent with your request.</p>
        <button type="button" className="xenios-order-button" aria-expanded={false} onClick={() => setOpen(true)}>Start the guide</button>
      </>}
      {applied !== null && <>
        <p role="status">You opened {CATEGORY_LABEL[applied]} from the guide. The browser Back button does not undo this.</p>
        <button type="button" className="xenios-order-button" onClick={browseAll}>Browse all products</button>
        <button type="button" className="xenios-order-link" aria-expanded={false} onClick={() => setOpen(true)}>Change answers</button>
      </>}
    </section>;
  }

  const result = shown ? catalogGuideResult(answers) : null;
  const cards = result && !result.fullCatalog ? result.cards.filter((card) => cardIsShown(card, availableFamilies)) : [];
  const toggle = <K extends "interests" | "topics">(key: K, value: string, on: boolean) => setAnswers((prev) => {
    const list = new Set<string>(prev[key] ?? []);
    if (on) list.add(value); else list.delete(value);
    return { ...prev, [key]: [...list] } as GuideAnswers;
  });
  const radio = <K extends "audience" | "style" | "next">(key: K, values: readonly string[], labels: Readonly<Record<string, string>>, legend: string) =>
    <fieldset>
      <legend>{legend}</legend>
      {values.map((value) => <label key={value}><input type="radio" name={headingId + key} value={value}
        checked={answers[key] === value} onChange={() => setAnswers((prev) => ({ ...prev, [key]: value }) as GuideAnswers)} />{labels[value]}</label>)}
    </fieldset>;
  const checks = <K extends "interests" | "topics">(key: K, values: readonly string[], labels: Readonly<Record<string, string>>, legend: string) =>
    <fieldset>
      <legend>{legend}</legend>
      {values.map((value) => <label key={value}><input type="checkbox" value={value}
        checked={(answers[key] ?? []).includes(value as never)} onChange={(event) => toggle(key, value, event.target.checked)} />{labels[value]}</label>)}
    </fieldset>;

  const exits = <div className="xenios-order-notice">
    <button type="button" className="xenios-order-link" onClick={close}>Skip guide</button>
    <button type="button" className="xenios-order-link" onClick={browseAll}>Browse the full catalog</button>
  </div>;

  return <section className="xenios-order-panel" aria-labelledby={headingId} data-testid="catalog-guide">
    <h2 id={headingId}>Help me find a starting point</h2>
    {exits}
    {!shown && <form onSubmit={(event) => { event.preventDefault(); setShown(true); }}>
      <p>Every question is optional. Your answers stay on this page and are not sent with your request.</p>
      {radio("audience", GUIDE_AUDIENCES, AUDIENCE_LABEL, "Who are you exploring for?")}
      {checks("interests", GUIDE_INTERESTS, INTEREST_LABEL, "What are you interested in?")}
      {checks("topics", GUIDE_TOPICS, TOPIC_LABEL, "Which general topics would help?")}
      {radio("style", GUIDE_STYLES, STYLE_LABEL, "What do you prefer?")}
      {radio("next", GUIDE_NEXT, NEXT_LABEL, "What would you like next?")}
      <button type="submit" className="xenios-order-button">Show starting points</button>
    </form>}
    {shown && <section aria-labelledby={resultsHeadingId} data-testid="catalog-guide-results">
      <h3 id={resultsHeadingId} tabIndex={-1}>A useful place to start.</h3>
      {cards.length === 0 && <p>The full catalog is the best place to start. Browse the full catalog available to you.</p>}
      {cards.length > 0 && <ul role="list">
        {cards.map((card) => <li key={card.kind + ("category" in card ? card.category : "group" in card ? card.group : card.href)}>
          {card.kind === "category" && <><h4>{CATEGORY_LABEL[card.category]}</h4><p>{card.reason}</p>
            <button type="button" className="xenios-order-button" onClick={() => applyView(card.category)}>View category</button></>}
          {card.kind === "faq" && <><h4>{FAQ_LABEL[card.group]}</h4><p>{card.reason} The FAQ has a section on it.</p>
            <a href="/research/faq">Open the FAQ</a></>}
          {card.kind === "organization" && <><h4>Business enquiries</h4><p>{card.reason}</p>
            <a href={card.href}>Go to business enquiries</a></>}
          {card.kind === "support" && <><h4>Ask the team</h4><p>{card.reason}</p>
            <a href={card.href}>Contact support</a></>}
        </li>)}
      </ul>}
      <div className="xenios-order-notice">
        <button type="button" className="xenios-order-button" onClick={browseAll}>Browse all products</button>
        <button type="button" className="xenios-order-link" onClick={() => setShown(false)}>Edit answers</button>
        <a href="/research/support">Ask the team</a>
      </div>
    </section>}
  </section>;
}
