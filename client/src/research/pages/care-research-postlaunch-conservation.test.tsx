// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutResearch from "./AboutResearch";
import AccessHub from "./AccessHub";
import Faq from "./Faq";
import Gateway from "./Gateway";
import HowItWorks from "./HowItWorks";
import { PublicEditorialFooter, PublicEditorialNav } from "./PublicEditorialNav";

function controlCounts(markup: string) {
  return {
    links: markup.match(/<a(?:\s|>)/g)?.length ?? 0,
    buttons: markup.match(/<button(?:\s|>)/g)?.length ?? 0,
    forms: markup.match(/<form(?:\s|>)/g)?.length ?? 0,
  };
}

describe("Care + Research public-control conservation", () => {
  const editorialChrome = controlCounts(renderToStaticMarkup(
    <>
      <PublicEditorialNav current="/research/about" />
      <PublicEditorialFooter />
    </>,
  ));

  it("preserves the shared MinimalChrome control baseline", () => {
    expect(editorialChrome).toEqual({ links: 37, buttons: 0, forms: 0 });
    // MinimalChrome adds its wordmark and Back-to-gateway links.
    expect(editorialChrome.links + 2).toBe(39);
  });

  it.each([
    ["/research/access-hub", <AccessHub />, { links: 14, buttons: 0, forms: 0 }, 53],
    ["/research/how-it-works", <HowItWorks />, { links: 7, buttons: 0, forms: 0 }, 46],
    ["/research/about", <AboutResearch />, { links: 4, buttons: 0, forms: 0 }, 43],
    ["/research/faq", <Faq />, { links: 3, buttons: 18, forms: 0 }, 42],
  ] as const)("preserves the recorded control baseline for %s", (_route, page, pageExpected, routeLinks) => {
    const pageCounts = controlCounts(renderToStaticMarkup(page));
    expect(pageCounts).toEqual(pageExpected);
    expect(pageCounts.links + editorialChrome.links + 2).toBe(routeLinks);
  });

  it("preserves the self-contained Gateway control baseline", () => {
    expect(controlCounts(renderToStaticMarkup(<Gateway />))).toEqual({
      links: 55,
      buttons: 0,
      forms: 0,
    });
  });

  it("keeps the Gateway free of new browser-catalog or commerce controls", () => {
    const markup = renderToStaticMarkup(<Gateway />);
    expect(markup).not.toMatch(/href="\/research\/(?:catalog|products|member\/products)/i);
    expect(markup).not.toMatch(/Add to cart|Buy now|Choose dose|Start treatment/i);
    expect(markup).toContain('href="/care"');
    expect(markup).toContain('href="/research/access-hub"');
  });
});
