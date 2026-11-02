// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAccountResult, SupportCaseSummaryDto } from "@shared/research/customer-account/contract";
import type { SupportRequestInput, SupportRequestResult } from "../types";
import { AccountSupportView } from "./SupportView";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
const firstDraft = { category: "account" as const, subject: "Original account question", description: "Please review the original synthetic account question." };
const nextDraft = { category: "order" as const, subject: "Newer order question", description: "These newer synthetic edits have not been submitted." };
const recorded: SupportCaseSummaryDto = {
  id: "case-original-synthetic",
  category: "account",
  subject: firstDraft.subject,
  state: "open",
  lastUpdateAt: "2026-11-01T00:00:00.000Z",
  responseExpectation: "Synthetic support routing expectation.",
};
type Result = CustomerAccountResult<SupportRequestResult>;

async function mount(onSubmit: (input: SupportRequestInput) => Promise<Result>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<AccountSupportView cases={[]} onSubmit={onSubmit} />));
  return container;
}

async function typeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function fill(container: HTMLElement, draft: SupportRequestInput) {
  await typeValue(container.querySelector<HTMLInputElement>("#support-subject")!, draft.subject);
  await typeValue(container.querySelector<HTMLTextAreaElement>("#support-description")!, draft.description);
  await act(async () => {
    const category = container.querySelector<HTMLSelectElement>("#support-category")!;
    category.value = draft.category;
    category.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit(container: HTMLElement) {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function expectDraft(container: HTMLElement, draft: SupportRequestInput) {
  expect(container.querySelector<HTMLInputElement>("#support-subject")!.value).toBe(draft.subject);
  expect(container.querySelector<HTMLTextAreaElement>("#support-description")!.value).toBe(draft.description);
  expect(container.querySelector<HTMLSelectElement>("#support-category")!.value).toBe(draft.category);
}

afterEach(async () => {
  while (mounted.length) {
    const entry = mounted.pop()!;
    await act(async () => entry.root.unmount());
    entry.container.remove();
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  vi.restoreAllMocks();
});

describe("support drafts during an outstanding submission", () => {
  it.each(["subject", "description", "category"] as const)("keeps a newer %s edit when the earlier request succeeds", async (field) => {
    let resolve!: (result: Result) => void;
    const onSubmit = vi.fn(() => new Promise<Result>((done) => { resolve = done; }));
    const container = await mount(onSubmit);
    await fill(container, firstDraft);
    await submit(container);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(firstDraft);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);

    const expected = { ...firstDraft, [field]: nextDraft[field] };
    if (field === "category") {
      await act(async () => {
        const category = container.querySelector<HTMLSelectElement>("#support-category")!;
        category.value = nextDraft.category;
        category.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } else {
      await typeValue(container.querySelector<HTMLInputElement | HTMLTextAreaElement>("#support-" + field)!, nextDraft[field]);
    }

    await act(async () => resolve({ kind: "ok", data: recorded }));
    expectDraft(container, expected);
    expect(container.querySelectorAll(".account-list-card")).toHaveLength(1);
    expect(container.querySelector(".account-list-card")!.textContent).toContain(firstDraft.subject);
    expect(container.querySelector('[role="status"]')!.textContent)
      .toBe("Your earlier support request was recorded. Your newer edits have not been submitted.");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("clears an unchanged submitted draft after confirmed success", async () => {
    const onSubmit = vi.fn(async (): Promise<Result> => ({ kind: "ok", data: recorded }));
    const container = await mount(onSubmit);
    await fill(container, firstDraft);
    await submit(container);
    expectDraft(container, { category: "account", subject: "", description: "" });
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Your support request was recorded.");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps newer edits after a failed earlier request and creates no case", async () => {
    let resolve!: (result: Result) => void;
    const onSubmit = vi.fn(() => new Promise<Result>((done) => { resolve = done; }));
    const container = await mount(onSubmit);
    await fill(container, firstDraft);
    await submit(container);
    await fill(container, nextDraft);
    await act(async () => resolve({ kind: "error" }));
    expectDraft(container, nextDraft);
    expect(container.querySelectorAll(".account-list-card")).toHaveLength(0);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it("submits the retained draft only on a fresh explicit action", async () => {
    let resolve!: (result: Result) => void;
    const onSubmit = vi.fn<(input: SupportRequestInput) => Promise<Result>>()
      .mockImplementationOnce(() => new Promise<Result>((done) => { resolve = done; }))
      .mockResolvedValueOnce({ kind: "ok", data: { ...recorded, id: "case-new-synthetic", category: "order", subject: nextDraft.subject } });
    const container = await mount(onSubmit);
    await fill(container, firstDraft);
    await submit(container);
    await fill(container, nextDraft);
    await act(async () => resolve({ kind: "ok", data: recorded }));
    expectDraft(container, nextDraft);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await submit(container);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1][0]).toEqual(nextDraft);
    expect(container.querySelectorAll(".account-list-card")).toHaveLength(2);
    expectDraft(container, { category: "order", subject: "", description: "" });
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Your support request was recorded.");
  });
});
