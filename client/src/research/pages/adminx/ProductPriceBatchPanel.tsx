import {useEffect,useRef,useState} from "react";
import type {AdminProductDetail} from "@shared/research/product-admin";
import {createAdminPrice} from "../../adapters/productAdmin";
import {draftSheetHeader,inspectDraftSheet,saveDraftSheet,type SheetProgress} from "./batch-price-drafts";
export function ProductPriceBatchPanel({product,token,onSaved}:{product:AdminProductDetail;token:string;onSaved:()=>void}){
 const [text,setText]=useState(""),[preview,setPreview]=useState(false),[sending,setSending]=useState(false),[progress,setProgress]=useState<SheetProgress[]>([]);
 const alive=useRef(true),lock=useRef(false),epoch=useRef(0);
 useEffect(()=>{alive.current=true;epoch.current++;setText("");setSending(false);setPreview(false);setProgress([]);lock.current=false;return()=>{alive.current=false;epoch.current++}},[product.id,token]);
 const plan=preview?inspectDraftSheet(product,text):null;
 const todo=plan?.rows.filter(x=>!x.exists).length??0;
 async function commit(){
   if(lock.current||!preview||!plan||plan.errors.length||!todo)return;
   const run=epoch.current, current=()=>alive.current&&run===epoch.current;
   lock.current=true;setSending(true);setProgress([]);
   try{await saveDraftSheet(product,text,(i,k)=>createAdminPrice(token,product.id,i,k),
     row=>{if(current())setProgress(a=>[...a,row]);},current);}
   finally{if(current()){setSending(false);lock.current=false;onSaved();}}
 }
 return <details className="card min-w-0 mt-4">
   <summary className="body-m font-700">Paste price drafts for this product</summary>
   <p className="body-s mt-2">Copy four columns from your spreadsheet: exact SKU, audience, USD amount, and effective date (YYYY-MM-DD, UTC). Preview before saving. New versions stay private and require the existing approval step.</p>
   <label className="form-label mt-3" htmlFor="price-sheet">Tab-separated price list</label>
   <textarea id="price-sheet" className="input-field w-full" rows={5} value={text} disabled={sending}
      placeholder={draftSheetHeader} onChange={e=>{setText(e.target.value);setPreview(false);setProgress([])}} />
   <button type="button" className="btn btn-secondary mt-3" disabled={sending||!text.trim()} onClick={()=>setPreview(true)}>Preview drafts</button>
   {plan&&<div className="mt-3">
     {plan.errors.length>0?<ul role="alert">{plan.errors.map(m=><li key={m}>{m}</li>)}</ul>:
     <><p>{todo} new drafts; {plan.rows.length-todo} already recorded.</p><ul>{plan.rows.map(r=><li key={r.row}>{r.sku} · {r.input.audience} · USD {String(r.input.amountCents).padStart(3,"0").slice(0,-2)}.{String(r.input.amountCents).padStart(3,"0").slice(-2)} · {r.input.effectiveAt.slice(0,10)} · {r.exists?"already recorded":"draft"}</li>)}</ul>
       <button type="button" className="btn btn-primary mt-3" disabled={sending||!todo} onClick={()=>void commit()}>{sending?"Saving drafts…":"Save reviewed drafts"}</button></>}
   </div>}
   {progress.length>0&&<ul aria-live="polite" className="body-s mt-3">{progress.map(r=><li key={r.row}>Row {r.row}: {r.state==="check"?r.message:r.state}.</li>)}</ul>}
 </details>;
}
