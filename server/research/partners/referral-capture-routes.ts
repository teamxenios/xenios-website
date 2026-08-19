// xenios research: the referral capture doors — the first live callers of the
// Gen 2 attribution spine.
//
// Two public GET doors, published as a transport-neutral descriptor table (the
// assisted-order http.ts idiom) so the composition root mounts them without
// this module touching server/index.ts:
//
//   GET /r/:code                          the shareable link. Always answers a
//                                         302 to the research landing page.
//   GET /api/research/referral/capture    the SPA's silent capture, ?ref=CODE.
//                                         Always answers 204.
//
// The defining behavior is that ATTRIBUTION NEVER BLOCKS THE JOURNEY. A valid
// code writes a durable touch and sets the signed attribution cookie; an
// invalid, missing, tampered, or unconfigured code changes NOTHING about the
// response except that no cookie is set and no touch is written. There is no
// error page, no oracle that confirms whether a guessed code exists beyond the
// cookie itself, and no 500 for a storage hiccup — a capture that cannot be
// recorded honestly is simply not recorded.
//
// Fail-closed rules carried from the spine:
//   - No link secret: verifyCode verifies nothing, the subject key cannot be
//     derived, so nothing is captured. The visitor still lands normally.
//   - A signature and a stored row that DISAGREE about the partner are treated
//     as tampering and captured as nothing.
//   - The visitor is identified by an opaque subject key derived from a random
//     visitor id — never an email, never a name, never a member id.

import { randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { AttributionChannel } from "@shared/research/distribution";
import type { AffiliateProgramConfig } from "@shared/research/affiliate-program/config";
import type { AttributionService } from "./attribution";
import type {
  AsyncAttributionTouchStore,
  AsyncPartnerLinkStore,
} from "../commerce/persistence/partners-store";
import {
  attributionSetCookieValue,
  mintAttributionToken,
} from "./attribution-cookie";

// ---------------------------------------------------------------------------
// Transport-neutral shapes (the assisted-order descriptor idiom)
// ---------------------------------------------------------------------------

export type ReferralCaptureHttpRequest = Readonly<{
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  query: Readonly<Record<string, string | undefined>>;
  params: Readonly<Record<string, string | undefined>>;
}>;

export type ReferralCaptureHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  /** These doors never answer a body: a redirect and a 204 are the whole surface. */
  body: null;
}>;

export type ReferralCaptureRouteHandler = (
  request: ReferralCaptureHttpRequest,
) => Promise<ReferralCaptureHttpResponse>;

export type ReferralCaptureRouteDescriptor = Readonly<{
  method: "GET";
  path: string;
  handler: ReferralCaptureRouteHandler;
}>;

export const REFERRAL_LINK_PATH = "/r/:code";
export const REFERRAL_CAPTURE_PATH = "/api/research/referral/capture";

/** Where the shareable link lands. Also the fallback for any unsafe `to`. */
export const REFERRAL_LANDING_PATH = "/research";

// ---------------------------------------------------------------------------
// Landing-path allowlist
// ---------------------------------------------------------------------------

// A same-site research path only: begins /research and is followed by nothing,
// a subpath, or a query string of plain characters. Everything else — absolute
// URLs, protocol-relative //host tricks, backslashes, header-splitting control
// characters, unrelated site paths — falls back to the landing page rather
// than becoming an open redirect.
const SAFE_LANDING = /^\/research(?:\/[A-Za-z0-9._~/-]*)?(?:\?[A-Za-z0-9._~&=%-]*)?$/;

