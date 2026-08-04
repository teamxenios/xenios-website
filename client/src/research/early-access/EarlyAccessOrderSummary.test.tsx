// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRICE_NOT_CONFIRMED } from "../pages/member/commerce-presentation";
import {
  EarlyAccessOrderSummary,
  type EarlyAccessOrderSummaryValue,
} from "./EarlyAccessOrderSummary";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PRICED: EarlyAccessOrderSummaryValue = {
  lines: [
    {
      id: "unit",
      label: "Private early access unit",
      quantity: 2,
      unitPriceCents: 12000,
      lineTotalCents: 24000,
    },
  ],
  totalCents: 24000,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(node: ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return {
    host,
    rerender(next: ReactElement) {
      act(() => root!.render(next));
    },
  };
}

describe("EarlyAccessOrderSummary", () => {
  it("renders the server's line items and total exactly as supplied", () => {
    const view = render(<EarlyAccessOrderSummary summary={PRICED} />);
    expect(view.host.querySelectorAll("h1")).toHaveLength(0);
    const heading = view.host.querySelector("h2")!;
    expect(view.host.querySelector("section")?.getAttribute("aria-labelledby")).toBe(heading.id);

    const line = view.host.querySelector('[data-testid="early-access-order-summary-line-unit"]')!;
    expect(line.textContent).toContain("Private early access unit");
    expect(line.textContent).toContain("x 2");
    expect(line.textContent).toContain("Unit price $120.00");
    expect(line.textContent).toContain("$240.00");
    expect(
      view.host.querySelector('[data-testid="early-access-order-summary-total"]')?.textContent,
    ).toBe("Total$240.00");
  });

  it("prints the server total even when it does not match the lines, because it computes nothing", () => {
    // A caller-side calculation would render $480.00 here. The server said
    // $100.00, so $100.00 is what a member sees.
    const view = render(
      <EarlyAccessOrderSummary
        summary={{
          lines: [
            {
              id: "unit",
              label: "Private early access unit",
              quantity: 4,
              unitPriceCents: 12000,
              lineTotalCents: 48000,
            },
          ],
          totalCents: 10000,
        }}
      />,
    );
    const total = view.host.querySelector('[data-testid="early-access-order-summary-total"]')!;
    expect(total.textContent).toBe("Total$100.00");
    expect(total.textContent).not.toContain("$480.00");
  });

  it("says a missing price is not confirmed and never shows a zero for it", () => {
    const view = render(
      <EarlyAccessOrderSummary
        summary={{
          lines: [
            {
              id: "unit",
              label: "Private early access unit",
              quantity: 1,
              unitPriceCents: null,
              lineTotalCents: null,
            },
          ],
          totalCents: null,
        }}
      />,
    );
    expect(view.host.textContent).toContain(PRICE_NOT_CONFIRMED);
    expect(view.host.textContent).not.toContain("$0.00");
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
    expect(
      view.host.querySelector('[data-testid="early-access-order-summary-total"]')?.textContent,
    ).toBe(`Total${PRICE_NOT_CONFIRMED}`);
  });

  it("treats an unusable figure as unconfirmed rather than guessing", () => {
    const view = render(<EarlyAccessOrderSummary summary={PRICED} />);
    for (const broken of [Number.NaN, Number.POSITIVE_INFINITY, undefined, "1200"]) {
      view.rerender(
        <EarlyAccessOrderSummary
          summary={
            {
              lines: [
                {
                  id: "unit",
                  label: "Private early access unit",
                  quantity: 1,
                  unitPriceCents: broken,
                  lineTotalCents: broken,
                },
              ],
              totalCents: broken,
            } as unknown as EarlyAccessOrderSummaryValue
          }
        />,
      );
      expect(view.host.textContent).toContain(PRICE_NOT_CONFIRMED);
      expect(view.host.textContent).not.toMatch(/\$\s*\d/);
      expect(view.host.textContent).not.toContain("1200");
    }
  });

  it("omits a quantity the server did not send as a whole positive count", () => {
    const view = render(<EarlyAccessOrderSummary summary={PRICED} />);
    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      view.rerender(
        <EarlyAccessOrderSummary
          summary={{
            lines: [{ ...PRICED.lines[0], quantity }],
            totalCents: PRICED.totalCents,
          }}
        />,
      );
      expect(view.host.textContent).not.toMatch(/x\s*-?\d/);
      expect(view.host.textContent).toContain("Private early access unit");
    }
  });

  it("stays calm and empty before the server has confirmed anything", () => {
    const view = render(<EarlyAccessOrderSummary summary={null} />);
    expect(
      view.host.querySelector('[data-testid="early-access-order-summary-pending"]'),
    ).not.toBeNull();
    expect(view.host.textContent).toContain("not ready yet");
    expect(view.host.textContent).toContain("Nothing has been requested or charged");
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);

    view.rerender(<EarlyAccessOrderSummary summary={{ lines: [], totalCents: 24000 }} />);
    expect(
      view.host.querySelector('[data-testid="early-access-order-summary-pending"]'),
    ).not.toBeNull();
    expect(view.host.textContent).not.toContain("$240.00");
  });

  it("is read-only and shows no receiving detail, control, or browser effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const view = render(<EarlyAccessOrderSummary summary={PRICED} />);
    expect(view.host.querySelector("form")).toBeNull();
    expect(view.host.querySelector("button")).toBeNull();
    expect(view.host.querySelector("input")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.querySelector("img")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(view.host.textContent).not.toMatch(
      /account number|routing number|recipient handle|destination handle|qr code|zelle|venmo|cash app|paypal/i,
    );
  });

  it("contains no money arithmetic at all and reuses the canonical wording", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessOrderSummary.tsx"), "utf8");
    expect(source).toContain("PRICE_NOT_CONFIRMED");
    expect(source).toContain("formatCents");
    expect(source).not.toMatch(/\.reduce\(|\.map\([^)]*\)\s*\.reduce/);
    expect(source).not.toMatch(/(unitPriceCents|lineTotalCents|totalCents|cents)\s*[*+/-]/);
    expect(source).not.toMatch(/[*+/-]\s*(unitPriceCents|lineTotalCents|totalCents|cents)\b/);
    expect(source).not.toMatch(/toFixed|Math\.round|parseFloat|Number\.parseFloat/);
    expect(source).toContain("tabular");
    expect(source).toContain("min-w-0");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|window\.location|setTimeout/i,
    );
  });
});
