// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RequestWorkflowV1 } from "../../../../shared/research/assisted-order/request-intent-workflow";
import type { RequestWorkflowRead } from "./request-workflow-api";
import { REQUEST_STATUS_UNAVAILABLE, RequestWorkflowStatus, StaffRequestWorkflowPanel } from "./RequestWorkflowStatus";
import { RequestIntentReceipt } from "./RequestIntentReceipt";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const id = "30000000-0000-4000-8000-000000000001";
const reviewing: RequestWorkflowV1 = {
  schemaVersion: 1, requestId: id, publicReference: "XRI-30000000000040008000000000000001",
  state: "reviewing", revision: 2, changedAt: "2026-11-18T03:10:00.000Z", customerNotice: "delivery_unknown",
  events: [
    { id: "40000000-0000-4000-8000-000000000001", revision: 0, kind: "received", occurredAt: "2026-11-18T03:00:00.000Z" },
    { id: "40000000-0000-4000-8000-000000000002", revision: 1, kind: "queued", occurredAt: "2026-11-18T03:00:05.000Z" },
    { id: "40000000-0000-4000-8000-000000000003", revision: 2, kind: "review_started", occurredAt: "2026-11-18T03:10:00.000Z" },
  ],
};
const receipt = { kind: "unapproved_selection_request" as const, requestId: id,
  publicReference: reviewing.publicReference, status: "pending_review" as const, createdAt: "2026-11-18T03:00:00.000Z" };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const text = () => container.textContent ?? "";
const button = (name: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === name);

describe("customer request status", () => {
  it("shows only the server's event times, in order, with machine-readable instants", async () => {
    const read = vi.fn(async () => ({ status: "ready", value: reviewing }) as const);
    await act(async () => root.render(<RequestWorkflowStatus requestId={id} read={read} />));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(id);
    expect(text()).toContain("The team has started reviewing your request.");
    const items = [...container.querySelectorAll("li")];
    expect(items.map((item) => item.querySelector("span")?.textContent)).toEqual(["Request received", "Added to the review queue", "Review started"]);
    expect(items.map((item) => item.querySelector("time")?.getAttribute("dateTime"))).toEqual(reviewing.events.map((event) => event.occurredAt));
    expect(text()).not.toMatch(/approved|shipped|paid|estimated/i);
    // Each time names its zone, so a customer in another zone is not misled.
    expect(items.every((item) => /(GMT|UTC|[A-Z]{2,5})$/.test(item.querySelector("time")?.textContent ?? ""))).toBe(true);
  });
  it("refreshes only on an explicit action, and an older reply never replaces a newer one", async () => {
    const replies: Array<(value: RequestWorkflowRead<RequestWorkflowV1>) => void> = [];
    const read = vi.fn(() => new Promise<RequestWorkflowRead<RequestWorkflowV1>>((resolve) => { replies.push(resolve); }));
    await act(async () => root.render(<RequestWorkflowStatus requestId={id} read={read} />));
    expect(text()).toBe("Checking current status...");
    await act(async () => replies[0]({ status: "unconfirmed" }));
    expect(text()).toContain("Current status could not be confirmed. Your request is still saved.");
    await act(async () => button("Refresh status")!.click());
    expect(read).toHaveBeenCalledTimes(2);
    expect(button("Refresh status")!.disabled).toBe(true);
    await act(async () => replies[1]({ status: "ready", value: { ...reviewing, state: "queued", revision: 1,
      changedAt: reviewing.events[1].occurredAt, events: reviewing.events.slice(0, 2) } }));
    expect(text()).toContain("Your request is in the review queue.");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
  it("keeps the receipt's existing sentence when the server reports the read switched off", async () => {
    await act(async () => root.render(<RequestWorkflowStatus requestId={id} read={async () => ({ status: "unavailable" })} />));
    expect(text()).toBe(REQUEST_STATUS_UNAVAILABLE);
    expect(container.querySelector("button")).toBeNull();
  });
  it("words a denied read neutrally, since a real owner's pre-workflow request is also a 404, and offers no retry loop", async () => {
    await act(async () => root.render(<RequestWorkflowStatus requestId={id} read={async () => ({ status: "denied" })} />));
    expect(text()).toContain("Online status is not available for this request. Your request is still saved.");
    expect(text()).not.toMatch(/session/i);
    expect(text()).not.toMatch(/not found|does not exist/i);
    expect(button("Refresh status")).toBeUndefined();
  });
  it("treats a rejected read as unconfirmed", async () => {
    await act(async () => root.render(<RequestWorkflowStatus requestId={id} read={async () => { throw new Error("x"); }} />));
    expect(text()).toContain("Current status could not be confirmed.");
  });
});

describe("receipt integration", () => {
  it("is unchanged without a status read", async () => {
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} />));
    expect(text()).toContain("Keep this reference and quote it if you contact support about this request. " + REQUEST_STATUS_UNAVAILABLE);
    expect(text()).not.toContain("Request status");
  });
  it("shows the status under the receipt heading level, and the same sentence when the read is off", async () => {
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} headingLevel={2}
      workflowRead={async () => ({ status: "ready", value: reviewing })} />));
    expect(container.querySelector("h3")?.textContent).toBe("Request status");
    await act(async () => root.render(<RequestIntentReceipt key="off" receipt={receipt}
      workflowRead={async () => ({ status: "unavailable" })} />));
    expect(text().split(REQUEST_STATUS_UNAVAILABLE)).toHaveLength(2);
  });
});

describe("staff workflow panel", () => {
  it("is read-only: state, revision, notice and times, and no Start review control even when the server allows it", async () => {
    const read = vi.fn(async () => ({ status: "ready", value: { workflow: reviewing, canStartReview: true } }) as const);
    await act(async () => root.render(<StaffRequestWorkflowPanel requestId={id} read={read} />));
    expect(text()).toContain("State: Reviewing | Revision 2 | Customer notice: Result unknown. Reconcile before any resend");
    expect(container.querySelectorAll("time")).toHaveLength(3);
    expect(text()).not.toMatch(/start review/i);
    expect([...container.querySelectorAll("button")].map((node) => node.textContent)).toEqual(["Refresh workflow"]);
  });
  it("names an unavailable workflow and a refused session plainly", async () => {
    await act(async () => root.render(<StaffRequestWorkflowPanel requestId={id} read={async () => ({ status: "unavailable" })} />));
    expect(text()).toContain("Workflow is unavailable right now.");
    await act(async () => root.render(<StaffRequestWorkflowPanel key="d" requestId={id} read={async () => ({ status: "denied" })} />));
    expect(text()).toContain("Workflow access could not be confirmed for this session.");
  });
});
