// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentSummaryDto,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import { AccountDocumentsView } from "./DocumentsView";
import { AccountSupportView } from "./SupportView";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function render(element: ReactElement) {
  const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(element));
  return container;
}

async function enterValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(container: HTMLElement) {
  await act(async () => {
    container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

afterEach(async () => {
  while (mounted.length) {
    const entry = mounted.pop();
    if (entry) {
      await act(async () => entry.root.unmount());
      entry.container.remove();
    }
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("account support truth and validation", () => {
  it("blocks an invalid request with a focused error summary", async () => {
    const onSubmit = vi.fn();
    const container = await render(<AccountSupportView cases={[]} onSubmit={onSubmit} />);

    await submit(container);

    expect(onSubmit).not.toHaveBeenCalled();
    const summary = container.querySelector('[aria-labelledby="support-validation-heading"]');
    expect(summary?.textContent).toContain("Enter a subject.");
    expect(summary?.textContent).toContain("Describe what you need help with.");
    expect(document.activeElement).toBe(summary);
    expect(summary?.hasAttribute("role")).toBe(false);
    expect(container.querySelector("#support-subject")?.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("#support-description")?.getAttribute("aria-invalid")).toBe("true");

    const subject = container.querySelector<HTMLInputElement>("#support-subject")!;
    await enterValue(subject, "x");
    expect(subject.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Subject must be at least 4 characters.");
    await enterValue(subject, "Valid synthetic subject");
    expect(subject.getAttribute("aria-invalid")).toBe("false");
  });

  it("preserves the request and names a rate limit without adding a case", async () => {
    const onSubmit = vi.fn(async () => ({ kind: "denied" as const, reason: "rate_limited" }));
    const container = await render(<AccountSupportView cases={[]} onSubmit={onSubmit} />);
    const subject = container.querySelector<HTMLInputElement>("#support-subject")!;
    const description = container.querySelector<HTMLTextAreaElement>("#support-description")!;
    await enterValue(subject, "Order question");
    await enterValue(description, "Please help me locate my order record.");

    await submit(container);

    expect(onSubmit).toHaveBeenCalledWith({
      category: "account",
      subject: "Order question",
      description: "Please help me locate my order record.",
    });
    expect(subject.value).toBe("Order question");
    expect(description.value).toBe("Please help me locate my order record.");
    expect(container.textContent).toContain("Too many support requests were submitted recently");
    expect(container.textContent).toContain("Your request was not recorded");
    expect(container.textContent).not.toContain("This sign-in cannot open a support request");
    expect(container.textContent).not.toContain("Your support request was recorded");
    expect(container.textContent).toContain("No support cases are visible");
    expect(container.querySelector('[aria-live] [role="alert"], [aria-live] [role="status"]')).toBeNull();
  });

  it("preserves the request after an error without claiming success", async () => {
    const onSubmit = vi.fn(async () => ({ kind: "error" as const }));
    const container = await render(<AccountSupportView cases={[]} onSubmit={onSubmit} />);
    const subject = container.querySelector<HTMLInputElement>("#support-subject")!;
    const description = container.querySelector<HTMLTextAreaElement>("#support-description")!;
    await enterValue(subject, "Account question");
    await enterValue(description, "I need help with my account record.");

    await submit(container);

    expect(subject.value).toBe("Account question");
    expect(description.value).toBe("I need help with my account record.");
    expect(container.textContent).toContain("The request could not be recorded");
    expect(container.textContent).not.toContain("Your support request was recorded");
  });

  it("keeps authentication denial distinct from rate limiting", async () => {
    const onSubmit = vi.fn(async () => ({ kind: "denied" as const, reason: "auth_required" }));
    const container = await render(<AccountSupportView cases={[]} onSubmit={onSubmit} />);
    await enterValue(container.querySelector<HTMLInputElement>("#support-subject")!, "Access question");
    await enterValue(container.querySelector<HTMLTextAreaElement>("#support-description")!, "I need help accessing my account.");

    await submit(container);

    expect(container.textContent).toContain("This sign-in cannot open a support request");
    expect(container.textContent).not.toContain("Too many support requests");
  });

  it("reconciles a successful response by id instead of duplicating a visible case", async () => {
    const existing: SupportCaseSummaryDto = {
      id: "case-synthetic-existing",
      category: "account",
      subject: "Earlier synthetic subject",
      state: "open",
      lastUpdateAt: "2026-08-25T00:00:00.000Z",
      responseExpectation: "Synthetic response expectation.",
    };
    const updated: SupportCaseSummaryDto = {
      ...existing,
      subject: "Updated synthetic subject",
      lastUpdateAt: "2026-08-26T00:00:00.000Z",
    };
    const onSubmit = vi.fn(async () => ({ kind: "ok" as const, data: updated }));
    const container = await render(<AccountSupportView cases={[existing]} onSubmit={onSubmit} />);
    await enterValue(container.querySelector<HTMLInputElement>("#support-subject")!, "Updated request");
    await enterValue(container.querySelector<HTMLTextAreaElement>("#support-description")!, "Please update this synthetic request.");

    await submit(container);

    expect(container.querySelectorAll(".account-list-card")).toHaveLength(1);
    expect(container.textContent).toContain("Updated synthetic subject");
    expect(container.textContent).not.toContain("Earlier synthetic subject");
    expect(container.textContent).toContain("Your support request was recorded");
  });
});

describe("account document availability", () => {
  const unsafeDocument: DocumentSummaryDto = {
    id: "doc-unsafe",
    kind: "receipt",
    title: "Receipt metadata",
    issuedAt: "2026-08-26T00:00:00.000Z",
    downloadPath: "https://storage.invalid/raw-receipt.pdf",
  };

  it("does not call or expose a rejected path and labels metadata separately", async () => {
    const onDownload = vi.fn(async () => "ok" as const);
    const container = await render(<AccountDocumentsView documents={[unsafeDocument]} onDownload={onDownload} />);

    expect(container.textContent).toContain("Metadata available");
    expect(container.textContent).toContain("its file cannot be opened from this account page");
    expect(container.textContent).not.toContain("Document available");
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain(unsafeDocument.downloadPath);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("reports an authenticated-path denial without claiming the file opened", async () => {
    const document = { ...unsafeDocument, id: "doc-authorized", downloadPath: "/api/research/customer-account/documents/doc-authorized" };
    const onDownload = vi.fn(async () => "denied" as const);
    const container = await render(<AccountDocumentsView documents={[document]} onDownload={onDownload} />);

    expect(container.textContent).toContain("Authorized path recorded");
    expect(container.textContent).not.toContain("Document available");

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onDownload).toHaveBeenCalledWith(document.downloadPath);
    expect(container.textContent).toContain("Access unavailable");
    expect(container.textContent).toContain("Document access was not granted");
    expect(container.textContent).not.toContain("Download requested");
    expect(container.querySelector("a")).toBeNull();
  });

  it("uses a success badge only after an authorized document read succeeds", async () => {
    const document = { ...unsafeDocument, id: "doc-success", downloadPath: "/api/research/customer-account/documents/doc-success" };
    const onDownload = vi.fn(async () => "ok" as const);
    const container = await render(<AccountDocumentsView documents={[document]} onDownload={onDownload} />);

    expect(container.textContent).toContain("Authorized path recorded");
    expect(container.querySelector(".ra-badge-success")).toBeNull();
    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Download requested");
    expect(container.textContent).toContain("file was received");
    expect(container.querySelector(".ra-badge-success")).not.toBeNull();
  });
});
