// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ResearchProvider } from "./core";
import ResearchLayout from "./layout";

/**
 * Founder decision 2026-07-30 ("option 1"): the discover-and-apply entry to
 * Research is public; everything else keeps the shared review password.
 *
 * shared/research/public-entry.test.ts pins the path ALLOWLIST. This file pins
 * the BEHAVIOUR, which is the part that actually protects the catalog: with the
 * gate genuinely locked, does the layout render the page or the password wall?
 * A path-helper test alone would still pass if someone rewired the layout.
 *
 * The gate state is driven the real way, through a mocked /api/research/me
 * returning { configured: true, authed: false }, so the component runs its own
 * state machine rather than being handed a value.
 */

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: () => null,
  isSupabaseBrowserConfigured: () => false,
}));

const PAGE_MARKER = "the page behind the gate";
const WALL_MARKER = "Access password";

let root: Root;
let container: HTMLElement;

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ResearchProvider>
        <ResearchLayout>
          <p>{PAGE_MARKER}</p>
        </ResearchLayout>
      </ResearchProvider>,
    );
  });
  await flush();
  return container;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.body.innerHTML = "";
  vi.clearAllMocks();
  // configured + NOT authed is exactly the state a first-time public visitor
  // hits: the shared password is set in production, and they do not have it.
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ configured: true, authed: false, publicMode: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("public entry, with the shared review gate LOCKED", () => {
  const OPEN = [
    ["/research", "the gateway, which carries the apply and sign-in actions"],
    ["/research/apply", "the membership application itself"],
    ["/research/apply/status", "an applicant checking their status from a fresh browser"],
    ["/research/application-status", "the registered alias for the same"],
    ["/research/privacy", "the exact privacy link in the gateway footer (post-#154)"],
    ["/research/terms", "the exact terms link in the gateway footer (post-#154)"],
    ["/research/support", "the exact support link in the gateway footer (post-#154)"],
    ["/research/policies/privacy", "the privacy link in MinimalChrome's footer"],
    ["/research/policies/terms", "the terms link in MinimalChrome's footer"],
  ] as const;

  it.each(OPEN)("renders %s without the password wall (%s)", async (path) => {
    const el = await renderAt(path);
    expect(el.textContent).toContain(PAGE_MARKER);
    expect(el.textContent).not.toContain(WALL_MARKER);
  });

  const GATED = [
    "/research/member",
    "/research/member/products",
    "/research/member/orders",
    "/research/member/documents",
    "/research/partners/dashboard",
    "/research/activate", // PR #147's activation lane, not public entry
    "/research/policies/research-use", // only the two linked policy slugs are open
    // Near-misses: a prefix match instead of an exact allowlist would open these.
    "/research/apply-admin",
    "/research/applyx",
    "/research/applications",
  ];

  it.each(GATED)("still shows the password wall on %s", async (path) => {
    const el = await renderAt(path);
    expect(el.textContent).toContain(WALL_MARKER);
    expect(el.textContent).not.toContain(PAGE_MARKER);
  });

  it("keeps the catalog behind the wall, which is the whole point of the gate", async () => {
    // The review gate exists to keep the peptide catalog private while COAs and
    // legal review are outstanding. If this ever inverts, the change was wrong
    // regardless of how convenient the front door became.
    const el = await renderAt("/research/member/products");
    expect(el.textContent).toContain(WALL_MARKER);
  });
});
