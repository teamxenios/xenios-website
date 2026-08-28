// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ACCOUNT_PORTAL_ROUTES } from "../lib/routes";
import { AccountResourceBoundary, accountSignInHref } from "./resource";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function deniedSignInHref(path: string): string | null {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AccountResourceBoundary snapshot={{ state: "denied", reason: "auth_required" }}>
        {() => null}
      </AccountResourceBoundary>,
    );
  });
  return container.querySelector("a")?.getAttribute("href") ?? null;
}

describe("account resource reauthentication", () => {
  it("preserves every static account page and a bounded order detail", () => {
    const paths = [
      ...Object.values(ACCOUNT_PORTAL_ROUTES).filter((path) => !path.includes(":")),
      "/research/account/orders/XRR-Fixture_01?from=expired-session",
    ];

    for (const path of paths) {
      const href = deniedSignInHref(path);
      const parsed = new URL(href!, "https://xenios.invalid");
      expect(parsed.pathname, path).toBe("/research/sign-in");
      expect(parsed.searchParams.get("returnTo"), path).toBe(path);

      act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });

  it("drops malformed, encoded, and parked account destinations", () => {
    for (const path of [
      "/research/account/orders/:reference",
      "/research/account/orders/XRR%2FFixture_01",
      "/research/account/orders/XRR-Fixture_01/extra",
      "/research/account/organizations/private-record",
    ]) {
      expect(accountSignInHref(path), path).toBe("/research/sign-in");
    }
  });
});
