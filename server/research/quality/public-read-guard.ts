import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request, RequestHandler, Response } from "express";

export const PUBLIC_QUALITY_RATE_WINDOW_SECONDS = 60;
export const PUBLIC_QUALITY_RATE_MAX_HITS = 30;
export const PUBLIC_QUALITY_RATE_RETENTION_SECONDS = 120;
export const PUBLIC_QUALITY_HMAC_ROTATION_SECONDS = 24 * 60 * 60;
export const PUBLIC_QUALITY_HMAC_KEY_MAX_LIFETIME_SECONDS =
  PUBLIC_QUALITY_HMAC_ROTATION_SECONDS;
export const PUBLIC_QUALITY_AUTHORITY_TIMEOUT_MS = 1_000;
export const PUBLIC_QUALITY_MAX_FORWARDED_HOPS = 8;

export interface PublicQualityHmacKey {
  version: string;
  secret: Uint8Array;
  activeFromMs: number;
  expiresAtMs: number;
}

export type PublicQualityTimeResolution =
  | { kind: "available"; nowMs: number }
  | { kind: "unavailable" };

export type PublicQualityHmacKeyResolution =
  | {
    kind: "available";
    key: PublicQualityHmacKey;
    previousKey: PublicQualityHmacKey | null;
    nextKey: PublicQualityHmacKey | null;
  }
  | { kind: "unavailable" };

export interface PublicQualityDurableRateInput {
  keys: readonly [string, ...string[]];
  windowSeconds: number;
  maxHits: number;
  retentionSeconds: number;
}

/**
 * The durable implementation owns its atomic clock/window calculation and
 * expiry. It must apply one hit atomically across every supplied rotation
 * alias and deny when any alias is over limit. A decision is usable only when
 * it also confirms bounded cleanup.
 */
export type PublicQualityDurableRateDecision =
  | { kind: "allowed" | "denied"; cleanup: "confirmed" }
  | { kind: "unavailable" };

export interface PublicQualityReadGuardDependencies {
  resolveNow(signal: AbortSignal): Promise<PublicQualityTimeResolution>;
  resolveActiveHmacKey(
    nowMs: number,
    signal: AbortSignal,
  ): Promise<PublicQualityHmacKeyResolution>;
  durableHit(
    input: PublicQualityDurableRateInput,
    signal: AbortSignal,
  ): Promise<PublicQualityDurableRateDecision>;
  isTrustedProxyAddress(address: string): boolean;
  /** Per-authority deadline; the guard performs sequential bounded authority calls. */
  authorityTimeoutMs?: number;
}

type TrustedAddressRequest = Pick<Request, "headers" | "socket">;
type BoundedResult<T> =
  | { kind: "value"; value: T }
  | { kind: "unavailable" };

function responseHeaders(response: Response): void {
  response.set("Cache-Control", "private, no-store, max-age=0");
  response.set("Pragma", "no-cache");
  response.set("Referrer-Policy", "no-referrer");
  response.set("X-Content-Type-Options", "nosniff");
  response.set("X-Robots-Tag", "noindex, nofollow");
}

function unavailable(response: Response): Response {
  responseHeaders(response);
  return response.status(503).json({
    kind: "unavailable",
    code: "public_quality_guard_unavailable",
    message: "Public lot verification is temporarily unavailable.",
  });
}

function mappedIpv4FromCanonicalIpv6(address: string): string | null {
  if (!address.startsWith("::ffff:")) return null;
  const suffix = address.slice(7);
  if (isIP(suffix) === 4) return suffix;
  const pieces = suffix.split(":");
  if (pieces.length !== 2) return null;
  const high = Number.parseInt(pieces[0], 16);
  const low = Number.parseInt(pieces[1], 16);
  if (
    !Number.isInteger(high)
    || !Number.isInteger(low)
    || high < 0
    || high > 0xffff
    || low < 0
    || low > 0xffff
  ) return null;
  return [
    high >>> 8,
    high & 0xff,
    low >>> 8,
    low & 0xff,
  ].join(".");
}

export function normalizePublicQualityClientAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let candidate = value.trim().toLowerCase();
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }
  if (candidate.includes("%")) return null;
  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family !== 6) return null;

  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    const canonical = hostname.slice(1, -1).toLowerCase();
    return mappedIpv4FromCanonicalIpv6(canonical) ?? canonical;
  } catch {
    return null;
  }
}

