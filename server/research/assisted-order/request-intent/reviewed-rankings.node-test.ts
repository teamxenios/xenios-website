import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readReviewedRanking, rankVisibleOfferings, type ReviewedRankingSnapshot } from "./reviewed-rankings.ts";
const day=86400000, end=Date.parse("2026-11-10T00:00:00.000Z");
const id=(n:number)=>"mov_"+n.toString(16).padStart(20,"0");
const iso=(n:number)=>new Date(n).toISOString();
const example:ReviewedRankingSnapshot={schema:1,metric:"paid_fulfilled_net_distinct_orders",windowStart:iso(end-30*day),windowEnd:iso(end),approvedAt:iso(end+1),sourceReceipt:"SRC-123",reviewReceipt:"QA-456",rows:[7,21,4,12].map((count,i)=>({variantId:id(i+1),count}))};
const rows=[0,1,2,3,4].map((i)=>({n:i,sourceSelection:{variantId:id(i),family:i===2?"supplements":"research_peptides_materials"}}));
const cmp=(a:{n:number},b:{n:number})=>a.n-b.n;
test("no reviewed evidence means no sort; never turn request popularity into sales",()=>{
 for(const bad of [null,{}, {...example,metric:"distinct_submitted_requests"},{...example,sourceReceipt:example.reviewReceipt},
 {...example,windowStart:iso(end-29*day)},{...example,approvedAt:iso(end-day)},{...example,approvedAt:iso(end+3*day)},
 {...example,privateEmail:"nobody@example.invalid"}]) assert.equal(readReviewedRanking(bad,"best_sellers",end+day),null);
 assert.equal(readReviewedRanking(example,"best_sellers",end+8*day),null);
 assert.equal(rankVisibleOfferings(rows,null,"best_sellers",cmp),null);
});
test("reject duplicate, raw event, quantified customer, unknown ID and invalid-count inputs",()=>{
 for(const r of [{...example.rows[0]}, {variantId:id(44),count:4.5},{variantId:id(44),count:-1},{variantId:id(44),count:Number.MAX_SAFE_INTEGER+1},{variantId:"not-a-variant",count:6},{variantId:id(44),count:6,email:"nobody@example.invalid"}]){
   assert.equal(readReviewedRanking({...example,rows:[...example.rows,r]},"best_sellers",end+day),null);
 }
});
test("only sort already-visible variants; no counts or source receipts in output; ties are deterministic",()=>{
 const scores=readReviewedRanking(example,"best_sellers",end+day);
 const view=[rows[4],rows[3],rows[1],rows[0]];
 const ranked=rankVisibleOfferings(view,scores,"best_sellers",cmp);
 assert.deepEqual(ranked?.map(row=>row.n),[4,1,0,3]);
 assert.deepEqual(view.map(row=>row.n),[4,3,1,0]);
 assert.equal(ranked?.length,view.length); assert.ok(ranked?.every(row=>view.includes(row))); assert.ok(!JSON.stringify(ranked).includes('"count"'));
 assert.equal(rankVisibleOfferings([rows[0],rows[1]],scores,"best_sellers",cmp),null);
});
test("peptide interest is expressly distinct requests, applies only to research peptide rows and keeps other rows",()=>{
 const raw={...example,metric:"distinct_submitted_requests"};
 const scores=readReviewedRanking(raw,"most_requested_research_peptides",end+day);
 assert.deepEqual(rankVisibleOfferings(rows,scores,"most_requested_research_peptides",cmp)?.map(row=>row.n),[4,1,0,2,3]);
 assert.equal(rankVisibleOfferings([rows[0],rows[3]],scores,"most_requested_research_peptides",cmp),null);
 const flat=readReviewedRanking({...raw,rows:example.rows.map(r=>({...r,count:5}))},"most_requested_research_peptides",end+day);
 assert.equal(rankVisibleOfferings(rows,flat,"most_requested_research_peptides",cmp),null);
});
