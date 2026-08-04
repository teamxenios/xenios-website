import { types as nodeTypes } from "node:util";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import { resolveEarlyAccessPaymentOptionsPresentation } from "../commerce/manual-order-payment-method-adapter";
import type {
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../commerce/manual-order-payments";
import { verifyPrivateAccessSession } from "./private-access-session";

/**
 * This module owns the pure Private Early Access read boundary. Production may
 * mount only the exported containment middleware, which deliberately supplies
 * no session or operational registry. Nothing here reads environment, cookie,
 * body, query, provider, or persistence state.
 */
export const PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH =
  "/api/research/early-access/payment-options" as const;

const ROUTE_REQUEST_KEYS = ["method", "rawPath", "sessionToken"] as const;

const SESSION_CONFIGURATION_KEYS = [
  "consumedNonces",
  "expectedNonce",
  "now",
  "sessionSecret",
] as const;

export interface PrivateEarlyAccessSessionConfiguration {
  readonly sessionSecret: string;
  readonly expectedNonce: string;
  readonly consumedNonces: readonly string[];
  /** Epoch milliseconds, injected so verification never consults ambient time. */
  readonly now: () => number;
}

export interface PrivateEarlyAccessPaymentOptionsRouteDependencies {
  readonly session: PrivateEarlyAccessSessionConfiguration | null;
  readonly methodRegistry: ManualPaymentMethodRegistryPort;
  readonly paymentClock: ManualPaymentClockPort;
}

/**
 * Explicit untrusted input supplied by a future trusted HTTP-only-cookie
 * adapter. This core never parses Cookie, Authorization, query, or body data.
 */
export interface PrivateEarlyAccessPaymentOptionsRouteRequest {
  readonly method: unknown;
  readonly rawPath: unknown;
  readonly sessionToken: unknown;
}

/** Minimal structural port implemented by an Express response. */
export interface PrivateEarlyAccessPaymentOptionsResponsePort {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
  json(body: unknown): unknown;
}

export interface PrivateEarlyAccessContainmentRequestPort {
  readonly method: unknown;
  readonly originalUrl: unknown;
}

export type PrivateEarlyAccessContainmentMiddleware = (
  request: PrivateEarlyAccessContainmentRequestPort,
  response: PrivateEarlyAccessPaymentOptionsResponsePort,
  next: () => void,
) => void;

export type PrivateEarlyAccessPaymentOptionsRoute = (
  request: unknown,
  response: PrivateEarlyAccessPaymentOptionsResponsePort,
) => void;

type CanonicalSessionConfiguration = Readonly<{
  sessionSecret: string;
  expectedNonce: string;
  consumedNonces: readonly string[];
  now: () => number;
}>;

const NOT_FOUND_BODY = Object.freeze({ ok: false, code: "not_found" as const });
const ACCESS_REQUIRED_BODY = Object.freeze({
  ok: false,
  code: "private_access_required" as const,
});
const UNAVAILABLE_BODY = Object.freeze({
  ok: false,
  code: "private_access_unavailable" as const,
});

function setPrivateHeaders(
  response: PrivateEarlyAccessPaymentOptionsResponsePort,
): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
}

function deny(
  response: PrivateEarlyAccessPaymentOptionsResponsePort,
  status: 401 | 404 | 503,
  body:
    | typeof NOT_FOUND_BODY
    | typeof ACCESS_REQUIRED_BODY
    | typeof UNAVAILABLE_BODY,
): void {
  response.status(status);
  response.json(body);
}

