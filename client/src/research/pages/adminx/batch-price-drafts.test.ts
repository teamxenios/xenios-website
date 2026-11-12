import {describe,expect,it,vi} from "vitest";
import type {AdminProductDetail,AdminProductPrice,CreateAdminPriceInput} from "@shared/research/product-admin";
import {inspectDraftSheet,saveDraftSheet,draftSheetHeader as h,stableDraftKey} from "./batch-price-drafts";
const product={id:'p1',variants:['a','b'].map(s=>({id:s,sku:'X-'+s,productId:'p1',status:'approved'})),prices:[]} as unknown as AdminProductDetail;
const data=(a='4.95',b='5.00')=>h+'\nX-a\twholesale\t'+a+'\t2026-11-10\nX-b\tretail\t'+b+'\t2026-11-10';
function saved(i:CreateAdminPriceInput){return {id:'price-'+i.variantId,productId:'p1',status:'draft',expiresAt:null,...i} as AdminProductPrice}
function ok(i:CreateAdminPriceInput){return {kind:'ok',data:{product:{...product,prices:[saved(i)]}}}}
describe("private bulk price draft worksheet",()=>{
 it('validates all rows without writing, including foreign, duplicate, currency, precision and ambiguous identities',async()=>{
  for(const bad of [data('1.999'),data('-4'),data().replace('2026-11-10','2026-02-30'),data().replace('X-a','X-other'),data().replace('X-b\tretail','X-a\twholesale'),data().replace('wholesale','public')]){
    expect(inspectDraftSheet(product,bad).errors.length).toBeGreaterThan(0);
    const writer=vi.fn();await expect(saveDraftSheet(product,bad,writer,()=>{})).rejects.toThrow();expect(writer).not.toHaveBeenCalled();
  }
  expect(inspectDraftSheet({...product,variants:[...product.variants,product.variants[0]]},data()).errors).toHaveLength(1);
 });
 it('builds stable distinct opaque retry keys; formatting changes do not create duplicate keys',async()=>{
  const x=inspectDraftSheet(product,data()).rows[0].input,y=inspectDraftSheet(product,data('4.95','5')).rows[1].input;
  const k=await stableDraftKey(product.id,x);expect(k).toMatch(/^sheet-price:[a-f0-9]{64}$/);
  expect(await stableDraftKey(product.id,{...x})).toBe(k);expect(await stableDraftKey('different',x)).not.toBe(k);expect(await stableDraftKey(product.id,y)).not.toBe(k);
 });
 it('reconciles existing exact versions and refuses colliding active, tiered or expiring prices',()=>{
  const base=saved(inspectDraftSheet(product,data()).rows[0].input);
  expect(inspectDraftSheet({...product,prices:[base]},data()).rows[0].exists).toBe(true);
  for(const conflicting of [{...base,status:'active',amountCents:1},{...base,quantityTiers:[{}]},{...base,expiresAt:'2026-12-02T00:00:00Z'}]){
   expect(inspectDraftSheet({...product,prices:[conflicting as AdminProductPrice]},data()).errors).toHaveLength(1);
  }
 });
 it('stops on uncertain outcomes; retry uses the identical key and skips committed rows after reload',async()=>{
  const stored=new Map<string,AdminProductPrice>(), audit:string[]=[];let first=true;
  const write=async(i:CreateAdminPriceInput,k:string)=>{audit.push(k);stored.set(k,saved(i));if(first){first=false;throw Error('response lost')}return ok(i)};
  let states:string[]=[];expect(await saveDraftSheet(product,data(),write,p=>states.push(p.state))).toBe(false);expect(states).toEqual(['check']);expect(audit).toHaveLength(1);
  states=[];expect(await saveDraftSheet({...product,prices:[...stored.values()]},data(),write,p=>states.push(p.state))).toBe(true);
  expect(states).toEqual(['existing','saved']);expect(stored.size).toBe(2);
 });
 it('does not trust ok without the exact recorded draft; aborts unsent rows after stale session',async()=>{
   const states:string[]=[];const empty=vi.fn(async()=>({kind:'ok',data:{product}}));expect(await saveDraftSheet(product,data(),empty,r=>states.push(r.state))).toBe(false);expect(states).toEqual(['check']);expect(empty).toHaveBeenCalledTimes(1);
   let current=true;const writer=vi.fn(async(i:CreateAdminPriceInput)=>{current=false;return ok(i)});
   expect(await saveDraftSheet(product,data(),writer,()=>{},()=>current)).toBe(false);expect(writer).toHaveBeenCalledTimes(1);
 });
});
