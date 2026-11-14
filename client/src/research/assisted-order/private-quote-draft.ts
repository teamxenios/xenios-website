/** Only imported by the private staff view. No network, storage, mailbox or telemetry. */
export const QUOTE_MAILBOX = "team@xeniostechnology.com";
const refPattern = /^XRI-[0-9A-F]{32}$/;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const displayUsd = (cents: number) => money.format(cents / 100);

/** Never round a staff entry (e.g. 1.999) to a price a person did not enter. */
function cents(text: string): number | null {
  const m = /^(0|[1-9][0-9]{0,6})(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!m) return null;
  const value = Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
  return value > 0 ? value : null;
}

export function worksheet(rows: readonly { quantity: number; unitUsd: string }[]) {
  let totalCents = 0, priced = 0;
  const amounts: (number | null)[] = [];
  for (const { quantity, unitUsd } of rows) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
    if (!unitUsd.trim()) { amounts.push(null); continue; }
    const unit = cents(unitUsd.trim());
    if (unit === null) return null;
    const amount = unit * quantity;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(totalCents + amount)) return null;
    totalCents += amount; priced++;
    amounts.push(amount);
  }
  return { amounts, totalCents, priced, unpriced: rows.length - priced };
}

function emailKey(text: unknown): string | null {
  // Compare the whole mailbox, preserving the local part. Never accept display names,
  // comma lists, line breaks, URL query fields or alternate recipients.
  if (typeof text !== "string" || /[\s\x00-\x1f\x7f]/.test(text) || text.length > 254) return null;
  const m = /^([a-zA-Z0-9.!#$%&'*+/=^_`{|}~-]+)@([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)$/.exec(text);
  if (!m || m[1].length > 64 || m[1].startsWith(".") || m[1].endsWith(".") || m[1].includes("..")
      || m[2].split(".").some(s => s.startsWith("-") || s.endsWith("-") || s.length > 63)) return null;
  return m[1] + "@" + m[2].toLowerCase();
}
export function centralDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {timeZone:"America/Chicago", year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)?.value || "";
  return [part("year"), part("month"), part("day")].join("-");
}
function dateOnly(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === s;
}

export function usableQuoteContact(saved: {publicReference: string; email: string}): boolean {
  return typeof saved.publicReference === "string" && refPattern.test(saved.publicReference) && emailKey(saved.email) !== null;
}

export type ApprovalCopy = Readonly<{
  requestReference: string; recipient: string; quoteNumber: string;
  validThrough: string; finalUsd: string; checked: boolean;
}>;
export function makeQuoteCover(
  saved: Readonly<{publicReference: string; email: string}>,
  copy: ApprovalCopy, today = centralDate()
): {ok: false; reason: string} | {ok: true; from: string; replyTo: string; to: string; subject: string; body: string} {
  if (!usableQuoteContact(saved))
    return {ok:false, reason:"The saved request has no usable reference or single recipient. Use the staff review process."};
  if (copy.requestReference.toUpperCase() !== saved.publicReference || emailKey(copy.recipient) !== emailKey(saved.email))
    return {ok:false, reason:"The request reference and email on the issued quote must match the retrieved request."};
  if (!/^[A-Za-z0-9][A-Za-z0-9./_-]{0,63}$/.test(copy.quoteNumber))
    return {ok:false, reason:"Enter the quote number exactly as issued (up to 64 characters)."};
  if (!dateOnly(copy.validThrough) || !dateOnly(today) || copy.validThrough < today)
    return {ok:false, reason:"The issued quote must have a valid current or future expiration date."};
  const total = cents(copy.finalUsd);
  if (total === null) return {ok:false, reason:"Enter the final USD total from the issued quote, including any approved charges."};
  if (!copy.checked) return {ok:false, reason:"Confirm the issued quote and the recipient before preparing its cover."};
  return {ok:true, from:QUOTE_MAILBOX, replyTo:QUOTE_MAILBOX, to:saved.email,
    subject:"Your Xenios quote " + copy.quoteNumber,
    body:[
      "Hello,", "",
      "Attached is quote " + copy.quoteNumber + " for your Xenios request " + saved.publicReference + ".",
      "The quoted total is " + displayUsd(total) + " USD. This quote is valid through " + copy.validThrough + ".",
      "The attachment lists the items covered and the applicable terms. If you have questions, reply to this email and include your quote number.",
      "", "Team Xenios", QUOTE_MAILBOX,
    ].join("\n")};
}
