const chicago = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function midnightUtc(date: Date): string {
  // Start at 06:00Z, then correct once using the IANA zone's actual offset.
  const candidate = date.getTime() + 6 * 60 * 60 * 1000;
  const parts = Object.fromEntries(chicago.formatToParts(candidate).map(part => [part.type, part.value]));
  const localEpoch = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(candidate + date.getTime() - localEpoch).toISOString();
}

/** A Chicago calendar day can span 23, 24 or 25 hours. End is exclusive. */
export function chicagoDayWindow(day: string): Readonly<{ start: string; end: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("invalid_analytics_day");
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error("invalid_analytics_day");
  }
  return { start: midnightUtc(date), end: midnightUtc(new Date(date.getTime() + 86_400_000)) };
}
