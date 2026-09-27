// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ActivationAuthorityPage } from "./AccountAuthorityPages";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("activation authority alias", () => {
  it("gives honest guidance at token-free /activate without implying an application or account", async () => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/activate");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root?.render(<ActivationAuthorityPage />));

    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("h1")?.textContent).toBe("Activate your account");
    expect(host.textContent).toContain("Activation needs the secure link Xenios emailed after approval.");
    expect(host.querySelector('a[href="/support"]')).not.toBeNull();
    expect(host.querySelector('a[href="/sign-in"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="form-claim-account"]')).toBeNull();
    expect(host.textContent).not.toContain("Account access confirmed");
  });
});
