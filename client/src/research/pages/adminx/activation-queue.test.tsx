// @vitest-environment jsdom
// The founding-activation payment verification queue (/admin/research/
// activation-queue) against the frozen admin wire. Covered:
//   1. The queue renders every field: reference, member, amounts, the full
//      member report, evidence reference, prior attempts, and duplicates.
//   2. The verify dialog requires EVERY verification field plus the exact
//      confirmation sentence checkbox (never prechecked); a disabled submit
//      never posts; the posted wire carries integer cents, confirmedReceived
//      exactly true, and an idempotency key.
//   3. A written-detail transition (reject) refuses to post without a detail.

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

import ActivationQueue, { VERIFY_CONFIRMATION_SENTENCE } from "./ActivationQueue";

const QUEUE_PATH = "/api/admin/research/activation/queue";
const IDENTITY_QUEUE_PATH = "/api/admin/research/activation/identity/queue";
const REF = "XRM-ABCDEFG2";

const ENTRY = {
  obligationId: "ob-1",
  humanRef: REF,
  memberId: "member-aaaa-1111",
  type: "activation_50",
  expectedAmountCents: 5000,
  currency: "USD",
  description: "Founding membership activation, $50.",
  status: "submitted",
  bridgePhase: "phase_a_manual_bridge",
  method: { methodId: "zelle-1", label: "Zelle" },
  submission: {
    methodId: "zelle-1",
    amountCents: 5000,
    sentDate: "2026-07-21",
    sentTime: "14:05",
    senderName: "Member Aye Test",
    senderContact: "aye@example.test",
    senderIdentifierMasked: "8842",
    externalRef: "ZP-1001",
    xeniosRef: REF,
    note: "Sent from my phone.",
    evidenceRef: "payment-evidence/xenios-research/member-aaaa-1111/ob-1-aa11",
    accuracyCertified: true,
    submittedAt: "2026-07-21T19:05:00.000Z",
  },
  createdAt: "2026-07-20T00:00:00.000Z",
  dueAt: "2026-08-03T00:00:00.000Z",
  expiresAt: null,
  duplicates: [
    { obligationId: "ob-9", humanRef: "XRM-DUPLICA9", memberId: "member-bbbb-2222", status: "submitted" },
  ],
  priorAttempts: 2,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  window.history.pushState({}, "", "/admin/research/activation-queue");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

type ActionRoute = { method: string; path: string; status: number; body: unknown };
type RecordedCall = { url: string; method: string; body: string | undefined };

function stubFetch(actions: ActionRoute[] = []): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      const json = (status: number, body: unknown) => ({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      });
      if (String(url).startsWith("/api/admin/me")) {
        return json(200, { success: true, email: "founder@xeniostechnology.com" });
      }
      const action = actions.find((r) => r.method === method && r.path === String(url));
      if (action) return json(action.status, action.body);
      if (method === "GET" && String(url) === QUEUE_PATH) return json(200, { ok: true, queue: [ENTRY] });
      if (method === "GET" && String(url) === IDENTITY_QUEUE_PATH) return json(200, { ok: true, queue: [] });
      throw new TypeError(`unstubbed fetch: ${method} ${url}`);
    }),
  );
  return calls;
}

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ActivationQueue />);
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

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---------------------------------------------------------------------------

