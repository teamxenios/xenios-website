// @vitest-environment jsdom
// The native, in-page e-signature signer (activation agreements step). Covered:
//   1. It renders "Agreement 1 of N" and the FULL published contract text.
//   2. "Sign and continue" stays DISABLED until both acknowledgments, a legal
//      name, and a signature are provided; the separate-acknowledgment checkbox
//      appears and gates when requiresSeparateAcknowledgment is true.
//   3. A typed signature submits with signatureMethod "typed" (drawnPngBase64
//      null).
//   4. Drawing then signing submits signatureMethod "drawn" with a non-null
//      drawnPngBase64.
//   5. On ok it shows the success state and advances to agreement 2.
//   6. A capability_disabled response shows the honest not-enabled state.
//   7. Nothing is prechecked on mount.
// fetch is stubbed with json content-type headers, matching the api lib; the
// signature canvas is mocked (jsdom has no 2d canvas context).

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The real react-signature-canvas needs a live 2d canvas; mock it with a class
// that exposes the same instance methods the component calls via its ref, and
// simulates a completed stroke on click (firing onEnd).
vi.mock("react-signature-canvas", async () => {
  const React = await import("react");
  class MockSignatureCanvas extends React.Component<any> {
    _drawn = false;
    isEmpty() {
      return !this._drawn;
    }
    clear() {
      this._drawn = false;
    }
    toDataURL() {
      return "data:image/png;base64,UNTRIMMEDPNG==";
    }
    // The component prefers the TRIMMED canvas; return a distinct data URL so a
    // test can prove the trimmed export (not the raw pad) is what ships.
    getTrimmedCanvas() {
      return { toDataURL: () => "data:image/png;base64,TRIMMEDPNG==" } as unknown as HTMLCanvasElement;
    }
    _simulateDraw = () => {
      this._drawn = true;
      if (typeof this.props.onEnd === "function") this.props.onEnd();
    };
    render() {
      const cp = this.props.canvasProps || {};
      return React.createElement("canvas", {
        ...cp,
        "data-testid": "mock-signature-canvas",
        onClick: this._simulateDraw,
      });
    }
  }
  return { default: MockSignatureCanvas };
});

import EmbeddedAgreementSigner from "./EmbeddedAgreementSigner";
import type { AgreementDto } from "../../adapters/activation";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

const SIGN_PATH = "/api/research/activation/esign/native/sign";

type RecordedCall = { url: string; method: string; body: string | undefined };

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

/** Stub native/sign. `respond(callIndex)` returns the body for each POST, so a
 * two-document flow can answer both signs. */
function stubSign(respond: (callIndex: number) => { status: number; body: unknown }): RecordedCall[] {
  const calls: RecordedCall[] = [];
  let signCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      if (String(url) === SIGN_PATH && method === "POST") {
        const r = respond(signCount);
        signCount += 1;
        return jsonResponse(r.status, r.body);
      }
      throw new TypeError(`unstubbed fetch: ${method} ${url}`);
    }),
  );
  return calls;
}

function mkAgreement(over: Partial<AgreementDto>): AgreementDto {
  return {
    category: "electronic_record_consent",
    title: "Electronic Records Consent",
    documentVersionId: "dv-1",
    semver: "1.0.0",
    requirement: "required",
    activationStep: 1,
    requiresSeparateAcknowledgment: false,
    jurisdiction: "US",
    effectiveDate: "2026-01-01",
    content: "FULL CONSENT TEXT.\nSecond line of the consent.",
    contentHash: "hash-1",
    signed: false,
    signedCurrentVersion: false,
    ...over,
  };
}

function okBody(documentVersionId: string, replayed = false) {
  return {
    ok: true,
    requestId: `req-${documentVersionId}`,
    documentVersionId,
    signedAt: "2026-07-23T12:00:00.000Z",
    replayed,
    status: "completed",
    signedPdfHash: "sha-signed",
    certificateHash: "sha-cert",
  };
}

async function renderSigner(agreements: AgreementDto[], onAllComplete = () => {}): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <EmbeddedAgreementSigner agreements={agreements} token="member-jwt" onAllComplete={onAllComplete} />,
    );
  });
  await flush();
  return container!;
}

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---------------------------------------------------------------------------

