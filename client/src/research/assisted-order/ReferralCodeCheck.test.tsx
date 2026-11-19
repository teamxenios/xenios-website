// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API, type RecommendationCapture } from "@shared/research/referral-v1";
import {
  REFERRAL_CHECK_MESSAGES, ReferralCodeCheck, checkReferralCode, type ReferralCheckDeps, type ReferralCheckIdentity,
} from "./ReferralCodeCheck";

vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: vi.fn().mockResolvedValue(null), isRecoveryAccessToken: () => false }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = <T,>(data: T) => ({ kind: "ok" as const, data });
const fail = (status: number, code = "synthetic") => ({ kind: "error" as const, status, code });
const context = ok({ destinationPath: "/research", sharedBy: "an approved Xenios partner" as const, valid: true as const });
const captured = (over: Partial<RecommendationCapture> = {}) =>
  ok<RecommendationCapture>({ destinationPath: "/research", attribution: "recognized", accountBinding: "sign_in_required", ...over });
const anonymous: ReferralCheckIdentity = { session: null, token: null };
const signedIn = (session: string): ReferralCheckIdentity => ({ session, token: "synthetic-token-" + session });
function deps(over: Partial<{ resolve: unknown; bootstrap: unknown; capture: unknown; identity: ReferralCheckIdentity }> = {}) {
  return {
    resolve: vi.fn().mockResolvedValue(over.resolve ?? context),
    bootstrap: vi.fn().mockResolvedValue(over.bootstrap ?? ok({ csrfToken: "synthetic-csrf" })),
    identity: vi.fn().mockResolvedValue(over.identity ?? anonymous),
    capture: vi.fn().mockResolvedValue(over.capture ?? captured()),
  } satisfies ReferralCheckDeps;
}
const outcomeOf = async (code: string, d: ReferralCheckDeps) => (await checkReferralCode(code, d)).outcome;

