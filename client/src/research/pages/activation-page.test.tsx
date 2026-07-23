// @vitest-environment jsdom
// The Founding Membership activation stepper (/research/activate) against the
// frozen member wire (server/research/membership-activation/routes.ts).
// Covered here, per the canonical-pricing contract:
//   1. The canonical pricing block renders VERBATIM, and the ONLY "$25" on
//      the page is inside "Then $25 for each additional 30-day membership
//      period." No $25 is ever presented as due at activation, and $50/$25
//      never render as competing choices.
//   2. Receiving instructions render MASKED ONLY, next to the required
//      "Submitting payment information does not activate your membership."
//      sentence and the duplicate-payment warning.
//   3. The report form's accuracy certification is NEVER prechecked, and the
//      submit stays disabled until every required field plus the
//      certification are affirmatively provided; the posted wire carries
//      integer cents and accuracyCertified exactly true.
//   4. While the founding-activation flag is off (503 capability_disabled ->
//      "unavailable"), the page renders the truthful not-open state.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../core";
import ActivationPage from "./ActivationPage";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

// Only the fields the page reads; the rest of the provider surface is
// irrelevant here (test-only cast, same pattern as persona-states.test.tsx).
function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "pending_activation", applicationStatus: "approved" },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

const SUBMISSION_CONTRACT =
  "Submitting this report does not activate or extend your membership. " +
  "Xenios verifies every payment by hand before your membership changes.";

const STATUS_BODY = {
  ok: true,
  steps: [
    { step: "application", state: "complete", detail: null },
    { step: "claim", state: "complete", detail: null },
    { step: "email", state: "complete", detail: null },
    { step: "consents", state: "complete", detail: null },
    { step: "identity", state: "complete", detail: null },
    { step: "agreements", state: "complete", detail: null },
    { step: "obligation", state: "complete", detail: null },
    { step: "payment", state: "action_required", detail: "Send your activation payment and report it here." },
    { step: "verification", state: "pending", detail: "Xenios verifies every payment by hand." },
    { step: "active", state: "pending", detail: null },
  ],
  currentStep: "payment",
  active: false,
  membershipStatus: "pending_activation",
  activatedAt: null,
  renewalDate: null,
  submissionContract: SUBMISSION_CONTRACT,
};

const IDENTITY_BODY = {
  ok: true,
  case: {
    status: "verified",
    consentVersion: "icv-1",
    consentRecordedAt: "2026-07-20T00:00:00.000Z",
    uploadedAt: "2026-07-20T01:00:00.000Z",
    outcome: "verified",
    rejectionCategory: null,
  },
  guidance: ["You may cover parts of your ID before photographing it."],
};

const AGREEMENTS_BODY = {
  ok: true,
  agreements: [],
  satisfied: true,
  blocking: [],
  formState: { affirmativeConsent: false, fullDocumentShown: false, separateAcknowledgment: false, typedLegalName: "" },
};

const OBLIGATION_BODY = {
  ok: true,
  obligation: {
    xeniosRef: "XRM-TESTREF1",
    type: "activation_50",
    status: "due",
    expectedAmountCents: 5000,
    currency: "USD",
    description:
      "Founding membership activation, $50. Includes your first 30 calendar days of membership. No separate $25 renewal is due at activation.",
    dueAt: "2026-08-05T00:00:00.000Z",
    methodId: "zelle-1",
    methodLabel: "Zelle",
    submittedAt: null,
    receiptRef: null,
  },
  submissionContract: SUBMISSION_CONTRACT,
};

const METHODS_BODY = {
  ok: true,
  methods: [
    {
      methodId: "zelle-1",
      memberFacingName: "Zelle",
      category: "manual_external_payment",
      currency: "USD",
      activationEligible: true,
      renewalEligible: true,
      minAmountCents: null,
      maxAmountCents: null,
      settlementTime: "same day",
      receivingInstructionsMasked: "••••11",
      mobileInstructions: "Open your banking app and choose Zelle.",
      desktopInstructions: null,
      memoInstructions: "Include your XRM reference in the payment memo.",
      deepLinkRef: null,
      qrAssetRef: null,
      supportContactRef: null,
      memoReference: "XRM-TESTREF1",
    },
  ],
  memoReference: "XRM-TESTREF1",
  submissionContract: SUBMISSION_CONTRACT,
};

