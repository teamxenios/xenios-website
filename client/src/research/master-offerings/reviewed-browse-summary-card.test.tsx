// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { ACTIONS as MEMBER_ACTIONS, ON_REQUEST as MEMBER_ON_REQUEST, card as memberCard,
  variant as memberVariant } from "./catalog-test-fixtures";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("reviewed browse text on existing member cards", () => {
  const full = "Synthetic full summary with complete limitations. ".repeat(12) + "Synthetic material warning remains.";
  const brief = "Synthetic reviewed browse text. This remains a request for review, not an approved order.";
  const content = (browseSummary?: string) => ({ summary: full, overview: "Synthetic complete overview.",
    ...(browseSummary === undefined ? {} : { browseSummary }) });
  const reviewMessage = "Synthetic reviewed sentence: details for this listing remain subject to review.";

  it.each([
    { browseSummary: brief, shown: brief, hidden: full },
    { browseSummary: undefined, shown: full, hidden: brief },
    { browseSummary: "   ", shown: full, hidden: brief },
  ])("uses complete reviewed browse text or the full original fallback for one variant: %j", async ({ browseSummary, shown, hidden }) => {
    const row = memberVariant({ displayState: "request_access", price: MEMBER_ON_REQUEST, action: MEMBER_ACTIONS.request_quote,
      reviewMessage, reviewedContent: content(browseSummary) });
    await act(async () => root.render(<ul><MasterOfferingCard product={memberCard({ variants: [row] })} /></ul>));
    expect(host.textContent).toContain(shown);
    expect(host.textContent).not.toContain(hidden);
    expect(row.reviewedContent?.summary).toBe(full);
    expect(host.querySelector('[data-testid="mo-variant-review-message"]')?.textContent).toBe(reviewMessage);
    expect(host.querySelector('[data-testid="mo-card-action"]')?.getAttribute("data-customer-action")).toBe("REQUEST_QUOTE");
    expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
  });

  it("selects browse text per held variant without widening ordinary multi-variant visibility", async () => {
    const first = memberVariant({ id: "mov_browse_first", displayState: "request_access", price: MEMBER_ON_REQUEST,
      action: MEMBER_ACTIONS.request_quote, reviewMessage, reviewedContent: content(brief) });
    const second = memberVariant({ id: "mov_browse_second", displayState: "request_access", price: MEMBER_ON_REQUEST,
      action: MEMBER_ACTIONS.request_quote, reviewMessage, reviewedContent: content("   ") });
    const ordinary = memberVariant({ id: "mov_browse_ordinary", displayState: "request_access", price: MEMBER_ON_REQUEST,
      action: MEMBER_ACTIONS.request_quote, reviewedContent: content(brief) });
    await act(async () => root.render(<ul><MasterOfferingCard product={memberCard({ variants: [first, second, ordinary] })} /></ul>));
    const rows = [...host.querySelectorAll('[data-testid="mo-variant-row"]')];
    expect(rows[0].textContent).toContain(brief);
    expect(rows[0].textContent).not.toContain(full);
    expect(rows[1].textContent).toContain(full);
    expect(rows[1].textContent).not.toContain(brief);
    expect(rows[2].textContent).not.toContain(brief);
    expect(rows[2].textContent).not.toContain(full);
    expect(host.querySelectorAll('[data-testid="mo-variant-review-message"]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-testid="mo-card-action"][data-customer-action="REQUEST_QUOTE"]')).toHaveLength(3);
    expect(host.querySelector('[data-testid="mo-card-buy-now"]')).toBeNull();
    expect([first, second, ordinary].map(row => row.reviewedContent?.summary)).toEqual([full, full, full]);
  });
});
