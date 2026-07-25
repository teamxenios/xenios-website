import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PendingMetabolicCare,
  SupplementComingSoon,
  type PublicPathwayCard,
  type SupplementCard,
} from "./CareAndSupplementsExperience";

beforeAll(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/research/member/products"),
  });
});

const pathways: PublicPathwayCard[] = [
  {
    pathwayId: "glp_1_pathway",
    publicName: "GLP-1 Pathway",
    publicStatus: "Pending clinician launch",
    publicCopy:
      "Clinician-guided metabolic evaluation and treatment options are being prepared through the separate Xenios Care pathway.",
    actions: { joinInterestHref: "/interest", exploreCareHref: "/care", askQuestionHref: "/questions" },
  },
  {
    pathwayId: "glp_2_pathway",
    publicName: "GLP-2 Pathway",
    publicStatus: "Pending clinician definition",
    publicCopy:
      "This pathway remains under clinical and product-definition review. Details will publish only after the medical team confirms the intended service, eligibility, product, and follow-up model.",
    actions: { joinInterestHref: "/interest", exploreCareHref: "/care", askQuestionHref: "/questions" },
  },
  {
    pathwayId: "next_generation_multi_agonist",
    publicName: "Next-Generation Multi-Agonist Pathway",
    publicStatus: "Pending clinician and regulatory review",
    publicCopy:
      "Next-generation multi-receptor metabolic pathways are being evaluated. Availability, eligibility, product selection, and timing will depend on clinician review and the status of the underlying therapy.",
    actions: { joinInterestHref: "/interest", exploreCareHref: "/care", askQuestionHref: "/questions" },
  },
];

const supplements: SupplementCard[] = [
  { category: "foundational", label: "Foundational supplements", status: "Coming soon", description: "Under review." },
  { category: "performance", label: "Performance supplements", status: "Coming soon", description: "Under review." },
  { category: "longevity", label: "Longevity supplements", status: "Coming soon", description: "Under review." },
  { category: "specialty", label: "Specialty supplements", status: "Coming soon", description: "Under review." },
];

describe("care and supplement member surfaces", () => {
  it("renders all three metabolic cards, actions, and the non-clinical interest boundary", () => {
    const html = renderToStaticMarkup(<PendingMetabolicCare pathways={pathways} />);
    expect(html).toContain("GLP-1 Pathway");
    expect(html).toContain("GLP-2 Pathway");
    expect(html).toContain("Next-Generation Multi-Agonist Pathway");
    expect(html).not.toContain("GLP-3");
    expect(html).toContain("Join interest list");
    expect(html).toContain("Explore Care");
    expect(html).toContain("Ask a question");
    expect(html).toContain("does not collect symptoms");
  });

  it("renders four unbranded supplement category placeholders", () => {
    const html = renderToStaticMarkup(<SupplementComingSoon supplements={supplements} />);
    for (const item of supplements) expect(html).toContain(item.label);
    expect(html).toContain("No brand, price, stock, serving instruction, or benefit claim");
    expect(html).not.toContain("$");
  });
});