export function safeLandingPath(to: string | undefined): string {
  if (!to) return REFERRAL_LANDING_PATH;
  if (to.length > 512) return REFERRAL_LANDING_PATH;
  if (to.includes("//") || to.includes("\\")) return REFERRAL_LANDING_PATH;
  if (!SAFE_LANDING.test(to)) return REFERRAL_LANDING_PATH;
  return to;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type ReferralCaptureDeps = Readonly<{
  /** RESEARCH_PARTNER_LINK_SECRET at the composition root. Null captures nothing. */
  linkSecret: string | null;
  /** The Gen 2 spine's own verification and subject-key derivation. */
  attribution: Pick<AttributionService, "verifyCode" | "deriveSubjectKey">;
  /** The durable link store, for plain (stored) code lookup. */
  links: Pick<AsyncPartnerLinkStore, "findLinkByCode">;
  /** The durable APPEND-ONLY touch store. The touch write is the capture. */
  touches: Pick<AsyncAttributionTouchStore, "appendTouch">;
  /** Cookie lifetime comes from the program config, never a constant here. */
  program: AffiliateProgramConfig;
  clock?: () => Date;
  /** Injected so a test can pin the visitor id. Must stay opaque and random. */
  newVisitorId?: () => string;
}>;

const MAX_CODE_LENGTH = 512;

export function createReferralCaptureRouteTable(
  deps: ReferralCaptureDeps,
): readonly ReferralCaptureRouteDescriptor[] {
  const clock = deps.clock ?? (() => new Date());
  const newVisitorId =
    deps.newVisitorId ?? (() => randomBytes(16).toString("base64url"));

  /**
   * Attempt the capture. Returns the Set-Cookie value on success, null on any
   * miss. Every failure path is a silent null: the callers' responses must be
   * indistinguishable apart from the cookie, so a code cannot be enumerated
   * through status codes or timing-visible errors we control.
   */
  async function capture(code: string | undefined, now: Date): Promise<string | null> {
    // No secret, no capture: an unverifiable code and an unmintable cookie.
    if (!deps.linkSecret || deps.linkSecret.length === 0) return null;
    if (!code || code.length === 0 || code.length > MAX_CODE_LENGTH) return null;

    const verified = deps.attribution.verifyCode(code);
    let stored = null;
    try {
      stored = await deps.links.findLinkByCode(code);
    } catch {
      // A store that cannot answer captures nothing; the journey continues.
      return null;
    }
    if (!verified && !stored) return null;
    // A signature naming one partner over a stored row naming another is
    // tampering, not ambiguity. Nothing is captured for either partner.
    if (verified && stored && verified.partnerId !== stored.partnerId) return null;

    const partnerId = verified?.partnerId ?? stored!.partnerId;
    // The stored row knows how the link was issued; a verified-but-unstored
    // code can only have arrived as a signed link.
    const channel: AttributionChannel = stored?.channel ?? "signed_link";

    const subjectKey = deps.attribution.deriveSubjectKey(newVisitorId());
    try {
      await deps.touches.appendTouch(subjectKey, {
        partnerId,
        channel,
        occurredAt: now.toISOString(),
      });
    } catch {
      // The durable touch IS the capture. If it cannot be written, no cookie
      // is minted either: a cookie without its touch would claim an
      // attribution the ledger never recorded.
      return null;
    }

    const expiresAt = new Date(
      now.getTime() + deps.program.attributionCookieTtlDays * 24 * 60 * 60 * 1000,
    );
    const token = mintAttributionToken(deps.linkSecret, {
      partnerId,
      code,
      subjectKey,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return attributionSetCookieValue(token, expiresAt, now);
  }

  const routes: ReferralCaptureRouteDescriptor[] = [
    {
      method: "GET",
      path: REFERRAL_LINK_PATH,
      handler: async (request) => {
        const now = clock();
        const cookie = await capture(request.params.code, now);
        return Object.freeze({
          status: 302,
          headers: Object.freeze({
            location: safeLandingPath(request.query.to),
            "cache-control": "no-store",
            ...(cookie ? { "set-cookie": cookie } : {}),
          }),
          body: null,
        });
      },
    },
    {
      method: "GET",
      path: REFERRAL_CAPTURE_PATH,
      handler: async (request) => {
        const now = clock();
        const cookie = await capture(request.query.ref, now);
        // 204 for hit and miss alike; only the cookie differs.
        return Object.freeze({
          status: 204,
          headers: Object.freeze({
            "cache-control": "no-store",
            ...(cookie ? { "set-cookie": cookie } : {}),
          }),
          body: null,
        });
      },
    },
  ];
  return Object.freeze(routes);
}

// ---------------------------------------------------------------------------
// Express adapter
// ---------------------------------------------------------------------------

/** One descriptor handler as one Express handler. Headers and status only. */
export function referralCaptureExpressHandler(
  descriptor: ReferralCaptureRouteDescriptor,
): RequestHandler {
  return (req: Request, res: Response) => {
    const request: ReferralCaptureHttpRequest = {
      method: req.method,
      path: descriptor.path,
      headers: req.headers as Readonly<Record<string, string | undefined>>,
      query: req.query as Readonly<Record<string, string | undefined>>,
      params: req.params as Readonly<Record<string, string | undefined>>,
    };
    void descriptor
      .handler(request)
      .then((response) => {
        for (const [name, value] of Object.entries(response.headers)) {
          res.setHeader(name, value);
        }
        res.status(response.status).end();
      })
      .catch(() => {
        // Even a thrown capture must not break the journey: land the visitor
        // exactly as a miss would, with no cookie and no error page.
        res.setHeader("cache-control", "no-store");
        if (descriptor.path === REFERRAL_LINK_PATH) {
          res.setHeader("location", REFERRAL_LANDING_PATH);
          res.status(302).end();
        } else {
          res.status(204).end();
        }
      });
  };
}
