// @vitest-environment jsdom
/**
 * Mounted React + canonical API/HTTP/service/RPC + owned PostgreSQL 16.
 * Synthetic headers stand in for verified guest/operator identities and Origin;
 * they do not qualify cookies, live Auth, managed Care schema or native browsers.
 * All request persistence is in the actual unchanged candidate SQL.
 */
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments,
} from "../../../../shared/research/assisted-order/form";
import {
  REQUEST_INTENT_NOTICE, REQUEST_INTENT_RECOVERY_NOTICE,
  type RequestIntentInput, type RequestIntentReceipt,
} from "../../../../shared/research/assisted-order/request-intent";
import { sha256AssistedOrderHasher } from "../../../../server/research/assisted-order/defaults";
import {
  createDurableJourneyFixture, guest, otherGuest, OPERATOR, ORIGIN, ROUTE, submission,
} from "../../../../server/research/assisted-order/request-intent/durable-journey.pg.fixture";
import { RequestIntentForm } from "./RequestIntentForm";
import { RequestIntentStaffReadback } from "./RequestIntentStaffReadback";
import { createRequestIntentApi, type RequestIntentApi } from "./request-intent-api";
import { REQUEST_INTENT_ATTEMPT_KEY, readIntentAttempt } from "./request-intent-attempt";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hostedPg16It = process.env.CI ? it : it.skip;

type Exchange = {
  path: string; method: string; guest?: "a" | "b"; staff?: "operator";
  body: unknown; marker: string | null; status?: number; response?: unknown;
};

async function closeHttp(server: Server | null) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Owned HTTP server did not close")), 5_000);
    server.close((error) => {
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    });
    server.closeAllConnections();
  });
}

// These DOM events exercise React handlers, not native-browser validation/layout.
async function type(input: HTMLInputElement, value: string) {
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function settles(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await delay(20); });
    check();
  }, { timeout: 15_000, interval: 20 });
}

