// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import Navbar from "./Navbar";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { if (root) act(() => root?.unmount()); host?.remove(); root = null; host = null; });

describe("global account entry", () => {
  it("renders persistent Sign in, Get access, and Menu controls outside the closed menu overlay", async () => {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root?.render(<Navbar />));
    const header = host.querySelector("header")!;
    expect(header.querySelector('a[href="/research/sign-in"]')?.textContent).toContain("Sign in");
    expect(header.querySelector('a[href="/research/access-hub#account-access"]')?.textContent).toContain("Get access");
    expect(header.querySelector('button[aria-label="Open full site menu"]')?.textContent).toContain("Menu");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(header.textContent).not.toContain("Request Early Access");
  });
});
