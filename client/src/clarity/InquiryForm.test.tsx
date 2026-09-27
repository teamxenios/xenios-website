// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/Turnstile", () => ({
  default: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" data-testid="turnstile" onClick={() => onToken("human-token")}>Verify</button>
  ),
}));

vi.mock("./inquiry-api", async (importActual) => {
  const actual = await importActual<typeof import("./inquiry-api")>();
  return { ...actual, submitInquiry: vi.fn() };
});

import InquiryForm from "./InquiryForm";
import {
  InquirySubmissionError,
  submitInquiry,
  type InquiryReceipt,
  type InquiryRequest,
} from "./inquiry-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const accepted: InquiryReceipt = {
  ok: true,
  accepted: true,
  replayed: false,
  reference: "INQ-ABC12345",
  status: "New",
  inquiryType: "practice",
  confirmation: "Stored",
  confirmationDelivery: "queued",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

async function renderForm(kind: InquiryRequest["inquiryType"]): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<InquiryForm kind={kind} />));
  return host;
}

function setValue(view: HTMLElement, name: string, value: string): void {
  const control = view.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!control) throw new Error(`Missing ${name}`);
  const prototype = control instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function fillCommon(view: HTMLElement): Promise<void> {
  setValue(view, "fullName", "  Sam Example  ");
  setValue(view, "email", " SAM@EXAMPLE.TEST ");
  setValue(view, "phone", "+1 555 010 2000");
  setValue(view, "message", "Please tell me about this pathway.");
  await act(async () => view.querySelector<HTMLButtonElement>('[data-testid="turnstile"]')?.click());
}

async function submit(view: HTMLElement): Promise<void> {
  await act(async () => {
    view.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe("InquiryForm durable delivery semantics", () => {
  it.each([
    ["practice", { organizationName: "Rivera Wellness", organizationKind: "Clinic or provider", role: "Owner", region: "TX", interest: "refer_clients" }],
    ["partner_interest", { interest: "partner_program" }],
    ["strategic", { organizationName: "Example Labs", interest: "strategic_partnership" }],
    ["supplier", { organizationName: "Example Supply", organizationKind: "Laboratory", region: "TX", interest: "supplier_relationship", documentationAvailable: true }],
    ["career_interest", { interest: "general_interest" }],
  ] as const)("submits the exact %s inquiry type", async (kind, specific) => {
    vi.mocked(submitInquiry).mockResolvedValue({ ...accepted, inquiryType: kind });
    const view = await renderForm(kind);
    await fillCommon(view);
    for (const [name, value] of Object.entries(specific)) {
      if (name === "documentationAvailable") {
        view.querySelector<HTMLInputElement>('input[name="documentationAvailable"][value="yes"]')?.click();
      } else if (name !== "interest" || kind === "practice") {
        setValue(view, name, String(value));
      }
    }

    await submit(view);

    expect(submitInquiry).toHaveBeenCalledOnce();
    expect(vi.mocked(submitInquiry).mock.calls[0][0]).toMatchObject({
      inquiryType: kind,
      fullName: "Sam Example",
      email: "sam@example.test",
      phone: "+1 555 010 2000",
      message: "Please tell me about this pathway.",
      website: "",
      turnstileToken: "human-token",
      ...specific,
    });
    expect(view.querySelector(`[data-testid="inquiry-success-${kind}"]`)?.textContent).toContain("INQ-ABC12345");
    expect(view.textContent).toContain("A confirmation email is queued");
  });

  it("does not permit a second send while the first request is unresolved", async () => {
    let resolveRequest!: (receipt: InquiryReceipt) => void;
    vi.mocked(submitInquiry).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const view = await renderForm("partner_interest");
    await fillCommon(view);

    view.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => Promise.resolve());
    const button = view.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    view.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(submitInquiry).toHaveBeenCalledOnce();

    await act(async () => resolveRequest({ ...accepted, inquiryType: "partner_interest" }));
    expect(view.querySelector('[data-testid="inquiry-success-partner_interest"]')).not.toBeNull();
  });

  it("accepts a replayed durable receipt without sending again", async () => {
    vi.mocked(submitInquiry).mockResolvedValue({ ...accepted, inquiryType: "partner_interest", replayed: true });
    const view = await renderForm("partner_interest");
    await fillCommon(view);
    await submit(view);

    expect(submitInquiry).toHaveBeenCalledOnce();
    expect(view.querySelector('[role="status"]')?.textContent).toContain("INQ-ABC12345");
    expect(view.textContent).toContain("A confirmation email is queued");
  });

  it.each([
    ["rejected", "We couldn't send this.", "Nothing was saved."],
    ["uncertain", "Receipt not confirmed.", "Please don't resend yet."],
  ] as const)("preserves the draft and shows no false receipt when delivery is %s", async (kind, heading, detail) => {
    vi.mocked(submitInquiry).mockRejectedValue(new InquirySubmissionError(
      detail,
      kind,
      kind === "rejected" ? { email: "Enter a valid email." } : {},
    ));
    const view = await renderForm("partner_interest");
    await fillCommon(view);
    await submit(view);

    expect(view.querySelector('[role="alert"]')?.textContent).toContain(heading);
    expect(view.textContent).toContain(detail);
    expect(view.querySelector('[data-testid^="inquiry-success-"]')).toBeNull();
    expect(view.querySelector<HTMLInputElement>('[name="fullName"]')?.value).toBe("  Sam Example  ");
    expect(view.querySelector<HTMLTextAreaElement>('[name="message"]')?.value).toBe("Please tell me about this pathway.");
    expect(view.querySelector('a[href="/support"]')).not.toBeNull();
  });
});
