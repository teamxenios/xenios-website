// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EarlyAccessRequestGuide, EarlyAccessRequestNextSteps } from "./EarlyAccessRequestGuide";
import {
  EARLY_ACCESS_CATEGORY_EXPLANATION,
  EARLY_ACCESS_RECEIPT_STEPS,
  EARLY_ACCESS_REQUEST_INTRO,
  EARLY_ACCESS_REQUEST_STEPS,
} from "./request-experience-copy";

describe("Early Access 2.0 presentation", () => {
  it("puts each reviewed description in the disclosure once and leaves the category explanation visible", () => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<EarlyAccessRequestGuide />), "text/html");
    const disclosure = doc.querySelector("details");
    expect([...disclosure!.querySelectorAll("dd")].map((node) => node.textContent))
      .toEqual(EARLY_ACCESS_REQUEST_STEPS.map((step) => step.description));
    disclosure!.remove();
    for (const { description } of EARLY_ACCESS_REQUEST_STEPS) expect(doc.body.textContent).not.toContain(description);
    expect(doc.body.textContent).toContain(EARLY_ACCESS_REQUEST_INTRO);
    expect(doc.body.textContent).toContain(EARLY_ACCESS_CATEGORY_EXPLANATION);
  });

  it("supplies every future step without adding a second announcement to the saved receipt", () => {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<EarlyAccessRequestNextSteps headingLevel={3} />), "text/html");
    expect([...doc.querySelectorAll("ol li strong")].map((node) => node.textContent))
      .toEqual(EARLY_ACCESS_RECEIPT_STEPS.map((step) => step.title));
    expect(doc.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(doc.body.textContent).not.toMatch(/Request (?:received|submitted)/i);
  });
});
