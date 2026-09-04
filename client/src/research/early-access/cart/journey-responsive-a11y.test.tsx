// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EarlyAccessProgress } from "./EarlyAccessProgress";
import { EARLY_ACCESS_CUSTOMER_STEPS } from "../customerSteps";
import { EarlyAccessCartAgreements } from "./EarlyAccessCartAgreements";

/**
 * NARROW SCREENS AND SCREEN READERS.
 *
 * jsdom does not lay anything out, so these do not measure pixels. They assert
 * the structural decisions that make the narrow case work, which is the part
 * that actually regresses: a fixed column count, a missing `min-w-0`, or a
 * track that cannot scroll are what turn step chips at 390px into unreadable
 * slivers or a page that scrolls sideways.
 *
 * The accessibility assertions are about saying each thing ONCE. The step
 * position is a sentence; the boxes are the same sentence drawn, so they are
 * hidden from the accessibility tree rather than read out repeatedly.
 */

let host: HTMLElement;
let root: Root;

function render(node: React.ReactElement): void {
  act(() => root.render(node));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the progress indicator survives 390px", () => {
  it("does not pin itself to a fixed column count", () => {
    render(<EarlyAccessProgress step="agreements" />);
    const list = host.querySelector('[data-testid="early-access-progress-steps"]')!;
    const className = list.className;
    // A fixed grid squeezes long labels such as "Confirmation and tracking".
    expect(className).not.toMatch(/grid-cols-\d/);
    expect(className).toContain("overflow-x-auto");
    expect(className).toContain("min-w-0");
  });

  it("lets the track scroll instead of the page", () => {
    render(<EarlyAccessProgress step="catalog" />);
    const items = Array.from(
      host.querySelectorAll('[data-testid="early-access-progress-steps"] li'),
    );
    expect(items.length).toBe(4);
    // Each chip keeps its width and the row scrolls, rather than each chip
    // being squeezed until the labels wrap into unreadable columns.
    for (const item of items) expect(item.className).toContain("shrink-0");
  });

  it("shows exactly the four customer stages in their shared order", () => {
    render(<EarlyAccessProgress step="submit" />);
    const steps = Array.from(
      host.querySelectorAll('[data-testid="early-access-progress-steps"] li'),
    ).map((item) => item.getAttribute("data-step"));
    expect(steps).toEqual(EARLY_ACCESS_CUSTOMER_STEPS.map(({ key }) => key));
    expect(host.querySelector('[data-testid="early-access-progress-steps"]')?.textContent)
      .toBe("Choose productsContact and deliveryReview and paymentConfirmation and tracking");
  });

  it("marks exactly one step current, and marks the ones behind it done", () => {
    render(<EarlyAccessProgress step="payment" />);
    const items = Array.from(
      host.querySelectorAll('[data-testid="early-access-progress-steps"] li'),
    );
    const states = items.map((item) => item.getAttribute("data-state"));
    expect(states.filter((state) => state === "current").length).toBe(1);
    expect(states.slice(0, states.indexOf("current")).every((state) => state === "done")).toBe(true);
  });
});

describe("the eight internal states are announced through four customer stages", () => {
  it.each([
    ["catalog", "Step 1 of 4 · Choose products"],
    ["cart", "Step 1 of 4 · Choose products"],
    ["details", "Step 2 of 4 · Contact and delivery"],
    ["agreements", "Step 2 of 4 · Contact and delivery"],
    ["review", "Step 3 of 4 · Review and payment"],
    ["payment", "Step 3 of 4 · Review and payment"],
    ["submit", "Step 3 of 4 · Review and payment"],
    ["status", "Step 4 of 4 · Confirmation and tracking"],
  ] as const)("projects %s without changing its internal identity", (step, announcement) => {
    render(<EarlyAccessProgress step={step} />);
    expect(host.querySelector('[data-testid="early-access-progress-position"]')?.textContent)
      .toContain(announcement);
    expect(host.querySelectorAll('[data-testid="early-access-progress-steps"] li')).toHaveLength(4);
  });

  it("states the step in words and hides the drawn track from assistive tech", () => {
    render(<EarlyAccessProgress step="agreements" />);
    const position = host.querySelector('[data-testid="early-access-progress-position"]');
    expect(position?.textContent).toContain("Step 2 of 4");
    expect(position?.textContent).toContain("Contact and delivery");

    const list = host.querySelector('[data-testid="early-access-progress-steps"]');
    expect(list?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Early Access checkout progress",
    );
  });

  it("the Back control is a real button, so it is keyboard reachable", () => {
    let backs = 0;
    render(<EarlyAccessProgress step="cart" onBack={() => { backs += 1; }} />);
    const back = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Back",
    );
    expect(back).toBeDefined();
    expect(back!.getAttribute("type")).toBe("button");
    act(() => {
      back!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(backs).toBe(1);
  });

  it("offers no Back control on the first step", () => {
    render(<EarlyAccessProgress step="catalog" />);
    const back = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Back",
    );
    expect(back).toBeUndefined();
  });
});

describe("the agreements step is announced and does not overflow", () => {
  it("states the standing through a live region and keeps its content narrow", () => {
    render(
      <EarlyAccessCartAgreements
        standing="required"
        onRecheck={() => {}}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    const standing = host.querySelector('[data-testid="early-access-agreements-standing"]');
    expect(standing?.getAttribute("role")).toBe("status");
    expect(standing?.getAttribute("data-satisfied")).toBe("false");
    // A measure cap, so long sentences do not run the full width of a 1920 screen.
    expect(standing?.className).toContain("max-w-[62ch]");
    expect(host.querySelector("section")?.className).toContain("min-w-0");
  });

  it("shows no continue control until the server standing is satisfied", () => {
    for (const standing of ["unknown", "required", "locked", "unverified", "error"] as const) {
      render(
        <EarlyAccessCartAgreements
          standing={standing}
          onRecheck={() => {}}
          onBack={() => {}}
          onContinue={() => {}}
        />,
      );
      expect(host.querySelector('[data-testid="early-access-agreements-continue"]')).toBeNull();
    }
    render(
      <EarlyAccessCartAgreements
        standing="accepted"
        onRecheck={() => {}}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(host.querySelector('[data-testid="early-access-agreements-continue"]')).not.toBeNull();
  });
});
