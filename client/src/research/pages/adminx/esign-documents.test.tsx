// @vitest-environment jsdom
// The e-signature document center (/admin/research/esign) against the frozen
// admin wire (adminEsignRequestView / adminEsignArchiveView). Covered:
//   1. A member-id search loads that member's requests + archive, and a
//      request renders its mode, document versions, status, and the integrity
//      hashes (never a storage path).
//   2. A signed-document download calls getEsignDownloadUrl and opens the
//      short-lived url the server minted (never a raw ref), and a resend posts
//      through the adapter and reports the result.
//   3. The disabled capability renders the honest unavailable state, and a
//      denied lookup renders the calm denial notice, not invented data.
// The adapter is mocked so the page's own branching is what is under test.

import { afterEach, describe, expect, it, vi } from "vitest";
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

const esign = vi.hoisted(() => ({
  getEsignMemberDocuments: vi.fn(),
  getEsignDownloadUrl: vi.fn(),
  esignResendNotification: vi.fn(),
  downloadEsignPacket: vi.fn(),
  esignPacketZipHref: (id: string) => `/api/admin/research/activation/esign/member/${id}/packet.zip`,
}));

vi.mock("../../adapters/esign", () => esign);

import EsignDocuments from "./EsignDocuments";

const MEMBER_DOCS = {
  ok: true,
  memberId: "mem-123",
  requests: [
    {
      requestId: "req-1",
      memberId: "mem-123",
      mode: "opensign_document",
      provider: "opensign",
      providerDocumentId: "prov-doc-1",
      status: "completed",
      documentVersionIds: ["dv-1", "dv-2"],
      signedPdfHash: "sha-signed-1",
      certificateHash: "sha-cert-1",
      completedAt: "2026-07-20T12:00:00.000Z",
      createdAt: "2026-07-19T12:00:00.000Z",
    },
  ],
  archive: [
    {
      archiveId: "arc-1",
      memberId: "mem-123",
      packetOrDocumentId: "pkt-1",
      documentVersionId: "dv-1",
      provider: "opensign",
      providerDocumentId: "prov-doc-1",
      signedPdfHash: "sha-signed-1",
      certificateHash: "sha-cert-1",
      xeniosSourceHash: "sha-source-1",
      completedAt: "2026-07-20T12:00:00.000Z",
      archiveStatus: "archived",
      accessClassification: "restricted",
      createdAt: "2026-07-20T12:05:00.000Z",
    },
  ],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  esign.getEsignMemberDocuments.mockReset();
  esign.getEsignDownloadUrl.mockReset();
  esign.esignResendNotification.mockReset();
  esign.downloadEsignPacket.mockReset();
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/admin/me")) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ success: true, email: "founder@xeniostechnology.com" }),
        };
      }
      throw new TypeError(`unstubbed fetch: ${url}`);
    }),
  );
}

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<EsignDocuments />);
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

async function lookup(view: HTMLElement, memberId: string) {
  const input = byTestId<HTMLInputElement>(view, "input-esign-member");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, memberId);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    byTestId<HTMLButtonElement>(view, "button-esign-search").click();
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// ---------------------------------------------------------------------------

describe("EsignDocuments", () => {
  it("looks up a member and renders their signing request with hashes, then resends", async () => {
    esign.getEsignMemberDocuments.mockResolvedValue({ kind: "ok", data: MEMBER_DOCS });
    esign.esignResendNotification.mockResolvedValue({
      kind: "ok",
      data: { ok: true, resent: true, requestId: "req-1" },
    });
    stubFetch();
    const view = await renderPage();

    // Nothing loads until a member is looked up.
    expect(view.textContent).toContain("Enter a member id to begin.");
    expect(esign.getEsignMemberDocuments).not.toHaveBeenCalled();

    await lookup(view, "mem-123");

    // The adapter is called with the exact member id, and the request renders.
    expect(esign.getEsignMemberDocuments).toHaveBeenCalledWith("admin-token", "mem-123");
    const card = byTestId(view, "esign-request-req-1");
    expect(card.textContent).toContain("OpenSign document");
    expect(card.textContent).toContain("dv-1, dv-2");
    expect(card.textContent).toContain("Completed");
    expect(card.textContent).toContain("sha-signed-1");
    expect(card.textContent).toContain("sha-cert-1");
    // The archive renders too, with its source hash.
    expect(byTestId(view, "esign-archive-arc-1").textContent).toContain("sha-source-1");

    // Resend posts through the adapter and reports the result honestly.
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "button-resend-req-1").click();
    });
    await act(async () => {});
    expect(esign.esignResendNotification).toHaveBeenCalledWith("admin-token", "req-1");
    expect(view.textContent).toContain("The completion notification was resent.");
  });

  it("opens the short-lived signed download url the server minted", async () => {
    esign.getEsignMemberDocuments.mockResolvedValue({ kind: "ok", data: MEMBER_DOCS });
    esign.getEsignDownloadUrl.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        which: "signed",
        grant: { signedUrl: "https://signed.example/abc", expiresAt: "2026-07-22T01:00:00.000Z" },
      },
    });
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    stubFetch();
    const view = await renderPage();
    await lookup(view, "mem-123");

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "button-download-signed-req-1").click();
    });
    await act(async () => {});

    expect(esign.getEsignDownloadUrl).toHaveBeenCalledWith("admin-token", "req-1", "signed");
    expect(openSpy).toHaveBeenCalledWith("https://signed.example/abc", "_blank", "noopener,noreferrer");
    // The page renders the minted-link outcome, never the storage ref.
    expect(view.textContent).toContain("A short-lived signed link opened in a new tab.");
  });

  it("renders the honest unavailable state when e-signature is disabled", async () => {
    esign.getEsignMemberDocuments.mockResolvedValue({ kind: "unavailable" });
    stubFetch();
    const view = await renderPage();
    await lookup(view, "mem-x");
    expect(view.textContent).toContain("The e-signature document center is not open.");
  });

  it("renders a denied lookup through the calm denial notice", async () => {
    esign.getEsignMemberDocuments.mockResolvedValue({
      kind: "denied",
      code: "membership_inactive",
      message: "server text",
    });
    stubFetch();
    const view = await renderPage();
    await lookup(view, "mem-y");
    // The denial notice renders; the server message never leads the UI.
    expect(byTestId(view, "ra-denial")).toBeDefined();
    expect(view.textContent).not.toContain("server text");
  });
});
