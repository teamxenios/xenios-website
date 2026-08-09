import { describe, expect, it } from "vitest";
import { formatInstantUtc } from "./instant";

/**
 * A SHIP DATE MUST READ THE SAME EVERYWHERE.
 *
 * These run in whatever zone the machine is set to, and they assert a fixed
 * string, so a formatter that quietly re-expressed the instant in local time
 * would fail here on any machine that is not already on UTC. The two
 * daylight-saving cases are the ones that would otherwise drift by an hour
 * twice a year without anyone changing a line of code.
 */

describe("server instants render in UTC, with the zone written out", () => {
  it("renders a plain instant", () => {
    expect(formatInstantUtc("2026-08-09T14:56:07.000Z")).toBe("9 Aug 2026, 14:56 UTC");
  });

  it("does not shift across a northern-hemisphere DST boundary", () => {
    // The hour before and the hour after the US spring-forward. Both are stated
    // in UTC, so both are exactly what the server recorded.
    expect(formatInstantUtc("2026-03-08T06:59:00.000Z")).toBe("8 Mar 2026, 06:59 UTC");
    expect(formatInstantUtc("2026-03-08T07:01:00.000Z")).toBe("8 Mar 2026, 07:01 UTC");
  });

  it("does not shift across a southern-hemisphere DST boundary", () => {
    expect(formatInstantUtc("2026-11-01T05:59:00.000Z")).toBe("1 Nov 2026, 05:59 UTC");
  });

  it("keeps the UTC calendar day, even when the local day differs", () => {
    // Late-evening UTC is the next day in Asia and the same day in the Americas.
    // The answer does not depend on which of those the reader is in.
    expect(formatInstantUtc("2026-12-31T23:30:00.000Z")).toBe("31 Dec 2026, 23:30 UTC");
    expect(formatInstantUtc("2027-01-01T00:30:00.000Z")).toBe("1 Jan 2027, 00:30 UTC");
  });

  it("pads hours and minutes so the column does not jump", () => {
    expect(formatInstantUtc("2026-08-09T04:05:00.000Z")).toBe("9 Aug 2026, 04:05 UTC");
  });

  it("returns null rather than 'Invalid Date' for anything unusable", () => {
    expect(formatInstantUtc(null)).toBeNull();
    expect(formatInstantUtc(undefined)).toBeNull();
    expect(formatInstantUtc("")).toBeNull();
    expect(formatInstantUtc("not a date")).toBeNull();
    expect(formatInstantUtc("2026-13-45T99:99:99Z")).toBeNull();
  });
});
