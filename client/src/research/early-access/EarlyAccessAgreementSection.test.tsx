// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessAgreementSection } from "./EarlyAccessAgreementSection";
import type {
  EarlyAccessAcceptResult,
  EarlyAccessAgreementState,
  ResearchPolicyLoad,
} from "../adapters/earlyAccessAgreement";

/**
 * The agreement acceptance screen.
 *
 * The properties under test: the customer sees the served policy in full,
 * agrees on purpose rather than by default, cannot continue until the SERVER
 * says they are agreed, and is never told a duplicate acceptance failed.
 */

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(element: ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

/** Lets the mount effect's promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const POLICY: ResearchPolicyLoad = {
  kind: "ok",
  policy: {
    title: "Research Use Policy",
    updated: "July 2026",
    sections: [
      {
        heading: "Purpose",
        paragraphs: [
          "Research materials listed through xenios are offered solely for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not offered for human or veterinary use.",
        ],
        bullets: [],
      },
      {
        heading: "Prohibited use",
        paragraphs: [
          "A purchaser may not ingest, inject, administer, prescribe, dispense, recommend, or distribute research materials for human or veterinary use.",
        ],
        bullets: ["No personal use", "No client or patient use", "No dosing or protocol support"],
      },
    ],
  },
};

type Options = {
  policy?: ResearchPolicyLoad;
  state?: EarlyAccessAgreementState;
  accept?: () => Promise<EarlyAccessAcceptResult>;
  onAccepted?: (accepted: boolean) => void;
  onBlocked?: (reason: "unverified" | "locked" | null) => void;
};

async function mount(options: Options = {}): Promise<HTMLElement> {
  const element = render(
    <EarlyAccessAgreementSection
      loadPolicy={async () => options.policy ?? POLICY}
      loadState={async () => options.state ?? { kind: "required" }}
      accept={options.accept ?? (async () => ({ kind: "accepted", alreadyAccepted: false }))}
      onAccepted={options.onAccepted}
      onBlocked={options.onBlocked}
    />,
  );
  await settle();
  return element;
}

function checkbox(host: HTMLElement): HTMLInputElement {
  const found = host.querySelector<HTMLInputElement>('[data-testid="early-access-agreement-checkbox"]');
  if (found === null) throw new Error("no checkbox rendered");
  return found;
}

function submit(host: HTMLElement): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>('[data-testid="early-access-agreement-submit"]');
  if (found === null) throw new Error("no submit rendered");
  return found;
}

/** A real click, the way a customer ticks the box. */
function tick(host: HTMLElement): void {
  const input = checkbox(host);
  act(() => {
    input.click();
  });
}

/** A real click on the continuation. */
function press(button: HTMLButtonElement): void {
  act(() => {
    button.click();
  });
}

/** The rendered section itself, not the harness container around it. */
function section(host: HTMLElement): HTMLElement {
  const found = host.querySelector<HTMLElement>('[data-testid="early-access-agreement"]');
  if (found === null) throw new Error("no section rendered");
  return found;
}

describe("what the customer is shown", () => {
  it("renders the served Research Use Policy in full", async () => {
    const host = await mount();

    expect(host.textContent).toContain("Research Use Policy");
    expect(host.textContent).toContain("Updated July 2026");
    // Every heading, paragraph and bullet the document carries.
    const headings = Array.from(
      host.querySelectorAll('[data-testid="early-access-agreement-heading"]'),
    );
    expect(headings.map((node) => node.textContent)).toEqual(["Purpose", "Prohibited use"]);
    const paragraphs = Array.from(
      host.querySelectorAll('[data-testid="early-access-agreement-paragraph"]'),
    );
    expect(paragraphs).toHaveLength(2);
    const bullets = Array.from(
      host.querySelectorAll('[data-testid="early-access-agreement-bullet"]'),
    );
    expect(bullets.map((node) => node.textContent)).toEqual([
      "No personal use",
      "No client or patient use",
      "No dosing or protocol support",
    ]);
    // The sentence that makes this a research-use agreement at all.
    expect(host.textContent).toContain("They are not offered for human or veterinary use.");
  });

  it("shows the research-use policy and NOT the draft Terms or draft Privacy documents", async () => {
    // The founder decision: a customer is not asked to accept a document that
    // labels itself a draft. This screen renders one policy, and it is not
    // either of those.
    const host = await mount();

    expect(host.textContent).toContain("Research Use Policy");
    expect(host.textContent).not.toContain("Terms of Service");
    expect(host.textContent).not.toContain("Privacy Policy");
    expect(host.textContent).not.toContain("Draft status");
  });

  it("uses the exact assent line, and does not combine it with anything else", async () => {
    const host = await mount();

    const label = host.querySelector('[data-testid="early-access-agreement-assent-label"]');
    expect(label?.textContent).toBe("I have read and agree to the Research Use Policy.");
    // One box, one meaning. A marketing opt-in sharing this tick would make the
    // tick evidence of neither.
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(host.textContent?.toLowerCase()).not.toContain("marketing");
    expect(host.textContent?.toLowerCase()).not.toContain("newsletter");
  });

  it("shows a loading state before the policy arrives", () => {
    const host = render(
      <EarlyAccessAgreementSection
        loadPolicy={() => new Promise(() => {})}
        loadState={() => new Promise(() => {})}
      />,
    );
    expect(host.querySelector('[data-testid="early-access-agreement-loading"]')).not.toBeNull();
  });

  it("refuses to collect agreement to a policy that did not load", async () => {
    // No checkbox at all. Collecting a tick against a blank page would record
    // an acceptance of nothing.
    const host = await mount({ policy: { kind: "error", message: "down" } });

    expect(host.querySelector('[data-testid="early-access-agreement-policy-fault"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-submit"]')).toBeNull();
  });

  it("says the session lapsed rather than showing an unanswerable form", async () => {
    const host = await mount({ state: { kind: "locked" } });

    expect(host.querySelector('[data-testid="early-access-agreement-locked"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();
  });
});

describe("agreeing on purpose", () => {
  it("starts unchecked, every time", async () => {
    const host = await mount();
    expect(checkbox(host).checked).toBe(false);
  });

  it("keeps the continuation unavailable until the box is ticked AND the write succeeds", async () => {
    const host = await mount();

    expect(submit(host).disabled).toBe(true);
    tick(host);
    expect(submit(host).disabled).toBe(false);
  });

  it("does not report an acceptance the server has not confirmed", async () => {
    const accepted: boolean[] = [];
    const host = await mount({ onAccepted: (value) => accepted.push(value) });

    tick(host);
    // Ticked, but not submitted. Nothing is on file, so nothing is unlocked.
    expect(accepted).toEqual([]);
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).toBeNull();
  });

  it("records the acceptance and unlocks continuation", async () => {
    const accepted: boolean[] = [];
    const accept = vi.fn(async () => ({ kind: "accepted" as const, alreadyAccepted: false }));
    const host = await mount({ accept, onAccepted: (value) => accepted.push(value) });

    tick(host);
    press(submit(host));
    await settle();

    expect(accept).toHaveBeenCalledTimes(1);
    expect(accepted).toEqual([true]);
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-error"]')).toBeNull();
  });

  it("treats a DUPLICATE acceptance as success, with no error shown", async () => {
    // The verification lane's case. The server returns 200 with
    // alreadyAccepted true when the row was already there, and a customer who
    // double-clicks is agreed either way.
    const accepted: boolean[] = [];
    const host = await mount({
      accept: async () => ({ kind: "accepted", alreadyAccepted: true }),
      onAccepted: (value) => accepted.push(value),
    });

    tick(host);
    press(submit(host));
    await settle();

    expect(accepted).toEqual([true]);
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-error"]')).toBeNull();
    expect(section(host).getAttribute("data-state")).toBe("accepted");
  });

  it("fails closed when the write genuinely fails", async () => {
    const accepted: boolean[] = [];
    const host = await mount({
      accept: async () => ({ kind: "refused", code: "NOT_RECORDED" }),
      onAccepted: (value) => accepted.push(value),
    });

    tick(host);
    press(submit(host));
    await settle();

    // Nothing is recorded, so nothing is unlocked, and the customer is told.
    expect(accepted).toEqual([]);
    const error = host.querySelector('[data-testid="early-access-agreement-error"]');
    expect(error?.textContent).toContain("not recorded");
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).toBeNull();
  });
});

describe("acceptance survives a refresh, because the server remembers it", () => {
  it("reads the acceptance back from the server on mount", async () => {
    // A fresh mount is what a refresh produces. Nothing was carried over in
    // browser storage: the server was asked, and it answered.
    const accepted: boolean[] = [];
    const host = await mount({
      state: { kind: "accepted" },
      onAccepted: (value) => accepted.push(value),
    });

    expect(accepted).toEqual([true]);
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();
  });

  it("writes nothing to browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const host = await mount();

    tick(host);
    press(submit(host));
    await settle();

    // The authority is the server. A value the browser keeps is a value the
    // browser can be made to invent, and this one stands in front of checkout.
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("keyboard, focus and small screens", () => {
  it("gives the assent a real label bound to a real checkbox", async () => {
    const host = await mount();
    const input = checkbox(host);
    const label = host.querySelector<HTMLLabelElement>(
      '[data-testid="early-access-agreement-assent-label"]',
    );

    // A native input inside a bound label is reachable by Tab, togglable by
    // Space, announced by a screen reader, and focusable by clicking the words.
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("checkbox");
    expect(input.id).not.toBe("");
    expect(label?.htmlFor).toBe(input.id);
  });

  it("keeps the tick and the continuation in the tab order, and the button natively focusable", async () => {
    const host = await mount();
    const input = checkbox(host);
    const button = submit(host);

    expect(input.getAttribute("tabindex")).toBeNull();
    expect(button.getAttribute("tabindex")).toBeNull();
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");

    tick(host);
    act(() => {
      button.focus();
    });
    // Visible focus is the site-wide :focus-visible outline; what this asserts
    // is that the element can hold focus at all, which is the part a component
    // can get wrong.
    expect(document.activeElement).toBe(button);
  });

  it("announces the outcome politely rather than silently swapping the screen", async () => {
    const host = await mount({ state: { kind: "accepted" } });
    const status = host.querySelector('[data-testid="early-access-agreement-accepted"]');
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });

  it("constrains its own width and never forces the page to scroll sideways", async () => {
    const host = await mount();
    const policy = host.querySelector('[data-testid="early-access-agreement-policy"]');
    // min-w-0 is what stops a long unbroken line from widening the whole grid
    // on a phone; max-w keeps the measure readable on a desktop.
    expect(policy?.className).toContain("min-w-0");
    expect(policy?.className).toContain("max-w-[62ch]");
    expect(section(host).className).toContain("min-w-0");
  });
});

describe("it reads the policy and the standing once", () => {
  it("does not re-read itself forever when it uses its own default loaders", async () => {
    // Same regression as the catalogue. An inline default parameter is a NEW
    // function every render, and the mount effect depends on it while also
    // setting state, so the screen would re-read the policy and the acceptance
    // standing without end. The defaults are module-level and stable.
    const fetches: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        fetches.push(String(input));
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ ok: true, policies: {}, accepted: false }),
        } as unknown as Response;
      }),
    );

    render(<EarlyAccessAgreementSection />);
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // One policy read, one standing read. No more.
    expect(fetches).toHaveLength(2);
    expect(new Set(fetches).size).toBe(2);
    vi.unstubAllGlobals();
  });
});