describe("checkReferralCode", () => {
  it("resolves, bootstraps and captures the exact typed code, in that order", async () => {
    const d = deps();
    expect(await checkReferralCode("Sam-Xen", d)).toEqual({ outcome: "visit", session: null });
    expect(d.resolve).toHaveBeenCalledWith("Sam-Xen");
    expect(d.capture).toHaveBeenCalledWith("Sam-Xen", "synthetic-csrf", null);
    expect(d.resolve.mock.invocationCallOrder[0]).toBeLessThan(d.bootstrap.mock.invocationCallOrder[0]);
    expect(d.bootstrap.mock.invocationCallOrder[0]).toBeLessThan(d.capture.mock.invocationCallOrder[0]);
  });
  it.each([
    [{ accountBinding: "bound" as const }, "saved"],
    [{ accountBinding: "not_bound" as const }, "visit_signed_in"],
    [{ conflictPreserved: true }, "kept_earlier"],
    [{ accountBinding: "bound" as const, bindingConflictPreserved: true }, "kept_earlier"],
    [{ attribution: "self_referral" as const }, "own_code"],
    [{ attribution: "retained_ineligible" as const }, "retained_ineligible"],
    [{ attribution: "unavailable" as const }, "unavailable"],
  ])("maps the server's capture result %j to %s", async (over, outcome) => {
    expect(await outcomeOf("SAMXEN", deps({ capture: captured(over) }))).toBe(outcome);
  });
  it.each([
    [404, "invalid_link", "not_recognized"], [410, "invalid_link", "not_recognized"], [404, "not_found", "not_recognized"],
    // A readable code that is missing, expired or revoked.
    [404, "code_unavailable", "not_recognized"],
    // A 404 that is not the authority's own answer (no JSON body) is a check that could not run.
    [404, "unavailable", "unavailable"], [400, "invalid_input", "unavailable"],
    [503, "unavailable", "unavailable"], [503, "code_unavailable", "unavailable"],
    [0, "connection_failed", "unavailable"], [429, "rate_limited", "busy"],
  ])("a resolve failure %i %s is %s and records nothing", async (status, code, outcome) => {
      const d = deps({ resolve: fail(status, code) });
      expect(await outcomeOf("SAMXEN", d)).toBe(outcome);
      expect(d.bootstrap).not.toHaveBeenCalled();
      expect(d.capture).not.toHaveBeenCalled();
    });
  it("does not capture a context that is not the approved-partner projection", async () => {
    const d = deps({ resolve: ok({ destinationPath: "/research", sharedBy: "someone", valid: true }) });
    expect(await outcomeOf("SAMXEN", d)).toBe("not_recognized");
    expect(d.capture).not.toHaveBeenCalled();
  });
  it.each([[fail(404), "unavailable"], [fail(503), "unavailable"], [fail(429), "busy"], [fail(403), "cookies"], [ok({ csrfToken: "" }), "cookies"], [ok({ csrfToken: "a\nb" }), "cookies"]])(
    "a bootstrap result %j is %s and is never sent to capture", async (bootstrap, outcome) => {
      const d = deps({ bootstrap });
      expect(await outcomeOf("SAMXEN", d)).toBe(outcome);
      expect(d.capture).not.toHaveBeenCalled();
    });
  it.each([[404, "invalid_link", "not_recognized"], [404, "code_unavailable", "not_recognized"], [404, "unavailable", "unavailable"],
    [403, "forbidden", "cookies"], [401, "sign_in_required", "signed_out"], [429, "rate_limited", "busy"], [503, "unavailable", "unavailable"]])(
    "a capture failure %i %s is %s", async (status, code, outcome) => {
      expect(await outcomeOf("SAMXEN", deps({ capture: fail(status, code) }))).toBe(outcome);
    });
  it("captures with the credential it read, and records the sign-in the answer belongs to", async () => {
    const d = deps({ identity: signedIn("account-a:session-1"), capture: captured({ accountBinding: "bound" }) });
    expect(await checkReferralCode("SAMXEN", d)).toEqual({ outcome: "saved", session: "account-a:session-1" });
    expect(d.capture).toHaveBeenCalledWith("SAMXEN", "synthetic-csrf", "synthetic-token-account-a:session-1");
  });
  it("does not describe an answer to a sign-in that changed while it was checked", async () => {
    for (const later of [signedIn("account-b:session-2"), signedIn("account-a:session-2"), anonymous]) {
      const d = deps({ identity: signedIn("account-a:session-1"), capture: captured({ accountBinding: "bound" }) });
      d.identity.mockResolvedValueOnce(signedIn("account-a:session-1")).mockResolvedValueOnce(later);
      expect(await checkReferralCode("SAMXEN", d)).toEqual({ outcome: "sign_in_changed", session: null });
    }
    const d = deps();
    d.identity.mockResolvedValueOnce(anonymous).mockResolvedValueOnce(signedIn("account-a:session-1"));
    expect(await outcomeOf("SAMXEN", d)).toBe("sign_in_changed");
  });
  it("does not send a credential whose account and session cannot be told apart", async () => {
    const d = deps({ identity: { session: null, token: "synthetic-unreadable-token" } });
    expect(await outcomeOf("SAMXEN", d)).toBe("unavailable");
    expect(d.capture).not.toHaveBeenCalled();
  });
  it("never promises money, credit or an account", () => {
    for (const text of Object.values(REFERRAL_CHECK_MESSAGES)) expect(text).not.toMatch(/commission|earn|credit|reward|discount|guarantee|percent|%/i);
    expect(REFERRAL_CHECK_MESSAGES.visit).toContain("for this visit");
    expect(REFERRAL_CHECK_MESSAGES.visit).not.toMatch(/saved|account\.$/);
    expect(REFERRAL_CHECK_MESSAGES.visit_signed_in).not.toMatch(/saved|sign in/i);
    expect(REFERRAL_CHECK_MESSAGES.not_recognized).not.toMatch(/(is|has) (expired|revoked)/);
    expect(REFERRAL_CHECK_MESSAGES.saved).toContain("saved to your signed-in account");
    expect(REFERRAL_CHECK_MESSAGES.sign_in_changed).not.toMatch(/saved|recognized/i);
  });
});

