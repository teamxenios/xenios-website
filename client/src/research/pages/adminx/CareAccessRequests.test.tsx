// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CareManualAccessAdminListResponse,
  CareManualAccessAdminRecord,
} from "@shared/care/manual-access-admin";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  updateStatus: vi.fn(),
  unsubscribeAuth: vi.fn(),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: vi.fn(async () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: mocks.unsubscribeAuth } },
      }),
    },
  })),
}));

vi.mock("../../adapters/careAdmin", () => ({
  listCareAccessRequests: mocks.list,
  updateCareAccessRequestStatus: mocks.updateStatus,
}));

import { CareAccessRequestsBody } from "./CareAccessRequests";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = "e30.eyJzdWIiOiJhZG1pbiJ9.signature";

function record(
  overrides: Partial<CareManualAccessAdminRecord> = {},
): CareManualAccessAdminRecord {
  return {
    id: "2a99c6f7-1111-4222-8333-abcdefabcdef",
    reference: "CARE-2A99C6F7",
    fullName: "Seth Grant",
    email: "se.grant@icloud.com",
    phone: "9704153774",
    locationState: "CO",
    locationStateLabel: "Colorado",
    careGoal: "new_care_request",
    careGoalLabel: "I want to start a new Care request",
    contactMethod: "phone",
    contactMethodLabel: "Phone call",
    contactWindow: "morning",
    contactWindowLabel: "Morning",
    status: "New",
    emailStatus: "sent",
    createdAt: "2026-09-03T04:28:51.480Z",
    dataQuality: "valid",
    attentionRequired: true,
    attentionReasons: ["new_request"],
    ...overrides,
  };
}

function listResponse(
  requests: CareManualAccessAdminRecord[],
): CareManualAccessAdminListResponse {
  return {
    ok: true,
    requests,
    summary: {
      total: requests.length,
      newCount: requests.filter((r) => r.status === "New").length,
      notificationFailureCount: requests.filter((r) => r.emailStatus === "failed").length,
      notificationUnknownCount: requests.filter(
        (r) => r.emailStatus !== "sent" && r.emailStatus !== "failed",
      ).length,
      dataQualityIssueCount: requests.filter((r) => r.dataQuality === "malformed").length,
      attentionRequiredCount: requests.filter((r) => r.attentionRequired).length,
    },
  };
}

let host: HTMLDivElement;
let root: Root | null;

