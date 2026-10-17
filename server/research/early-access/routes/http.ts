import { PRIVATE_ACCESS_PRIVATE_HEADERS } from "../private-access-routes";

/**
 * The response discipline every Early Access commerce route shares.
 *
 * The header set is IMPORTED rather than restated. Two copies of "this response
 * is private" drift, and the copy that drifts is the one nobody notices, so the
 * unlock endpoint and the order endpoint answer with the same four headers by
 * construction.
 *
 * Every handler below is a pure function of injected values over this port, so a
 * refusal can be exercised with no server, and the Express binding in
 * `register.ts` stays the only place that knows about Express at all.
 */

export type ResponsePort = {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
  json(body: unknown): unknown;
};

export function applyPrivateHeaders(response: ResponsePort): void {
  for (const [name, value] of PRIVATE_ACCESS_PRIVATE_HEADERS) {
    response.setHeader(name, value);
  }
}

export function send(response: ResponsePort, status: number, body: unknown): void {
  response.status(status);
  response.json(body);
}

export function fail(
  response: ResponsePort,
  status: number,
  code: string,
  detail?: Readonly<Record<string, unknown>>,
): void {
  send(response, status, { ok: false, code, ...(detail ?? {}) });
}

/**
 * Copy the named fields onto a fresh plain object and discard everything else.
 *
 * This is the same technique `order-service.ts` uses on its request, and it is
 * here for the same reason: a field the route does not read cannot influence the
 * outcome, so "the client cannot state its own price" is a property of the shape
 * rather than of a deny list somebody has to keep current. Values are read from
 * descriptors, so an accessor planted on the body is refused rather than invoked.
 */
export function project(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const projected: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (descriptor === undefined) continue;
      if (!("value" in descriptor) || descriptor.enumerable !== true) return null;
      projected[key] = descriptor.value;
    }
    return projected;
  } catch {
    return null;
  }
}

/** Epoch milliseconds a `Date` can actually represent, or null. */
export function readInstant(now: () => number): number | null {
  try {
    const value = now();
    return Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000 ? value : null;
  } catch {
    return null;
  }
}

/** The canonical UTC millisecond stamp the commerce domain validates against. */
export function stampOf(nowMs: number): string {
  return new Date(nowMs).toISOString();
}
