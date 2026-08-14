// @vitest-environment jsdom
// Real-wire coverage for the denial capture in establishMemberSession: the
// provider preserves the server guard's machine-readable 403 code (and ONLY a
// coded 403), clears it on every other outcome, and clears it at attempt
// start so a denial can never outlive the attempt that produced it. These
// tests drive the actual fetch path against stubbed /api/research/member/me
// responses - no hand-written peekMemberDenial stubs.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => {
  const state = { session: null as any };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => {
      state.session = null;
      return { error: null };
    }),
  };
  return { state, auth };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  clearPersistedRecoverySession: vi.fn(() => true),
  revokeRecoverySession: vi.fn(async () => {}),
  isRecoveryAccessToken: (token: string) => token.includes("recovery"),
}));

import { ResearchProvider, useResearch, type MemberDenial, type MemberInfo } from "./core";

// /member/me behavior is swapped per test; every other endpoint answers a
// bland default so hydration settles quietly.
const memberMe = vi.hoisted(() => ({
  respond: null as null | (() => Promise<Response> | Response),
}));

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type ProbeApi = {
  establishMemberSession: (token: string) => Promise<MemberInfo | null>;
  peekMemberDenial: () => MemberDenial | null;
};
const probeApi: { current: ProbeApi | null } = { current: null };

function Probe() {
  const { establishMemberSession, peekMemberDenial, memberDenial, memberSessionStatus, member } = useResearch();
  probeApi.current = { establishMemberSession, peekMemberDenial };
  return (
    <output
      data-testid="denial-probe"
      data-denial-code={memberDenial?.code ?? ""}
      data-status={memberSessionStatus}
      data-member={member?.firstName ?? ""}
    />
  );
}

let root: Root | null = null;
let container: HTMLElement | null = null;

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountProvider() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ResearchProvider>
        <Probe />
      </ResearchProvider>,
    );
  });
  await flush();
}

function probe() {
  return container!.querySelector('[data-testid="denial-probe"]') as HTMLElement;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/research/sign-in");
  document.body.innerHTML = "";
  supa.state.session = null;
  memberMe.respond = null;
  root = null;
  container = null;
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? input);
    const path = url.split("?")[0];
    if (path === "/api/research/member/me") {
      if (memberMe.respond) return memberMe.respond();
      return jsonResponse({ ok: true, member: { firstName: "Avery", status: "active", applicationStatus: "active" } });
    }
    if (path === "/api/research/me") {
      return jsonResponse({ configured: true, authed: false, publicMode: false });
    }
    return jsonResponse({ ok: true });
  }) as any;
});

describe("denial capture on the real member verification wire", () => {
  it("preserves a coded 403 refusal exactly as the server sent it", async () => {
    memberMe.respond = () =>
      jsonResponse({ ok: false, code: "recovery_session", message: "server text" }, 403);
    await mountProvider();
    let result: MemberInfo | null = { firstName: "x", status: "x", applicationStatus: null };
    await act(async () => {
      result = await probeApi.current!.establishMemberSession("tok-coded");
    });
    await flush();
    expect(result).toBeNull();
    expect(probeApi.current!.peekMemberDenial()).toEqual({ code: "recovery_session", message: "server text" });
    expect(probe().getAttribute("data-denial-code")).toBe("recovery_session");
    expect(probe().getAttribute("data-status")).toBe("verification_failed");
  });

  it("records NO denial for an uncoded 403 (the no-membership refusal)", async () => {
    memberMe.respond = () => jsonResponse({ ok: false, message: "No research membership for this account." }, 403);
    await mountProvider();
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-uncoded");
    });
    await flush();
    expect(probeApi.current!.peekMemberDenial()).toBeNull();
    expect(probe().getAttribute("data-denial-code")).toBe("");
    expect(probe().getAttribute("data-status")).toBe("verification_failed");
  });

  it("records NO denial for a 401, even when its body carries a code", async () => {
    // Only the guard's 403 carries a routable refusal; an expired/invalid
    // token stays a plain sign-in problem.
    memberMe.respond = () => jsonResponse({ ok: false, code: "token_expired", message: "expired" }, 401);
    await mountProvider();
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-401");
    });
    await flush();
    expect(probeApi.current!.peekMemberDenial()).toBeNull();
  });

  it("records NO denial for a 503 unconfigured answer", async () => {
    memberMe.respond = () => jsonResponse({ ok: false, message: "Not configured." }, 503);
    await mountProvider();
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-503");
    });
    await flush();
    expect(probeApi.current!.peekMemberDenial()).toBeNull();
  });

  it("records NO denial on a network failure", async () => {
    memberMe.respond = () => Promise.reject(new TypeError("network down"));
    await mountProvider();
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-neterr");
    });
    await flush();
    expect(probeApi.current!.peekMemberDenial()).toBeNull();
    expect(probe().getAttribute("data-status")).toBe("verification_failed");
  });

  it("clears a recorded denial when a later attempt verifies successfully", async () => {
    memberMe.respond = () => jsonResponse({ ok: false, code: "recovery_session" }, 403);
    await mountProvider();
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-first");
    });
    expect(probeApi.current!.peekMemberDenial()?.code).toBe("recovery_session");

    memberMe.respond = () =>
      jsonResponse({ ok: true, member: { firstName: "Avery", status: "active", applicationStatus: "active" } });
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-second");
    });
    await flush();
    expect(probeApi.current!.peekMemberDenial()).toBeNull();
    expect(probe().getAttribute("data-denial-code")).toBe("");
    expect(probe().getAttribute("data-member")).toBe("Avery");
  });

  it("never lets a stale denial masquerade as a later attempt's outcome (attempt-start clearing)", async () => {
    memberMe.respond = () => jsonResponse({ ok: false, code: "recovery_session" }, 403);
    await mountProvider();
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-a");
    });
    expect(probeApi.current!.peekMemberDenial()?.code).toBe("recovery_session");

    // The next attempt fails WITHOUT a code; the earlier coded denial must
    // not survive into this attempt's reading.
    memberMe.respond = () => jsonResponse({ ok: false, message: "no membership" }, 403);
    await act(async () => {
      await probeApi.current!.establishMemberSession("tok-b");
    });
    await flush();
    expect(probeApi.current!.peekMemberDenial()).toBeNull();
  });
});
