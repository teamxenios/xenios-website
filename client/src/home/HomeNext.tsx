import { useEffect, useRef } from "react";
import { HOME_COPY, HOME_COPY_VERSION, HOME_HEADLINE, HOME_UI, type HomeCopySlot } from "./content";
import { HOME_DESTINATIONS, HOME_FOOTER_DESTINATIONS, type HomeDestinationId } from "./destinations";
import "./home.css";

function Copy({ slot }: { slot: HomeCopySlot }) {
  return <span data-copy={slot}>{HOME_COPY[slot]}</span>;
}
function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
function Action({ destination, slot, secondary = false, describedBy }: {
  destination: HomeDestinationId; slot: HomeCopySlot; secondary?: boolean; describedBy?: string;
}) {
  return <a className={"xh-btn" + (secondary ? " xh-btn-secondary" : "")}
    href={HOME_DESTINATIONS[destination].href} data-destination={destination} aria-describedby={describedBy}>
    <Copy slot={slot} /><Arrow />
  </a>;
}
function TextLink({ destination, slot }: { destination: HomeDestinationId; slot: HomeCopySlot }) {
  return <a className="xh-textlink" href={HOME_DESTINATIONS[destination].href} data-destination={destination}>
    <Copy slot={slot} /><Arrow />
  </a>;
}

function HomeHeader() {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !menu.current?.open) return;
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
    function onOutsideClick(event: MouseEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) {
        menu.current.open = false;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onOutsideClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onOutsideClick);
    };
  }, []);
  return <header className="xh-wrap xh-header">
    <a className="xh-wordmark" href={HOME_DESTINATIONS.home.href} aria-label={HOME_UI.homeName}>
      <span className="xh-mark" aria-hidden="true" /><span>{HOME_UI.wordmark}</span>
    </a>
    <nav className="xh-nav" aria-label={HOME_UI.primaryNavigation}>
      <a href={HOME_DESTINATIONS.health.href}><Copy slot="nav.health" /></a>
      <a href={HOME_DESTINATIONS.infinity.href}><Copy slot="nav.infinity" /></a>
      <a href={HOME_DESTINATIONS.about.href}>{HOME_UI.about}</a>
      <a className="xh-signin" href={HOME_DESTINATIONS.signIn.href}>{HOME_UI.signIn}</a>
    </nav>
    <details ref={menu} className="xh-mobile-nav" onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("a") && menu.current) menu.current.open = false;
    }}>
      <summary>{HOME_UI.menu} <span aria-hidden="true">+</span></summary>
      <nav aria-label={HOME_UI.mobileNavigation}>
        <a href={HOME_DESTINATIONS.health.href}>{HOME_COPY["nav.health"]}</a>
        <a href={HOME_DESTINATIONS.infinity.href}>{HOME_COPY["nav.infinity"]}</a>
        <a href={HOME_DESTINATIONS.about.href}>{HOME_UI.mobileAbout}</a>
        <a href={HOME_DESTINATIONS.signIn.href}>{HOME_UI.signIn}</a>
      </nav>
    </details>
  </header>;
}

function HomeHero() {
  return <section className="xh-wrap xh-hero" aria-labelledby="xh-hero-title">
    <p className="xh-label"><Copy slot="hero.eyebrow" /></p>
    <h1 className="xh-h1" id="xh-hero-title" data-copy="hero.headline" data-testid="text-headline">
      {HOME_HEADLINE.opening}<span className="xh-serif">{HOME_HEADLINE.life}</span><br />{" "}
      {HOME_HEADLINE.continuation}<span className="xh-mono-word">{HOME_HEADLINE.possibility}</span>
    </h1>
    <p className="xh-lede"><Copy slot="hero.lede" /></p>
    <div className="xh-actions">
      <Action destination="healthRequest" slot="health.cta" />
      <Action destination="howRequests" slot="health.processCta" secondary />
    </div>
    <nav className="xh-jump" aria-label={HOME_UI.jumpNavigation}>
      <a href={HOME_DESTINATIONS.health.href}>{HOME_UI.healthJump}<Arrow /></a>
      <a href={HOME_DESTINATIONS.infinity.href}>{HOME_UI.infinityJump}<Arrow /></a>
    </nav>
    <p className="xh-editorial-note"><Copy slot="hero.note" /></p>
    <ul className="xh-trust-strip" aria-label={HOME_UI.trustStrip}>
      {(["company", "process", "scope"] as const).map(id => <li key={id}><Copy slot={"trust.strip." + id as HomeCopySlot} /></li>)}
    </ul>
  </section>;
}

