// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CareContactForm from "./CareContactForm";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

function renderForm(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<CareContactForm />));
  return container;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement>(
  view: HTMLElement,
  id: string,
): T {
  const element = view.querySelector(`[data-testid="${id}"]`);
  if (!element) throw new Error(`missing ${id}`);
  return element as T;
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitValidForm(view: HTMLElement) {
  setValue(field(view, "care-contact-name"), "Jordan Test");
  setValue(field(view, "care-contact-email"), "JORDAN@EXAMPLE.TEST");
  setValue(field(view, "care-contact-subject"), "Care pathway support");
  setValue(
    field(view, "care-contact-message"),
    "I need help finding the correct nonclinical Care support pathway.",
  );
  const form = view.querySelector<HTMLFormElement>("[data-testid=care-contact-form]");
  if (!form) throw new Error("missing Care contact form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("CareContactForm", () => {
  it("submits only to the Care-owned contact endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderForm();

    await submitValidForm(view);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/care/contact",
      expect.objectContaining({ method: "POST" }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      name: "Jordan Test",
      email: "jordan@example.test",
      persona: "other",
      subject: "Care pathway support",
    });
    expect(view.querySelector("[data-testid=care-contact-success]")).not.toBeNull();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('"/api/contact"');
  });

  it("shows a visible error when the Care endpoint refuses the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Too many requests." }),
    }));
    const view = renderForm();

    await submitValidForm(view);

    const error = view.querySelector("[data-testid=care-contact-error]");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toContain("Too many requests.");
  });
});
