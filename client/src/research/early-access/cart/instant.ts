/**
 * Rendering a server instant without letting the browser change what it means.
 *
 * Server timestamps arrive as ISO instants. Handing one to a locale formatter
 * re-expresses it in whatever zone the machine happens to be in, so the same
 * shipment reads as two different days for a customer and an operator looking
 * at the same record, and it silently shifts twice a year at a daylight-saving
 * boundary. For a ship-by date that is the difference between "today" and
 * "yesterday, so where is it".
 *
 * So the instant is rendered in UTC, with the zone written out. It is one fixed
 * answer everywhere, it does not move with the clock change, and a customer can
 * see which zone they are reading. This is deliberately not a pretty local
 * date; it is an unambiguous one.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * `2026-08-09T14:56:07Z` becomes `9 Aug 2026, 14:56 UTC`.
 *
 * Returns null for anything that is not a usable instant, so a caller renders
 * nothing rather than "Invalid Date". A malformed timestamp is a fact the
 * customer cannot act on, and a broken one on a shipment screen reads as a
 * broken shipment.
 */
export function formatInstantUtc(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") return null;
  const at = new Date(value);
  const stamp = at.getTime();
  if (!Number.isFinite(stamp)) return null;
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${pad(
    at.getUTCHours(),
  )}:${pad(at.getUTCMinutes())} UTC`;
}
