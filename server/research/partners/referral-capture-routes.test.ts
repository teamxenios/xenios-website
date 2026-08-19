import { describe, expect, it } from "vitest";
import type { AttributionTouch } from "@shared/research/distribution";
import { DEFAULT_LAUNCH_PROGRAM } from "@shared/research/affiliate-program/config";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
  type AttributionService,
} from "./attribution";
import {
  ATTRIBUTION_COOKIE_NAME,
  verifyAttributionToken,
} from "./attribution-cookie";
import {
  createInMemoryAttributionTouchStore,
  createInMemoryPartnerLinkStore,
  type AsyncAttributionTouchStore,
  type AsyncPartnerLinkStore,
} from "../commerce/persistence/partners-store";
import {
  REFERRAL_CAPTURE_PATH,
  REFERRAL_LINK_PATH,
  createReferralCaptureRouteTable,
  safeLandingPath,
  type ReferralCaptureHttpRequest,
  type ReferralCaptureRouteDescriptor,
} from "./referral-capture-routes";

const SECRET = "referral-capture-test-secret";
const NOW = new Date("2026-08-19T12:00:00.000Z");
const VISITOR_ID = "visitor-0001";

function buildAttribution(secret: string | null = SECRET): AttributionService {
  return createAttributionService({
    repository: createInMemoryAttributionRepository(),
    linkSecret: secret,
    linkBaseUrl: "https://xeniostechnology.com",
    generateNonce: () => "nonce-1",
  });
}

function harness(overrides: {
  linkSecret?: string | null;
  touches?: AsyncAttributionTouchStore;
  links?: AsyncPartnerLinkStore;
} = {}) {
  const attribution = buildAttribution();
  const links = overrides.links ?? createInMemoryPartnerLinkStore();
  const touchRows: Array<{ subjectKey: string; touch: AttributionTouch }> = [];
  const touchStore = overrides.touches ?? createInMemoryAttributionTouchStore();
  const recordingTouches: AsyncAttributionTouchStore = {
    async appendTouch(subjectKey, touch) {
      await touchStore.appendTouch(subjectKey, touch);
      touchRows.push({ subjectKey, touch });
    },
    touchesFor: (subjectKey) => touchStore.touchesFor(subjectKey),
  };
  const routes = createReferralCaptureRouteTable({
    linkSecret: overrides.linkSecret !== undefined ? overrides.linkSecret : SECRET,
    attribution,
    links,
    touches: recordingTouches,
    program: DEFAULT_LAUNCH_PROGRAM,
    clock: () => NOW,
    newVisitorId: () => VISITOR_ID,
  });
  const route = (path: string): ReferralCaptureRouteDescriptor => {
    const found = routes.find((candidate) => candidate.path === path);
    if (!found) throw new Error(`descriptor missing: ${path}`);
    return found;
  };
  return { attribution, links, routes, route, touchRows };
}

function request(
  overrides: Partial<{
    query: Record<string, string | undefined>;
    params: Record<string, string | undefined>;
  }> = {},
): ReferralCaptureHttpRequest {
  return {
    method: "GET",
    path: "/",
    headers: {},
    query: overrides.query ?? {},
    params: overrides.params ?? {},
  };
}

function cookieOf(response: { headers: Readonly<Record<string, string>> }): string | null {
  return response.headers["set-cookie"] ?? null;
}

function tokenOf(cookie: string): string {
  const first = cookie.split(";")[0];
  expect(first.startsWith(`${ATTRIBUTION_COOKIE_NAME}=`)).toBe(true);
  return first.slice(ATTRIBUTION_COOKIE_NAME.length + 1);
}