type RecordedCall = { url: string; method: string; body: string | undefined };

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

function stubActivationApi(
  overrides: Partial<Record<string, { status: number; body: unknown }>> = {},
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const routes: Record<string, { status: number; body: unknown }> = {
    "GET /api/research/activation/status": { status: 200, body: STATUS_BODY },
    "GET /api/research/activation/identity/status": { status: 200, body: IDENTITY_BODY },
    "GET /api/research/activation/agreements": { status: 200, body: AGREEMENTS_BODY },
    "GET /api/research/activation/payment/obligation": { status: 200, body: OBLIGATION_BODY },
    "GET /api/research/activation/payment/methods": { status: 200, body: METHODS_BODY },
    "POST /api/research/activation/payment/report": {
      status: 200,
      body: { ok: true, obligation: { ...OBLIGATION_BODY.obligation, status: "submitted" }, submissionContract: SUBMISSION_CONTRACT },
    },
    ...overrides,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      const route = routes[`${method} ${String(url)}`];
      if (route) return jsonResponse(route.status, route.body);
      throw new TypeError(`unstubbed fetch: ${method} ${url}`);
    }),
  );
  return calls;
}

async function renderPage(): Promise<HTMLDivElement> {
  window.history.pushState({}, "", "/research/activate");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={fixtureContext()}>
        <ActivationPage />
      </ResearchContext.Provider>,
    );
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

describe("ActivationPage canonical pricing", () => {
  it("renders the canonical Founding Membership pricing block verbatim", async () => {
    stubActivationApi();
    const view = await renderPage();
    const body = text(view);

    expect(body).toContain("Founding Membership");
    expect(body).toContain("$50 due today");
    expect(body).toContain("Includes your activation and first 30 days of membership.");
    expect(body).toContain("Then $25 for each additional 30-day membership period.");
    expect(body).toContain("Your first renewal date will be calculated when your activation payment is verified.");
  });

  it("never shows $25 at activation and never as a competing choice", async () => {
    stubActivationApi();
    const view = await renderPage();
    const body = text(view);

    // The ONLY $25 on the page is the canonical additional-period sentence
    // (the server's obligation description restates the same rule).
    const withoutCanonical = body
      .split("Then $25 for each additional 30-day membership period.")
      .join("")
      .split("No separate $25 renewal is due at activation.")
      .join("");
    expect(withoutCanonical).not.toContain("$25");

    // No monthly-membership framing anywhere on the activation surface.
    expect(body.toLowerCase()).not.toContain("monthly membership");
    expect(body).not.toContain("$25/month");
    expect(body).not.toContain("$25 / month");
    // The old competing-choice card pair never renders.
    expect(body).not.toContain("One-time activation");
  });

  it("renders the truthful not-open state while the flag is off (capability_disabled)", async () => {
    stubActivationApi({
      "GET /api/research/activation/status": {
        status: 503,
        body: { ok: false, code: "capability_disabled", message: "Founding membership activation is not enabled." },
      },
    });
    const view = await renderPage();
    expect(byTestId(view, "activation-not-open").textContent).toContain("Activation is not open yet.");
    // The pricing stays stated even while the flow is closed; nothing else
    // pretends to be live.
    expect(text(view)).toContain("$50 due today");
    expect(view.querySelector('[data-testid="payment-report-form"]')).toBeNull();
  });
});

