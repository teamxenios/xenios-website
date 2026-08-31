// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CareAccessRequestForm from "./CareAccessRequestForm";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<CareAccessRequestForm />));
  return container;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("value setter unavailable");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", {
      bubbles: true,
    }));
  });
}

function openStatus() {
  return {
    ok: true,
    acceptingRequests: true,
    workflow: "manual_human_follow_up",
    typicalResponse: "one_business_day",
    clinicalHandoff: "separate_secure_step_after_review",
  };
}

function stubFetch(options: {
  accepting?: boolean;
  submit?: (body: Record<string, unknown>) => Promise<Response>;
} = {}) {
  const payloads: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/config") {
      return { ok: false, json: async () => ({}) } as Response;
    }
    if (url === "/api/care/access-request/status") {
      return {
        ok: true,
        json: async () => ({ ...openStatus(), acceptingRequests: options.accepting ?? true }),
      } as Response;
    }
    if (url === "/api/care/access-request") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      payloads.push(body);
      if (options.submit) return options.submit(body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          reference: "CARE-123E4567",
          saved: true,
          confirmationSent: true,
        }),
      } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
  return payloads;
}

async function settleAvailability() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function completeRequiredFields() {
  setValue(byId<HTMLInputElement>("care-access-name"), "Jordan Test");
  setValue(byId<HTMLInputElement>("care-access-email"), "jordan@example.com");
  setValue(byId<HTMLSelectElement>("care-access-state"), "TX");
  setValue(byId<HTMLSelectElement>("care-access-goal"), "new_care_request");
  setValue(byId<HTMLSelectElement>("care-access-contact-method"), "email");
  setValue(byId<HTMLSelectElement>("care-access-contact-window"), "anytime");
  act(() => byId<HTMLInputElement>("care-access-adult").click());
  act(() => byId<HTMLInputElement>("care-access-boundary").click());
}

describe("CareAccessRequestForm", () => {
  it("offers only bounded operational fields and no clinical free-text control", async () => {
    stubFetch();
    const view = render();
    await settleAvailability();

    expect(view.querySelector("textarea")).toBeNull();
    expect(view.textContent).toContain("This public form intentionally has no clinical free-text field.");
    expect(view.textContent).toContain("does not create an appointment, clinician-patient relationship, treatment decision, or prescription");
    expect(view.querySelector('[data-testid="care-access-submit"]')?.hasAttribute("disabled")).toBe(false);
  });

  it("submits an exact no-free-text payload and renders the durable reference", async () => {
    const payloads = stubFetch();
    const view = render();
    await settleAvailability();
    completeRequiredFields();

    await act(async () => {
      view.querySelector("form")!.dispatchEvent(new Event("submit", {
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      fullName: "Jordan Test",
      email: "jordan@example.com",
      locationState: "TX",
      careGoal: "new_care_request",
      contactMethod: "email",
      contactWindow: "anytime",
      adultConfirmation: true,
      boundaryAcknowledgement: true,
      website: "",
    });
    expect(view.querySelector('[data-testid="care-access-success"]')?.textContent)
      .toContain("CARE-123E4567");
  });

  it("focuses the first invalid field and announces the validation summary", async () => {
    stubFetch();
    const view = render();
    await settleAvailability();

    act(() => {
      view.querySelector("form")!.dispatchEvent(new Event("submit", {
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(document.activeElement).toBe(byId("care-access-name"));
    expect(view.querySelector('[data-testid="care-access-validation-summary"]')?.getAttribute("role"))
      .toBe("alert");
    expect(byId("care-access-name").getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps submission disabled when the server cannot verify that requests are open", async () => {
    stubFetch({ accepting: false });
    const view = render();
    await settleAvailability();

    expect(view.textContent).toContain("Care requests are temporarily unavailable");
    expect(view.querySelector('[data-testid="care-access-submit"]')?.hasAttribute("disabled")).toBe(true);
  });

  it("announces a server refusal without claiming that the request was saved", async () => {
    stubFetch({
      submit: async () => ({
        ok: false,
        json: async () => ({ message: "Care requests are temporarily unavailable." }),
      } as Response),
    });
    const view = render();
    await settleAvailability();
    completeRequiredFields();

    await act(async () => {
      view.querySelector("form")!.dispatchEvent(new Event("submit", {
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(view.querySelector('[data-testid="care-access-server-error"]')?.getAttribute("role"))
      .toBe("alert");
    expect(view.textContent).not.toContain("Your Care request is in.");
  });
});