function readRouteRequest(
  value: unknown,
): PrivateEarlyAccessPaymentOptionsRouteRequest | null {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      nodeTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== ROUTE_REQUEST_KEYS.length ||
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          !ROUTE_REQUEST_KEYS.includes(
            key as (typeof ROUTE_REQUEST_KEYS)[number],
          ),
      )
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    for (const key of ROUTE_REQUEST_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
    }
    // Descriptor checks above prevent accessors from running; structuredClone
    // then rejects transparent and revoked Proxy objects instead of allowing a
    // trap-backed object to imitate a detached request record.
    if (typeof structuredClone !== "function") return null;
    structuredClone(value);
    return Object.freeze({
      method: descriptors.method?.value as unknown,
      rawPath: descriptors.rawPath?.value as unknown,
      sessionToken: descriptors.sessionToken?.value as unknown,
    });
  } catch {
    return null;
  }
}

function readCanonicalSessionConfiguration(
  value: unknown,
): CanonicalSessionConfiguration | null {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      nodeTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== SESSION_CONFIGURATION_KEYS.length ||
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          !SESSION_CONFIGURATION_KEYS.includes(
            key as (typeof SESSION_CONFIGURATION_KEYS)[number],
          ),
      )
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    for (const key of SESSION_CONFIGURATION_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
    }
    const sessionSecret = descriptors.sessionSecret?.value as unknown;
    const expectedNonce = descriptors.expectedNonce?.value as unknown;
    const consumedNonces = descriptors.consumedNonces?.value as unknown;
    const now = descriptors.now?.value as unknown;
    if (
      typeof sessionSecret !== "string" ||
      typeof expectedNonce !== "string" ||
      !Array.isArray(consumedNonces) ||
      nodeTypes.isProxy(consumedNonces) ||
      typeof now !== "function" ||
      nodeTypes.isProxy(now)
    ) {
      return null;
    }
    return Object.freeze({
      sessionSecret,
      expectedNonce,
      consumedNonces,
      now: now as () => number,
    });
  } catch {
    return null;
  }
}

function readSessionToken(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1_024 &&
    value.trim() === value
    ? value
    : null;
}

