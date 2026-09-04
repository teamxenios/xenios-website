import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS,
  FOUNDER_COMMAND_CENTER_API_PATH,
  FOUNDER_COMMAND_CENTER_AREA_IDS,
  isFounderCommandCenterResponse,
} from "@shared/research/founder-command-center";
import {
  boundedCount,
  buildFounderCommandCenterSnapshot,
  exactCount,
  registerFounderCommandCenterApi,
  type FounderCommandCenterSourceSnapshot,
  type FounderCommandCenterSources,
} from "./founder-command-center";

const NOW = new Date("2026-09-04T20:00:00.000Z");
const OLDEST = "2026-09-01T12:00:00.000Z";

function successfulSnapshot(
  area: (typeof FOUNDER_COMMAND_CENTER_AREA_IDS)[number],
  value = 1,
): FounderCommandCenterSourceSnapshot {
  return {
    source: {
      state: "current",
      authority: `Canonical ${area} test source`,
      observedAt: NOW.toISOString(),
    },
    primaryCount: exactCount(
      `${area}.attention`,
      "Needs attention",
      value,
      "Exact focused test scope.",
    ),
    breakdown: [],
    facts: [],
    oldestWaiting: value > 0
      ? { state: "available", since: OLDEST }
      : { state: "not_applicable", since: null },
    attention: value > 0
      ? {
          severity: "warning",
          code: "attention",
          reason: "A current item requires attention.",
        }
      : {
          severity: "none",
          code: "none",
          reason: "No items are in this exact test scope.",
        },
  };
}

function successfulSources(): FounderCommandCenterSources {
  return Object.fromEntries(
    FOUNDER_COMMAND_CENTER_AREA_IDS.map((area) => [
      area,
      async () => successfulSnapshot(area),
    ]),
  ) as FounderCommandCenterSources;
}

function appFor(
  sources: FounderCommandCenterSources,
  options: { authorized?: boolean; timeoutMs?: number } = {},
) {
  const app = express();
  registerFounderCommandCenterApi(app, sources, {
    timeoutMs: options.timeoutMs,
    now: () => NOW,
    requireAdmin: (_req, res, next) => {
      if (options.authorized === false) {
        res.status(401).json({ ok: false, message: "Unauthorized" });
        return;
      }
      next();
    },
  });
  return app;
}

describe("Founder Command Center read-only API", () => {
  it("returns the one strict thirteen-card contract in canonical order", async () => {
    const response = await request(appFor(successfulSources()))
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.readOnly).toBe(true);
    expect(response.body.cards.map((card: { area: string }) => card.area)).toEqual(
      FOUNDER_COMMAND_CENTER_AREA_IDS,
    );
    expect(isFounderCommandCenterResponse(response.body)).toBe(true);
    expect(
      response.body.cards.every(
        (card: { directAction: { href: string }; owningWorkflow: { href: string } }) =>
          FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS.includes(
            card.directAction.href as never,
          ) &&
          FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS.includes(
            card.owningWorkflow.href as never,
          ),
      ),
    ).toBe(true);
  });

  it("sets private headers before auth and never starts a source for a denied request", async () => {
    const source = vi.fn(async () => successfulSnapshot("applications"));
    const response = await request(
      appFor({ applications: source }, { authorized: false }),
    )
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .expect(401);

    expect(source).not.toHaveBeenCalled();
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("isolates rejected and malformed sources without fabricating a zero", async () => {
    const sources = successfulSources() as Record<string, any>;
    sources.care_requests = async () => {
      throw new Error("database detail that must not escape");
    };
    sources.assisted_orders = async () => ({
      ...successfulSnapshot("assisted_orders"),
      email: "pii-sentinel@example.invalid",
    });

    const response = await request(appFor(sources))
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .expect(200);
    const care = response.body.cards.find(
      (card: { area: string }) => card.area === "care_requests",
    );
    const assisted = response.body.cards.find(
      (card: { area: string }) => card.area === "assisted_orders",
    );

    for (const card of [care, assisted]) {
      expect(card.source.state).toBe("unavailable");
      expect(card.primaryCount).toMatchObject({
        state: "unavailable",
        value: null,
      });
    }
    expect(JSON.stringify(response.body)).not.toContain("database detail");
    expect(JSON.stringify(response.body)).not.toContain(
      "pii-sentinel@example.invalid",
    );
    expect(response.body.cards).toHaveLength(13);
  });

  it("preserves bounded semantics and accepts an exact zero only from a successful source", async () => {
    const sources = successfulSources() as Record<string, any>;
    sources.referrals = async () => ({
      ...successfulSnapshot("referrals", 0),
      source: {
        state: "partial",
        authority: "Bounded referral source",
        observedAt: NOW.toISOString(),
      },
      primaryCount: boundedCount(
        "referrals.sample",
        "Observed referrals",
        100,
        "At least this many rows were returned by a capped source.",
      ),
      attention: {
        severity: "unknown",
        code: "bounded",
        reason: "The current source supplies a lower bound only.",
      },
    });
    sources.support = async () => successfulSnapshot("support", 0);

    const snapshot = await buildFounderCommandCenterSnapshot(sources, {
      now: () => NOW,
    });
    expect(snapshot.cards.find((card) => card.area === "referrals")?.primaryCount)
      .toMatchObject({ state: "bounded", value: 100 });
    expect(snapshot.cards.find((card) => card.area === "support")?.primaryCount)
      .toMatchObject({ state: "exact", value: 0 });
  });

  it("turns a timed-out source and malformed oldest timestamp into unavailable cards", async () => {
    const sources = successfulSources() as Record<string, any>;
    sources.applications = async () => new Promise(() => undefined);
    sources.care_requests = async () => ({
      ...successfulSnapshot("care_requests"),
      oldestWaiting: { state: "available", since: "not-a-timestamp" },
    });

    const snapshot = await buildFounderCommandCenterSnapshot(sources, {
      timeoutMs: 5,
      now: () => NOW,
    });
    expect(snapshot.cards.find((card) => card.area === "applications")?.source.state)
      .toBe("unavailable");
    expect(snapshot.cards.find((card) => card.area === "care_requests")?.source.state)
      .toBe("unavailable");
  });

  it("rejects query-driven scope changes and exposes no mutation route", async () => {
    const sources = successfulSources();
    await request(appFor(sources))
      .get(`${FOUNDER_COMMAND_CENTER_API_PATH}?status=open`)
      .expect(400, {
        ok: false,
        code: "command_center_query_not_supported",
      });
    await request(appFor(sources))
      .post(FOUNDER_COMMAND_CENTER_API_PATH)
      .send({ status: "closed" })
      .expect(404);
  });
});
