// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApplicationDetail from "./ApplicationDetail";
import type { AdminApplication } from "./AdminResearchHome";
import type { ApiResult } from "../../lib/api";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const scope = vi.hoisted(() => ({ token: "fixture-admin-a", id: "00000000-0000-4000-8000-000000000a01" }));
vi.mock("../../adapters/adminOps", () => ({ getApplication: api.get, postApplicationAction: api.post }));
vi.mock("wouter", async (importOriginal) => ({
  ...await importOriginal<typeof import("wouter")>(),
  useParams: () => ({ id: scope.id }),
}));
vi.mock("./auth", () => ({ fmtDate: (value: string) => value, fmtDateTime: (value: string) => value }));
vi.mock("./Applications", () => ({ statusTone: () => "neutral" }));
vi.mock("./AdminResearchHome", () => ({
  AdminScreen: ({ title, lead, actions, children }: { title: string; lead: string; actions?: ReactNode; children: (token: string) => ReactNode }) =>
    <main><h1>{title}</h1><p>{lead}</p>{actions}{children(scope.token)}</main>,
  APPLICATION_STATUS_LABEL: {
    submitted: "Submitted", resubmitted: "Resubmitted", under_review: "Under review",
    approved_pending_payment: "Legacy approval, review needed", payment_pending: "Historical payment review pending",
    active: "Active", paused: "Paused", declined: "Declined", withdrawn: "Withdrawn", expired: "Expired",
  },
}));

