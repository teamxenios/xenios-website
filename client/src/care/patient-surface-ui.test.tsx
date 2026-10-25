// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import { careApiFetch } from "./api";
import CareSection from "./section";
import CareInstructionsPage, { CARE_INSTRUCTIONS_PATH } from "./CareInstructionsPage";
import CareSuppliesPage, { CARE_SUPPLIES_PATH } from "./CareSuppliesPage";
import CareMessagesPage, { CARE_MESSAGES_PATH } from "./CareMessagesPage";
import CareSupportPage, { CARE_SUPPORT_PATH } from "./CareSupportPage";

vi.mock("./api", () => ({ careApiFetch: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const careApiFetchMock = vi.mocked(careApiFetch);

const source = (file: string) => readFileSync(resolve(__dirname, file), "utf8");
const instructionsSource = source("./CareInstructionsPage.tsx");
const suppliesSource = source("./CareSuppliesPage.tsx");
const messagesSource = source("./CareMessagesPage.tsx");
const supportSource = source("./CareSupportPage.tsx");
const statesSource = source("./CarePatientSurfaceStates.tsx");
const sectionSource = source("./section.tsx");

type PageComponent = () => React.JSX.Element;

const SURFACES = [
  ["instructions", CARE_INSTRUCTIONS_PATH, CareInstructionsPage, CARE_ROUTE_CONTRACTS.instructions],
  ["supplies", CARE_SUPPLIES_PATH, CareSuppliesPage, CARE_ROUTE_CONTRACTS.supplies],
  ["messages", CARE_MESSAGES_PATH, CareMessagesPage, CARE_ROUTE_CONTRACTS.messages],
  ["support", CARE_SUPPORT_PATH, CareSupportPage, CARE_ROUTE_CONTRACTS.support],
] as const satisfies readonly (readonly [string, string, PageComponent, string])[];

/**
 * Obviously synthetic. No value here is, or resembles, a real person, a real
 * clinician, a real carrier reference, or any clinical content.
 */
const SYNTHETIC = {
  instructionId: "11111111-1111-4111-8111-111111111111",
  shipmentId: "22222222-2222-4222-8222-222222222222",
  threadId: "33333333-3333-4333-8333-333333333333",
  requestId: "44444444-4444-4444-8444-444444444444",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  careApiFetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  careApiFetchMock.mockReset();
});

async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

async function render(path: string, Page: PageComponent) {
  const staticLocation = (): [string, (next: string) => void] => [
    path,
    () => undefined,
  ];
  await act(async () => {
    root.render(
      <Router hook={staticLocation} searchHook={() => ""} ssrPath={path}>
        <Route path={path}>
          <Page />
        </Route>
      </Router>,
    );
  });
  await settle();
  return container;
}

function text() {
  return container.textContent ?? "";
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Care patient surfaces, honest states", () => {
  it.each(SURFACES)(
    "reads %s from the contract declared on main",
    async (_label, path, Page, contract) => {
      careApiFetchMock.mockResolvedValue(json({ message: "Not Found" }, 404));
      await render(path, Page);
      expect(careApiFetchMock).toHaveBeenCalledWith(contract);
    },
  );

  it.each(SURFACES)(
    "names the unserved contract on %s instead of showing an empty list",
    async (_label, path, Page, contract) => {
      careApiFetchMock.mockResolvedValue(json({ message: "Not Found" }, 404));
      await render(path, Page);
      const rendered = text();
      expect(rendered).toContain("CONTRACT NOT SERVED");
      expect(rendered).toContain(contract);
      expect(rendered).toContain("this is not an empty list");
      expect(rendered).not.toMatch(/No (instruction|supply shipment|conversation|support request)/);
    },
  );

  it.each(SURFACES)(
    "asks an anonymous visitor on %s to sign in and shows nothing",
    async (_label, path, Page) => {
      careApiFetchMock.mockResolvedValue(json({ ok: false, code: "care_auth_required" }, 401));
      await render(path, Page);
      expect(text()).toContain("AUTHORIZATION REQUIRED");
      expect(text()).toContain("Sign in is required.");
      expect(container.querySelector("form")).toBeNull();
    },
  );

  it.each(SURFACES)(
    "tells the wrong role on %s that nothing is claimed about any record",
    async (_label, path, Page) => {
      careApiFetchMock.mockResolvedValue(json({ ok: false, code: "care_forbidden" }, 403));
      await render(path, Page);
      expect(text()).toContain("NOT AUTHORIZED");
      expect(text()).toContain("This says nothing about whether any record exists.");
      expect(container.querySelector("form")).toBeNull();
    },
  );

  it.each(SURFACES)(
    "repeats the server's own words when Care is switched off on %s",
    async (_label, path, Page) => {
      careApiFetchMock.mockResolvedValue(
        json({ ok: false, code: "care_disabled", message: "Care is being prepared." }, 503),
      );
      await render(path, Page);
      expect(text()).toContain("Care is not available yet.");
      expect(text()).toContain("Care is being prepared.");
    },
  );

  it.each(SURFACES)("offers a retry after a failure on %s", async (_label, path, Page) => {
    careApiFetchMock.mockResolvedValue(json({ ok: false }, 500));
    await render(path, Page);
    expect(text()).toContain("temporarily unavailable");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();
    careApiFetchMock.mockClear();
    await click(retry as HTMLButtonElement);
    expect(careApiFetchMock).toHaveBeenCalled();
  });

  it.each(SURFACES)(
    "marks %s busy while the read is in flight and claims nothing",
    async (_label, path, Page) => {
      let release: (value: Response) => void = () => undefined;
      careApiFetchMock.mockImplementation(
        () => new Promise<Response>((done) => (release = done)),
      );
      const staticLocation = (): [string, (next: string) => void] => [path, () => undefined];
      await act(async () => {
        root.render(
          <Router hook={staticLocation} searchHook={() => ""} ssrPath={path}>
            <Route path={path}>
              <Page />
            </Route>
          </Router>,
        );
      });
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(text()).toContain("Checking your private Care records…");
      expect(text()).toContain("Nothing is claimed about your records");
      await act(async () => {
        release(json({ ok: false }, 500));
      });
      await settle();
    },
  );
});

describe("Care patient surfaces, a missing record is not an empty list", () => {
  const missing = [
    ["instructions", CARE_INSTRUCTIONS_PATH, CareInstructionsPage, "instructions", "care_patient_instructions"],
    ["supplies", CARE_SUPPLIES_PATH, CareSuppliesPage, "shipments", "care_supply_shipments"],
    ["messages", CARE_MESSAGES_PATH, CareMessagesPage, "threads", "care_message_threads"],
    ["support", CARE_SUPPORT_PATH, CareSupportPage, "requests", "care_support_requests"],
  ] as const;

  it.each(missing)(
    "names the absent record on %s rather than reporting none",
    async (_label, path, Page, key, table) => {
      careApiFetchMock.mockResolvedValue(
        json({
          ok: true,
          storage: { available: false, missingTables: [table] },
          [key]: [],
          sendAvailable: false,
          submissionAvailable: false,
        }),
      );
      await render(path, Page);
      expect(text()).toContain("RECORD NOT AVAILABLE");
      expect(text()).toContain(table);
      expect(text()).toContain("This does not mean you have none.");
    },
  );

  it.each(missing)(
    "treats a storage state it cannot read on %s as unknown, not available",
    async (_label, path, Page, key) => {
      careApiFetchMock.mockResolvedValue(
        json({ ok: true, [key]: [], sendAvailable: true, submissionAvailable: true }),
      );
      await render(path, Page);
      expect(text()).toContain("RECORD NOT AVAILABLE");
    },
  );
});

describe("Care instructions", () => {
  const ok = (instructions: unknown[], awaitingPublication = 0) =>
    json({
      ok: true,
      storage: { available: true, missingTables: [] },
      instructions,
      awaitingPublication,
    });

  it("says nothing has been published when the list is empty", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_INSTRUCTIONS_PATH, CareInstructionsPage);
    expect(text()).toContain("No instruction has been published for you.");
    expect(text()).toContain("this page never invents one");
  });

  it("shows a published instruction and never its text", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.instructionId,
          title: "Synthetic sample instruction",
          category: "self_monitoring",
          version: "2026.07",
          publishedAt: "2026-07-30T12:00:00.000Z",
          acknowledgedAt: null,
          bodyAvailable: true,
        },
      ]),
    );
    await render(CARE_INSTRUCTIONS_PATH, CareInstructionsPage);
    expect(text()).toContain("Synthetic sample instruction");
    expect(text()).toContain("SELF MONITORING");
    expect(text()).toContain("It is not displayed on this page.");
    expect(text()).toContain("Not recorded");
  });

  it("refuses to render an item that lost its publication stamp", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.instructionId,
          title: "UNPUBLISHED_SYNTHETIC_DRAFT",
          category: "safety",
          version: "2026.07",
          publishedAt: null,
          acknowledgedAt: null,
          bodyAvailable: true,
        },
      ]),
    );
    await render(CARE_INSTRUCTIONS_PATH, CareInstructionsPage);
    expect(text()).not.toContain("UNPUBLISHED_SYNTHETIC_DRAFT");
    expect(text()).toContain("could not read completely");
  });

  it("reports unpublished drafts as a count and never as guidance", async () => {
    careApiFetchMock.mockResolvedValue(ok([], 2));
    await render(CARE_INSTRUCTIONS_PATH, CareInstructionsPage);
    expect(text()).toContain("2 instructions are written but not published");
    expect(text()).toContain("nobody has stood behind yet");
  });

  it("falls back rather than projecting a category it does not know", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.instructionId,
          title: "Synthetic sample instruction",
          category: "SYNTHETIC_UNKNOWN_CATEGORY",
          version: "2026.07",
          publishedAt: "2026-07-30T12:00:00.000Z",
          acknowledgedAt: null,
          bodyAvailable: false,
        },
      ]),
    );
    await render(CARE_INSTRUCTIONS_PATH, CareInstructionsPage);
    expect(text()).not.toContain("SYNTHETIC_UNKNOWN_CATEGORY");
    expect(text()).toContain("NOT CATEGORIZED");
  });

  it("exposes no write path at all", () => {
    expect(instructionsSource).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(instructionsSource).not.toMatch(/<(form|input|textarea|select)\b/i);
    expect(instructionsSource).toContain('data-care-read-only="true"');
  });
});