async function renderPage() {
  await act(async () => {
    root = createRoot(host);
    root.render(<CareAccessRequestsBody token={TOKEN} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = null;
  mocks.list.mockReset();
  mocks.updateStatus.mockReset();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  host.remove();
});

describe("Care access requests admin page", () => {
  it("renders the durable Care request exactly as projected, with contact actions and no raw storage fields", async () => {
    mocks.list.mockResolvedValue({ kind: "ok", data: listResponse([record()]) });
    await renderPage();

    const html = host.innerHTML;
    expect(html).toContain("CARE-2A99C6F7");
    expect(html).toContain("Seth Grant");
    expect(html).toContain("Colorado");
    expect(html).toContain("I want to start a new Care request");
    expect(html).toContain("Phone call");
    expect(html).toContain("Morning");
    expect(host.querySelector('a[href="mailto:se.grant@icloud.com"]')).not.toBeNull();
    expect(host.querySelector('a[href="tel:9704153774"]')).not.toBeNull();
    const select = host.querySelector<HTMLSelectElement>(
      '[data-testid="care-status-CARE-2A99C6F7"]',
    );
    expect(select).not.toBeNull();
    expect(select?.value).toBe("New");
    expect(html).not.toMatch(/why_interested|referrer_url|utm_|203\.0\.113/i);
    // The request cards carry routing data only; clinical vocabulary appears
    // solely in the standing secure notice, never in a projected record.
    const cards = Array.from(host.querySelectorAll("article.card")).map((card) => card.innerHTML).join("");
    expect(cards).not.toMatch(/symptom|diagnos|medication|allerg|prescription/i);
    expect(html).toContain("Move clinical intake into the authorized secure Care");
  });

  it("keeps malformed and notification-failed requests visible and flagged", async () => {
    mocks.list.mockResolvedValue({
      kind: "ok",
      data: listResponse([
        record(),
        record({
          id: "bbbbbbbb-1111-4222-8333-abcdefabcdef",
          reference: "CARE-BBBBBBBB",
          fullName: "Second Requester",
          email: "second@example.test",
          emailStatus: "failed",
          dataQuality: "malformed",
          attentionReasons: ["new_request", "notification_failed", "malformed_operational_payload"],
        }),
      ]),
    });
    await renderPage();

    const html = host.innerHTML;
    expect(html).toContain("CARE-BBBBBBBB");
    expect(html).toContain("Notification failure");
    expect(html).toContain("Data needs review");
    expect(html).toContain("Queue integrity warning");
    expect(host.querySelectorAll("article.card")).toHaveLength(2);
  });

  it("filters by search without dropping the queue and shows the empty state honestly", async () => {
    mocks.list.mockResolvedValue({
      kind: "ok",
      data: listResponse([
        record(),
        record({ id: "cccccccc-1111-4222-8333-abcdefabcdef", reference: "CARE-CCCCCCCC", fullName: "Other Person", email: "other@example.test", locationState: "TX", locationStateLabel: "Texas" }),
      ]),
    });
    await renderPage();
    const search = host.querySelector<HTMLInputElement>("#care-request-search");
    expect(search).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(search, "2A99C6F7");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(host.querySelectorAll("article.card")).toHaveLength(1);
    expect(host.innerHTML).toContain("CARE-2A99C6F7");
    expect(host.innerHTML).not.toContain("CARE-CCCCCCCC");
  });

  it("renders the empty state when no Care request exists", async () => {
    mocks.list.mockResolvedValue({ kind: "ok", data: listResponse([]) });
    await renderPage();
    expect(host.innerHTML).toContain("No Care requests yet.");
    expect(host.innerHTML).toContain("even if email delivery fails");
  });

  it("updates an operational status through the admin adapter and reloads the queue", async () => {
    mocks.list.mockResolvedValue({ kind: "ok", data: listResponse([record()]) });
    mocks.updateStatus.mockResolvedValue({ kind: "ok", data: { ok: true, request: record({ status: "Contacted" }) } });
    await renderPage();
    const select = host.querySelector<HTMLSelectElement>(
      '[data-testid="care-status-CARE-2A99C6F7"]',
    );
    expect(select).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(select, "Contacted");
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      TOKEN,
      "2a99c6f7-1111-4222-8333-abcdefabcdef",
      "Contacted",
    );
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("never sends a clinical status because the select only offers the approved operational vocabulary", async () => {
    mocks.list.mockResolvedValue({ kind: "ok", data: listResponse([record()]) });
    await renderPage();
    const options = Array.from(
      host.querySelectorAll<HTMLOptionElement>('[data-testid="care-status-CARE-2A99C6F7"] option'),
    ).map((option) => option.value);
    expect(options).toEqual([
      "New",
      "Contacted",
      "Secure intake sent",
      "Provider handoff",
      "Closed",
      "Not moving forward",
    ]);
    expect(options.join(" ")).not.toMatch(/approved for treatment|prescribed|diagnosed|eligible/i);
  });

  it("shows an honest unavailable state that does not tell the customer to resubmit", async () => {
    mocks.list.mockResolvedValue({ kind: "unavailable" });
    await renderPage();
    expect(host.innerHTML).toContain("The Care request queue is not reachable.");
    expect(host.innerHTML).toContain("may still be durably saved");
    expect(host.innerHTML).not.toContain("resubmit your request");
    expect(host.querySelectorAll("article.card")).toHaveLength(0);
  });

  it("renders no queue data when the session is unauthorized", async () => {
    mocks.list.mockResolvedValue({ kind: "unauthorized" });
    await renderPage();
    expect(host.querySelectorAll("article.card")).toHaveLength(0);
    expect(host.innerHTML).not.toContain("CARE-2A99C6F7");
  });
});

describe("Care access requests responsive layout", () => {
  it("uses fluid grid tracks and wrap-safe contact text so narrow viewports never overflow", () => {
    const source = readFileSync(join(HERE, "CareAccessRequests.tsx"), "utf8");
    expect(source).toContain("minmax(min(210px, 100%), 1fr)");
    expect(source).toContain("minmax(min(190px, 100%), 1fr)");
    expect(source).toContain("minmax(min(220px, 100%), 1fr)");
    expect(source).toContain('overflowWrap: "anywhere"');
    expect(source).not.toMatch(/minmax\(\d+px, 1fr\)/);
    expect(source).toContain("flex-wrap");
  });
});
