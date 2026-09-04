// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS,
  FOUNDER_COMMAND_CENTER_API_PATH,
  FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS,
  FOUNDER_COMMAND_CENTER_AREA_IDS,
  founderCommandCenterResponseSchema,
  type FounderCommandCenterCard,
  type FounderCommandCenterResponse,
} from "@shared/research/founder-command-center";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  apiGet: mocks.apiGet,
}));

import { FounderCommandCenterBody } from "./FounderCommandCenter";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = "synthetic-admin-token";

function buildCard(
  index: number,
  overrides: Partial<FounderCommandCenterCard> = {},
): FounderCommandCenterCard {
  const definition = FOUNDER_COMMAND_CENTER_AREA_DEFINITIONS[index];
  return {
    area: definition.area,
    label: definition.label,
    scope: definition.scope,
    source: {
      state: "current",
      authority: "Canonical operations projection",
      observedAt: "2026-09-04T15:00:00.000Z",
    },
    primaryCount: {
      key: `${definition.area}.count`,
      label: "Items requiring attention",
      value: index,
      state: "exact",
      scope: "Current records in the owning workflow.",
    },
    breakdown: [],
    facts: [],
    oldestWaiting: {
      state: "not_applicable",
      since: null,
      actionHref: definition.workflowHref,
    },
    attention: {
      severity: "none",
      code: "none",
      reason: "No additional attention is reported by this source.",
    },
    owningWorkflow: {
      label: definition.workflowLabel,
      href: definition.workflowHref,
    },
    directAction: {
      label: definition.actionLabel,
      href: definition.workflowHref,
    },
    ...overrides,
  } as FounderCommandCenterCard;
}

function buildResponse(): FounderCommandCenterResponse {
  return {
    ok: true,
    readOnly: true,
    generatedAt: "2026-09-04T15:01:00.000Z",
    cards: FOUNDER_COMMAND_CENTER_AREA_IDS.map((_area, index) =>
      buildCard(index),
    ),
  };
}

