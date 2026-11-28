// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import http from "supertest";
import { expect, vi } from "vitest";
import {
  createDurableJourneyFixture, OPERATOR, ORIGIN, pg16It, ROUTE,
} from "../../../../server/research/assisted-order/request-intent/durable-journey.pg.fixture";
import { RequestIntentForm } from "../assisted-order/RequestIntentForm";
import { RequestIntentStaffReadback } from "../assisted-order/RequestIntentStaffReadback";
import { REQUEST_INTENT_RECEIPT_RECORD_KEY } from "../assisted-order/request-intent-continuation";
import { createRequestIntentApi } from "../assisted-order/request-intent-api";
import { createCatalogAdmissionApi } from "./catalog-admission-api";
import { PreCatalogContact } from "./PreCatalogContact";

pg16It("takes an adult fixture from postal intake to one recoverable receipt and an authorized staff read", async () => {
  const fixture = createDurableJourneyFixture();
  const visitor = document.body.appendChild(document.createElement("main"));
  const desk = document.body.appendChild(document.createElement("main"));
  const guestStorage = window.sessionStorage;
  guestStorage.clear();
  let guestRoot: Root | undefined;
  let staffRoot: Root | undefined;
  const receipts: number[] = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  async function waitFor(check: () => void) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await act(() => new Promise<void>(resolve => setTimeout(resolve, 20)));
      try { check(); return; } catch (error) { if (Date.now() >= deadline) throw error; }
    }
    check();
  }
  function input(root: HTMLElement, name: string) {
    const field = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (!field) throw new Error("Missing fixture input " + name);
    return field;
  }
  async function click(root: HTMLElement, label: string) {
    let button: HTMLButtonElement | undefined;
    await waitFor(() => {
      button = Array.from(root.querySelectorAll("button")).find(e => e.textContent?.trim() === label && !e.disabled);
      expect(button, label).toBeDefined();
    });
    await act(async () => button!.click());
  }
  try {
    await fixture.start({ managedCareSchema: true });
    for (const path of [
      "server/research/assisted-order/request-intent/private-contact.candidate.sql",
      "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261114133643_early_access_postal_admission.sql",
    ]) await fixture.sql(readFileSync(path, "utf8"));
    await fixture.sql("insert into public.care_role_assignments(user_id,role,granted_by) values ($1,'request_intent_reader',$1)", [OPERATOR]);
    const { app } = fixture.application(fixture.adapter({ loseCreateReply: true }).client, false, undefined, {
      env: { RESEARCH_REQUEST_CATALOG_CONTACT_REQUIRED: "true", RESEARCH_REQUEST_CATALOG_CONTACT_RETENTION_SECONDS: "7200" },
      resolvePrincipal: async req => req.get("x-fixture-staff") === "operator"
        ? { subjectId: OPERATOR, roles: ["request_intent_reader"] } : null,
    });
    // Only the identity boundary is a fixture. Both clients use the real routes, repository and SQL.
    function transport(identity: "guest" | "staff") {
      return async (path: string, init: RequestInit) => {
        const req = init.method === "POST" ? http(app).post(path) : http(app).get(path);
        req.set(init.headers as Record<string, string>).set("Origin", ORIGIN).set("Sec-Fetch-Site", "same-origin");
        req.set(identity === "guest" ? "x-fixture-guest" : "x-fixture-staff", identity === "guest" ? "a" : "operator");
        const res = await req.send(init.body as string | undefined);
        if (init.method === "POST" && path === ROUTE) receipts.push(res.status);
        return new Response(JSON.stringify(res.body), { status: res.status });
      };
    }
    const guest = transport("guest");
    const admission = createCatalogAdmissionApi(() => null, guest);
    const customer = createRequestIntentApi(() => null, guest);
    const guestPage = <PreCatalogContact sessionEpoch="guest-a" api={admission}>
      <RequestIntentForm api={customer} storage={guestStorage} embedded ownerKey="early-access-session" />
    </PreCatalogContact>;
    guestRoot = createRoot(visitor);
    await act(async () => guestRoot!.render(guestPage));
    await waitFor(() => expect(visitor.querySelector("[name=fullLegalName]")).toBeTruthy());
    const form = visitor.querySelector("form")!;
    expect(form.checkValidity()).toBe(false);
    expect(visitor.textContent).toContain("two hours");
    expect(visitor.textContent).not.toContain("Synthetic 1");
    input(visitor, "fullLegalName").value = "Synthetic Rehearsal";
    input(visitor, "email").value = "synthetic@example.invalid";
    input(visitor, "line1").value = "1 Fixture Avenue";
    input(visitor, "city").value = "Fixture City";
    input(visitor, "countryCode").value = "US";
    await act(async () => { input(visitor, "countryCode").dispatchEvent(new Event("change", { bubbles: true })); });
    expect(form.checkValidity()).toBe(false);
    input(visitor, "region").value = "TX";
    input(visitor, "postalCode").value = "00000";
    expect(form.checkValidity()).toBe(true);
    await click(visitor, "View catalog");
    await click(visitor, "Add to quote cart");
    await click(visitor, "Continue to details");
    expect(input(visitor, "name").value).toBe("Synthetic Rehearsal");
    expect(input(visitor, "email").value).toBe("synthetic@example.invalid");
    expect(Array.from(visitor.querySelectorAll("input")).map(e => e.value)).toContain("1 Fixture Avenue");
    input(visitor, "phone").value = "+15555550123";
    await act(async () => input(visitor, "age").click());
    await click(visitor, "Continue to request a quote");
    expect(visitor.textContent).toContain("Submit your request");
    for (const ack of visitor.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
      await act(async () => ack.click());
    }
    await click(visitor, "Submit Request");
    await click(visitor, "Retry same request");
    const reference = /XRI-[\dA-F]{32}/;
    await waitFor(() => expect(visitor.textContent).toMatch(reference));
    const receipt = visitor.textContent!.match(reference)![0];
    expect(receipts).toEqual([503, 200]);

    await act(async () => guestRoot!.unmount());
    // A remount intentionally starts fresh on the same page. Simulate the prior page-load
    // identity as the component's reload tests do, preserving the actual saved receipt.
    const stored = JSON.parse(guestStorage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY)!);
    expect(stored.publicReference).toBe(receipt);
    guestStorage.setItem(REQUEST_INTENT_RECEIPT_RECORD_KEY, JSON.stringify({ ...stored, pageLoad: "prior-page" }));
    guestRoot = createRoot(visitor);
    await act(async () => guestRoot!.render(guestPage));
    await waitFor(() => expect(visitor.textContent).toContain(receipt));
    expect(receipts).toEqual([503, 200]);

    staffRoot = createRoot(desk);
    const operator = createRequestIntentApi(() => null, transport("staff"));
    await act(async () => staffRoot!.render(<RequestIntentStaffReadback api={operator} />));
    await click(desk, receipt);
    await waitFor(() => expect(desk.textContent).toContain("1 Fixture Avenue"));
    expect(desk.textContent).toContain("Synthetic Rehearsal");
    expect(await fixture.counts()).toEqual({ requests: 1, submitted: 1, events: 3 });
    expect((await fixture.sql("select event_type,actor_user_id from request_intent_private.access_events where event_type in ('queue_list','staff_read') order by event_type")).rows)
      .toEqual([{ event_type: "queue_list", actor_user_id: OPERATOR }, { event_type: "staff_read", actor_user_id: OPERATOR }]);
  } finally {
    try {
      await act(async () => { guestRoot?.unmount(); staffRoot?.unmount(); });
      visitor.remove();
      desk.remove();
      guestStorage.clear();
      vi.unstubAllGlobals();
    } finally {
      await fixture.close();
    }
  }
}, 120_000);