function forwardedChain(request: TrustedAddressRequest): string[] | null {
  const raw = request.headers["x-forwarded-for"];
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 512) return null;
  const values = raw.split(",");
  if (values.length < 1 || values.length > PUBLIC_QUALITY_MAX_FORWARDED_HOPS) return null;
  const normalized = values.map(normalizePublicQualityClientAddress);
  return normalized.every((value): value is string => value !== null) ? normalized : null;
}

/**
 * Direct peers cannot influence the token with forwarding headers. A forwarding
 * chain is considered only when the socket peer is trusted by the required
 * composition-owned authority; the walk stops at the nearest untrusted hop.
 * Caller-controlled entries farther left never become the client identity.
 */
export function trustedPublicQualityClientAddress(
  request: TrustedAddressRequest,
  isTrustedProxyAddress: (address: string) => boolean,
): string | null {
  const peer = normalizePublicQualityClientAddress(request.socket.remoteAddress);
  if (peer === null) return null;
  if (!isTrustedProxyAddress(peer)) return peer;

  const chain = forwardedChain(request);
  if (chain === null) return null;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index];
    if (!isTrustedProxyAddress(candidate)) return candidate;
  }
  return null;
}

export function publicQualityHmacKeyVersion(activeFromMs: number): string {
  return `r1-${activeFromMs.toString(36)}`;
}

function validEpochKey(
  key: PublicQualityHmacKey,
  activeFromMs: number,
  expiresAtMs: number,
): boolean {
  return key.version === publicQualityHmacKeyVersion(activeFromMs)
    && key.secret instanceof Uint8Array
    && key.secret.byteLength >= 32
    && Number.isSafeInteger(key.activeFromMs)
    && Number.isSafeInteger(key.expiresAtMs)
    && key.activeFromMs === activeFromMs
    && key.expiresAtMs === expiresAtMs;
}

function reusesSecretMaterial(
  first: PublicQualityHmacKey,
  second: PublicQualityHmacKey,
): boolean {
  return first.secret.byteLength === second.secret.byteLength
    && timingSafeEqual(first.secret, second.secret);
}

function activeKeys(
  resolution: PublicQualityHmacKeyResolution,
  nowMs: number,
): readonly [PublicQualityHmacKey, ...PublicQualityHmacKey[]] | null {
  if (resolution.kind !== "available") return null;
  const rotationMs = PUBLIC_QUALITY_HMAC_ROTATION_SECONDS * 1000;
  const epochStartMs = Math.floor(nowMs / rotationMs) * rotationMs;
  const epochEndMs = epochStartMs + rotationMs;
  const key = resolution.key;
  if (
    !validEpochKey(key, epochStartMs, epochEndMs)
    || nowMs < key.activeFromMs
    || nowMs >= key.expiresAtMs
  ) return null;

  const overlapMs = PUBLIC_QUALITY_RATE_RETENTION_SECONDS * 1000;
  if (nowMs - epochStartMs < overlapMs) {
    const previousKey = resolution.previousKey;
    const previousStartMs = epochStartMs - rotationMs;
    if (
      previousKey === null
      || !validEpochKey(previousKey, previousStartMs, epochStartMs)
      || reusesSecretMaterial(previousKey, key)
    ) return null;
    return [key, previousKey];
  }
  if (epochEndMs - nowMs <= overlapMs) {
    const nextKey = resolution.nextKey;
    if (
      nextKey === null
      || !validEpochKey(nextKey, epochEndMs, epochEndMs + rotationMs)
      || reusesSecretMaterial(key, nextKey)
    ) return null;
    return [key, nextKey];
  }
  return [key];
}

export function publicQualityRateLimitKey(
  address: string,
  key: PublicQualityHmacKey,
): string {
  const canonicalAddress = normalizePublicQualityClientAddress(address);
  if (canonicalAddress === null) throw new Error("invalid public quality client address");
  const token = createHmac("sha256", key.secret)
    .update("xenios-public-quality-rate-v1\0", "utf8")
    .update(key.version, "utf8")
    .update("\0", "utf8")
    .update(canonicalAddress, "utf8")
    .digest("hex");
  return `research:public-quality:${key.version}:${token}`;
}

