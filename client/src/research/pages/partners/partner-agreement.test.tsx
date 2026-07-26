// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PartnerAgreementCard } from "./Onboarding";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

const FULL_TEXT =
  "These approved affiliate terms define attribution, disclosures, commission holds, reversals, payout review, compliance, suspension, and termination. " +
  "The partner must review this complete version before accepting it.";

describe("partner agreement UI", () => {
  it("renders the exact published version and requires explicit review confirmation", () => {
    const view = render(
      <PartnerAgreementCard
        agreement={{
          id: "version-1",
          title: "Affiliate Terms",
          version: "2026.1",
          content: FULL_TEXT,
          contentHash: "a".repeat(64),
          required: true,
          acknowledged: false,
        }}
        token="partner-token"
        onAccepted={() => undefined}
      />,
    );

    expect(view.textContent).toContain("Affiliate Terms");
    expect(view.textContent).toContain("Version 2026.1 · Required");
    expect(view.textContent).toContain(FULL_TEXT);
    expect(view.querySelector('[aria-label="Affiliate Terms, full text"]')?.getAttribute("tabindex")).toBe("0");
    const checkbox = view.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const button = view.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    act(() => checkbox.click());
    expect(button.disabled).toBe(false);
  });

  it("fails closed when complete content integrity evidence is absent", () => {
    const view = render(
      <PartnerAgreementCard
        agreement={{
          id: "version-incomplete",
          title: "Affiliate Terms",
          version: "2026.1",
          content: FULL_TEXT,
          contentHash: "not-a-content-hash",
          required: true,
          acknowledged: false,
        }}
        token="partner-token"
        onAccepted={() => undefined}
      />,
    );
    expect(view.textContent).toContain("Complete agreement text and integrity evidence are required");
    expect(view.querySelector("button")).toBeNull();
  });

  it("shows immutable acceptance evidence without another acceptance control", () => {
    const view = render(
      <PartnerAgreementCard
        agreement={{
          id: "version-accepted",
          title: "Affiliate Terms",
          version: "2026.1",
          content: FULL_TEXT,
          contentHash: "b".repeat(64),
          required: true,
          acknowledged: true,
          acceptedAt: "2026-07-25T22:33:00.000Z",
        }}
        token="partner-token"
        onAccepted={() => undefined}
      />,
    );
    expect(view.textContent).toContain("Accepted");
    expect(view.textContent).toContain("audit record");
    expect(view.querySelector("button")).toBeNull();
  });
});
