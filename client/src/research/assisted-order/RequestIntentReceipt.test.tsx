// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RequestIntentReceipt } from "./RequestIntentReceipt";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const receipt = {
  kind: "unapproved_selection_request" as const,
  requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: "XRI-30000000000040008000000000000001",
  status: "pending_review" as const,
  createdAt: "2026-10-14T12:00:00.000Z",
};
let container: HTMLDivElement;
let root: Root;
let outside: HTMLButtonElement | null;
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T12:01:00.000Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  outside = null;
});

describe("the original saved request's reply window", () => {
  const promise = "Request received. Our team will reply within 24 hours.";
  it.each([{}, { recovered: true }, { reopened: true }])("shows the confirmed promise and original times for %j", async (state: { reopened?: boolean; recovered?: boolean }) => {
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} {...state} />));
    expect(container.querySelector("h1 + p strong")?.textContent).toBe(promise);
    expect([...container.querySelectorAll("time")].map((time) => time.dateTime))
      .toEqual([receipt.createdAt, "2026-10-15T12:00:00.000Z"]);
    expect(container.textContent).toContain(receipt.publicReference);
    if (state.reopened || state.recovered) expect(container.querySelector('[data-testid="request-next-steps"]')).toBeNull();
  });
  it("does not move the original window when the confirmation is reopened later", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-15T11:59:59.999Z"));
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} reopened />));
    expect(container.textContent).toContain(promise);
    expect(container.querySelectorAll("time")[1].dateTime).toBe("2026-10-15T12:00:00.000Z");
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-15T12:00:00.000Z"));
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} reopened />));
    expect(container.textContent).not.toContain(promise);
    expect(container.textContent).toContain("Its original 24-hour team-reply window has ended.");
    expect(container.textContent).toContain("does not show whether a team member has replied");
    expect(container.querySelectorAll("time")[1].dateTime).toBe("2026-10-15T12:00:00.000Z");
    expect(container.querySelector('[data-testid="request-next-steps"]')).toBeNull();
    expect(container.querySelector('a[href="/research/support"]')).not.toBeNull();
  });
  it("does not invent a new window when a saved timestamp is invalid", async () => {
    await act(async () => root.render(<RequestIntentReceipt receipt={{ ...receipt, createdAt: "invalid" }} reopened />));
    expect(container.textContent).not.toContain(promise);
    expect(container.textContent).toContain("Contact support for its original reply window.");
    expect(container.querySelectorAll("time")).toHaveLength(0);
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  outside?.remove();
  vi.restoreAllMocks();
});

describe("confirmed receipt focus", () => {
  it("leaves focus alone by default", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} />));
    expect(document.activeElement).toBe(document.body);
    expect(focus).not.toHaveBeenCalled();
  });
  it("focuses the confirmation with default scrolling when focus is on the body", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    expect(document.activeElement).toBe(document.body);
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} focusOnMount />));
    expect(document.activeElement).toBe(container.querySelector("h1"));
    expect(focus).toHaveBeenCalledExactlyOnceWith();
  });
  it("moves ancestor-container focus to the confirmation", async () => {
    container.tabIndex = -1;
    container.focus();
    expect(document.activeElement).toBe(container);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} focusOnMount />));
    expect(document.activeElement).toBe(container.querySelector("h1"));
    expect(focus).toHaveBeenCalledExactlyOnceWith();
  });
  it("preserves deliberate focus outside the receipt", async () => {
    outside = document.createElement("button");
    outside.textContent = "Other action";
    document.body.append(outside);
    outside.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} focusOnMount />));
    expect(document.activeElement).toBe(outside);
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("confirmed receipt wording and heading level", () => {
  it("states what a review request covers without asking the customer to submit again", async () => {
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} />));
    expect(container.textContent).toContain("A review request saves the requested items only. It does not approve treatment, create a prescription, collect payment or place a supplier order.");
    expect(container.textContent).not.toContain("Request a quote");
  });
  it("renders its heading at the level the surrounding page needs, and focuses it the same way", async () => {
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} headingLevel={2} focusOnMount />));
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Request submitted");
    expect(document.activeElement).toBe(container.querySelector("h2"));
  });
});

describe("confirmed receipt continuation", () => {
  function hrefs() { return [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? ""); }
  it("links the confirmation page and support with the reference only, and confirms review rather than an order", async () => {
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} />));
    const links = hrefs();
    expect(links).toContain("/research/early-access/order-request/confirmation/" + receipt.publicReference);
    expect(links).toContain("/research/support");
    const mailto = links.find((href) => href.startsWith("mailto:team@xeniostechnology.com"))!;
    expect(decodeURIComponent(mailto)).toContain("Early Access request " + receipt.publicReference);
    expect(decodeURIComponent(mailto)).toContain("do not include medical information or payment details");
    for (const href of links) expect(href).not.toMatch(/token|key=|requestId/i);
    expect(container.textContent).toContain("Online status is not available for review requests.");
    const nextSteps = container.querySelector('[data-testid="request-next-steps"]');
    expect(nextSteps?.textContent).toContain("For approved, available items");
    const receiptWithoutNextSteps = container.cloneNode(true) as HTMLElement;
    receiptWithoutNextSteps.querySelector('[data-testid="request-next-steps"]')?.remove();
    expect(receiptWithoutNextSteps.textContent).not.toMatch(/approved|paid|shipped|delivery date/i);
    expect(container.textContent).not.toContain("earlier in this browser tab");
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Copy reference"]);
    // The continuations are a plain list, not the shared action row, which reverses its order on narrow screens.
    expect(container.querySelector(".xenios-order-actions")).toBeNull();
    const continuationLists = container.querySelectorAll("ul.xenios-order-receipt-continuations");
    expect(continuationLists).toHaveLength(1);
    expect([...continuationLists[0].querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Copy reference", "Open your confirmation page", "Email support about this request", "Contact support",
    ]);
  });
  it("copies the reference and reports it in an always-mounted status region, or says copying is unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    try {
      await act(async () => root.render(<RequestIntentReceipt receipt={receipt} />));
      const statuses = () => [...container.querySelectorAll('[role="status"]')].map((node) => node.textContent);
      expect(statuses()).toEqual(["Your request reference is " + receipt.publicReference + ".", ""]);
      const copy = [...container.querySelectorAll("button")].find((button) => button.textContent === "Copy reference")!;
      await act(async () => copy.click());
      expect(writeText).toHaveBeenCalledExactlyOnceWith(receipt.publicReference);
      expect(statuses()[1]).toBe("Reference copied.");
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      await act(async () => copy.click());
      expect(statuses()[1]).toBe("Copying is unavailable here. Select the reference text to copy it.");
    } finally {
      if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
  it("marks a reopened reference as confirmed earlier and offers a fresh request only when a handler exists", async () => {
    const startAnother = vi.fn();
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} reopened onStartAnother={startAnother} />));
    expect(container.textContent).toContain("This reference was confirmed earlier in this browser tab. Nothing was sent again.");
    expect(container.querySelector("h1")?.textContent).toBe("Your submitted request");
    expect(container.textContent).not.toContain("Each item is pending review");
    expect(container.querySelector('[data-testid="request-next-steps"]')).toBeNull();
    const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "Start another request")!;
    expect(start).toBeTruthy();
    await act(async () => start.click());
    expect(startAnother).toHaveBeenCalledTimes(1);
  });
});
