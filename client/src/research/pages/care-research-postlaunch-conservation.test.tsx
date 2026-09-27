// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutResearch from "./AboutResearch";
import AccessHub from "./AccessHub";
import Faq from "./Faq";
import Gateway from "./Gateway";
import HowItWorks from "./HowItWorks";
import { PublicEditorialFooter, PublicEditorialNav } from "./PublicEditorialNav";

function markup(page: React.ReactNode): string {
  return renderToStaticMarkup(page);
}

describe("Care + Research public-control conservation", () => {
  it("keeps shared editorial chrome semantic rather than pinning brittle control counts", () => {
    const html = markup(<><PublicEditorialNav current="/research/about" /><PublicEditorialFooter /></>);
    expect(html).toContain('aria-label="Research information"');
    expect(html).toContain('aria-label="Research public footer"');
    expect(html).toContain('href="/research/about"');
    expect(html).not.toMatch(/Add to cart|Buy now|Choose dose|Start treatment/i);
  });

  it.each([
    ["/research/access-hub", <AccessHub />],
    ["/research/how-it-works", <HowItWorks />],
    ["/research/about", <AboutResearch />],
    ["/research/faq", <Faq />],
  ] as const)("keeps %s structurally bounded and free of direct commerce", (_route, page) => {
    const html = markup(page);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).not.toMatch(/href="\/research\/(?:catalog|products|member\/products)/i);
    expect(html).not.toMatch(/Add to cart|Buy now|Choose dose|Start treatment/i);
  });

  it("keeps the FAQ at the approved nine questions with explicit ARIA relationships", () => {
    const html = markup(<Faq />);
    expect(html.match(/data-testid="button-faq-/g)).toHaveLength(9);
    expect(html.match(/aria-controls="faq-panel-/g)).toHaveLength(9);
    expect(html.match(/role="region"/g)).toHaveLength(9);
  });

  it("keeps the Gateway on approved product discovery and credential-safe status actions", () => {
    const html = markup(<Gateway />);
    expect(html).toContain('href="/products"');
    expect(html).toContain('href="/status"');
    expect(html).toContain('href="#order-steps"');
    expect(html).not.toMatch(/href="\/research\/(?:catalog|products|member\/products)/i);
    expect(html).not.toMatch(/Add to cart|Buy now|Choose dose|Start treatment/i);
  });
});
