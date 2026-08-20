import { describe, expect, it } from "vitest";

import { requestIp } from "./rate-limit";

/**
 * A rate limiter is only as good as the identity it counts against.
 *
 * This one used to read `x-forwarded-for` and take the leftmost entry. That
 * entry is not the client, it is whatever the client SENT: the edge appends the
 * address it observes rather than replacing the header, so a caller can prepend
 * any value they like and it lands exactly there. Every limiter keyed on it was
 * therefore bypassable by varying one header per request — including the shared
 * research password door, whose only defence this is, and account claim, which
 * consumes a one-time token and sets a new password.
 */
describe("the identity a research rate limiter counts against", () => {
  it("uses the address the proxy chain established, not a header the caller chose", () => {
    const req = {
      ip: "203.0.113.7",
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.7" },
      socket: { remoteAddress: "10.0.0.1" },
    };
    expect(requestIp(req)).toBe("203.0.113.7");
  });

  it("gives an attacker the SAME bucket however they vary the header", () => {
    // The whole point. Before this, each of these produced a different key and
    // therefore a fresh allowance.
    const attacker = "203.0.113.9";
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2", "3.3.3.3", "", "not-an-ip"].map((spoofed) =>
        requestIp({
          ip: attacker,
          headers: { "x-forwarded-for": `${spoofed}, ${attacker}` },
          socket: { remoteAddress: "10.0.0.1" },
        }),
      ),
    );
    expect(Array.from(keys)).toEqual([attacker]);
  });

  it("still separates two genuinely different callers", () => {
    const a = requestIp({ ip: "203.0.113.7", headers: {}, socket: { remoteAddress: "10.0.0.1" } });
    const b = requestIp({ ip: "203.0.113.8", headers: {}, socket: { remoteAddress: "10.0.0.1" } });
    expect(a).not.toBe(b);
  });

  it("falls back to the socket, never to the header, when Express did not derive one", () => {
    expect(
      requestIp({
        headers: { "x-forwarded-for": "198.51.100.1" },
        socket: { remoteAddress: "10.0.0.5" },
      }),
    ).toBe("10.0.0.5");
  });

  it("answers a stable placeholder rather than throwing when nothing is known", () => {
    expect(requestIp({ headers: {} })).toBe("unknown");
  });
});