async function runBounded<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<BoundedResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve()
    .then(() => operation(controller.signal))
    .then(
      (value): BoundedResult<T> => ({ kind: "value", value }),
      (): BoundedResult<T> => ({ kind: "unavailable" }),
    );
  const timeout = new Promise<BoundedResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "unavailable" });
    }, timeoutMs);
  });
  const result = await Promise.race([work, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (result.kind === "unavailable") controller.abort();
  return result;
}

/**
 * No in-memory or best-effort fallback exists. Missing trusted-peer, clock,
 * HMAC-key, durable-rate, deadline, or cleanup evidence fails closed.
 */
export function buildPublicQualityReadGuard(
  dependencies: PublicQualityReadGuardDependencies,
): RequestHandler {
  if (!dependencies || typeof dependencies !== "object") {
    throw new Error("buildPublicQualityReadGuard: dependencies are required");
  }
  if (typeof dependencies.resolveNow !== "function") {
    throw new Error("buildPublicQualityReadGuard: an authoritative clock is required");
  }
  if (typeof dependencies.resolveActiveHmacKey !== "function") {
    throw new Error("buildPublicQualityReadGuard: an active HMAC key source is required");
  }
  if (typeof dependencies.durableHit !== "function") {
    throw new Error("buildPublicQualityReadGuard: a durable rate authority is required");
  }
  if (typeof dependencies.isTrustedProxyAddress !== "function") {
    throw new Error("buildPublicQualityReadGuard: a trusted proxy authority is required");
  }
  const timeoutMs = dependencies.authorityTimeoutMs ?? PUBLIC_QUALITY_AUTHORITY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("buildPublicQualityReadGuard: authorityTimeoutMs must be between 1 and 10000");
  }

  return async (request, response, next) => {
    try {
      const time = await runBounded(timeoutMs, dependencies.resolveNow);
      if (
        time.kind !== "value"
        || time.value.kind !== "available"
        || !Number.isSafeInteger(time.value.nowMs)
        || time.value.nowMs < 0
      ) return unavailable(response);
      const nowMs = time.value.nowMs;

      const address = trustedPublicQualityClientAddress(
        request,
        dependencies.isTrustedProxyAddress,
      );
      if (address === null) return unavailable(response);

      const keyResolution = await runBounded(
        timeoutMs,
        (signal) => dependencies.resolveActiveHmacKey(nowMs, signal),
      );
      if (keyResolution.kind !== "value") return unavailable(response);

      const freshTime = await runBounded(timeoutMs, dependencies.resolveNow);
      if (
        freshTime.kind !== "value"
        || freshTime.value.kind !== "available"
        || !Number.isSafeInteger(freshTime.value.nowMs)
        || freshTime.value.nowMs < nowMs
      ) return unavailable(response);
      const keys = activeKeys(
        keyResolution.value,
        freshTime.value.nowMs,
      );
      if (keys === null) return unavailable(response);
      const [firstKey, ...remainingKeys] = keys;
      const rateKeys: [string, ...string[]] = [
        publicQualityRateLimitKey(address, firstKey),
        ...remainingKeys.map((key) => publicQualityRateLimitKey(address, key)),
      ];

      const decision = await runBounded(
        timeoutMs,
        (signal) => dependencies.durableHit({
          keys: rateKeys,
          windowSeconds: PUBLIC_QUALITY_RATE_WINDOW_SECONDS,
          maxHits: PUBLIC_QUALITY_RATE_MAX_HITS,
          retentionSeconds: PUBLIC_QUALITY_RATE_RETENTION_SECONDS,
        }, signal),
      );
      if (
        decision.kind !== "value"
        || decision.value.kind === "unavailable"
        || decision.value.cleanup !== "confirmed"
      ) return unavailable(response);
      if (decision.value.kind === "allowed") return next();
      if (decision.value.kind !== "denied") return unavailable(response);

      responseHeaders(response);
      return response.status(429).json({
        kind: "rate_limited",
        code: "public_quality_rate_limited",
        message: "Public lot verification is temporarily busy. Try again shortly.",
      });
    } catch {
      return unavailable(response);
    }
  };
}