const firstId = "00000000-0000-4000-8000-000000000a01";
const secondId = "00000000-0000-4000-8000-000000000b01";
function application(status = "under_review", id = scope.id, firstName = "Fixture A"): AdminApplication {
  return {
    id, email: `${firstName.replace(/\s/g, "-").toLowerCase()}@fixture.invalid`, first_name: firstName, last_name: "Applicant",
    phone: null, country: "US", region: null, city: null, applicant_type: "individual", occupation: null,
    organization: null, interests: ["Synthetic interest"], goals_text: "Synthetic recorded goal", fit_text: "Synthetic recorded fit",
    referral_source: null, referral_code: null, status, submitted_at: "2026-09-01T12:00:00Z", approval_expires_at: null,
  };
}
const history = [{
  id: "fixture-event", previous_status: "approved_pending_payment", new_status: "payment_pending", actor_type: "admin",
  actor_id: "fixture-reviewer", reason_code: "legacy_payment_review", internal_note: "Historical payment reference fixture-ref-1 preserved",
  member_visible_note: "Historical source note retained", created_at: "2025-01-01T12:00:00Z",
}];
const success = (record = application(), events: unknown = history): ApiResult<unknown> => ({
  kind: "ok", data: { ok: true, application: record, events },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let container: HTMLDivElement;
let root: Root;
let routing: Pick<ReturnType<typeof memoryLocation>, "hook">;
async function render() {
  await act(async () => root.render(<Router hook={routing.hook}><ApplicationDetail /></Router>));
}
async function click(selector: string, host: ParentNode = container) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button, `Expected ${selector}`).not.toBeNull();
  await act(async () => button!.click());
}
async function enter(selector: string, value: string, host: ParentNode = container) {
  const textarea = host.querySelector<HTMLTextAreaElement>(selector)!;
  expect(textarea).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  scope.token = "fixture-admin-a"; scope.id = firstId;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  routing = memoryLocation({ path: `/admin/research/applications/${firstId}`, static: true });
  api.get.mockReset().mockResolvedValue(success());
  api.post.mockReset().mockResolvedValue({ kind: "ok", data: { ok: true } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No real API or provider request is permitted in this test."); }));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("application review after paid membership retirement", () => {
  it.each(["submitted", "resubmitted", "under_review", "more_information_requested", "approved_pending_payment", "approved_customer",
    "approved_sponsored_b2b", "payment_pending", "active", "paused", "declined", "withdrawn", "expired"])(
    "keeps retired approval and payment controls absent for %s", async status => {
      api.get.mockResolvedValue(success(application(status)));
      await render();
      const buttons = Array.from(container.querySelectorAll("button")).map(button => button.textContent ?? "");
      expect(buttons.join(" ")).not.toMatch(/approve|activation|activate|payment|renew/i);
      expect(container.querySelector('[data-testid="button-approve"], [data-testid="button-begin-activation"], [data-testid="button-activate"]')).toBeNull();
      expect(container.textContent).not.toMatch(/\$50|\$25|annual plan|first 30 days|monthly membership/i);
      expect(container.textContent).toContain("Customer access no longer requires a paid membership");
      expect(container.querySelector('a[href="/admin/research/members"]')?.textContent).toBe("Open account access diagnosis");
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it("preserves applicant source facts and historical billing/application timeline without recreating approval", async () => {
    await render();
    expect(container.textContent).toContain("Fixture A Applicant");
    expect(container.textContent).toContain("fixture-a@fixture.invalid");
    expect(container.textContent).toContain("Synthetic recorded goal");
    const timeline = container.querySelector('[aria-label="Application timeline"]');
    expect(timeline?.textContent).toContain("Historical payment review pending");
    expect(timeline?.textContent).toContain("Historical payment reference fixture-ref-1 preserved");
    expect(timeline?.textContent).toContain("Historical source note retained");
    expect(timeline?.textContent).toContain("2025-01-01T12:00:00Z");
    expect(api.get).toHaveBeenCalledExactlyOnceWith(scope.token, firstId);
  });

  it("retains the separate begin-review action without sending an approval or activation", async () => {
    api.get.mockResolvedValue(success(application("submitted")));
    await render(); await click('[data-testid="button-begin-review"]');
    expect(api.post).toHaveBeenCalledExactlyOnceWith(scope.token, firstId, "review", {});
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("retains explicit request-information submission with its applicant notification warning", async () => {
    await render();
    expect(container.textContent).toContain("this note is sent to the applicant");
    expect(container.querySelector<HTMLButtonElement>('[data-testid="button-request-info"]')?.disabled).toBe(true);
    await enter("#app-info-note", "  Please review the synthetic application information.  ");
    await click('[data-testid="button-request-info"]');
    expect(api.post).toHaveBeenCalledExactlyOnceWith(scope.token, firstId, "request-info", { memberVisibleNote: "Please review the synthetic application information." });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("requires the preserved decline confirmation before sending the separate review mutation", async () => {
    await render(); await click('[data-testid="button-decline"]');
    expect(api.post).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("decline email");
    await enter("#app-decline-note", "  Synthetic internal review note.  ", document);
    await click('[data-testid="ra-confirm"]', document);
    expect(api.post).toHaveBeenCalledExactlyOnceWith(scope.token, firstId, "decline", { internalNote: "Synthetic internal review note." });
  });

  it("keeps unavailable reads distinct from a missing application", async () => {
    api.get.mockResolvedValue({ kind: "unavailable" });
    await render();
    expect(container.textContent).toContain("Application unavailable");
    expect(container.textContent).toContain("Its presence or absence has not been determined");
    expect(container.textContent).not.toMatch(/not found|does not exist|Fixture A/);
    expect(container.querySelector('[aria-label="Review actions"]')).toBeNull();
  });

  it("refuses a response for a different application id", async () => {
    api.get.mockResolvedValue(success(application("under_review", secondId, "Foreign fixture")));
    await render();
    expect(container.textContent).toContain("The application response could not be verified");
    expect(container.textContent).not.toContain("Foreign fixture");
    expect(container.querySelector('[aria-label="Review actions"]')).toBeNull();
  });

  it.each([null, undefined, {}, { ok: false, application: application("under_review", firstId), events: [] },
    { ok: true, application: null, events: [] }, { ok: true, application: application("under_review", firstId), events: null },
    { ok: true, application: application("under_review", firstId) }])("refuses an invalid success envelope %j", async data => {
    api.get.mockResolvedValue({ kind: "ok", data });
    await render();
    expect(container.querySelector('[data-testid="ra-error"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Fixture A Applicant");
    expect(container.querySelector('[aria-label="Review actions"]')).toBeNull();
  });

  it.each(["token", "id"] as const)("ignores a delayed old read after a %s change", async change => {
    const oldRead = deferred<ApiResult<unknown>>();
    const newRead = deferred<ApiResult<unknown>>();
    api.get.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    await render();
    if (change === "token") scope.token = "fixture-admin-b"; else scope.id = secondId;
    await render();
    await act(async () => oldRead.resolve(success(application("under_review", firstId, "Old private fixture"))));
    expect(container.textContent).not.toContain("Old private fixture");
    await act(async () => newRead.resolve(success(application("under_review", scope.id, "New fixture"))));
    expect(container.textContent).toContain("New fixture Applicant");
    expect(container.textContent).not.toContain("Old private fixture");
  });

  it.each(["token", "id"] as const)("clears loaded facts and action inputs on a %s change", async change => {
    await render(); await enter("#app-info-note", "Old private draft");
    const newRead = deferred<ApiResult<unknown>>(); api.get.mockReturnValueOnce(newRead.promise);
    if (change === "token") scope.token = "fixture-admin-b"; else scope.id = secondId;
    await render();
    expect(container.textContent).not.toContain("Fixture A Applicant");
    expect(container.querySelector("textarea")).toBeNull();
    await act(async () => newRead.resolve(success(application("under_review", scope.id, "New fixture"))));
    expect(container.querySelector<HTMLTextAreaElement>("#app-info-note")?.value).toBe("");
  });

  it.each(["token", "id"] as const)("ignores an old action completion without reloading the next %s scope", async change => {
    const oldAction = deferred<ApiResult<unknown>>(); api.post.mockReturnValue(oldAction.promise);
    await render(); await enter("#app-info-note", "Old synthetic request"); await click('[data-testid="button-request-info"]');
    const nextId = change === "id" ? secondId : firstId;
    api.get.mockResolvedValue(success(application("under_review", nextId, "New fixture")));
    if (change === "token") scope.token = "fixture-admin-b"; else scope.id = secondId;
    await render();
    const readsBeforeOldAction = api.get.mock.calls.length;
    await act(async () => oldAction.resolve({ kind: "ok", data: { ok: true } }));
    expect(api.get).toHaveBeenCalledTimes(readsBeforeOldAction);
    expect(container.textContent).toContain("New fixture Applicant");
    expect(container.querySelector<HTMLTextAreaElement>("#app-info-note")?.value).toBe("");
    expect(container.querySelector('[data-testid="text-application-action-error"]')).toBeNull();
  });

  it("treats an unverified action response as failure rather than approved or reloaded", async () => {
    api.get.mockResolvedValue(success(application("submitted")));
    api.post.mockResolvedValue({ kind: "ok", data: { ok: false } });
    await render(); await click('[data-testid="button-begin-review"]');
    expect(container.textContent).toContain("The action response could not be verified");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("settles a rejected read into a retryable error without showing applicant facts", async () => {
    api.get.mockRejectedValue(new Error("Synthetic unavailable read"));
    await render();
    expect(container.querySelector('[data-testid="ra-error"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Fixture A Applicant");
  });

  it("settles a rejected review action into an error and allows another deliberate attempt", async () => {
    api.get.mockResolvedValue(success(application("submitted")));
    api.post.mockRejectedValue(new Error("Synthetic unavailable action"));
    await render(); await click('[data-testid="button-begin-review"]');
    expect(container.querySelector('[data-testid="text-application-action-error"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="button-begin-review"]')?.disabled).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
