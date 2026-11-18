import { describe, expect, it, vi } from "vitest";
import { createRequestWorkflowApi } from "./request-workflow-api";

const id = "30000000-0000-4000-8000-000000000001";
const workflow = {
  schemaVersion: 1, requestId: id, publicReference: "XRI-30000000000040008000000000000001",
  state: "queued", revision: 1, changedAt: "2026-11-18T03:00:05.000Z", customerNotice: "pending",
  events: [
    { id: "40000000-0000-4000-8000-000000000001", revision: 0, kind: "received", occurredAt: "2026-11-18T03:00:00.000Z" },
    { id: "40000000-0000-4000-8000-000000000002", revision: 1, kind: "queued", occurredAt: "2026-11-18T03:00:05.000Z" },
  ],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("read-only workflow transport", () => {
  it("GETs the owner path with cookie, no-store, the current token and no query or body", async () => {
    let token: string | null = "synthetic-member";
    const transport = vi.fn(async (_path: string, _init: RequestInit) => json(workflow));
    const api = createRequestWorkflowApi(() => token, transport);
    await expect(api.owner(id)).resolves.toEqual({ status: "ready", value: workflow });
    token = null;
    await api.owner(id);
    const [path, init] = transport.mock.calls[0];
    expect(path).toBe(`/api/research/early-access/request-intents/${id}/workflow`);
    expect(init).toMatchObject({ method: "GET", credentials: "include", cache: "no-store" });
    expect(init.body).toBeUndefined();
    expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-member" });
    expect(transport.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
  });
  it("GETs the staff path and checks the wrapper's request id", async () => {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => json({ workflow, canStartReview: false }));
    const api = createRequestWorkflowApi(() => null, transport);
    await expect(api.staff(id)).resolves.toEqual({ status: "ready", value: { workflow, canStartReview: false } });
    expect(transport.mock.calls[0][0]).toBe(`/api/research/early-access/request-intents/staff/${id}/workflow`);
    const other = "30000000-0000-4000-8000-000000000002";
    await expect(createRequestWorkflowApi(() => null, async () => json({ workflow, canStartReview: false })).staff(other))
      .resolves.toEqual({ status: "unconfirmed" });
  });
  it("sends nothing for an identifier that is not a UUID, including a public reference", async () => {
    const transport = vi.fn(async () => json(workflow));
    const api = createRequestWorkflowApi(() => null, transport);
    for (const value of ["XRI-30000000000040008000000000000001", "", "../config", `${id}?email=x`]) {
      await expect(api.owner(value)).resolves.toEqual({ status: "unconfirmed" });
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("maps refusals without disclosing existence, and only the server's own code means switched off", async () => {
    const cases: Array<[Response, string]> = [
      [json({ error: "authentication_required" }, 401), "denied"],
      [json({ error: "forbidden" }, 403), "denied"],
      [json({ error: "request_not_found" }, 404), "denied"],
      [json({ error: "rate_limited" }, 429), "rate_limited"],
      [json({ error: "request_workflow_unavailable" }, 503), "unavailable"],
      [json({ error: "request_outcome_unconfirmed" }, 503), "unconfirmed"],
      [new Response("<html>Bad gateway</html>", { status: 503 }), "unconfirmed"],
      [json({ error: "invalid_workflow_request" }, 400), "unconfirmed"],
      [json({ error: "x" }, 500), "unconfirmed"],
    ];
    for (const [response, status] of cases) {
      await expect(createRequestWorkflowApi(() => null, async () => response).owner(id)).resolves.toEqual({ status });
    }
    await expect(createRequestWorkflowApi(() => null, async () => { throw new TypeError("offline"); }).owner(id))
      .resolves.toEqual({ status: "unconfirmed" });
  });
  it("refuses a 200 that fails the strict contract or names another request", async () => {
    const bad = [
      null, "ok", { ...workflow, extra: true }, { ...workflow, state: "approved" },
      { ...workflow, revision: 2 }, { ...workflow, events: [workflow.events[1], workflow.events[0]] },
      { ...workflow, changedAt: "2026-11-18T03:00:00.000Z" },
      { ...workflow, requestId: "30000000-0000-4000-8000-000000000002" },
    ];
    for (const body of bad) {
      await expect(createRequestWorkflowApi(() => null, async () => json(body)).owner(id)).resolves.toEqual({ status: "unconfirmed" });
    }
    await expect(createRequestWorkflowApi(() => null, async () => new Response("not json", { status: 200 })).owner(id))
      .resolves.toEqual({ status: "unconfirmed" });
  });
});