describe("ReferralCodeCheck", () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const render = (code: string, d?: ReferralCheckDeps, disabled = false) => act(async () => root.render(<ReferralCodeCheck code={code} deps={d} disabled={disabled} />));
  const button = () => host.querySelector("button")!;
  const status = () => host.querySelector('[role="status"]')!.textContent;

  it("shows nothing for an empty code or one outside the authority's syntax, and calls nothing until asked", async () => {
    const d = deps();
    for (const code of ["   ", "AB", "-SAM", "SAM XEN", "SAM_XEN", "A".repeat(25), "https://example.test/r/SAMXEN", "r1_" + "a".repeat(43)]) {
      await render(code, d);
      expect(host.innerHTML).toBe("");
    }
    await render("SAMXEN", d);
    expect(button().textContent).toBe("Check this code");
    expect(status()).toBe("");
    expect(d.resolve).not.toHaveBeenCalled();
  });
  it("says recognized for this visit only after the capture succeeds, with no money wording", async () => {
    const d = deps();
    await render("  SAMXEN ", d);
    await act(async () => button().click());
    expect(d.resolve).toHaveBeenCalledWith("SAMXEN");
    expect(status()).toBe(REFERRAL_CHECK_MESSAGES.visit);
    expect(host.textContent).toContain("does not apply a discount, create an account or place an order");
  });
  it("offers a retry for a temporary failure, and not for an unrecognized code", async () => {
    const d = deps({ resolve: fail(503) });
    await render("SAMXEN", d);
    await act(async () => button().click());
    expect(status()).toBe(REFERRAL_CHECK_MESSAGES.unavailable);
    expect(button().textContent).toBe("Check the code again");
    d.resolve.mockResolvedValueOnce(fail(404, "code_unavailable"));
    await act(async () => button().click());
    expect(status()).toBe(REFERRAL_CHECK_MESSAGES.not_recognized);
    expect(button().textContent).toBe("Check this code");
  });
  it("withdraws a result when the code is edited, and drops a reply for the old text", async () => {
    let release!: (value: unknown) => void;
    const d = deps();
    d.resolve.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    await render("SAMXEN", d);
    await act(async () => { button().click(); });
    expect(button().disabled).toBe(true);
    await render("OTHER-CODE", d);
    await act(async () => release(context));
    expect(status()).toBe("");
    expect(d.capture).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });
  it("withdraws a saved result when the sign-in changes afterwards, and keeps it while it does not", async () => {
    let notify!: () => void;
    const unsubscribe = vi.fn();
    const d: ReferralCheckDeps = { ...deps({ identity: signedIn("account-a:session-1"), capture: captured({ accountBinding: "bound" }) }),
      watchIdentity: vi.fn((onChange: () => void) => { notify = onChange; return unsubscribe; }) };
    await render("SAMXEN", d);
    await act(async () => button().click());
    expect(status()).toBe(REFERRAL_CHECK_MESSAGES.saved);
    expect(d.watchIdentity).toHaveBeenCalledTimes(1);
    await act(async () => notify());
    expect(status()).toBe(REFERRAL_CHECK_MESSAGES.saved);
    vi.mocked(d.identity).mockResolvedValue(signedIn("account-b:session-2"));
    await act(async () => notify());
    expect(status()).toBe("");
    expect(host.textContent).not.toContain("saved");
    expect(unsubscribe).toHaveBeenCalled();
  });
  it("stops watching the sign-in when the control is removed", async () => {
    const unsubscribe = vi.fn();
    const d: ReferralCheckDeps = { ...deps(), watchIdentity: vi.fn(() => unsubscribe) };
    await render("SAMXEN", d);
    await act(async () => button().click());
    await act(async () => root.render(<></>));
    expect(unsubscribe).toHaveBeenCalled();
  });
  it("is disabled while the form is busy", async () => {
    await render("SAMXEN", deps(), true);
    expect(button().disabled).toBe(true);
  });
  it("uses the canonical Referral V1 endpoints with the exact code when no deps are given", async () => {
    const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, destinationPath: "/research", sharedBy: "an approved Xenios partner", valid: true }))
      .mockResolvedValueOnce(response({ ok: true, csrfToken: "synthetic-csrf" }))
      .mockResolvedValueOnce(response({ ok: true, destinationPath: "/research", attribution: "recognized", accountBinding: "sign_in_required" }));
    vi.stubGlobal("fetch", fetcher);
    await render("Sam-Xen");
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => button().click());
    await vi.waitFor(() => expect(status()).toBe(REFERRAL_CHECK_MESSAGES.visit));
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([REFERRAL_API.resolve, REFERRAL_API.bootstrap, REFERRAL_API.capture]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", body: JSON.stringify({ code: "Sam-Xen" }) });
    expect(fetcher.mock.calls[2][1]).toMatchObject({ body: JSON.stringify({ code: "Sam-Xen" }), headers: { "X-Xenios-Referral-CSRF": "synthetic-csrf" } });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBeUndefined();
  });
  it("answers a readable code the server says is unavailable as not recognized, through the real client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ ok: false, code: "code_unavailable" }) }));
    await render("SAMXEN");
    await act(async () => button().click());
    await vi.waitFor(() => expect(status()).toBe(REFERRAL_CHECK_MESSAGES.not_recognized));
  });
});
