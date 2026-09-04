// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API, type ReferralLifecycle } from "@shared/research/referral-v1";
import ReferralLifecyclePage from "./ReferralLifecycle";

const session = vi.hoisted(() => ({ token: "synthetic-admin-one" }));
vi.mock("./AdminResearchHome", () => ({ AdminScreen: ({ children }: { children: (token: string) => ReactNode }) => <div>{children(session.token)}</div> }));
let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const snapshot = (): ReferralLifecycle => ({
  links: [{ id: "synthetic-link", partnerId: "synthetic-partner", destinationPath: "/health", state: "ready", createdAt: "2026-09-04T12:00:00Z", expiresAt: "2026-12-04T12:00:00Z", revokedAt: null, opens: 1, accountsLinked: 1 }],
  touches: [{ touchId: "synthetic-touch", linkId: "synthetic-link", partnerId: "synthetic-partner", capturedAt: "2026-09-04T12:10:00Z", expiresAt: "2026-10-04T12:10:00Z", availability: "ready" }],
  bindings: [{ accountKey: "synthetic-account-key", partnerId: "synthetic-partner", linkId: "synthetic-link", touchId: "synthetic-touch", boundAt: "2026-09-04T12:11:00Z", availability: "ready" }],
  events: [{ id: "synthetic-event", eventType: "account_bound", partnerId: "synthetic-partner", linkId: "synthetic-link", occurredAt: "2026-09-04T12:11:00Z" }],
  lineage: { state: "unavailable", records: [] }, correctionsSupported: false,
});
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const render = () => act(async () => { root.render(<ReferralLifecyclePage />); });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-admin-one";
  fetcher = vi.fn().mockResolvedValue(response({ ok: true, ...snapshot() })); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("admin referral lifecycle", () => {
  it("reads only the authorized bounded source and never infers missing lineage", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledWith(REFERRAL_API.admin, expect.objectContaining({ method: "GET", cache: "no-store", credentials: "same-origin", headers: expect.objectContaining({ Authorization: "Bearer synthetic-admin-one" }) }));
    expect(host.textContent).toContain("synthetic-account-key");
    expect(host.textContent).toContain("not lifetime totals");
    expect(host.textContent).toContain("This does not mean no request or order exists");
    expect(host.textContent).toContain("Attribution corrections are not supported");
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector("button")?.textContent).toBe("Refresh lifecycle");
    expect(host.innerHTML).not.toContain("synthetic-admin-one");
  });
  it("renders only allowlisted source fields, not extra sensitive payload fields", async () => {
    const data = snapshot();
    data.lineage = { state: "available", records: [{ accountKey: "synthetic-account-key", type: "request", reference: "synthetic-request", state: "submitted", occurredAt: "2026-09-04T12:12:00Z", attribution: "account_binding_only" }] };
    fetcher.mockResolvedValue(response({ ok: true, ...data, privateEmail: "person@example.invalid", fullClinicalNotes: "private clinical note" }));
    await render();
    expect(host.textContent).toContain("synthetic-request");
    expect(host.textContent).toContain("do not establish independently verified order-level referral attribution");
    expect(host.textContent).not.toContain("person@example.invalid");
    expect(host.textContent).not.toContain("private clinical note");
  });
  it.each([401, 403, 503])("denies or names unavailable status %s without fake empty totals", async status => {
    fetcher.mockResolvedValue(response({ ok: false, message: "private upstream" }, status)); await render();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("No records returned");
    expect(host.textContent).not.toContain("private upstream");
    expect(host.textContent).not.toContain("synthetic-account-key");
  });
  it("does not render malformed arrays as an empty success", async () => {
    fetcher.mockResolvedValue(response({ ok: true, ...snapshot(), bindings: [{ accountKey: { private: "bad" } }] }));
    await render(); expect(host.textContent).toContain("could not be read safely");
    expect(host.textContent).not.toContain("No records returned");
  });
  it.each([
    ["revoked", "Revoked"], ["expired", "Expired"], ["partner_inactive", "Partner inactive"], ["self_referral", "Self-referral — ineligible"],
  ] as const)("shows %s availability even when a record's link is outside the bounded link snapshot", async (availability, label) => {
    const data = snapshot(); data.links = []; data.bindings[0].availability = availability; data.touches[0].availability = availability;
    fetcher.mockResolvedValue(response({ ok: true, ...data })); await render();
    const bindings = host.querySelector('[aria-label="Verified account bindings"]')!;
    const touches = host.querySelector('[aria-label="Referral touches"]')!;
    expect(bindings.textContent).toContain(label); expect(touches.textContent).toContain(label);
    expect(bindings.textContent).toContain("Current referral availability");
  });
  it("does not treat a binding with missing current availability as active", async () => {
    const data = snapshot();
    fetcher.mockResolvedValue(response({ ok: true, ...data, bindings: [{ ...data.bindings[0], availability: undefined }] }));
    await render(); expect(host.textContent).toContain("could not be read safely");
    expect(host.querySelector('[aria-label="Verified account bindings"]')).toBeNull();
  });
  it("caps each displayed section without implying a global total", async () => {
    const data = snapshot(); data.events = Array.from({ length: 101 }, (_, index) => ({ ...data.events[0], id: `synthetic-event-${index}` }));
    fetcher.mockResolvedValue(response({ ok: true, ...data })); await render();
    expect(host.textContent).toContain("Showing 100 of 101 records returned in this snapshot");
    expect(host.textContent).not.toContain("synthetic-event-100");
  });
  it("discards a previous admin's late response", async () => {
    let finish!: (value: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(response({ ok: false }, 403));
    await render(); session.token = "synthetic-admin-two"; await render();
    await act(async () => finish(response({ ok: true, ...snapshot() })));
    expect(host.textContent).toContain("not authorized");
    expect(host.textContent).not.toContain("synthetic-account-key");
  });
});
