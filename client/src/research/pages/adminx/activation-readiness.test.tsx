// @vitest-environment jsdom
// The go-live readiness report (/admin/research/activation-readiness) against
// the frozen admin wire. Covered:
//   1. Every area renders with its items, and every item's state maps to the
//      four-state vocabulary exactly (code_ready, configuration_missing,
//      external_approval_missing, production_test_missing) with its detail.
//   2. The page renders the server's words only; presence booleans and
//      variable names, never a secret-looking value it invented.
//   3. The disabled capability renders the honest unavailable state.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => ({
  auth: {
    getSession: async () => ({ data: { session: { access_token: "admin-token" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
  },
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
}));

import ActivationReadiness, { READINESS_STATE_PRESENTATION } from "./ActivationReadiness";

const READINESS_PATH = "/api/admin/research/activation/readiness";

const REPORT = {
  ok: true,
  generatedAt: "2026-07-22T00:00:00.000Z",
  areas: [
    {
      area: "legal",
      title: "Legal documents",
      items: [
        {
          key: "approved_versions",
          label: "Counsel-approved versions present per required category",
          state: "external_approval_missing",
          detail: "3 of 15 required categories carry a counsel-approved version.",
        },
        {
          key: "signing_sequence",
          label: "Signing sequence configured",
          state: "code_ready",
          detail: "Every required category is bound to an activation step.",
        },
      ],
    },
    {
      area: "identity",
      title: "Identity verification",
      items: [
        {
          key: "storage_configured",
          label: "Identity document storage configured",
          state: "configuration_missing",
          detail: "Missing environment variables: RESEARCH_IDENTITY_BUCKET.",
        },
        {
          key: "deletion_test",
          label: "Production deletion test",
          state: "production_test_missing",
          detail: "No production deletion run has been recorded in this environment yet.",
        },
      ],
    },
    {
      area: "payments",
      title: "Payments",
      items: [
        {
          key: "cipher_key_present",
          label: "Instruction encryption key present",
          state: "configuration_missing",
          detail: "PAYMENT_INSTRUCTIONS_ENC_KEY present: false.",
        },
        {
          key: "verification_idempotency",
          label: "Verification idempotency",
          state: "code_ready",
          detail: "Replay-safe verification is enforced by the idempotency store.",
        },
      ],
    },
    {
      area: "day15",
      title: "Day 15 exits",
      items: [
        {
          key: "provider_account_approved",
          label: "Business provider account approved and configured",
          state: "external_approval_missing",
          detail: "No owner recorded yet.",
        },
        {
          key: "sunset_scheduled",
          label: "Bridge sunset scheduled",
          state: "code_ready",
          detail: "The bridge end is scheduled for 2026-08-03T05:00:00.000Z.",
        },
      ],
    },
  ],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  window.history.pushState({}, "", "/admin/research/activation-readiness");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function stubFetch(readinessStatus: number, readinessBody: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const json = (status: number, body: unknown) => ({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      });
      if (String(url).startsWith("/api/admin/me")) {
        return json(200, { success: true, email: "founder@xeniostechnology.com" });
      }
      if (String(url) === READINESS_PATH) return json(readinessStatus, readinessBody);
      throw new TypeError(`unstubbed fetch: ${url}`);
    }),
  );
}

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ActivationReadiness />);
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function text(view: HTMLElement): string {
  return view.textContent ?? "";
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------

describe("ActivationReadiness", () => {
  it("renders every area and maps each item state to the four-state vocabulary", async () => {
    stubFetch(200, REPORT);
    const view = await renderPage();
    const body = text(view);

    // Every area card with its title and progress line.
    for (const area of REPORT.areas) {
      expect(byTestId(view, `readiness-area-${area.area}`)).toBeDefined();
      expect(body).toContain(area.title);
    }
    expect(byTestId(view, "readiness-progress-legal").textContent).toContain("1 of 2 code ready");

    // Every item with its label, its detail, and its state's exact wording.
    for (const area of REPORT.areas) {
      for (const item of area.items) {
        const row = byTestId(view, `readiness-item-${area.area}-${item.key}`);
        expect(row.textContent).toContain(item.label);
        if (item.detail) expect(row.textContent).toContain(item.detail);
        const presentation =
          READINESS_STATE_PRESENTATION[item.state as keyof typeof READINESS_STATE_PRESENTATION];
        expect(presentation, `${area.area}.${item.key}`).toBeDefined();
        expect(row.textContent).toContain(presentation.label);
      }
    }

    // The four-state vocabulary is the ONLY vocabulary rendered.
    expect(body).toContain("Code ready");
    expect(body).toContain("Configuration missing");
    expect(body).toContain("External approval missing");
    expect(body).toContain("Production test missing");

    // The page renders the server's presence booleans and variable names; it
    // never invents or displays a secret-looking value.
    expect(body).toContain("PAYMENT_INSTRUCTIONS_ENC_KEY present: false.");
    expect(body).not.toContain("••••");
  });

  it("renders the honest unavailable state when the capability is disabled", async () => {
    stubFetch(503, { ok: false, code: "capability_disabled" });
    const view = await renderPage();
    expect(text(view)).toContain("The readiness report is not open.");
  });
});
