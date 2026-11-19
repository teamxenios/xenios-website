// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ACTIONS, card, render, variant } from "./catalog-test-fixtures";
import { MasterOfferingCard } from "./MasterOfferingCard";

const reviewed = (packageWords: string) => ({ summary: "Synthetic reviewed summary.", overview: "Synthetic overview.",
  specifications: [{ label: "Package", value: packageWords }] });

describe("the package on a member catalog card", () => {
  it("is said once when the only variant is named by the same package", () => {
    const row = variant({ label: "60 label servings", action: ACTIONS.request_quote,
      reviewedContent: reviewed(" 60 Label  servings") });
    const view = render(<MasterOfferingCard product={card({ variants: [row] })} />);
    expect(view.host.textContent?.match(/60 label +servings/gi)).toHaveLength(1);
    expect(view.host.textContent).not.toContain("Package ·");
    expect(view.host.querySelector('[data-testid="mo-variant-label"]')?.textContent).toBe("60 label servings");
    view.unmount();
  });

  it("keeps the Package line when the package says something the variant label does not", () => {
    const row = variant({ label: "5 mg vial", action: ACTIONS.request_quote,
      reviewedContent: reviewed("Bottle of 60 capsules") });
    const view = render(<MasterOfferingCard product={card({ variants: [row] })} />);
    expect(view.host.textContent).toContain("Package · Bottle of 60 capsules");
    view.unmount();
  });
});