describe("ActivationQueue", () => {
  it("renders every queue field including the report, evidence, duplicates, and prior attempts", async () => {
    stubFetch();
    const view = await renderPage();
    const body = text(view);

    expect(body).toContain(REF);
    expect(body).toContain("member-aaaa-1111");
    expect(body).toContain("$50.00");
    expect(body).toContain("Member Aye Test");
    expect(body).toContain("ZP-1001");
    expect(body).toContain("8842");
    expect(byTestId(view, `evidence-${REF}`).textContent).toContain("payment-evidence/");
    expect(byTestId(view, `prior-attempts-${REF}`).textContent).toBe("2");
    const duplicates = byTestId(view, `duplicates-${REF}`);
    expect(duplicates.textContent).toContain("XRM-DUPLICA9");
    expect(duplicates.textContent).toContain("member-bbbb-2222");
  });

  it("requires every verification field plus the exact confirmation sentence, never prechecked", async () => {
    const calls = stubFetch([
      {
        method: "POST",
        path: "/api/admin/research/activation/queue/ob-1/verify",
        status: 200,
        body: { ok: true, replayed: false, period: { endsAt: "2026-08-21T00:00:00.000Z" } },
      },
    ]);
    const view = await renderPage();

    await act(async () => {
      byTestId<HTMLButtonElement>(view, `verify-open-${REF}`).click();
    });

    // The exact sentence renders with the checkbox, and it starts UNCHECKED.
    expect(text(view)).toContain(VERIFY_CONFIRMATION_SENTENCE);
    expect(VERIFY_CONFIRMATION_SENTENCE).toBe(
      "I confirm that I checked the receiving account and verified that this payment was received.",
    );
    const confirm = byTestId<HTMLInputElement>(view, `verify-confirm-${REF}`);
    expect(confirm.checked).toBe(false);

    // Empty form: disabled; a click posts nothing.
    const submit = byTestId<HTMLButtonElement>(view, `verify-submit-${REF}`);
    expect(submit.disabled).toBe(true);
    await act(async () => {
      submit.click();
    });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    // Every field filled but the confirmation still unchecked: still disabled.
    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `verify-amount-${REF}`), "50.00");
      setInputValue(byTestId<HTMLInputElement>(view, `verify-date-${REF}`), "2026-07-21");
      setInputValue(byTestId<HTMLInputElement>(view, `verify-destination-${REF}`), "recv-acct-1");
      setInputValue(byTestId<HTMLInputElement>(view, `verify-reconciliation-${REF}`), "2026-07-22");
    });
    expect(byTestId<HTMLButtonElement>(view, `verify-submit-${REF}`).disabled).toBe(true);

    // The admin's own click on the confirmation enables the verify.
    await act(async () => {
      confirm.click();
    });
    expect(byTestId<HTMLButtonElement>(view, `verify-submit-${REF}`).disabled).toBe(false);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, `verify-submit-${REF}`).click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/admin/research/activation/queue/ob-1/verify");
    const wire = JSON.parse(post?.body ?? "{}");
    expect(wire.amountReceivedCents).toBe(5000);
    expect(Number.isInteger(wire.amountReceivedCents)).toBe(true);
    expect(wire.dateReceived).toBe("2026-07-21");
    expect(wire.receivingDestinationRef).toBe("recv-acct-1");
    expect(wire.methodId).toBe("zelle-1");
    expect(wire.reconciliationDate).toBe("2026-07-22");
    expect(wire.confirmedReceived).toBe(true);
    expect(typeof wire.idempotencyKey).toBe("string");
    expect(wire.idempotencyKey.length).toBeGreaterThan(0);

    // The queue reloaded after the change.
    expect(calls.filter((c) => c.method === "GET" && c.url === QUEUE_PATH).length).toBeGreaterThanOrEqual(2);
  });

  it("refuses a written-detail transition without a detail", async () => {
    const calls = stubFetch([
      {
        method: "POST",
        path: "/api/admin/research/activation/queue/ob-1/reject",
        status: 200,
        body: { ok: true, obligation: { ...ENTRY, status: "rejected" } },
      },
    ]);
    const view = await renderPage();

    await act(async () => {
      byTestId<HTMLButtonElement>(view, `action-reject-${REF}`).click();
    });
    const submit = byTestId<HTMLButtonElement>(view, `action-submit-${REF}`);
    expect(submit.disabled).toBe(true);
    await act(async () => {
      submit.click();
    });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await act(async () => {
      setInputValue(byTestId<HTMLTextAreaElement>(view, `action-detail-${REF}`), "Amount could not be located.");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, `action-submit-${REF}`).click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/admin/research/activation/queue/ob-1/reject");
    expect(JSON.parse(post?.body ?? "{}")).toEqual({ detail: "Amount could not be located." });
  });
});