function readNow(session: CanonicalSessionConfiguration): number | null {
  try {
    const value = session.now();
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function dependenciesAreCallable(
  dependencies: PrivateEarlyAccessPaymentOptionsRouteDependencies,
): boolean {
  try {
    return (
      typeof dependencies === "object" &&
      dependencies !== null &&
      !nodeTypes.isProxy(dependencies) &&
      typeof dependencies.methodRegistry === "object" &&
      dependencies.methodRegistry !== null &&
      !nodeTypes.isProxy(dependencies.methodRegistry) &&
      typeof dependencies.methodRegistry.resolveEnabledMethod === "function" &&
      !nodeTypes.isProxy(dependencies.methodRegistry.resolveEnabledMethod) &&
      typeof dependencies.paymentClock === "object" &&
      dependencies.paymentClock !== null &&
      !nodeTypes.isProxy(dependencies.paymentClock) &&
      typeof dependencies.paymentClock.now === "function" &&
      !nodeTypes.isProxy(dependencies.paymentClock.now)
    );
  } catch {
    return false;
  }
}

function configurationIsValid(
  session: CanonicalSessionConfiguration,
  now: number,
): boolean {
  // The existing verifier is the single authority for secret, nonce, replay
  // snapshot, and clock bounds. A fixed malformed token must reach exactly the
  // TOKEN_INVALID result when all injected configuration is valid.
  const result = verifyPrivateAccessSession({
    consumedNonces: session.consumedNonces,
    expectedNonce: session.expectedNonce,
    now,
    sessionSecret: session.sessionSecret,
    token: "configuration-probe",
  });
  return result.ok === false && result.code === "TOKEN_INVALID";
}

function canonicalCodes(
  values: readonly EarlyAccessPaymentOptionCode[],
): readonly EarlyAccessPaymentOptionCode[] | null {
  let previousIndex = -1;
  const codes: EarlyAccessPaymentOptionCode[] = [];
  for (const value of values) {
    const index = EARLY_ACCESS_PAYMENT_OPTION_CODES.indexOf(value);
    if (index <= previousIndex) return null;
    previousIndex = index;
    codes.push(value);
  }
  return Object.freeze(codes);
}

/**
 * Construct, but do not register, the exact Private Early Access payment-option
 * read boundary. A future trusted adapter supplies the dedicated HTTP-only
 * cookie's token as the explicit `sessionToken` field. This core never parses
 * Cookie, Authorization, query, body, or a legacy Research credential.
 */
export function createPrivateEarlyAccessPaymentOptionsRoute(
  dependencies: PrivateEarlyAccessPaymentOptionsRouteDependencies,
): PrivateEarlyAccessPaymentOptionsRoute {
  return (untrustedRequest, response): void => {
    // Private headers precede path, configuration, credential, and registry
    // decisions, so every denial produced by this boundary is non-cacheable and
    // non-indexable.
    setPrivateHeaders(response);

    const request = readRouteRequest(untrustedRequest);

    if (
      request === null ||
      request.method !== "GET" ||
      request.rawPath !== PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH
    ) {
      deny(response, 404, NOT_FOUND_BODY);
      return;
    }

    const session = readCanonicalSessionConfiguration(dependencies?.session);
    const now = session === null ? null : readNow(session);
    if (
      session === null ||
      now === null ||
      !dependenciesAreCallable(dependencies) ||
      !configurationIsValid(session, now)
    ) {
      deny(response, 503, UNAVAILABLE_BODY);
      return;
    }

    const token = readSessionToken(request.sessionToken);
    if (token === null) {
      deny(response, 401, ACCESS_REQUIRED_BODY);
      return;
    }

    const verified = verifyPrivateAccessSession({
      consumedNonces: session.consumedNonces,
      expectedNonce: session.expectedNonce,
      now,
      sessionSecret: session.sessionSecret,
      token,
    });
    if (!verified.ok) {
      deny(response, 401, ACCESS_REQUIRED_BODY);
      return;
    }

    let resolution: ReturnType<
      typeof resolveEarlyAccessPaymentOptionsPresentation
    >;
    try {
      resolution = resolveEarlyAccessPaymentOptionsPresentation({
        methodRegistry: dependencies.methodRegistry,
        clock: dependencies.paymentClock,
      });
    } catch {
      deny(response, 503, UNAVAILABLE_BODY);
      return;
    }
    if (resolution.state !== "resolved") {
      deny(response, 503, UNAVAILABLE_BODY);
      return;
    }
    const codes = canonicalCodes(resolution.codes);
    if (codes === null) {
      deny(response, 503, UNAVAILABLE_BODY);
      return;
    }

    // Explicit construction keeps every protected registry field behind the
    // server boundary even if the underlying snapshot grows later.
    const body = Object.freeze({ state: "resolved" as const, codes });
    response.status(200);
    response.json(body);
  };
}

/**
 * Exact raw-path production containment. The route is deliberately mounted
 * before application body parsers, but cannot authenticate or resolve a
 * payment method: there is no session, clock, or registry integration. Exact
 * requests therefore fail closed with private headers while noncanonical
 * lookalikes continue to the unchanged Research wall.
 */
export function createPrivateEarlyAccessPaymentOptionsContainmentMiddleware(
): PrivateEarlyAccessContainmentMiddleware {
  const route = createPrivateEarlyAccessPaymentOptionsRoute({
    session: null,
    methodRegistry: Object.freeze({
      resolveEnabledMethod(): never {
        throw new Error(
          "Private Early Access payment registry is unavailable.",
        );
      },
    }),
    paymentClock: Object.freeze({
      now(): never {
        throw new Error("Private Early Access payment clock is unavailable.");
      },
    }),
  });

  return (request, response, next): void => {
    if (request.originalUrl !== PRIVATE_EARLY_ACCESS_PAYMENT_OPTIONS_PATH) {
      next();
      return;
    }

    route(
      Object.freeze({
        method: request.method,
        rawPath: request.originalUrl,
        sessionToken: null,
      }),
      response,
    );
  };
}