describe("ActivationPage payment step", () => {
  it("renders masked-only receiving instructions with the no-activation sentence and the duplicate warning", async () => {
    stubActivationApi();
    const view = await renderPage();

    // Masked destination only; the memo reference with a copy control.
    expect(byTestId(view, "payment-masked-destination").textContent).toBe("••••11");
    expect(byTestId(view, "payment-xrm").textContent).toBe("XRM-TESTREF1");
    expect(view.querySelector('[data-testid="copy-memo"]')).not.toBeNull();

    // The required sentence, verbatim.
    expect(byTestId(view, "payment-not-activation").textContent).toBe(
      "Submitting payment information does not activate your membership. Xenios must confirm that the funds were received.",
    );

    // The duplicate-payment warning.
    const warning = byTestId(view, "payment-duplicate-warning");
    expect(warning.textContent).toContain("Send exactly one payment.");
    expect(warning.textContent).toContain("do not send it again");

    // Expiration surface: the obligation due date renders.
    expect(text(view)).toContain("Due by");
  });

  it("never prechecks the report certification and keeps submit disabled until everything is provided", async () => {
    const calls = stubActivationApi();
    const view = await renderPage();

    const certify = byTestId<HTMLInputElement>(view, "report-certify");
    expect(certify.checked).toBe(false);

    const submit = byTestId<HTMLButtonElement>(view, "report-submit");
    expect(submit.disabled).toBe(true);

    // Filling the required fields is not enough without the certification.
    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, "report-amount"), "50.00");
      setInputValue(byTestId<HTMLInputElement>(view, "report-sent-date"), "2026-07-21");
      setInputValue(byTestId<HTMLInputElement>(view, "report-sender-name"), "Sam Tester");
    });
    expect(byTestId<HTMLButtonElement>(view, "report-submit").disabled).toBe(true);

    // A disabled submit never posts.
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "report-submit").click();
    });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    // The member's own affirmative click enables it.
    await act(async () => {
      certify.click();
    });
    expect(byTestId<HTMLButtonElement>(view, "report-submit").disabled).toBe(false);

    // The submission contract renders verbatim next to the form.
    expect(byTestId(view, "report-submission-contract").textContent).toBe(SUBMISSION_CONTRACT);
    // The redaction guidance sits with the evidence input.
    expect(byTestId(view, "evidence-redaction-guidance").textContent).toContain("redact");
  });

  it("posts integer cents and accuracyCertified exactly true", async () => {
    const calls = stubActivationApi();
    const view = await renderPage();

    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, "report-amount"), "50.00");
      setInputValue(byTestId<HTMLInputElement>(view, "report-sent-date"), "2026-07-21");
      setInputValue(byTestId<HTMLInputElement>(view, "report-sender-name"), "Sam Tester");
    });
    await act(async () => {
      byTestId<HTMLInputElement>(view, "report-certify").click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "report-submit").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST" && c.url === "/api/research/activation/payment/report");
    expect(post).toBeTruthy();
    const wire = JSON.parse(post!.body ?? "{}");
    expect(wire.amountCents).toBe(5000);
    expect(Number.isInteger(wire.amountCents)).toBe(true);
    expect(wire.accuracyCertified).toBe(true);
    expect(wire.senderName).toBe("Sam Tester");
    expect(wire.sentDate).toBe("2026-07-21");
  });
});

// ---------------------------------------------------------------------------
// Agreements step: the embedded-signer vs AgreementSignCard choice is driven
// ENTIRELY by the server's status.embeddedEsignEnabled, read on every render.
// (Release blocker #2: the page must not hardcode the native signer.)
// ---------------------------------------------------------------------------

function agreementFixture(over: Record<string, unknown> = {}) {
  return {
    category: "membership_terms",
    title: "Membership Terms",
    documentVersionId: "dv-a1",
    semver: "1.0.0",
    requirement: "required",
    activationStep: 1,
    requiresSeparateAcknowledgment: false,
    jurisdiction: "US",
    effectiveDate: "2026-01-01",
    content: "MEMBERSHIP TERMS FULL TEXT.",
    contentHash: "hash-a1",
    signed: false,
    signedCurrentVersion: false,
    ...over,
  };
}

/** Stub the activation reads, with GET status answering embeddedEsignEnabled
 * from a per-call sequence (the last entry repeats) so a reload can flip the
 * flag, and GET agreements answering a fixed list. */