function Pathway({ pathway }: { pathway: "clinical" | "research" }) {
  const slot = (part: string) => pathway + "." + part as HomeCopySlot;
  return <section className="xh-pathway" aria-labelledby={"xh-" + pathway + "-title"}>
    <p className="xh-label"><Copy slot={slot("label")} /></p>
    <h3 id={"xh-" + pathway + "-title"}><Copy slot={slot("title")} /></h3>
    <p className="xh-body"><Copy slot={slot("body")} /></p>
    {pathway === "research" && <p className="xh-audience"><Copy slot="research.audience" /></p>}
    <Action destination={pathway === "clinical" ? "clinicalRequest" : "researchRequest"} slot={slot("cta")}
      describedBy="xh-shared-entry" secondary={pathway === "research"} />
    <details className="xh-explanation">
      <summary><Copy slot={slot("detailsLabel")} /></summary>
      <p className="xh-body"><Copy slot={slot("detailsBody")} /></p>
    </details>
  </section>;
}

function HowRequestsWork() {
  return <section id="how-requests" className="xh-process xh-section" tabIndex={-1} aria-labelledby="xh-process-title">
    <p className="xh-label"><Copy slot="how.label" /></p>
    <h3 className="xh-section-title" id="xh-process-title"><Copy slot="how.title" /></h3>
    <ol className="xh-process-grid">
      {([1, 2, 3, 4] as const).map(step => <li key={step}>
        <span className="xh-step-number" aria-hidden="true">{"0" + step}</span>
        <h4><Copy slot={"how.step" + step + ".title" as HomeCopySlot} /></h4>
        {step === 1 && <p className="xh-body"><Copy slot="health.step1" /></p>}
        <p className="xh-body"><Copy slot={"how.step" + step + ".body" as HomeCopySlot} /></p>
      </li>)}
    </ol>
    <div className="xh-actions"><Action destination="healthRequest" slot="how.cta" /></div>
  </section>;
}

function ReviewApproach() {
  return <section className="xh-section xh-review" aria-labelledby="xh-review-title">
    <p className="xh-label"><Copy slot="trust.label" /></p>
    <h3 className="xh-section-title" id="xh-review-title"><Copy slot="trust.title" /></h3>
    <p className="xh-body"><Copy slot="trust.body" /></p>
    <div className="xh-proof-grid">
      {(["company", "clinical", "documents"] as const).map(id => <section className="xh-proof" key={id} aria-labelledby={"xh-proof-" + id}>
        <h4 id={"xh-proof-" + id}><Copy slot={"trust." + id + ".title" as HomeCopySlot} /></h4>
        <p className="xh-body"><Copy slot={"trust." + id + ".body" as HomeCopySlot} /></p>
        {id === "company" && <TextLink destination="about" slot="trust.company.cta" />}
        {id === "documents" && <TextLink destination="requestSupport" slot="trust.documents.cta" />}
      </section>)}
    </div>
  </section>;
}

const FAQ_IDS = ["request", "pathways", "review", "origin", "access", "contact", "availability", "order", "updates", "correct", "documents", "unavailable"] as const;
function HealthFaq() {
  return <section className="xh-section" aria-labelledby="xh-faq-title">
    <p className="xh-label"><Copy slot="faq.label" /></p>
    <h3 className="xh-section-title" id="xh-faq-title"><Copy slot="faq.title" /></h3>
    <div className="xh-faq-grid">
      {FAQ_IDS.map(id => <details className="xh-faq" key={id}>
        <summary><Copy slot={"faq." + id + ".question" as HomeCopySlot} /></summary>
        <p className="xh-body"><Copy slot={"faq." + id + ".answer" as HomeCopySlot} /></p>
        {id === "correct" && <TextLink destination="requestSupport" slot="closing.support" />}
      </details>)}
    </div>
  </section>;
}