describe("Care supplies", () => {
  const ok = (shipments: unknown[]) =>
    json({ ok: true, storage: { available: true, missingTables: [] }, shipments });

  it("says nothing has been sent when the list is empty", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_SUPPLIES_PATH, CareSuppliesPage);
    expect(text()).toContain("No supply shipment is recorded for you.");
  });

  it("never reports movement ahead of the recorded status", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.shipmentId,
          status: "requested",
          itemCount: 1,
          carrierName: "SYNTHETIC_CARRIER",
          trackingAvailable: true,
          shippedAt: "2099-01-01T00:00:00.000Z",
          deliveredAt: "2099-01-02T00:00:00.000Z",
          updatedAt: "2026-07-30T12:00:00.000Z",
        },
      ]),
    );
    await render(CARE_SUPPLIES_PATH, CareSuppliesPage);
    expect(text()).toContain("REQUESTED");
    expect(text()).toContain("nothing has left anywhere");
    expect(text()).not.toContain("2099-01-01");
    expect(text()).not.toContain("2099-01-02");
  });

  it("never shows or invents a tracking number", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.shipmentId,
          status: "shipped",
          itemCount: 2,
          carrierName: null,
          trackingAvailable: false,
          shippedAt: "2026-07-30T12:00:00.000Z",
          deliveredAt: null,
          updatedAt: "2026-07-30T12:00:00.000Z",
        },
      ]),
    );
    await render(CARE_SUPPLIES_PATH, CareSuppliesPage);
    expect(text()).toContain("No tracking number is recorded.");
    expect(text()).toContain("It is not recorded as delivered.");
    expect(suppliesSource).not.toMatch(/tracking(Number|Id|Code)/i);
  });

  it("reports a status it does not recognize instead of guessing progress", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.shipmentId,
          status: "SYNTHETIC_UNKNOWN_STATUS",
          itemCount: 0,
          carrierName: null,
          trackingAvailable: false,
          shippedAt: null,
          deliveredAt: null,
          updatedAt: null,
        },
      ]),
    );
    await render(CARE_SUPPLIES_PATH, CareSuppliesPage);
    expect(text()).toContain("STATUS NOT RECOGNIZED");
    expect(text()).not.toContain("SYNTHETIC_UNKNOWN_STATUS");
    expect(text()).toContain("nothing is claimed about where it is");
  });

  it("exposes no write path at all", () => {
    expect(suppliesSource).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(suppliesSource).not.toMatch(/<(form|input|textarea|select)\b/i);
    expect(suppliesSource).toContain('data-care-read-only="true"');
  });
});

