import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute } from "node:path";
import { readReviewedRanking, rankVisibleOfferings, type ReviewedRankingSort } from "./reviewed-rankings";
import type { RequestIntentCatalogItem } from "../../../../shared/research/assisted-order/request-intent";

export type RankingSource = () => Promise<unknown>;
const MAX = 1024 * 1024;
/** An optional operator-owned, read-only artifact. No URL or filename comes from an HTTP request.
 * Writers must publish by atomic rename; a missing, unavailable, partial or invalid document disables rankings.
 */
export const readCatalogRankingSource: RankingSource = async () => {
  const path = process.env.EARLY_ACCESS_PRIVATE_RANKINGS_FILE;
  if (!path || !isAbsolute(path)) return null;
  let fd;
  try {
    fd = await open(path,constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const s = await fd.stat();
    if (!s.isFile() || s.size <= 0 || s.size > MAX) return null;
    const data = Buffer.alloc(s.size + 1);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await fd.read(data,offset,data.length-offset,offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== s.size) return null;
    return JSON.parse(data.subarray(0,offset).toString("utf8"));
  } catch { return null; } finally { await fd?.close().catch(()=>{}); }
};
const isRecord = (v: unknown): v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);
const allowedKeys=(v: Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
function reviewedPeptides(raw:unknown):Set<string>|null {
  if(!isRecord(raw)||!allowedKeys(raw,["receipt","variantIds"])||typeof raw.receipt!=="string"
    ||!/^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{0,127}$/.test(raw.receipt)||!Array.isArray(raw.variantIds)
    ||raw.variantIds.length<2||raw.variantIds.length>10000)return null;
  const ids=new Set<string>();
  for(const id of raw.variantIds){if(typeof id!=="string"||!/^mov_[a-f0-9]{20}$/.test(id)||ids.has(id))return null;ids.add(id);}
  return ids;
}
/** Resolve only approved metrics among the filtered, authorized visible rows, never across hidden inventory. */
export function candidateRankOrders(raw:unknown, items:readonly RequestIntentCatalogItem[], now:number,
  fallback:(a:RequestIntentCatalogItem,b:RequestIntentCatalogItem)=>number) {
  const out=new Map<ReviewedRankingSort, readonly RequestIntentCatalogItem[]>();
  if(!isRecord(raw)||raw.schema!==1||!allowedKeys(raw,["schema","sales","requests","researchPeptides"]))return out;
  for(const sort of ["best_sellers","most_requested_research_peptides"] as const){
    const snapshot=sort==="best_sellers"?raw.sales:raw.requests;
    const scores=readReviewedRanking(snapshot,sort,now);
    if(!scores)continue;
    const peptides=sort==="most_requested_research_peptides"?reviewedPeptides(raw.researchPeptides):null;
    if(sort==="most_requested_research_peptides"&&!peptides)continue;
    const eligible=new Map<string,number>();
    for(const item of items){
      const s=item.sourceSelection;
      if(!s||item.clinicalReviewRequired||!item.selectableForReview||item.intentExclusion||item.reviewMessage
        ||(item.sourceRefusal !== null && item.sourceRefusal !== "family_outside_launch_scope")
        ||!(["research_peptides_materials","research_capsules","supplements"].includes(s.family))
        ||(sort==="most_requested_research_peptides"&&(s.family!=="research_peptides_materials"||!peptides?.has(s.variantId))))continue;
      const count=scores.get(s.variantId);if(count!==undefined)eligible.set(s.variantId,count);
    }
    const ranked=rankVisibleOfferings(items,eligible,sort,fallback);
    if(ranked)out.set(sort,ranked);
  }
  return out;
}
