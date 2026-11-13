/** Server only. Counts, origin receipt and reviewer receipt must never be sent to a browser. */
export type ReviewedRankingSort = "best_sellers" | "most_requested_research_peptides";
export type RankingRow = Readonly<{ sourceSelection?: Readonly<{ family: string; variantId: string }> }>;
export type ReviewedRankingSnapshot = Readonly<{
  schema: 1;
  metric: "paid_fulfilled_net_distinct_orders" | "distinct_submitted_requests";
  windowStart: string; windowEnd: string; approvedAt: string;
  sourceReceipt: string; reviewReceipt: string;
  rows: readonly Readonly<{ variantId: string; count: number }>[];
}>;

const DAY = 86400000;
const idPattern = /^mov_[a-f0-9]{20}$/;
const recordPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{0,127}$/;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function shape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => own(value,key));
}
function iso(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}
/** Validate once per snapshot outside the page loop. Absent, stale or malformed data never enables a sort.
 * An approved upstream owner must attest the actual metric, complete window and receipts; shape alone is not evidence.
 */
export function readReviewedRanking(raw: unknown, sort: ReviewedRankingSort, now: number):
  ReadonlyMap<string, number> | null {
  const metric = sort === "best_sellers" ? "paid_fulfilled_net_distinct_orders"
    : sort === "most_requested_research_peptides" ? "distinct_submitted_requests" : null;
  if (!metric || !Number.isFinite(now) || !shape(raw, ["schema","metric","windowStart","windowEnd","approvedAt","sourceReceipt","reviewReceipt","rows"])
    || raw.schema !== 1 || raw.metric !== metric || !Array.isArray(raw.rows) || raw.rows.length < 2 || raw.rows.length > 10000) return null;
  for (const key of ["sourceReceipt","reviewReceipt"]) {
    const value = raw[key]; if (typeof value !== "string" || value.includes("\n") || !recordPattern.test(value)) return null;
  }
  if (raw.sourceReceipt === raw.reviewReceipt) return null;
  const start = iso(raw.windowStart), end = iso(raw.windowEnd), approved = iso(raw.approvedAt);
  if (![start,end,approved].every(Number.isFinite) || end-start !== 30*DAY
    || end>now || now-end>7*DAY || approved<end || approved>now) return null;
  const scores=new Map<string,number>();
  for (const row of raw.rows) {
    if (!shape(row, ["variantId","count"]) || typeof row.variantId!=="string" || row.variantId.length!==24
      || !idPattern.test(row.variantId) || typeof row.count!=="number" || !Number.isSafeInteger(row.count)
      || row.count<0 || scores.has(row.variantId)) return null;
    scores.set(row.variantId,row.count);
  }
  return scores;
}
/** Return null if there is no useful reviewed ranking among THESE already-authorized rows.
 * Never adds an item. Unranked rows keep the supplied deterministic fallback order.
 * This is a SORT (no hidden filtering): unrelated/nonpeptide rows may follow the ranked research peptides.
 */
export function rankVisibleOfferings<T extends RankingRow>(items: readonly T[], scores: ReadonlyMap<string,number>|null,
  sort: ReviewedRankingSort, compareFallback: (a:T,b:T)=>number): readonly T[]|null {
  if (!scores) return null;
  const score = (item:T) => {
    const src=item.sourceSelection;
    if (!src || (sort==="most_requested_research_peptides" && src.family!=="research_peptides_materials")) return 0;
    const n=scores.get(src.variantId)??0;
    return n >= 5 ? n : 0; // Suppress low activity as a launch policy; no individual requester events leave the source.
  };
  const usable=items.map(score).filter(x=>x>0);
  if (usable.length<2 || new Set(usable).size<2) return null;
  return [...items].sort((a,b)=>score(b)-score(a) || compareFallback(a,b));
}
