// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ACTIONS, card, detail, render, variant } from "./catalog-test-fixtures";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingDetail } from "./MasterOfferingDetail";

const SENTENCE = "Synthetic reviewed sentence: details for this listing have not yet been confirmed.";

describe("the reviewed sentence on a member catalog listing", () => {
  it("is shown on the card and on the detail page when the server sends one", () => {
    const row = variant({ action: ACTIONS.request_quote, reviewMessage: SENTENCE });
    const onCard = render(<MasterOfferingCard product={card({ variants: [row] })} />);
    expect(onCard.host.querySelector('[data-testid="mo-variant-review-message"]')?.textContent).toBe(SENTENCE);
    onCard.unmount();
    const onDetail = render(<MasterOfferingDetail product={detail({ variants: [row] })} />);
    expect(onDetail.host.querySelector('[data-testid="mo-selected-review-message"]')?.textContent).toBe(SENTENCE);
    onDetail.unmount();
  });

  it("is absent, with no empty element, when the server sends none", () => {
    const row = variant({ action: ACTIONS.request_quote });
    const onCard = render(<MasterOfferingCard product={card({ variants: [row] })} />);
    expect(onCard.host.querySelector('[data-testid="mo-variant-review-message"]')).toBeNull();
    onCard.unmount();
    const onDetail = render(<MasterOfferingDetail product={detail({ variants: [row] })} />);
    expect(onDetail.host.querySelector('[data-testid="mo-selected-review-message"]')).toBeNull();
    onDetail.unmount();
  });
});