describe("mounted guest request through disposable PostgreSQL to mounted operator readback", () => {
  hostedPg16It("retains the same attempt after a committed 503, recovers on remount and never duplicates it", async () => {
    const fixture = createDurableJourneyFixture();
    const host = document.createElement("div");
    document.body.append(host);
    sessionStorage.clear();
    let root: Root | null = null;
    let server: Server | null = null;
    const exchanges: Exchange[] = [];
    const acknowledgments = requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: true });
    const submitExchanges = () => exchanges.filter((entry) => entry.method === "POST" && entry.path === ROUTE);
    const button = (text: string) => {
      const matches = [...host.querySelectorAll("button")].filter((entry) => entry.textContent === text);
      expect(matches).toHaveLength(1);
      return matches[0];
    };
    const click = async (text: string) => { await act(async () => button(text).click()); };
    const submitForm = async () => {
      expect(host.querySelectorAll("form")).toHaveLength(1);
      await act(async () => host.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ));
    };
    async function unmount() {
      if (root) { const current = root; root = null; await act(async () => current.unmount()); }
    }
    async function mountGuest(api: RequestIntentApi) {
      await unmount();
      root = createRoot(host);
      await act(async () => root!.render(<RequestIntentForm api={api} storage={sessionStorage} />));
    }

    try {
      const networkFetch = globalThis.fetch.bind(globalThis);
      await fixture.start();
      expect(await fixture.counts()).toEqual({ requests: 0, submitted: 0, events: 0 });
      const rpc = fixture.adapter({ loseCreateReply: true });
      const application = fixture.application(rpc.client);
      const ownedServer = createServer(application.app);
      server = ownedServer;
      await new Promise<void>((resolve, reject) => {
        ownedServer.once("error", reject);
        ownedServer.listen(0, "127.0.0.1", () => {
          ownedServer.off("error", reject);
          resolve();
        });
      });
      const address = ownedServer.address();
      if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
        throw new Error("HTTP listener was not confined to literal loopback");
      }
      const origin = "http://127.0.0.1:" + address.port;
      function transport(identity: { guest?: "a" | "b"; staff?: "operator" }) {
        return async (path: string, init: RequestInit): Promise<Response> => {
          const url = new URL(path, origin);
          if (url.origin !== origin || !(url.pathname === ROUTE || url.pathname.startsWith(ROUTE + "/"))) {
            throw new Error("Transport escaped owned request-intent fixture");
          }
          const headers = new Headers(init.headers);
          headers.set("Origin", ORIGIN);
          headers.set("Sec-Fetch-Site", "same-origin");
          if (identity.guest) headers.set("x-fixture-guest", identity.guest);
          if (identity.staff) headers.set("x-fixture-staff", identity.staff);
          const exchange: Exchange = {
            path, method: init.method ?? "GET", ...identity,
            body: typeof init.body === "string" ? JSON.parse(init.body) : null,
            marker: sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY),
          };
          exchanges.push(exchange);
          // No API result is substituted. Reply loss occurs only after the
          // fixture's actual create RPC has committed and closed its connection.
          const response = await networkFetch(url.href, {
            ...init, headers, redirect: "error", signal: AbortSignal.timeout(15_000),
          });
          exchange.status = response.status;
          exchange.response = await response.clone().json();
          return response;
        };
      }
      const guestApi = createRequestIntentApi(() => null, transport({ guest: "a" }));
      const foreignApi = createRequestIntentApi(() => null, transport({ guest: "b" }));
      const operatorApi = createRequestIntentApi(() => null, transport({ staff: "operator" }));

      await mountGuest(guestApi);
      await settles(() => {
        expect(host.querySelectorAll("article")).toHaveLength(2);
        expect(exchanges.find((entry) => entry.path === ROUTE + "/config")?.status).toBe(200);
      });
      const cards = [...host.querySelectorAll("article")];
      expect(cards.map((card) => card.querySelector("h2")?.textContent)).toEqual(["Synthetic 1", "Synthetic 2"]);
      expect(cards[0].textContent).toContain("Synthetic exact variant 1");
      expect(cards[0].textContent).toContain("Clinical review required. Not a prescription.");
      expect(cards[0].textContent).toContain("Final price follows applicable review.");
      expect(cards[1].textContent).toContain("Synthetic exact variant 2");
      expect(cards[1].textContent).toContain("Research Use Only. Nonclinical use only.");
      expect(cards[1].textContent).toContain("Price on request (catalog display, not a final quote)");
      await click("Add Synthetic 1 to request");
      await click("Add Synthetic 2 to request");
      const quantities = [...host.querySelectorAll<HTMLInputElement>("article input[type=number]")];
      expect(quantities).toHaveLength(2);
      expect(quantities.map((input) => [input.min, input.max, input.step])).toEqual([["1", "100", "1"], ["1", "100", "1"]]);
      await type(quantities[0], "2");
      await type(quantities[1], "101");
      expect(quantities[1].value).toBe("100"); // The real UI clamps; it cannot carry 101.
      await type(quantities[1], "3");
      expect(host.querySelector('[aria-label="Selected request items"]')?.textContent)
        .toContain("2 products | 2 exact variants | 5 requested units");
      expect(submitExchanges()).toHaveLength(0);
      expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
      await click("Continue to contact");
      for (const [name, value] of Object.entries({
        name: "Synthetic Customer", email: "synthetic@example.invalid", phone: "+15555550123",
        shippingLine1: "1 Synthetic Street", shippingLine2: "Synthetic Unit", shippingCity: "Test",
        shippingRegion: "TX", shippingPostalCode: "00000", shippingCountryCode: "US",
      })) await type(host.querySelector<HTMLInputElement>('input[name="' + name + '"]')!, value);
      await act(async () => host.querySelector<HTMLInputElement>('input[name="age"]')!.click());
      await submitForm();
      expect(host.textContent).toContain("Review your request");
      expect(host.textContent).toContain("Synthetic 1 | Synthetic exact variant 1 | Requested quantity: 2 | Pending clinical review");
      expect(host.textContent).toContain("Synthetic 2 | Synthetic exact variant 2 | Requested quantity: 3 | Pending internal review");
      expect(button("Submit for review").disabled).toBe(true);
      await click("Submit for review");
      const checks = [...host.querySelectorAll<HTMLInputElement>("fieldset input[type=checkbox]")];
      expect(checks.map((input) => input.closest("label")?.textContent)).toEqual([
        "I have read and accept the fixture-terms policy.", ...acknowledgments.map((ack) => ack.copy),
      ]);
      for (const check of checks.slice(0, -1)) await act(async () => check.click());
      expect(button("Submit for review").disabled).toBe(true);
      await click("Submit for review");
      expect(submitExchanges()).toHaveLength(0);
      expect(await fixture.counts()).toEqual({ requests: 0, submitted: 0, events: 0 });
      expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();

      // Independent negative controls traverse the same real API/HTTP/SQL path.
      // The mounted input clamps quantities; this probes an invalid wire value.
      const invalid = submission();
      await expect(guestApi.submit({ ...invalid, lines: [{ ...invalid.lines[0], quantity: 101 }, invalid.lines[1]] }))
        .rejects.toMatchObject({ status: 400, code: "selection_requires_refresh" });
      await expect(guestApi.submit({ ...invalid, agreements: invalid.agreements.slice(1) }))
        .rejects.toMatchObject({ status: 400, code: "current_acknowledgments_required" });
      expect(await fixture.counts()).toEqual({ requests: 0, submitted: 0, events: 0 });
      expect(rpc.calls.filter((name) => name === "request_intent_create_or_replay")).toEqual([]);
      await act(async () => checks[checks.length - 1].click());
      expect(button("Submit for review").disabled).toBe(false);
      await click("Submit for review");
      await settles(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe(REQUEST_INTENT_RECOVERY_NOTICE));
      expect(submitExchanges()).toHaveLength(3);
      const sent = submitExchanges()[2];
      expect(sent.status).toBe(503);
      expect(sent.response).toEqual({ error: "request_outcome_unconfirmed", message: REQUEST_INTENT_RECOVERY_NOTICE });
      const input = sent.body as RequestIntentInput;
      const markerRaw = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
      expect(markerRaw).not.toBeNull();
      const marker = readIntentAttempt(sessionStorage)!;
      expect(marker).toEqual({ key: input.idempotencyKey, acceptedAt: input.agreements[0].acceptedAt, state: "uncertain" });
      expect(JSON.parse(sent.marker!)).toEqual({ key: marker.key, acceptedAt: marker.acceptedAt, state: "in_flight" });
      expect(sent.marker).toBe(markerRaw);
      expect(Object.keys(JSON.parse(markerRaw!)).sort()).toEqual(["acceptedAt", "key", "state"]);
      expect(sessionStorage.length).toBe(1);
      expect(input.lines).toEqual([
        { productId: "product-var-1", variantId: "pc-var-1", quantity: 2 },
        { productId: "product-var-2", variantId: "pc-var-2", quantity: 3 },
      ]);
      expect(input.agreements).toEqual([
        { kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt: marker.acceptedAt },
        ...acknowledgments.map((ack) => ({ ...assistedOrderFormPair(ack), accepted: true, acceptedAt: marker.acceptedAt })),
      ]);
      expect(button("Edit selection").disabled).toBe(true);
      expect(button("Retry same request").disabled).toBe(false);
      expect(host.textContent).not.toContain("This request was not saved.");
      const savedRows = await fixture.snapshot();
      expect(savedRows).toHaveLength(1);
      const saved = savedRows[0];
      expect(saved.owner_hash).toBe(sha256AssistedOrderHasher.stableHash([
        "request-intent-owner", "session", guest.earlyAccessCustomerRef, guest.earlyAccessSessionHash,
      ]));
      expect(saved.attempt_hash).toBe(sha256AssistedOrderHasher.hash(marker.key));
      const addressInput = { line1: "1 Synthetic Street", line2: "Synthetic Unit", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" };
      expect(saved.contact).toEqual({
        fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
        ageConfirmed: true, billingSameAsShipping: true, shippingAddress: addressInput, billingAddress: addressInput,
      });
      expect(saved.agreements).toEqual(input.agreements);
      expect(saved.lines).toEqual([
        {
          productId: "product-var-1", variantId: "pc-var-1", sourceVariantId: "var-1",
          productName: "Synthetic 1", specification: "Synthetic exact variant 1",
          family: "clinical_formulations_503a", workflowMode: "provider_request",
          quantity: 2, researchUseOnly: false, clinicalReviewRequired: true,
          sourceDisplayState: "care_pathway", sourceVariantDisplayState: "care_pathway",
          sourceRefusal: "provider_pathway_family", catalogVersion: "synthetic-durable-v1", reviewState: "pending",
        },
        {
          productId: "product-var-2", variantId: "pc-var-2", sourceVariantId: "var-2",
          productName: "Synthetic 2", specification: "Synthetic exact variant 2",
          family: "research_peptides_materials", workflowMode: "request_pricing",
          quantity: 3, researchUseOnly: true, clinicalReviewRequired: false,
          sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access",
          sourceRefusal: null, catalogVersion: "synthetic-durable-v1", reviewState: "pending",
        },
      ]);
      expect(host.textContent).not.toContain(saved.public_reference);
      expect(rpc.calls.filter((name) => name === "request_intent_create_or_replay")).toHaveLength(1);
      expect(rpc.errors).toEqual([]);
      expect(await fixture.counts()).toEqual({ requests: 1, submitted: 1, events: 1 });

      // Same email and even the same retained marker confer no other-owner access.
      expect(otherGuest.normalizedEmail).toBe(guest.normalizedEmail);
      await mountGuest(foreignApi);
      expect(host.textContent).toContain("Check your earlier request");
      await click("Check saved request");
      await settles(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        "The saved result is not yet confirmed. Keep this attempt and check again, or contact support before any replacement.",
      ));
      const foreign = exchanges.filter((entry) => entry.path === ROUTE + "/recover" && entry.guest === "b");
      expect(foreign).toHaveLength(1);
      expect(foreign[0].body).toEqual({ idempotencyKey: marker.key });
      expect(foreign[0].response).toEqual({ receipt: null });
      expect(host.textContent).not.toContain(saved.public_reference);
      expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(markerRaw);
      expect(await fixture.snapshot()).toEqual(savedRows);

      await mountGuest(guestApi); // Same actual sessionStorage; no marker rewrite.
      expect(host.textContent).toContain("Check your earlier request");
      expect(host.textContent).toContain("Product selections and contact information were not saved in this browser.");
      expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(markerRaw);
      expect(host.querySelector("form")).toBeNull();
      await click("Check saved request");
      await settles(() => expect(host.querySelector("h1")?.textContent).toBe("Request saved for review"));
      const recovered = exchanges.filter((entry) => entry.path === ROUTE + "/recover" && entry.guest === "a");
      expect(recovered).toHaveLength(1);
      expect(recovered[0].body).toEqual({ idempotencyKey: marker.key });
      const receipt = (recovered[0].response as { receipt: RequestIntentReceipt }).receipt;
      expect(receipt).toEqual({
        kind: "unapproved_selection_request", requestId: saved.id,
        publicReference: "XRI-" + saved.id.replace(/-/g, "").toUpperCase(),
        status: "pending_review", createdAt: expect.any(String),
      });
      expect(receipt.publicReference).toBe(saved.public_reference);
      expect(Date.parse(receipt.createdAt)).toBe(saved.created_at.getTime());
      expect(host.querySelector('[role="status"]')?.textContent).toBe("Your saved request reference is " + saved.public_reference + ".");
      expect(host.textContent).toContain(REQUEST_INTENT_NOTICE);
      expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
      expect(submitExchanges()).toHaveLength(3); // Recovery never silently resubmits.
      for (let replay = 0; replay < 2; replay += 1) expect(await guestApi.submit(input)).toEqual(receipt);
      await expect(guestApi.submit({ ...input, lines: [{ ...input.lines[0], quantity: 3 }, input.lines[1]] }))
        .rejects.toMatchObject({ status: 409, code: "attempt_conflict" });
      expect(rpc.calls.filter((name) => name === "request_intent_create_or_replay")).toHaveLength(1);
      expect(await fixture.snapshot()).toEqual(savedRows);
      expect(await fixture.counts()).toEqual({ requests: 1, submitted: 1, events: 1 });

      // Final authorized positive control follows the foreign-owner/conflict probes.
      // The existing private component is mounted; Auth/shell authorization is synthetic.
      await unmount();
      root = createRoot(host);
      await act(async () => root!.render(<RequestIntentStaffReadback api={operatorApi} />));
      await settles(() => expect(host.querySelector('[aria-label="Pending private requests"]')?.textContent).toContain("Pending requests (1)"));
      expect(host.textContent).toContain("2 requested lines");
      await click(saved.public_reference);
      expect(host.querySelector<HTMLInputElement>("form input")?.value).toBe(saved.public_reference);
      await submitForm();
      await settles(() => expect([...host.querySelectorAll("h2")].map((entry) => entry.textContent)).toContain(saved.public_reference));
      expect(host.textContent).toContain("Synthetic Customer | synthetic@example.invalid | +15555550123");
      const privateLines = [...host.querySelectorAll("li")].filter((entry) => entry.querySelector("strong"));
      expect(privateLines).toHaveLength(2);
      expect(privateLines[0].textContent).toContain("Synthetic exact variant 1 | pc-var-1 | Requested quantity: 2");
      expect(privateLines[0].textContent).toContain("Pending clinical review");
      expect(privateLines[0].textContent).toContain("Source restriction: provider_pathway_family");
      expect(privateLines[1].textContent).toContain("Synthetic exact variant 2 | pc-var-2 | Requested quantity: 3");
      expect(privateLines[1].textContent).toContain("Pending internal review | Research Use Only");
      const queue = exchanges.filter((entry) => entry.staff === "operator" && entry.path === ROUTE + "/staff?page=1");
      const detail = exchanges.filter((entry) => entry.staff === "operator" && entry.path === ROUTE + "/staff/" + saved.id);
      expect(queue).toHaveLength(1);
      expect(queue[0].response).toEqual({ items: [{ ...receipt, lineCount: 2 }], total: 1, page: 1, pageSize: 25 });
      expect(detail).toHaveLength(1);
      expect(detail[0].response).toEqual({ ...receipt, contact: saved.contact, agreements: saved.agreements, lines: saved.lines });
      expect(application.care.loadCapabilityStatus).not.toHaveBeenCalled();
      expect(rpc.errors).toEqual([]);
      expect(await fixture.snapshot()).toEqual(savedRows);
      expect(await fixture.counts()).toEqual({ requests: 1, submitted: 1, events: 3 });
      expect((await fixture.sql("select distinct actor_user_id from request_intent_private.access_events where event_type in ('staff_read','queue_list')")).rows)
        .toEqual([{ actor_user_id: OPERATOR }]);
    } finally {
      try {
        await unmount();
      } finally {
        host.remove();
        sessionStorage.clear();
        try { await closeHttp(server); }
        finally { await fixture.close(); }
      }
    }
  }, 240_000);
});