describe("Care messages, nothing is transmitted", () => {
  const ok = (threads: unknown[], sendAvailable = true) =>
    json({
      ok: true,
      storage: { available: true, missingTables: [] },
      threads,
      sendAvailable,
      transmission: "not_enabled",
      notice: "server supplied notice",
    });

  it("says plainly that nothing is sent and nobody is told", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    const rendered = text();
    expect(rendered).toContain("NOTHING IS SENT");
    expect(rendered).toContain("Nothing written here is sent anywhere");
    expect(rendered).toContain("nobody has been told it exists");
    expect(rendered).toContain("Nobody is watching this page.");
  });

  it("labels the control truthfully and never as sending", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    const submit = container.querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe("Record this message");
    expect(text()).toContain("It does not send it, and nobody is notified.");
    for (const claim of [
      "will receive",
      "has received",
      "we will respond",
      "we will get back",
      "looking into it",
      "Send message",
      "Message sent",
    ]) {
      expect(text()).not.toContain(claim);
    }
  });

  it("never says a clinician has read or will answer an assigned thread", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.threadId,
          subject: "Synthetic sample conversation",
          status: "awaiting_clinician",
          messageCount: 1,
          clinicianAssigned: true,
          lastMessageAt: "2026-07-30T12:00:00.000Z",
          lastMessageFrom: "patient",
        },
      ]),
    );
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    expect(text()).toContain("RECORDED AS WAITING ON A CLINICIAN");
    expect(text()).toContain("it does not mean anyone has read it");
    expect(text()).toContain("no reply has been promised");
    expect(text()).toContain("Message text is not displayed on this page.");
  });

  it("reports an unassigned thread as unassigned", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.threadId,
          subject: "Synthetic sample conversation",
          status: "open",
          messageCount: 1,
          clinicianAssigned: false,
          lastMessageAt: null,
          lastMessageFrom: null,
        },
      ]),
    );
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    expect(text()).toContain("Nobody is assigned to this conversation.");
    expect(text()).toContain("Nobody has been told it exists.");
  });

  it("never accepts a typed conversation identifier", () => {
    expect(messagesSource).toContain("<select");
    expect(messagesSource).not.toMatch(/name="threadId"[^>]*type="text"/);
    expect(messagesSource).toContain(
      "You can only add to a conversation that is already yours.",
    );
  });

  it("disables the control, with the reason, when nothing can hold a message", async () => {
    careApiFetchMock.mockResolvedValue(
      json({
        ok: true,
        storage: { available: false, missingTables: ["care_messages"] },
        threads: [],
        sendAvailable: false,
      }),
    );
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(text()).toContain("nothing here can hold a Care message yet");
    expect(text()).toContain(
      "Writing one now would be telling you it was kept when it was not.",
    );
  });

  it("confirms a write as recorded, never as sent", async () => {
    careApiFetchMock.mockImplementation(async (_path, init) =>
      init?.method === "POST"
        ? json({ ok: true, message: { id: "synthetic-message-1" } }, 201)
        : ok([]),
    );
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    const body = container.querySelector("textarea") as HTMLTextAreaElement;
    setValue(body, "Synthetic sample message.");
    await settle();
    await click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
    expect(text()).toContain("RECORDED, NOT SENT");
    expect(text()).toContain("It was not sent to anybody");
    expect(text()).toContain("no reply has been promised");
    const post = careApiFetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe(CARE_ROUTE_CONTRACTS.messages);
    const payload = JSON.parse(String(post?.[1]?.body));
    expect(payload.threadId).toBeNull();
    expect(payload.body).toBe("Synthetic sample message.");
    expect(String(payload.idempotencyKey).length).toBeGreaterThanOrEqual(8);
  });

  it("never claims a record when the server did not return one", async () => {
    careApiFetchMock.mockImplementation(async (_path, init) =>
      init?.method === "POST" ? json({ ok: true }, 201) : ok([]),
    );
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Synthetic sample.");
    await settle();
    await click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
    expect(text()).toContain("NOT RECORDED");
    expect(text()).toContain("nobody will see it");
    expect(text()).not.toContain("RECORDED, NOT SENT");
  });

  it("carries the server's refusal when a thread is not the patient's own", async () => {
    careApiFetchMock.mockImplementation(async (_path, init) =>
      init?.method === "POST"
        ? json(
            {
              ok: false,
              code: "care_message_thread_not_owned",
              message:
                "This message was not recorded and nobody will see it. It named a conversation that is not yours.",
            },
            403,
          )
        : ok([]),
    );
    await render(CARE_MESSAGES_PATH, CareMessagesPage);
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Synthetic sample.");
    await settle();
    await click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
    expect(text()).toContain("It named a conversation that is not yours.");
  });
});