let host: HTMLDivElement;
let root: Root | null;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderBody() {
  await act(async () => {
    root = createRoot(host);
    root.render(<FounderCommandCenterBody token={TOKEN} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await flush();
}

function commandCards(): HTMLElement[] {
  return Array.from(
    host.querySelectorAll<HTMLElement>(
      'article[data-testid^="command-center-card-"]',
    ),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = null;
  mocks.apiGet.mockReset();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  host.remove();
});

describe("Founder command center aggregate", () => {
  it("performs one authorized GET and renders all 13 fixed areas in canonical order", async () => {
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: buildResponse() });
    await renderBody();

    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
    expect(mocks.apiGet).toHaveBeenCalledWith(
      FOUNDER_COMMAND_CENTER_API_PATH,
      TOKEN,
    );
    expect(commandCards()).toHaveLength(13);
    expect(
      commandCards().map((card) =>
        card.getAttribute("data-testid")?.replace("command-center-card-", ""),
      ),
    ).toEqual([...FOUNDER_COMMAND_CENTER_AREA_IDS]);
    expect(host.textContent).toContain("Read only");
    expect(host.textContent).toContain("Generated");
    expect(host.innerHTML).not.toContain(TOKEN);
  });

  it("distinguishes exact, bounded, and unavailable counts without inventing zero", async () => {
    const response = buildResponse();
    response.cards[0] = buildCard(0, {
      primaryCount: {
        key: "test.exact_zero",
        label: "Exact zero",
        value: 0,
        state: "exact",
        scope: "Exact current records.",
      },
    });
    response.cards[1] = buildCard(1, {
      primaryCount: {
        key: "test.bounded_two",
        label: "Bounded count",
        value: 2,
        state: "bounded",
        scope: "Bounded current records.",
      },
    });
    response.cards[2] = buildCard(2, {
      primaryCount: {
        key: "test.unavailable_count",
        label: "Unavailable count",
        value: null,
        state: "unavailable",
        scope: "Source does not publish this count.",
      },
      breakdown: [
        {
          key: "test.unavailable_breakdown",
          label: "Unavailable breakdown",
          value: null,
          state: "unavailable",
          scope: "No bounded breakdown is published.",
        },
      ],
    });
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: response });
    await renderBody();

    expect(commandCards()[0]?.textContent).toMatch(/Applications[\s\S]*0[\s\S]*Exact/);
    expect(commandCards()[1]?.textContent).toMatch(/Care requests[\s\S]*2[\s\S]*Bounded/);
    const unavailable = commandCards()[2];
    expect(unavailable?.textContent).toContain("Assisted orders");
    expect(unavailable?.textContent).toContain("Unavailable");
    expect(unavailable?.textContent).not.toMatch(/\b0\b/);
  });

  it("shows every source state, oldest-waiting state, attention severity, fact state, and safe workflow links", async () => {
    const response = buildResponse();
    const sourceStates = [
      "current",
      "partial",
      "feature_gated",
      "unavailable",
    ] as const;
    const attention = ["none", "info", "warning", "critical", "unknown"] as const;
    sourceStates.forEach((state, index) => {
      response.cards[index] = buildCard(index, {
        source: {
          state,
          authority: "Canonical operations projection",
          observedAt: state === "unavailable" ? null : "2026-09-04T15:00:00.000Z",
        },
      });
    });
    attention.forEach((severity, index) => {
      response.cards[index] = {
        ...response.cards[index],
        attention: {
          severity,
          code: `attention_${severity}`,
          reason: `Attention state is ${severity}.`,
        },
      };
    });
    response.cards[0] = {
      ...response.cards[0],
      oldestWaiting: {
        state: "available",
        since: "2026-09-03T14:00:00.000Z",
        actionHref: response.cards[0].directAction.href,
      },
      facts: [
        { key: "test.current_fact", label: "Current fact", value: "Enabled", state: "current" },
        { key: "test.verified_fact", label: "Verified fact", value: "Verified", state: "last_verified" },
        { key: "test.missing_fact", label: "Missing fact", value: null, state: "unavailable" },
      ],
    };
    response.cards[1] = {
      ...response.cards[1],
      oldestWaiting: {
        state: "unavailable",
        since: null,
        actionHref: response.cards[1].directAction.href,
      },
    };
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: response });
    await renderBody();

    expect(commandCards()[0]?.textContent).toContain("Current");
    expect(commandCards()[1]?.textContent).toContain("Partial");
    expect(commandCards()[2]?.textContent).toContain("Feature gated");
    expect(commandCards()[3]?.textContent).toContain("Unavailable");
    expect(commandCards()[0]?.textContent).toContain("Additional verified fact 1");
    expect(commandCards()[0]?.textContent).toContain("Additional verified fact 2");
    expect(commandCards()[0]?.textContent).toContain("Additional verified fact 3");
    expect(commandCards()[0]?.textContent).toContain("Last verified");
    expect(commandCards()[0]?.textContent).toContain("No attention");
    expect(commandCards()[1]?.textContent).toContain("Information");
    expect(commandCards()[2]?.textContent).toContain("Attention");
    expect(commandCards()[3]?.textContent).toContain("Critical");
    expect(commandCards()[4]?.textContent).toContain("Unknown");
    expect(commandCards()[0]?.querySelector('a[href="/admin/research/applications"]')).not.toBeNull();
    expect(commandCards()[1]?.textContent).toContain("Unavailable");
    expect(commandCards()[2]?.textContent).toContain("Not applicable");
    expect(
      Array.from(host.querySelectorAll<HTMLAnchorElement>("a")).every((link) =>
        FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS.includes(
          link.getAttribute("href") as (typeof FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS)[number],
        ),
      ),
    ).toBe(true);
  });

  it("uses closed attention-code copy for bounded Care, email-provider failure, and unknown-code fallback", async () => {
    const response = buildResponse();
    response.cards[1] = buildCard(1, {
      source: {
        state: "partial",
        authority: "private Care source detail",
        observedAt: "2026-09-04T15:00:00.000Z",
      },
      primaryCount: {
        key: "care.new",
        label: "New Care requests",
        value: 2000,
        state: "bounded",
        scope: "private bounded source detail",
      },
      attention: {
        severity: "warning",
        code: "care_projection_bounded",
        reason: "owner@example.test reached a private cap",
      },
    });
    response.cards[11] = buildCard(11, {
      attention: {
        severity: "warning",
        code: "email_provider_unavailable",
        reason: "api_key=private-provider-secret",
      },
    });
    response.cards[0] = buildCard(0, {
      attention: {
        severity: "warning",
        code: "future_private_code",
        reason: "John Doe at 123 Main Street",
      },
    });
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: response });
    await renderBody();

    expect(commandCards()[1]?.textContent).toContain(
      "The Care projection reached its safety cap, so its counts are bounded and a zero is not inferred.",
    );
    expect(commandCards()[11]?.textContent).toContain(
      "The canonical email configuration resolver reports no available provider.",
    );
    expect(commandCards()[0]?.textContent).toContain(
      "The owning workflow reports items requiring an operator-owned next step.",
    );
    const html = host.innerHTML;
    expect(html).not.toContain("owner@example.test");
    expect(html).not.toContain("private-provider-secret");
    expect(html).not.toContain("future_private_code");
    expect(html).not.toContain("John Doe");
    expect(html).not.toContain("123 Main Street");
  });

  it("is navigation-only after load and exposes no mutation controls", async () => {
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: buildResponse() });
    await renderBody();

    expect(host.querySelectorAll("button, form, input, select, textarea")).toHaveLength(0);
    expect(host.querySelectorAll("a")).toHaveLength(26);
    expect(
      Array.from(host.querySelectorAll("a")).some(
        (link) => link.textContent?.trim() === "Unavailable",
      ),
    ).toBe(false);
    expect(host.textContent).not.toMatch(/approve|reject|verify payment|mark shipped/i);
    expect(host.textContent).toContain("Read-only operational aggregate");
  });

  it("never renders schema-valid person, contact, address, record, or credential text from dynamic fields", async () => {
    const response = buildResponse();
    response.cards[0] = buildCard(0, {
      source: {
        state: "current",
        authority: "John Doe, 123 Main Street",
        observedAt: "2026-09-04T15:00:00.000Z",
      },
      primaryCount: {
        key: "private.person_name",
        label: "John Doe",
        value: 1,
        state: "exact",
        scope: "Call +1 (312) 555-0199 about SSN 123-45-6789.",
      },
      attention: {
        severity: "warning",
        code: "credential_notice",
        reason: "Order 550e8400-e29b-41d4-a716-446655440000 uses Bearer: private-access-token.",
      },
      facts: [
        {
          key: "private.account_owner",
          label: "Patient account owner",
          value: "owner@example.test — John Doe",
          state: "current",
        },
      ],
    });
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: response });
    await renderBody();

    expect(commandCards()).toHaveLength(13);
    const html = host.innerHTML;
    for (const privateText of [
      "John Doe",
      "123 Main Street",
      "312",
      "555-0199",
      "123-45-6789",
      "550e8400-e29b-41d4-a716-446655440000",
      "private-access-token",
      "owner@example.test",
      "private.person_name",
      "private.account_owner",
      "Patient account owner",
    ]) {
      expect(html).not.toContain(privateText);
    }
    expect(commandCards()[0]?.textContent).toContain("Applications");
    expect(commandCards()[0]?.textContent).toContain("Additional verified fact 1");
    expect(commandCards()[0]?.textContent).toContain("Unavailable");
  });

  it("rejects noncanonical card vocabulary, cross-area links, and unsafe or blank action labels", () => {
    const mutations: Array<(response: FounderCommandCenterResponse) => void> = [
      (response) => {
        response.cards[0].label = "Applicant John Doe";
      },
      (response) => {
        response.cards[0].scope = "Account 550e8400-e29b-41d4-a716-446655440000";
      },
      (response) => {
        response.cards[0].owningWorkflow.href = "/admin/research/audit";
      },
      (response) => {
        response.cards[0].directAction.href = "/admin/research/audit";
      },
      (response) => {
        response.cards[0].oldestWaiting.actionHref = "/admin/research/audit";
      },
      (response) => {
        response.cards[0].directAction.label = "   ";
      },
      (response) => {
        response.cards[0].directAction.label = "Open owner@example.test";
      },
    ];

    expect(founderCommandCenterResponseSchema.safeParse(buildResponse()).success).toBe(true);
    for (const mutate of mutations) {
      const response = buildResponse();
      mutate(response);
      expect(founderCommandCenterResponseSchema.safeParse(response).success).toBe(false);
    }
  });

  it("rejects malformed or expanded payloads instead of rendering private fields or unsafe links", async () => {
    const malformed = buildResponse() as FounderCommandCenterResponse & {
      privateEmail?: string;
    };
    malformed.privateEmail = "private@example.test";
    malformed.cards[0] = {
      ...malformed.cards[0],
      directAction: {
        label: "Unsafe destination",
        href: "https://example.test/private" as FounderCommandCenterCard["directAction"]["href"],
      },
    };
    mocks.apiGet.mockResolvedValue({ kind: "ok", data: malformed });
    await renderBody();

    expect(commandCards()).toHaveLength(0);
    expect(host.querySelector('[data-testid="ra-error"]')).not.toBeNull();
    expect(host.textContent).toContain("invalid aggregate response");
    expect(host.innerHTML).not.toContain("private@example.test");
    expect(host.querySelector('a[href="https://example.test/private"]')).toBeNull();
  });
});

