import { Fragment, useEffect, useRef } from "react";
import { HOME_COPY, HOME_HEADLINE, HOME_UI } from "./content";
import { HOME_DESTINATIONS, HOME_FOOTER_DESTINATIONS } from "./destinations";
import "./home.css";

function Arrow() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.7" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function SentenceLines({ text }: { text: string }) {
  return text.split(/(?<=\.) /u).map((sentence, index) => <Fragment key={sentence}>
    {index > 0 && <><br />{" "}</>}{sentence}
  </Fragment>);
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
      <a href={HOME_DESTINATIONS.health.href} data-copy="nav.health">{HOME_COPY["nav.health"]}</a>
      <a href={HOME_DESTINATIONS.infinity.href} data-copy="nav.infinity">{HOME_COPY["nav.infinity"]}</a>
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
    <p className="xh-label" data-copy="hero.eyebrow">{HOME_COPY["hero.eyebrow"]}</p>
    <h1 className="xh-h1" id="xh-hero-title" data-copy="hero.headline" data-testid="text-headline">
      {HOME_HEADLINE.opening}<span className="xh-serif">{HOME_HEADLINE.life}</span><br />{" "}
      {HOME_HEADLINE.continuation}<span className="xh-mono-word">{HOME_HEADLINE.possibility}</span>
    </h1>
    <div className="xh-hero-bottom">
      <p className="xh-lede" data-copy="hero.lede">{HOME_COPY["hero.lede"]}</p>
      <p className="xh-editorial-note" data-copy="hero.note"><SentenceLines text={HOME_COPY["hero.note"]} /></p>
    </div>
    <nav className="xh-jump" aria-label={HOME_UI.jumpNavigation}>
      <a href={HOME_DESTINATIONS.health.href}><span aria-hidden="true">01</span>{HOME_UI.healthJump}<Arrow /></a>
      <a href={HOME_DESTINATIONS.infinity.href}><span aria-hidden="true">02</span>{HOME_UI.infinityJump}<Arrow /></a>
    </nav>
  </section>;
}

type Offering = "health" | "infinity";
type OfferingCopyPart = "label" | "status" | "name" | "transition" | "line"
  | "vision.label" | "vision.body" | "vision.note" | "now.label" | "now.title" | "now.body"
  | "step1" | "step2" | "step3" | "cta" | "boundary";

function OfferingSection({ offering }: { offering: Offering }) {
  const health = offering === "health";
  const destination = health ? HOME_DESTINATIONS.healthRequest : HOME_DESTINATIONS.foundingGroup;
  const slot = (part: OfferingCopyPart) => `${offering}.${part}` as const;
  const copy = (part: OfferingCopyPart) => HOME_COPY[slot(part)];

  return <article className="xh-door" id={offering} tabIndex={-1} aria-labelledby={`xh-${offering}-title`}>
    <div className="xh-door-top">
      <p className="xh-label" data-copy={slot("label")}>{copy("label")}</p>
      <span className={"xh-chip" + (health ? " xh-chip-live" : "")} data-copy={slot("status")}>{copy("status")}</span>
    </div>
    <h2 className="xh-door-name" id={`xh-${offering}-title`} data-copy={slot("name")}>{copy("name")}</h2>
    <p className="xh-transition" data-copy={slot("transition")}>{copy("transition")}</p>
    <p className={"xh-door-pitch " + (health ? "xh-door-pitch-health" : "xh-door-pitch-software")}
      data-copy={slot("line")}>{health ? copy("line") : <SentenceLines text={copy("line")} />}</p>
    <div className="xh-vision-block">
      <h3 className="xh-kicker" data-copy={slot("vision.label")}>{copy("vision.label")}</h3>
      <p className="xh-door-body" data-copy={slot("vision.body")}>{copy("vision.body")}</p>
      <p className="xh-vision-footnote" data-copy={slot("vision.note")}>{copy("vision.note")}</p>
    </div>
    <div className="xh-now-block">
      <div className="xh-now-heading">
        <span className={"xh-status-dot" + (health ? "" : " xh-status-dot-outline")} aria-hidden="true" />
        <h3 className="xh-kicker" data-copy={slot("now.label")}>{copy("now.label")}</h3>
      </div>
      <p className="xh-now-title" data-copy={slot("now.title")}>{copy("now.title")}</p>
      <p className="xh-door-body" data-copy={slot("now.body")}>{copy("now.body")}</p>
      <ol className="xh-steps">
        {([1, 2, 3] as const).map((step) => <li key={step}>
          <span aria-hidden="true">{String(step).padStart(2, "0")}</span>
          <span data-copy={slot(`step${step}`)}>{copy(`step${step}`)}</span>
        </li>)}
      </ol>
      <a className={"xh-btn" + (health ? "" : " xh-btn-secondary")} href={destination.href}
        data-destination={health ? "healthRequest" : "foundingGroup"}>
        <span data-copy={slot("cta")}>{copy("cta")}</span><Arrow />
      </a>
      <p className="xh-boundary" data-copy={slot("boundary")}>{copy("boundary")}</p>
    </div>
  </article>;
}

function BuiltByBand() {
  return <section className="xh-band" aria-labelledby="xh-builtby-title"><div className="xh-wrap xh-band-inner">
    <div className="xh-band-grid">
      <div className="xh-band-col xh-band-maker">
        <p className="xh-label" data-copy="builtby.label">{HOME_COPY["builtby.label"]}</p>
        <h2 id="xh-builtby-title" className="xh-band-title" data-copy="builtby.title">{HOME_COPY["builtby.title"]}</h2>
        <p className="xh-band-body" data-copy="builtby.body">{HOME_COPY["builtby.body"]}</p>
      </div>
      {(["partners", "member"] as const).map((entry) => <div className="xh-band-col" key={entry}>
        <h3 className="xh-label" data-copy={`${entry}.label`}>{HOME_COPY[`${entry}.label`]}</h3>
        <p className="xh-band-body" data-copy={`${entry}.body`}>{HOME_COPY[`${entry}.body`]}</p>
        <a className="xh-textlink" href={entry === "partners" ? HOME_DESTINATIONS.partners.href : HOME_DESTINATIONS.account.href}>
          <span data-copy={`${entry}.cta`}>{HOME_COPY[`${entry}.cta`]}</span><Arrow />
        </a>
      </div>)}
    </div>
  </div></section>;
}

function HomeFooter() {
  return <footer className="xh-band"><div className="xh-wrap"><div className="xh-footer">
    <p data-copy="footer.legal">{HOME_COPY["footer.legal"]}</p>
    <nav className="xh-footer-links" aria-label={HOME_UI.footerNavigation}>
      {HOME_FOOTER_DESTINATIONS.map((id) => <a key={id} href={HOME_DESTINATIONS[id].href}>{HOME_DESTINATIONS[id].label}</a>)}
    </nav>
  </div></div></footer>;
}

export default function HomeNext() {
  return <div className="xenios-home-next" data-design-version="1.0.0" data-direction="B-v2-editorial">
    <a href="#xh-main" className="xh-skip">{HOME_UI.skip}</a>
    <HomeHeader />
    <main id="xh-main" tabIndex={-1}>
      <HomeHero />
      <section className="xh-wrap xh-doors" aria-label={HOME_UI.offerings}><div className="xh-doors-grid">
        <OfferingSection offering="health" />
        <OfferingSection offering="infinity" />
      </div></section>
      <BuiltByBand />
    </main>
    <HomeFooter />
  </div>;
}