describe("EmbeddedAgreementSigner", () => {
  it("renders the progress and the full contract text", async () => {
    stubSign(() => ({ status: 200, body: okBody("dv-1") }));
    const view = await renderSigner([
      mkAgreement({}),
      mkAgreement({ documentVersionId: "dv-2", category: "membership_terms", title: "Membership Terms" }),
    ]);

    expect(byTestId(view, "embedded-progress").textContent).toBe("Agreement 1 of 2");
    const content = byTestId(view, "embedded-content-electronic_record_consent");
    expect(content.textContent).toContain("FULL CONSENT TEXT.");
    expect(content.textContent).toContain("Second line of the consent.");
  });

  it("keeps nothing prechecked on mount", async () => {
    stubSign(() => ({ status: 200, body: okBody("dv-1") }));
    const view = await renderSigner([mkAgreement({ requiresSeparateAcknowledgment: true })]);

    expect(byTestId<HTMLInputElement>(view, "embedded-reviewed-electronic_record_consent").checked).toBe(false);
    expect(byTestId<HTMLInputElement>(view, "embedded-accept-electronic_record_consent").checked).toBe(false);
    expect(byTestId<HTMLInputElement>(view, "embedded-separate-electronic_record_consent").checked).toBe(false);
    expect(byTestId<HTMLInputElement>(view, "embedded-name-electronic_record_consent").value).toBe("");
    // The typed method is the default; its preview shows no committed signature.
    expect(byTestId<HTMLButtonElement>(view, "embedded-sign-electronic_record_consent").disabled).toBe(true);
  });

  it("gates sign-and-continue on both acknowledgments, the separate ack, a name, and a signature", async () => {
    const calls = stubSign(() => ({ status: 200, body: okBody("dv-arb") }));
    const view = await renderSigner([
      mkAgreement({
        documentVersionId: "dv-arb",
        category: "arbitration_agreement",
        title: "Arbitration Agreement",
        requiresSeparateAcknowledgment: true,
      }),
    ]);
    const cat = "arbitration_agreement";
    const submit = () => byTestId<HTMLButtonElement>(view, `embedded-sign-${cat}`);

    // The separate-ack checkbox appears because the document requires it.
    expect(view.querySelector(`[data-testid="embedded-separate-${cat}"]`)).not.toBeNull();
    expect(submit().disabled).toBe(true);

    // Name + both acks, but the separate ack still missing -> disabled.
    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `embedded-name-${cat}`), "Sam Member");
      byTestId<HTMLInputElement>(view, `embedded-reviewed-${cat}`).click();
      byTestId<HTMLInputElement>(view, `embedded-accept-${cat}`).click();
    });
    expect(submit().disabled).toBe(true);

    // A disabled submit never posts.
    await act(async () => {
      submit().click();
    });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    // The separate acknowledgment enables it (typed method: the name is the sig).
    await act(async () => {
      byTestId<HTMLInputElement>(view, `embedded-separate-${cat}`).click();
    });
    expect(submit().disabled).toBe(false);
  });

  it("submits a typed signature with method typed and a null drawn image", async () => {
    const calls = stubSign(() => ({ status: 200, body: okBody("dv-1") }));
    const view = await renderSigner([mkAgreement({})]);
    const cat = "electronic_record_consent";

    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `embedded-name-${cat}`), "Sam Member");
      byTestId<HTMLInputElement>(view, `embedded-reviewed-${cat}`).click();
      byTestId<HTMLInputElement>(view, `embedded-accept-${cat}`).click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, `embedded-sign-${cat}`).click();
    });
    await flush();

    const post = calls.find((c) => c.method === "POST" && c.url === SIGN_PATH);
    expect(post).toBeTruthy();
    const wire = JSON.parse(post!.body ?? "{}");
    expect(wire.signatureMethod).toBe("typed");
    expect(wire.drawnPngBase64).toBeNull();
    expect(wire.typedLegalName).toBe("Sam Member");
    expect(wire.fullDocumentShown).toBe(true);
    expect(wire.affirmativeConsent).toBe(true);
    expect(wire.documentVersionId).toBe("dv-1");
    expect(typeof wire.idempotencyKey).toBe("string");
    expect(wire.idempotencyKey.length).toBeGreaterThan(0);
  });

  it("submits a drawn signature with method drawn and a non-null drawn image", async () => {
    const calls = stubSign(() => ({ status: 200, body: okBody("dv-1") }));
    const view = await renderSigner([mkAgreement({})]);
    const cat = "electronic_record_consent";

    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `embedded-name-${cat}`), "Sam Member");
      byTestId<HTMLInputElement>(view, `embedded-reviewed-${cat}`).click();
      byTestId<HTMLInputElement>(view, `embedded-accept-${cat}`).click();
      // Switch to the draw method.
      byTestId<HTMLInputElement>(view, `embedded-method-drawn-${cat}`).click();
    });
    // Draw a stroke on the (mocked) canvas.
    await act(async () => {
      byTestId(view, "mock-signature-canvas").click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, `embedded-sign-${cat}`).click();
    });
    await flush();

    const post = calls.find((c) => c.method === "POST" && c.url === SIGN_PATH);
    expect(post).toBeTruthy();
    const wire = JSON.parse(post!.body ?? "{}");
    expect(wire.signatureMethod).toBe("drawn");
    // The TRIMMED canvas is exported (not the raw pad), with the data-uri
    // prefix stripped, keeping the payload small.
    expect(wire.drawnPngBase64).toBe("TRIMMEDPNG==");
    expect(wire.drawnPngBase64).not.toBeNull();
  });

  it("shows the success state and advances to agreement 2 on ok", async () => {
    let completeCalls = 0;
    stubSign(() => ({ status: 200, body: okBody("dv-1") }));
    const view = await renderSigner(
      [
        mkAgreement({}),
        mkAgreement({ documentVersionId: "dv-2", category: "membership_terms", title: "Membership Terms" }),
      ],
      () => {
        completeCalls += 1;
      },
    );

    const cat = "electronic_record_consent";
    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `embedded-name-${cat}`), "Sam Member");
      byTestId<HTMLInputElement>(view, `embedded-reviewed-${cat}`).click();
      byTestId<HTMLInputElement>(view, `embedded-accept-${cat}`).click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, `embedded-sign-${cat}`).click();
    });
    await flush();

    // Success state for agreement 1, saved-to-document-center copy.
    expect(byTestId(view, "embedded-signed-title").textContent).toContain("Electronic Records Consent signed");
    expect(view.textContent).toContain("saved to your Document Center");

    // Continue advances to agreement 2 of 2.
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "embedded-continue").click();
    });
    await flush();
    expect(byTestId(view, "embedded-progress").textContent).toBe("Agreement 2 of 2");
    expect(view.querySelector('[data-testid="embedded-content-membership_terms"]')).not.toBeNull();
    // onAllComplete has NOT fired yet (agreement 2 still unsigned).
    expect(completeCalls).toBe(0);
  });

  it("shows the honest not-enabled state on capability_disabled, not a crash", async () => {
    stubSign(() => ({
      status: 200,
      body: { ok: false, code: "capability_disabled", message: "not enabled" },
    }));
    const view = await renderSigner([mkAgreement({})]);
    const cat = "electronic_record_consent";

    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `embedded-name-${cat}`), "Sam Member");
      byTestId<HTMLInputElement>(view, `embedded-reviewed-${cat}`).click();
      byTestId<HTMLInputElement>(view, `embedded-accept-${cat}`).click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, `embedded-sign-${cat}`).click();
    });
    await flush();

    expect(byTestId(view, "embedded-signer-not-enabled").textContent).toContain(
      "Electronic signing is being set up",
    );
    // Calm: no error alert, no raw code shown.
    expect(view.querySelector('[data-testid="embedded-error"]')).toBeNull();
    expect(view.textContent).not.toContain("capability_disabled");
  });

  // A denied response with a typed method, so the sign path is the simplest to
  // exercise. Each returns the calm member message for its validation code and
  // KEEPS the form (the member can clear and retry); the raw code never shows.
  async function signTypedAndExpectError(
    body: unknown,
    expectedMessage: string,
    status = 400,
  ): Promise<void> {
    stubSign(() => ({ status, body }));
    const view = await renderSigner([mkAgreement({})]);
    const cat = "electronic_record_consent";

    await act(async () => {
      setInputValue(byTestId<HTMLInputElement>(view, `embedded-name-${cat}`), "Sam Member");
      byTestId<HTMLInputElement>(view, `embedded-reviewed-${cat}`).click();
      byTestId<HTMLInputElement>(view, `embedded-accept-${cat}`).click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, `embedded-sign-${cat}`).click();
    });
    await flush();

    expect(byTestId(view, "embedded-error").textContent).toBe(expectedMessage);
    // Recoverable: the form (and its sign button) stay, no honest-off panel.
    expect(view.querySelector(`[data-testid="embedded-sign-${cat}"]`)).not.toBeNull();
    expect(view.querySelector('[data-testid="embedded-signer-not-enabled"]')).toBeNull();
    // No raw machine code is ever dumped to the member.
    const raw = (body as { code?: string }).code ?? "";
    expect(view.textContent).not.toContain(raw);
  }

  it("shows a calm, recoverable message for signature_invalid", async () => {
    await signTypedAndExpectError(
      { ok: false, code: "signature_invalid", message: "the signature image is not a png" },
      "That signature image could not be read. Please clear and sign again.",
    );
  });

  it("shows a calm, recoverable message for signature_too_large", async () => {
    await signTypedAndExpectError(
      { ok: false, code: "signature_too_large", message: "the signature image is too large" },
      "That signature is too large. Please clear and sign again.",
    );
  });

  it("shows a calm, recoverable message for signature_dimensions", async () => {
    await signTypedAndExpectError(
      { ok: false, code: "signature_dimensions", message: "the signature image dimensions are out of range" },
      "That signature is too large. Please clear and sign again.",
    );
  });

  it("shows a reload message for idempotency_conflict (409)", async () => {
    await signTypedAndExpectError(
      { ok: false, code: "idempotency_conflict", message: "this idempotency key was already used" },
      "This form was already used for another document. Please reload and try again.",
      409,
    );
  });
});