function HealthSection() {
  return <article className="xh-wrap xh-health" id="health" tabIndex={-1} aria-labelledby="xh-health-title">
    <div className="xh-door-top">
      <p className="xh-label"><Copy slot="health.label" /></p><span className="xh-chip xh-chip-live"><Copy slot="health.status" /></span>
    </div>
    <h2 className="xh-door-name" id="xh-health-title"><Copy slot="health.name" /></h2>
    <p className="xh-transition"><Copy slot="health.transition" /></p>
    <p className="xh-health-pitch"><Copy slot="health.line" /></p>
    <section className="xh-current" aria-labelledby="xh-current-title">
      <p className="xh-label"><Copy slot="health.now.label" /></p>
      <h3 id="xh-current-title"><Copy slot="health.now.title" /></h3>
      <p className="xh-body"><Copy slot="health.now.body" /></p>
      <div className="xh-actions"><Action destination="healthRequest" slot="health.cta" />
        <TextLink destination="howRequests" slot="health.processCta" /></div>
      <p className="xh-boundary"><Copy slot="health.boundary" /></p>
    </section>
    <div className="xh-pathways"><Pathway pathway="clinical" /><Pathway pathway="research" /></div>
    <p className="xh-shared-entry" id="xh-shared-entry"><Copy slot="health.sharedEntry" /></p>
    <HowRequestsWork />
    <ReviewApproach />
    <section className="xh-vision xh-section" aria-labelledby="xh-vision-title">
      <div><p className="xh-label"><Copy slot="health.vision.label" /></p>
        <h3 className="xh-section-title xh-serif" id="xh-vision-title"><Copy slot="health.vision.title" /></h3></div>
      <div><p className="xh-body"><Copy slot="health.vision.body" /></p>
        <p className="xh-boundary"><Copy slot="health.vision.note" /></p></div>
    </section>
    <HealthFaq />
    <section className="xh-closing xh-section" aria-labelledby="xh-closing-title">
      <h3 className="xh-section-title" id="xh-closing-title"><Copy slot="closing.title" /></h3>
      <p className="xh-body"><Copy slot="closing.body" /></p>
      <div className="xh-actions"><Action destination="healthRequest" slot="closing.cta" />
        <TextLink destination="requestSupport" slot="closing.support" /></div>
    </section>
  </article>;
}

function InfinitySection() {
  return <article className="xh-wrap xh-infinity" id="infinity" tabIndex={-1} aria-labelledby="xh-infinity-title">
    <div className="xh-door-top"><p className="xh-label"><Copy slot="infinity.label" /></p>
      <span className="xh-chip"><Copy slot="infinity.status" /></span></div>
    <div className="xh-infinity-grid">
      <div><h2 className="xh-door-name" id="xh-infinity-title"><Copy slot="infinity.name" /></h2>
        <p className="xh-transition"><Copy slot="infinity.transition" /></p>
        <p className="xh-software-pitch"><Copy slot="infinity.line" /></p>
        <h3 className="xh-label"><Copy slot="infinity.vision.label" /></h3>
        <p className="xh-body"><Copy slot="infinity.vision.body" /></p>
        <p className="xh-boundary"><Copy slot="infinity.vision.note" /></p></div>
      <section className="xh-infinity-current" aria-labelledby="xh-infinity-current-title">
        <h3 id="xh-infinity-current-title"><Copy slot="infinity.now.label" /></h3>
        <p className="xh-body"><Copy slot="infinity.now.body" /></p>
        <Action destination="foundingGroup" slot="infinity.cta" secondary />
        <p className="xh-boundary"><Copy slot="infinity.boundary" /></p>
      </section>
    </div>
  </article>;
}

function BuiltByBand() {
  return <section className="xh-band" aria-labelledby="xh-builtby-title"><div className="xh-wrap xh-band-grid">
    <div><p className="xh-label"><Copy slot="builtby.label" /></p>
      <h2 className="xh-band-title" id="xh-builtby-title"><Copy slot="builtby.title" /></h2>
      <p className="xh-band-body"><Copy slot="builtby.body" /></p></div>
    {(["partners", "member"] as const).map(id => <div key={id}>
      <h3 className="xh-label"><Copy slot={id + ".label" as HomeCopySlot} /></h3>
      <p className="xh-band-body"><Copy slot={id + ".body" as HomeCopySlot} /></p>
      <TextLink destination={id === "partners" ? "partners" : "account"} slot={id + ".cta" as HomeCopySlot} />
    </div>)}
  </div></section>;
}
function HomeFooter() {
  return <footer className="xh-band"><div className="xh-wrap xh-footer">
    <p><Copy slot="footer.legal" /></p><nav className="xh-footer-links" aria-label={HOME_UI.footerNavigation}>
      {HOME_FOOTER_DESTINATIONS.map(id => <a key={id} href={HOME_DESTINATIONS[id].href}>{HOME_DESTINATIONS[id].label}</a>)}
    </nav>
  </div></footer>;
}
export default function HomeNext() {
  return <div className="xenios-home-next" data-copy-version={HOME_COPY_VERSION} data-direction="B-editorial">
    <a href="#xh-main" className="xh-skip">{HOME_UI.skip}</a><HomeHeader />
    <main id="xh-main" tabIndex={-1}><HomeHero /><HealthSection /><InfinitySection /><BuiltByBand /></main>
    <HomeFooter />
  </div>;
}