describe("signed in, but not verified against an approved account", () => {
  it("does not claim the session ended, and offers no checkbox", async () => {
    const host = await mount({ state: { kind: "unverified" } });

    const panel = host.querySelector('[data-testid="early-access-agreement-unverified"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Complete identity verification");
    expect(panel?.textContent).toContain("Your private access session is active");
    // The false message that shipped to production.
    expect(host.textContent).not.toContain("Your private session has ended");
    // Fail closed: nothing to tick, nothing to submit, nothing recorded.
    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-submit"]')).toBeNull();
    expect(section(host).getAttribute("data-state")).toBe("unverified");
    // The way OUT is offered, not just the diagnosis. A screen that names the
    // problem and gives no action is the dead end production actually shipped.
    expect(host.querySelector('[data-testid="early-access-agreement-verification-request"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-verification-redeem"]')).not.toBeNull();
  });

  it("tells the surrounding journey why, so the page cannot contradict itself", async () => {
    const seen: Array<string | null> = [];
    await mount({ state: { kind: "unverified" }, onBlocked: (reason) => seen.push(reason) });
    expect(seen).toEqual(["unverified"]);
  });

  it("reports an unverified acceptance attempt without unlocking anything", async () => {
    const accepted: boolean[] = [];
    const seen: Array<string | null> = [];
    const host = await mount({
      accept: async () => ({ kind: "unverified" }),
      onAccepted: (value) => accepted.push(value),
      onBlocked: (reason) => seen.push(reason),
    });

    tick(host);
    press(submit(host));
    await settle();

    expect(accepted).toEqual([]);
    expect(seen).toEqual(["unverified"]);
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).toBeNull();
  });
});