function stubToggleApi(opts: { statusSeq: boolean[]; agreements: unknown[]; satisfied?: boolean }): RecordedCall[] {
  const calls: RecordedCall[] = [];
  let statusCall = 0;
  const agreementsBody = {
    ok: true,
    agreements: opts.agreements,
    satisfied: opts.satisfied ?? false,
    blocking: [],
    formState: AGREEMENTS_BODY.formState,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const u = String(url);
      calls.push({ url: u, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (method === "GET" && u === "/api/research/activation/status") {
        const idx = Math.min(statusCall, opts.statusSeq.length - 1);
        statusCall += 1;
        return jsonResponse(200, { ...STATUS_BODY, embeddedEsignEnabled: opts.statusSeq[idx] });
      }
      if (method === "GET" && u === "/api/research/activation/identity/status") return jsonResponse(200, IDENTITY_BODY);
      if (method === "GET" && u === "/api/research/activation/agreements") return jsonResponse(200, agreementsBody);
      if (method === "GET" && u === "/api/research/activation/payment/obligation") return jsonResponse(200, OBLIGATION_BODY);
      if (method === "GET" && u === "/api/research/activation/payment/methods") return jsonResponse(200, METHODS_BODY);
      throw new TypeError(`unstubbed fetch: ${method} ${u}`);
    }),
  );
  return calls;
}

async function extraFlush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("ActivationPage agreements step toggle", () => {
  it("renders the embedded signer when the server enables it", async () => {
    stubToggleApi({ statusSeq: [true], agreements: [agreementFixture()] });
    const view = await renderPage();

    expect(view.querySelector('[data-testid="embedded-signer"]')).not.toBeNull();
    expect(byTestId(view, "embedded-progress").textContent).toBe("Agreement 1 of 1");
    // The fallback card path is NOT rendered.
    expect(view.querySelector('[data-testid="agreement-membership_terms"]')).toBeNull();
  });

  it("renders the AgreementSignCard path when the server disables it", async () => {
    stubToggleApi({ statusSeq: [false], agreements: [agreementFixture()] });
    const view = await renderPage();

    // The per-document card path, with its own sign control, is what renders.
    expect(view.querySelector('[data-testid="agreement-membership_terms"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="agreement-sign-membership_terms"]')).not.toBeNull();
    // The native embedded signer is absent.
    expect(view.querySelector('[data-testid="embedded-signer"]')).toBeNull();
    expect(view.querySelector('[data-testid="embedded-progress"]')).toBeNull();
  });

  it("falls back to the card path after a reload flips the flag off (rollback)", async () => {
    // First status enables the embedded signer; the already-signed agreement
    // makes the signer complete on mount, which calls reload. The second status
    // fetch has the flag rolled back off, so the step re-renders the card path
    // (proving the choice reads the CURRENT status, not a one-time value).
    stubToggleApi({ statusSeq: [true, false], agreements: [agreementFixture({ signed: true })], satisfied: true });
    const view = await renderPage();
    await extraFlush();

    expect(view.querySelector('[data-testid="embedded-signer"]')).toBeNull();
    expect(view.querySelector('[data-testid="embedded-signer-complete"]')).toBeNull();
    expect(view.querySelector('[data-testid="agreement-membership_terms"]')).not.toBeNull();
  });

  it("keeps an already-signed agreement readable in the card path after rollback", async () => {
    stubToggleApi({ statusSeq: [false], agreements: [agreementFixture({ signed: true })], satisfied: true });
    const view = await renderPage();

    const card = byTestId(view, "agreement-membership_terms");
    // The signed state is shown, and the full document stays readable.
    expect(card.textContent).toContain("Signed");
    expect(view.querySelector('[data-testid="agreement-content-membership_terms"]')).not.toBeNull();
    expect(byTestId(view, "agreement-content-membership_terms").textContent).toContain("MEMBERSHIP TERMS FULL TEXT.");
    // Nothing about the toggle re-opens a sign form for an already-signed doc.
    expect(view.querySelector('[data-testid="agreement-sign-membership_terms"]')).toBeNull();
  });
});
