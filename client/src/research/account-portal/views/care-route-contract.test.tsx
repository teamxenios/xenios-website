// @vitest-environment jsdom
// The route-to-view contract test P1-6 demanded: the ACTUAL server envelope
// from GET /api/research/customer-account/care — produced by the real route
// table over the memory ports — is fed, unmodified, into the ACTUAL view the
// Care page renders. This is the binding the original defect slipped through:
// the server sent CareEnrollmentDto, the loader declared CareStatusDto, the
// view read flat properties, and every real enrollment rendered "not
// enrolled". If the wire shape and the view's reading paths ever diverge
// again, this test fails instead of the customer's Care page.

import { act } from "react";
import { createRoot } from "react-dom/client";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  CUSTOMER_ACCOUNT_PATHS,
  registerCustomerAccountApi,
} from "../../../../../server/research/customer-account/routes";
import {
  createMemoryCustomerAccountPorts,
  defaultMemorySeeds,
} from "../../../../../server/research/customer-account/memory-adapters";
import { AccountCareView } from "./CareView";

function buildServer() {
  const app = express();
  registerCustomerAccountApi(app, createMemoryCustomerAccountPorts(defaultMemorySeeds()), {
    requireMember: (req, res, next) => {
      const key = req.header("x-test-member");
      if (!key) {
        res.status(401).json({ kind: "denied", reason: "member_required" });
        return;
      }
      (req as { researchMember?: { id: string } }).researchMember = { id: key };
      next();
    },
    requireActiveMember: (_req, res) => {
      res.status(403).json({ ok: false, code: "membership_inactive" });
    },
  });
  return app;
}

async function renderWith(data: unknown): Promise<HTMLElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () =>
    root.render(<AccountCareView data={data as Parameters<typeof AccountCareView>[0]["data"]} />),
  );
  return container;
}

describe("Care route-to-view contract (real envelope, real view)", () => {
  it("an ENROLLED member's wire payload renders the staged timeline, not 'not started'", async () => {
    const res = await request(buildServer())
      .get(CUSTOMER_ACCOUNT_PATHS.care)
      .set("x-test-member", "member-fixture-1"); // seeded enrolled at provider_review
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("ok");
    // The wire truth this contract pins: discriminated source, nested status,
    // top-level enrolled (P1-D).
    expect(res.body.data.sourceState).toBe("available");
    expect(res.body.data.enrolled).toBe(true);
    expect(res.body.data.status.stage).toBe("provider_review");

    const container = await renderWith(res.body.data);
    expect(container.textContent).toContain("Provider review");
    expect(container.querySelectorAll(".care-status-step")).toHaveLength(10);
    expect(container.textContent).not.toContain("Care not started");
    expect(container.textContent).not.toContain("Care status unavailable");
  });

  it("a NOT-enrolled member's wire payload renders the truthful not-started state", async () => {
    const res = await request(buildServer())
      .get(CUSTOMER_ACCOUNT_PATHS.care)
      .set("x-test-member", "member-fixture-2"); // seeded with no Care relationship
    expect(res.status).toBe(200);
    // A CONNECTED source reporting no enrollment is a knowable fact — only
    // then may "not started" render.
    expect(res.body.data.sourceState).toBe("available");
    expect(res.body.data.enrolled).toBe(false);

    const container = await renderWith(res.body.data);
    expect(container.textContent).toContain("Care not started");
    expect(container.querySelector(".care-status-timeline")).toBeNull();
  });

  it("an UNAVAILABLE Care source renders no enrollment claim, only unavailability", async () => {
    const container = await renderWith({ sourceState: "unavailable" });
    expect(container.textContent).toContain("Care status unavailable");
    expect(container.textContent).not.toContain("Care not started");
    expect(container.textContent).not.toContain("Not enrolled");
    expect(container.querySelector(".care-status-timeline")).toBeNull();
  });
});