describe("Care support", () => {
  const ok = (requests: unknown[], submissionAvailable = true) =>
    json({
      ok: true,
      storage: { available: true, missingTables: [] },
      requests,
      submissionAvailable,
      transmission: "not_enabled",
      scopeNotice: "server supplied notice",
    });

  it("states that support is not a clinical channel before the form", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_SUPPORT_PATH, CareSupportPage);
    expect(text()).toContain("It is not a clinical channel, nobody clinical reads it");
    expect(text()).toContain("NOTHING IS SENT");
    expect(text()).toContain("This site is not emergency care.");
  });

  it("labels the control truthfully", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_SUPPORT_PATH, CareSupportPage);
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe(
      "Record this request",
    );
    for (const claim of ["we will get back", "looking into it", "we will respond"]) {
      expect(text()).not.toContain(claim);
    }
  });

  it("reports an untaken request as untaken rather than softening it", async () => {
    careApiFetchMock.mockResolvedValue(
      ok([
        {
          id: SYNTHETIC.requestId,
          topic: "billing",
          status: "received",
          assigned: false,
          recordedAt: "2026-07-30T12:00:00.000Z",
          resolvedAt: "2099-01-01T00:00:00.000Z",
        },
      ]),
    );
    await render(CARE_SUPPORT_PATH, CareSupportPage);
    expect(text()).toContain("Nobody has taken this request yet");
    expect(text()).not.toContain("2099-01-01");
    expect(text()).toContain("Request text is not displayed on this page.");
  });

  it("offers no clinical topic", async () => {
    careApiFetchMock.mockResolvedValue(ok([]));
    await render(CARE_SUPPORT_PATH, CareSupportPage);
    const options = Array.from(container.querySelectorAll("option")).map(
      (option) => option.value,
    );
    expect(options).toEqual(["account", "billing", "scheduling", "technical", "other"]);
    expect(text()).toContain("A medical question does not belong here.");
  });

  it("confirms a write as recorded and as taken by nobody", async () => {
    careApiFetchMock.mockImplementation(async (_path, init) =>
      init?.method === "POST"
        ? json({ ok: true, request: { id: "synthetic-request-1" } }, 201)
        : ok([]),
    );
    await render(CARE_SUPPORT_PATH, CareSupportPage);
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Synthetic sample.");
    await settle();
    await click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
    expect(text()).toContain("RECORDED, NOT SENT");
    expect(text()).toContain("nobody has taken it yet");
    const post = careApiFetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(String(post?.[1]?.body));
    expect(payload.topic).toBe("account");
    expect(Object.keys(payload).sort()).toEqual(["body", "idempotencyKey", "topic"]);
  });

  it("names the record that cannot hold a refused request", async () => {
    careApiFetchMock.mockImplementation(async (_path, init) =>
      init?.method === "POST"
        ? json(
            {
              ok: false,
              code: "care_support_request_not_recorded",
              missingTables: ["care_support_requests"],
              message: "This request was not recorded and nobody will see it.",
            },
            503,
          )
        : ok([]),
    );
    await render(CARE_SUPPORT_PATH, CareSupportPage);
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Synthetic sample.");
    await settle();
    await click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
    expect(text()).toContain("NOT RECORDED");
    expect(text()).toContain("care_support_requests");
  });
});