describe("route table", () => {
  it("publishes exactly the two capture doors, GET only", () => {
    const { routes } = harness();
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${REFERRAL_LINK_PATH}`,
      `GET ${REFERRAL_CAPTURE_PATH}`,
    ]);
  });
});

describe("GET /r/:code", () => {
  it("captures a signed issued code: durable touch, signed cookie, 302 to /research", async () => {
    const h = harness();
    const link = h.attribution.issueLink("partner-1", "signed_link", null, NOW);
    await h.links.saveLink({
      code: link.code,
      partnerId: "partner-1",
      channel: "signed_link",
      campaign: null,
      issuedAt: NOW.toISOString(),
    });

    const response = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code: link.code } }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/research");
    expect(response.headers["cache-control"]).toBe("no-store");

    // The durable touch is the capture, written under an opaque subject key.
    expect(h.touchRows).toHaveLength(1);
    const written = h.touchRows[0];
    expect(written.touch).toEqual({
      partnerId: "partner-1",
      channel: "signed_link",
      occurredAt: NOW.toISOString(),
    });
    expect(written.subjectKey).toBe(h.attribution.deriveSubjectKey(VISITOR_ID));
    expect(written.subjectKey).not.toContain("@");
    expect(written.subjectKey).not.toBe(VISITOR_ID);

    // The cookie is a verifiable token naming the same partner and subject.
    const cookie = cookieOf(response);
    expect(cookie).not.toBeNull();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    const claims = verifyAttributionToken(SECRET, tokenOf(cookie!), NOW);
    expect(claims).not.toBeNull();
    expect(claims!.partnerId).toBe("partner-1");
    expect(claims!.code).toBe(link.code);
    expect(claims!.subjectKey).toBe(written.subjectKey);
    // Expiry comes from the program config, not a constant in the routes.
    expect(new Date(claims!.expiresAt).getTime()).toBe(
      NOW.getTime() +
        DEFAULT_LAUNCH_PROGRAM.attributionCookieTtlDays * 24 * 60 * 60 * 1000,
    );
  });

  it("captures a plain stored (unsigned) code under its stored channel", async () => {
    const h = harness();
    await h.links.saveLink({
      code: "SPRING24",
      partnerId: "partner-2",
      channel: "campaign",
      campaign: "spring",
      issuedAt: NOW.toISOString(),
    });

    const response = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code: "SPRING24" } }),
    );
    expect(response.status).toBe(302);
    expect(cookieOf(response)).not.toBeNull();
    expect(h.touchRows).toHaveLength(1);
    expect(h.touchRows[0].touch.partnerId).toBe("partner-2");
    expect(h.touchRows[0].touch.channel).toBe("campaign");
  });

  it("continues the journey with no cookie and no touch for an invalid code", async () => {
    const h = harness();
    const response = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code: "no-such-code" } }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/research");
    expect(cookieOf(response)).toBeNull();
    expect(h.touchRows).toHaveLength(0);
  });

  it("continues the journey for a missing code", async () => {
    const h = harness();
    const response = await h.route(REFERRAL_LINK_PATH).handler(request());
    expect(response.status).toBe(302);
    expect(cookieOf(response)).toBeNull();
    expect(h.touchRows).toHaveLength(0);
  });

  it("fails closed with no secret: valid-shaped codes capture nothing", async () => {
    const signedElsewhere = buildAttribution().signCode("partner-1", "nonce-1");
    const h = harness({ linkSecret: null });
    const response = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code: signedElsewhere } }),
    );
    expect(response.status).toBe(302);
    expect(cookieOf(response)).toBeNull();
    expect(h.touchRows).toHaveLength(0);
  });

  it("treats a signature/store partner disagreement as tampering and captures nothing", async () => {
    const h = harness();
    const code = h.attribution.signCode("partner-1", "nonce-1");
    // A stored row that names a DIFFERENT partner for the same code. The
    // store's unique-code rule makes this unreachable normally; if it ever
    // happens it is tampering, and neither partner is credited.
    await h.links.saveLink({
      code,
      partnerId: "partner-9",
      channel: "signed_link",
      campaign: null,
      issuedAt: NOW.toISOString(),
    });
    const response = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code } }),
    );
    expect(cookieOf(response)).toBeNull();
    expect(h.touchRows).toHaveLength(0);
  });

  it("mints no cookie when the durable touch write fails", async () => {
    const failing: AsyncAttributionTouchStore = {
      async appendTouch() {
        throw new Error("db down");
      },
      async touchesFor() {
        return [];
      },
    };
    const h = harness({ touches: failing });
    const code = h.attribution.signCode("partner-1", "nonce-1");
    const response = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code } }),
    );
    expect(response.status).toBe(302);
    expect(cookieOf(response)).toBeNull();
  });

  it("carries an allowlisted landing path and falls back on anything unsafe", async () => {
    const h = harness();
    const carried = await h.route(REFERRAL_LINK_PATH).handler(
      request({ params: { code: "x" }, query: { to: "/research/early-access" } }),
    );
    expect(carried.headers.location).toBe("/research/early-access");

    for (const evil of [
      "https://evil.example/",
      "//evil.example",
      "/admin",
      "/researcher-fake",
      "\\research",
      "/research/\r\nSet-Cookie:x=y",
    ]) {
      const response = await h.route(REFERRAL_LINK_PATH).handler(
        request({ params: { code: "x" }, query: { to: evil } }),
      );
      expect(response.headers.location).toBe("/research");
    }
  });
});

describe("GET /api/research/referral/capture", () => {
  it("answers 204 with the cookie for a valid ref", async () => {
    const h = harness();
    const code = h.attribution.signCode("partner-1", "nonce-1");
    const response = await h.route(REFERRAL_CAPTURE_PATH).handler(
      request({ query: { ref: code } }),
    );
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(cookieOf(response)).not.toBeNull();
    expect(h.touchRows).toHaveLength(1);
  });

  it("answers the same 204 with no cookie for an invalid or missing ref", async () => {
    const h = harness();
    const invalid = await h.route(REFERRAL_CAPTURE_PATH).handler(
      request({ query: { ref: "junk" } }),
    );
    expect(invalid.status).toBe(204);
    expect(cookieOf(invalid)).toBeNull();

    const missing = await h.route(REFERRAL_CAPTURE_PATH).handler(request());
    expect(missing.status).toBe(204);
    expect(cookieOf(missing)).toBeNull();
    expect(h.touchRows).toHaveLength(0);
  });

  it("rejects an oversized ref without touching the stores", async () => {
    const h = harness();
    const response = await h.route(REFERRAL_CAPTURE_PATH).handler(
      request({ query: { ref: "x".repeat(513) } }),
    );
    expect(response.status).toBe(204);
    expect(cookieOf(response)).toBeNull();
    expect(h.touchRows).toHaveLength(0);
  });
});

describe("safeLandingPath", () => {
  it("admits only same-site research paths", () => {
    expect(safeLandingPath(undefined)).toBe("/research");
    expect(safeLandingPath("/research")).toBe("/research");
    expect(safeLandingPath("/research/early-access?tab=orders")).toBe(
      "/research/early-access?tab=orders",
    );
    expect(safeLandingPath("/research//nested")).toBe("/research");
    expect(safeLandingPath("http://evil")).toBe("/research");
    expect(safeLandingPath("/other")).toBe("/research");
    expect(safeLandingPath(`/research/${"a".repeat(600)}`)).toBe("/research");
  });
});