describe("Founder command center boundary states", () => {
  it("shows loading while the single aggregate request is pending", async () => {
    let resolveRequest!: (value: unknown) => void;
    mocks.apiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    await act(async () => {
      root = createRoot(host);
      root.render(<FounderCommandCenterBody token={TOKEN} />);
    });

    expect(host.querySelector('[data-testid="ra-loading"]')).not.toBeNull();
    expect(host.textContent).toContain("Loading");
    expect(commandCards()).toHaveLength(0);

    await act(async () => {
      resolveRequest({ kind: "ok", data: buildResponse() });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("shows literal Unavailable and never an empty or zero aggregate", async () => {
    mocks.apiGet.mockResolvedValue({ kind: "unavailable" });
    await renderBody();

    expect(host.querySelector('[data-testid="ra-empty"]')).not.toBeNull();
    expect(host.textContent).toContain("Unavailable");
    expect(host.textContent).toContain("No operational total is inferred");
    expect(commandCards()).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\b0\b/);
  });

  it("retries an error through the same GET and then renders the aggregate", async () => {
    mocks.apiGet
      .mockResolvedValueOnce({
        kind: "error",
        message: "owner@example.test Bearer: private-error-token",
      })
      .mockResolvedValueOnce({ kind: "ok", data: buildResponse() });
    await renderBody();

    expect(host.querySelector('[data-testid="ra-error"]')).not.toBeNull();
    expect(host.textContent).toContain("The read-only command center could not be loaded.");
    expect(host.textContent).not.toContain("owner@example.test");
    expect(host.textContent).not.toContain("private-error-token");
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();

    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
    expect(commandCards()).toHaveLength(13);
  });

  it.each([
    ["unauthorized", "Your admin session has ended."],
    ["forbidden", "Access denied."],
  ] as const)("renders %s without leaking aggregate cards", async (kind, copy) => {
    mocks.apiGet.mockResolvedValue({
      kind,
      message: "owner@example.test Bearer: private-denial-token",
    });
    await renderBody();

    expect(host.textContent).toContain(copy);
    expect(host.textContent).not.toContain("owner@example.test");
    expect(host.textContent).not.toContain("private-denial-token");
    expect(commandCards()).toHaveLength(0);
  });

  it("renders a machine-code denial without aggregate data", async () => {
    mocks.apiGet.mockResolvedValue({
      kind: "denied",
      code: "membership_inactive",
      message: "Private upstream detail",
    });
    await renderBody();

    expect(host.querySelector('[data-testid="ra-denial"]')).not.toBeNull();
    expect(commandCards()).toHaveLength(0);
    expect(host.textContent).not.toContain("Private upstream detail");
  });
});

describe("Founder command center responsive structure", () => {
  it("uses narrow-viewport-safe tracks, wrapping, and full-width primary links", () => {
    const source = readFileSync(join(HERE, "FounderCommandCenter.tsx"), "utf8");
    expect(source).toContain("repeat(auto-fit, minmax(min(100%, 300px), 1fr))");
    expect(source).toContain("minmax(min(150px, 100%), 1fr)");
    expect(source).toContain('overflowWrap: "anywhere"');
    expect(source).toContain('whiteSpace: "normal"');
    expect(source).toContain('width: emphasis ? "100%" : undefined');
    expect(source).toContain("flex-wrap");
    expect(source).not.toMatch(/minmax\(\d+px, 1fr\)/);
  });
});
