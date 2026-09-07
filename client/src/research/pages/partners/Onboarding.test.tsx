// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import Onboarding from "./Onboarding";
import * as partner from "../../adapters/partner";
import { __resetCapabilitiesCache } from "../../lib/capabilities";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const CAPABILITIES = "/api/research/capabilities";
const entry = (patch: Record<string, unknown> = {}) => ({ id: "agreement-a", title: "A-only agreement", version: "1.0.0", acknowledged: true, ...patch });
const body = (patch: Record<string, unknown> = {}) => ({ ok: true, verification: { state: "verified", detail: "PRIVATE-A-only identity message" }, agreements: [entry()], ...patch });
const response = (value: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(value), { status, headers: { "content-type": type } });
const loaded = (patch: Record<string, unknown> = {}) => response(body(patch));
const enabled = () => response({ ok: true, capabilities: { affiliate_payouts: { enabled: true } } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
type ReadInit = { method?: string; body?: string; headers: { Authorization: string } };
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
let onboardingRead: Mock<(init: ReadInit) => Promise<Response>>;
let capabilityRead: Mock<(init: ReadInit) => Promise<Response>>;
const snapshots: string[] = [];
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.innerHTML); }); return null; }
const render = () => act(async () => root.render(<><Onboarding /><Snapshot /></>));
const text = () => (host.textContent ?? "").replace(/\s+/g, " ");
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh onboarding records")!.click();
});
const payoutHandoff = () => host.querySelector('[aria-label="Payout reporting handoff"]');
const noPrivateData = () => {
  expect(host.querySelector('[aria-label="Reported identity marker"],[aria-label="Reported agreement records"]')).toBeNull();
  expect(payoutHandoff()).toBeNull();
  expect(text()).not.toMatch(/A-only|Verified \(reported\)|Acknowledgement recorded \(reported\)|No agreement records were returned/);
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0; __resetCapabilitiesCache();
  onboardingRead = vi.fn(() => Promise.resolve(loaded())); capabilityRead = vi.fn(() => Promise.resolve(enabled()));
  fetcher = vi.fn((path: string, init: ReadInit) => {
    if (path === partner.PARTNER_API.onboarding && init.method === "GET") return onboardingRead(init);
    if (path === CAPABILITIES && init.method === undefined) return capabilityRead(init);
    throw new Error("Unexpected synthetic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetCapabilitiesCache();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("onboarding source facts and preserved policy", () => {
  it("uses only the exact existing read endpoints and offers no identity, agreement, or payout mutation", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem"); await render();
    expect(fetcher.mock.calls).toEqual([
      [partner.PARTNER_API.onboarding, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" } }],
      [CAPABILITIES, { credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" } }],
    ]);
    expect(host.querySelector("form,input,textarea,select")).toBeNull();
    expect(Array.from(host.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Refresh onboarding records"]);
    expect(storageWrite).not.toHaveBeenCalled(); expect(host.innerHTML).not.toContain("synthetic-partner-a");
    expect(host.innerHTML).not.toContain("agreement-a"); expect(text()).not.toContain("PRIVATE-A-only identity message");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Onboarding help"] a[href="/research/partners/training"]')).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Onboarding help"] a[href="/research/partners/support"]')).not.toBeNull();
  });
  it("preserves every onboarding step including no customer-access fee prerequisite", async () => {
    await render(); const steps = host.querySelector('section[aria-labelledby="po-steps"]')!.textContent;
    for (const value of [
      "Identity verification", "We confirm who you are before your link exists. One account per person, always under a real name.",
      "Partner agreement", "The full Research Rep agreement is presented for review and acceptance. Nothing is shareable before it is accepted.",
      "Compliance certification", "The training modules and certification review. Current training and reviewed evidence are required before activation.",
      "Payout and tax clearance", "Payout readiness and tax documentation are reviewed before certification and activation. No fee or payment is required to begin customer access.",
    ]) expect(steps).toContain(value);
    expect(text()).not.toMatch(/membership costs|before your first payout, never before/);
  });
  it.each(["signed-out", "checking"])("retains policy but reads no private or capability data while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); noPrivateData(); expect(fetcher).not.toHaveBeenCalled(); expect(text()).toContain("The onboarding steps");
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it.each([["verified", "Verified"], ["not_started", "Not started"], ["pending", "Pending"]])("renders %s only as a source marker without a queue or no-action receipt", async (state, label) => {
    onboardingRead.mockResolvedValueOnce(loaded({ verification: { state, detail: "PRIVATE-SOURCE: Nothing is required; a review is queued." } })); await render();
    expect(text()).toContain(`${label} (reported)`); expect(text()).not.toContain("PRIVATE-SOURCE");
    expect(text()).toContain("does not confirm that a new review is queued or that no action is required");
    expect(text()).toContain("separate from customer approval, partner activation, and sharing or product permissions");
    expect(text()).toContain("does not start an identity review, accept an agreement, or change account access");
    expect(host.querySelector(".ra-badge-success")).toBeNull();
  });
  it.each([true, false])("renders acknowledgement=%s for only the reported version", async (acknowledged) => {
    onboardingRead.mockResolvedValueOnce(loaded({ agreements: [entry({ acknowledged, version: "v2.0" })] })); await render();
    expect(text()).toContain("Reported version: v2.0"); expect(text()).not.toContain("vv2.0");
    expect(text()).toContain(acknowledged ? "Acknowledgement recorded (reported)" : "Acknowledgement not recorded for this version");
    expect(text()).toContain("does not itself confirm current partner eligibility, a signed document, or completion of all onboarding requirements");
    expect(text()).not.toContain("Awaiting acceptance");
  });
  it("keeps a changed version's false acknowledgement instead of inheriting an older true flag", async () => {
    await render(); onboardingRead.mockResolvedValueOnce(loaded({ agreements: [entry({ version: "2.0.0", acknowledged: false })] })); await refresh();
    expect(text()).toContain("Reported version: 2.0.0"); expect(text()).toContain("Acknowledgement not recorded for this version");
    expect(text()).not.toContain("Reported version: 1.0.0"); expect(text()).not.toContain("Acknowledgement recorded (reported)");
  });
  it("distinguishes an exact empty agreement list from no presented agreements or complete history", async () => {
    onboardingRead.mockResolvedValueOnce(loaded({ agreements: [] })); await render();
    expect(text()).toContain("No agreement records were returned"); expect(text()).toContain("not evidence that no agreements exist, none have been presented, or your agreement history is complete");
    expect(text()).not.toContain("No agreements have been presented yet");
  });
  it("renders titles as text and never converts agreement identifiers to document or acceptance links", async () => {
    onboardingRead.mockResolvedValueOnce(loaded({ agreements: [entry({ title: '<img src=x onerror="synthetic()">' })] })); await render();
    expect(text()).toContain('<img src=x onerror="synthetic()">');
    expect(host.querySelector('[aria-label="Reported agreement records"]')!.querySelector("a,img,script,button")).toBeNull();
  });
  it.each([401, 403, 404, 501, 503, 500])("cannot turn onboarding HTTP %s into identity/agreement/payout facts", async (status) => {
    onboardingRead.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await render(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
  });
  it("preserves canonical server denial separately from customer access", async () => {
    onboardingRead.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM" }, 403)); await render(); noPrivateData();
    expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("Partner reporting access is separate from customer approval"); expect(text()).not.toContain("PRIVATE");
  });
  it.each([
    {}, { ok: true }, body({ verification: undefined }), body({ verification: null }),
    body({ verification: { state: "verified" } }), body({ verification: { state: "approved", detail: "not a source state" } }),
    body({ verification: { state: "verified", detail: "", canShare: true } }), body({ agreements: undefined }), body({ agreements: null }),
    body({ agreements: [entry(), entry()] }), body({ agreements: [entry({ id: "../other" })] }), body({ agreements: [entry({ title: null })] }),
    body({ agreements: [entry({ version: undefined })] }), body({ agreements: [entry({ version: "v1?token=secret" })] }),
    body({ agreements: [entry({ acknowledged: undefined })] }), body({ agreements: [entry({ acknowledged: "false" })] }), body({ agreements: [entry({ acknowledged: 1 })] }),
    body({ agreements: [entry({ memberId: "PRIVATE-ID" })] }), body({ payoutReady: true }), body({ userEmail: "PRIVATE@fixture.invalid" }),
  ])("refuses missing, coercible, or extra source data: %j", async (value) => {
    onboardingRead.mockResolvedValueOnce(response(value)); await render(); noPrivateData();
    expect(text()).toContain("Onboarding records could not be read safely"); expect(text()).not.toContain("PRIVATE");
  });
  it("contains HTML and thrown readers without exposing private errors", async () => {
    onboardingRead.mockResolvedValueOnce(response("PRIVATE-HTML", 200, "text/html")); await render(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
    vi.spyOn(partner, "getPartnerOnboarding").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await refresh(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
    await refresh(); expect(text()).toContain("A-only agreement");
  });
});

describe("unchanged payout gate without invented setup or tax facts", () => {
  it("offers a gated reporting handoff, not Setup pending or a provider/tax readiness status", async () => {
    await render(); expect(payoutHandoff()).not.toBeNull();
    expect(payoutHandoff()!.querySelector('a[href="/research/partners/payouts"]')?.textContent).toBe("View payout records");
    expect(text()).toContain("Payout and tax status are not provided by this report");
    expect(text()).toContain("Current payout readiness and tax clearance are not verified here");
    expect(text()).not.toMatch(/Setup pending|Ready for payouts|tax clearance confirmed/);
    expect(fetcher.mock.calls.every(([path]) => path !== partner.PARTNER_API.payouts)).toBe(true);
  });
  it.each([
    { ok: true, capabilities: { affiliate_payouts: { enabled: false } } },
    { ok: true, capabilities: { affiliate_payouts: { enabled: "true" } } },
    { ok: true, capabilities: { product_commerce: { enabled: true } } },
    { ok: false, capabilities: { affiliate_payouts: { enabled: true } } }, {}, null,
  ])("keeps payout handoff closed for absent or malformed capability %j", async (value) => {
    capabilityRead.mockResolvedValueOnce(response(value)); await render();
    expect(text()).toContain("A-only agreement"); expect(payoutHandoff()).toBeNull(); expect(text()).toContain("Partner payouts are being configured");
  });
  it.each([401, 403, 404, 500, 503])("keeps capability HTTP %s closed without clearing valid onboarding records", async (status) => {
    capabilityRead.mockResolvedValueOnce(response({ ok: true, capabilities: { affiliate_payouts: { enabled: true } } }, status)); await render();
    expect(payoutHandoff()).toBeNull(); expect(text()).toContain("A-only agreement");
  });
  it("contains a thrown capability source and waits for explicit enablement", async () => {
    capabilityRead.mockRejectedValueOnce(new Error("PRIVATE-CAPABILITY")); await render(); expect(payoutHandoff()).toBeNull(); expect(text()).not.toContain("PRIVATE");
  });
  it("does not expose payout handoff while either existing source is unresolved", async () => {
    const records = deferred<Response>(); const capabilities = deferred<Response>();
    onboardingRead.mockReturnValueOnce(records.promise); capabilityRead.mockReturnValueOnce(capabilities.promise); await render(); noPrivateData();
    await act(async () => records.resolve(loaded())); expect(text()).toContain("A-only agreement"); expect(payoutHandoff()).toBeNull();
    await act(async () => capabilities.resolve(enabled())); expect(payoutHandoff()).not.toBeNull();
  });
});

describe("onboarding principal and read-generation isolation", () => {
  it("clears A's markers and enabled payout handoff in B's first commit", async () => {
    await render(); const pending = deferred<Response>(); onboardingRead.mockReturnValueOnce(pending.promise); capabilityRead.mockResolvedValueOnce(response({ ok: true, capabilities: {} }));
    const start = snapshots.length; session.token = "synthetic-partner-b"; await render(); noPrivateData();
    expect(snapshots.slice(start).every((snapshot) => !snapshot.includes("A-only") && !snapshot.includes("Payout reporting handoff"))).toBe(true);
    await act(async () => pending.resolve(loaded({ verification: { state: "pending", detail: "B detail" }, agreements: [entry({ title: "B-only agreement", acknowledged: false })] })));
    expect(text()).toContain("B-only agreement"); expect(text()).not.toContain("A-only"); expect(payoutHandoff()).toBeNull();
    expect(onboardingRead.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer synthetic-partner-b");
    expect(capabilityRead.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it("ignores A's late enabled capability after B reports disabled", async () => {
    const old = deferred<Response>(); capabilityRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ ok: true, capabilities: {} }));
    await render(); session.token = "synthetic-partner-b"; onboardingRead.mockResolvedValueOnce(loaded({ agreements: [] })); await render();
    await act(async () => old.resolve(enabled())); expect(payoutHandoff()).toBeNull(); expect(text()).not.toContain("A-only");
  });
  it.each(["success", "denial"])("ignores A's late %s onboarding response after B loads", async (kind) => {
    const old = deferred<Response>(); onboardingRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(loaded({ agreements: [entry({ title: "B-only agreement" })] }));
    await render(); session.token = "synthetic-partner-b"; await render();
    await act(async () => old.resolve(kind === "success" ? loaded() : response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("B-only agreement"); expect(text()).not.toContain("A-only"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("clears logout state and ignores late onboarding/capability results", async () => {
    const records = deferred<Response>(); const capabilities = deferred<Response>(); onboardingRead.mockReturnValueOnce(records.promise); capabilityRead.mockReturnValueOnce(capabilities.promise);
    await render(); session.token = null; await render(); const requests = fetcher.mock.calls.length;
    await act(async () => { records.resolve(loaded()); capabilities.resolve(enabled()); }); noPrivateData();
    expect(fetcher).toHaveBeenCalledTimes(requests); expect(text()).toContain("Sign in to view reported onboarding records");
  });
  it("does not revive an old login's response after A-null-A", async () => {
    const old = deferred<Response>(); onboardingRead.mockReturnValueOnce(old.promise); await render(); session.token = null; await render();
    session.token = "synthetic-partner-a"; onboardingRead.mockResolvedValueOnce(loaded({ agreements: [entry({ title: "New login agreement" })] })); await render();
    await act(async () => old.resolve(loaded())); expect(text()).toContain("New login agreement"); expect(text()).not.toContain("A-only");
  });
  it.each(["checking", "token-refresh"])("clears records and handoff on %s until the new read completes", async (transition) => {
    await render(); if (transition === "checking") { session.checking = true; await render(); noPrivateData(); expect(onboardingRead).toHaveBeenCalledTimes(1); session.checking = false; }
    session.token = "synthetic-partner-a-refreshed"; const pending = deferred<Response>(); onboardingRead.mockReturnValueOnce(pending.promise); await render(); noPrivateData();
    await act(async () => pending.resolve(loaded({ agreements: [] }))); expect(text()).toContain("No agreement records were returned"); expect(text()).not.toContain("A-only");
  });
  it.each(["success", "denial"])("keeps latest %s over an older overlapping read", async (latest) => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>(); onboardingRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await refresh(); await refresh(); noPrivateData(); const denial = () => response({ ok: false, code: "partner_not_active" }, 403);
    await act(async () => second.resolve(latest === "success" ? loaded({ agreements: [] }) : denial()));
    await act(async () => first.resolve(latest === "success" ? denial() : loaded()));
    if (latest === "success") { expect(text()).toContain("No agreement records were returned"); expect(text()).not.toContain("Your partner account is not active"); }
    else { noPrivateData(); expect(text()).toContain("Your partner account is not active"); }
  });
  it("does not resurrect agreement history or payout handoff while retrying an unavailable read", async () => {
    await render(); onboardingRead.mockResolvedValueOnce(response({}, 503)); await refresh(); noPrivateData();
    const pending = deferred<Response>(); onboardingRead.mockReturnValueOnce(pending.promise); await refresh(); noPrivateData();
  });
  it("ignores unmounted results from both existing read sources", async () => {
    const records = deferred<Response>(); const capabilities = deferred<Response>(); onboardingRead.mockReturnValueOnce(records.promise); capabilityRead.mockReturnValueOnce(capabilities.promise);
    await render(); await act(async () => root.render(null)); await act(async () => { records.resolve(loaded()); capabilities.resolve(enabled()); }); expect(host.innerHTML).toBe("");
  });
  it("survives StrictMode replay without stale identity/agreement data or writes", async () => {
    const old = deferred<Response>(); onboardingRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(loaded({ agreements: [] }));
    await act(async () => root.render(<StrictMode><Onboarding /></StrictMode>)); await act(async () => old.resolve(loaded()));
    expect(text()).toContain("No agreement records were returned"); expect(text()).not.toContain("A-only");
    expect(fetcher.mock.calls.every(([path, init]) => init.body === undefined && (path === CAPABILITIES || path === partner.PARTNER_API.onboarding))).toBe(true);
  });
});