describe("Care patient surfaces, routing and accessibility", () => {
  it.each(SURFACES)(
    "reaches %s from the Care sub-router without touching the application router",
    async (_label, path) => {
      careApiFetchMock.mockResolvedValue(json({ ok: false, code: "care_auth_required" }, 401));
      await render(path, CareSection);
      expect(text()).toContain("Sign in is required.");
      expect(text()).not.toContain("FOUNDATION IN PROGRESS");
    },
  );

  it("declares each surface path in the Care sub-router only", () => {
    for (const constant of [
      "CARE_INSTRUCTIONS_PATH",
      "CARE_SUPPLIES_PATH",
      "CARE_MESSAGES_PATH",
      "CARE_SUPPORT_PATH",
    ]) {
      expect(sectionSource).toContain(constant);
    }
    expect(sectionSource).toContain("CarePendingShell");
  });

  it.each(SURFACES)(
    "keeps exactly one main and one h1 with an in-page focus target on %s",
    (_label, path, Page) => {
      const markup = renderToStaticMarkup(
        <Router ssrPath={path}>
          <Route path={path}>
            <Page />
          </Route>
        </Router>,
      );
      expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
      expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
      expect(markup).toContain('id="main-content"');
    },
  );

  it.each(["1440", "768", "375", "320"])(
    "reflows at the %s review target without a fixed minimum width",
    () => {
      for (const page of [instructionsSource, suppliesSource, messagesSource, supportSource]) {
        expect(page).toContain("container-x");
        expect(page).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
        expect(page).not.toContain("overflow-x-auto");
      }
      expect(statesSource).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
    },
  );

  it.each([
    ["messages", CARE_MESSAGES_PATH, CareMessagesPage],
    ["support", CARE_SUPPORT_PATH, CareSupportPage],
  ] as const)("labels and describes every control on %s", async (_label, path, Page) => {
    careApiFetchMock.mockResolvedValue(
      json({
        ok: true,
        storage: { available: true, missingTables: [] },
        threads: [],
        requests: [],
        sendAvailable: true,
        submissionAvailable: true,
      }),
    );
    await render(path, Page);
    const controls = Array.from(
      container.querySelectorAll("input, textarea, select"),
    ) as HTMLElement[];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const id = control.getAttribute("id");
      expect(id).toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
      const described = control.getAttribute("aria-describedby");
      expect(described).toBeTruthy();
      expect(container.querySelector(`#${described}`)).not.toBeNull();
    }
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    const submitHelp = submit.getAttribute("aria-describedby");
    expect(container.querySelector(`#${submitHelp}`)).not.toBeNull();
  });

  it("keeps every write refusal in an alert region", () => {
    for (const page of [messagesSource, supportSource]) {
      expect(page).toContain('role="alert"');
      expect(page).toContain("aria-live=\"polite\"");
    }
  });
});
