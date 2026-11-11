import type {AdminProductDetail,CreateAdminPriceInput,PriceAudience} from "@shared/research/product-admin";
import {PRICE_AUDIENCES} from "@shared/research/product-admin";
import {readDraftAmountCents,readDraftEffectiveAt} from "./ProductPriceReviewPanel";

export type DraftSheetRow = Readonly<{row:number; sku:string; input:CreateAdminPriceInput; exists:boolean}>;
export type DraftSheet = Readonly<{rows:readonly DraftSheetRow[]; errors:readonly string[]}>;
const HEADER="sku\taudience\tusd\teffective_date";
export const draftSheetHeader=HEADER;
type Product = Pick<AdminProductDetail,"id"|"variants"|"prices">;
export function inspectDraftSheet(product:Product,text:string):DraftSheet {
  const errors:string[]=[], rows:DraftSheetRow[]=[], used=new Set<string>();
  if(text.length>24000)return {rows,errors:["Paste at most 50 rows."]};
  const lines=text.replace(/^\uFEFF/,"").trimEnd().split(/\r?\n/);
  if(lines[0]?.toLowerCase()!==HEADER||lines.length<2||lines.length>51)return {rows,errors:["Use the four tab-separated headers and 1–50 product rows."]};
  for(let i=1;i<lines.length;i++){
    const parts=lines[i].split("\t").map(p=>p.trim()), [sku,audience,amount,date]=parts;
    const fail=(why:string)=>errors.push("Row "+(i+1)+": "+why);
    if(parts.length!==4||!sku){fail("four fields and an exact SKU are required.");continue;}
    const matches=product.variants.filter(v=>v.sku===sku);
    if(matches.length!==1||matches[0].productId!==product.id||matches[0].status==="archived"){fail("SKU is missing, archived or not unique on this product.");continue;}
    const cents=readDraftAmountCents(amount), effective=readDraftEffectiveAt(date);
    if(cents===null||effective===null||!(PRICE_AUDIENCES as readonly string[]).includes(audience)){fail("invalid USD amount, UTC date or audience.");continue;}
    const variantId=matches[0].id,key=JSON.stringify([variantId,audience,effective]);
    if(used.has(key)){fail("duplicate SKU, audience and effective date.");continue;} used.add(key);
    const collisions=product.prices.filter(p=>p.productId===product.id && p.variantId===variantId && p.audience===audience && p.currency==="USD" && Date.parse(p.effectiveAt)===Date.parse(effective) && (p.status==="draft"||p.status==="approved"||p.status==="active"));
    const same=collisions.length===1 && collisions[0].amountCents===cents && !collisions[0].quantityTiers?.length && collisions[0].expiresAt===null;
    if(collisions.length&&!same){fail("a different price version already uses that date and audience. Review it individually.");continue;}
    rows.push({row:i+1,sku,input:{variantId,audience:audience as PriceAudience,amountCents:cents,currency:"USD",effectiveAt:effective},exists:same});
  }
  return {errors,rows};
}
// The existing private endpoint receives the key in its idempotency header. Neither SKU nor amount appears in it.
export async function stableDraftKey(productId:string,i:CreateAdminPriceInput):Promise<string>{
  const canonical=JSON.stringify(["catalog-staff-draft/v1",productId,i.variantId,i.audience,i.currency,i.amountCents,i.effectiveAt]);
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));
  return 'sheet-price:'+Array.from(new Uint8Array(buf),v=>v.toString(16).padStart(2,'0')).join('');
}
export type SheetProgress = {row:number; state:"existing"|"saved"|"check"; message?:string};
export async function saveDraftSheet(product:Product,text:string,
  save:(i:CreateAdminPriceInput,key:string)=>Promise<{kind:string;data?:{product:AdminProductDetail}}>,
  record:(r:SheetProgress)=>void, stillCurrent=()=>true){
  const plan=inspectDraftSheet(product,text);
  if(plan.errors.length)throw Error(plan.errors.join(" "));
  for(const r of plan.rows){
    if(!stillCurrent())return false;
    if(r.exists){record({row:r.row,state:"existing"});continue;}
    try{
      const key=await stableDraftKey(product.id,r.input);
      if(!stillCurrent())return false;
      const result=await save(r.input,key);
      if(!stillCurrent())return false;
      const evidence=result.data?.product;
      // Some idempotency adapters can return an earlier response. Verify the product and the returned version, never infer a save from HTTP success alone.
      const matches=evidence?.prices.filter(p=>p.productId===product.id&&p.variantId===r.input.variantId&&p.currency===r.input.currency&&p.audience===r.input.audience&&p.amountCents===r.input.amountCents&&Date.parse(p.effectiveAt)===Date.parse(r.input.effectiveAt)&&p.expiresAt===null&&!p.quantityTiers?.length&&p.status==="draft");
      if(result.kind!=="ok"||evidence?.id!==product.id||matches?.length!==1){record({row:r.row,state:"check",message:"Refresh private price history before retrying. Later rows were not sent."});return false;}
      record({row:r.row,state:"saved"});
    }catch{if(stillCurrent())record({row:r.row,state:"check",message:"Outcome unconfirmed. Refresh private price history before retrying."});return false;}
  }
  return true;
}
