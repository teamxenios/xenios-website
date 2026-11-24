// @vitest-environment jsdom
import { it } from "vitest";
import assert from "node:assert/strict";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { ProductPublicationEditor } from "./ProductPublicationEditor";
import type { EditorPort, EditorHead, CandidatePreview } from "./publicationEditor";
const P="11111111-1111-4111-8111-111111111111",V="22222222-2222-4222-8222-222222222222",M="33333333-3333-4333-8333-333333333333",R="44444444-4444-4444-8444-444444444444";
const identity={offeringId:"mo_a",offeringVariantId:"mov_b",productId:P,variantId:V};
const head:EditorHead={identity,generation:4,currentRevisionId:R,revisions:[{revisionId:R,previouslyPublished:true}],operations:[{operation:"publish",revisionId:R,generation:4,at:"2026-11-24T00:00:00.000Z"}],historyTruncated:true};
const candidate:CandidatePreview={identity,sourceSha256:"a".repeat(64),content:{summary:"<script>Synthetic summary</script>",overview:"Synthetic overview"},media:{mediaId:M,altText:"Synthetic artwork",width:10,height:10,representation:"catalog_reference",packagingDesign:false},approvalAvailable:true};
const product={id:P,variants:[{id:V,productId:P,label:"Synthetic variant"}],media:[{id:M,productId:P,state:"approved",filename:"Synthetic approved"},{id:R,productId:P,state:"in_review",filename:"Not approved sentinel"}]} as unknown as AdminProductDetail;
async function mounted(run:(x:{host:HTMLDivElement;calls:string[];render:(variant?:string,token?:string)=>Promise<void>})=>Promise<void>){
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host),calls:string[]=[];
  const makePort=():EditorPort=>({readCurrent:async()=>{calls.push("read");return {kind:"ok",data:head};},preview:async()=>{calls.push("preview");return {kind:"ok",data:candidate};},newKey:()=>"synthetic-only-key",command:async op=>{calls.push(op);return {kind:"unknown"};}});
  const render=async(variant=V,token="synthetic-inert")=>{await act(async()=>root.render(createElement(StrictMode,null,createElement(ProductPublicationEditor,{token,product,variantId:variant,makePort}))));};
  try{await render();await run({host,calls,render});}finally{await act(async()=>root.unmount());host.remove();}
}
const button=(host:HTMLElement,label:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent===label)!;
it("mounts on the existing deliberate pair and reads current, including effect replay",async()=>mounted(async({host,calls})=>{assert(calls.filter(x=>x==="read").length>=1);assert.match(host.textContent!,/Current generation: 4/);assert.match(host.textContent!,/Older operations may be omitted/);assert.equal(host.querySelectorAll("select").length,2);assert(!host.textContent!.includes("Not approved sentinel"));assert.equal(calls.filter(x=>x!=="read").length,0);}));
it("shows no old publication details when the parent clears or invalidates selection",async()=>mounted(async({host,render})=>{await render("");assert(!host.textContent!.includes("Current generation"));assert.match(host.textContent!,/Select one exact variant/);}));
it("renders proposed text escaped and never derives an image from a private key",async()=>mounted(async({host,calls})=>{const select=host.querySelector<HTMLSelectElement>("select")!;await act(async()=>{select.value=M;select.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>button(host,"Preview proposed revision").click());assert.match(host.textContent!,/<script>Synthetic summary<\/script>/);assert.equal(host.querySelector("script"),null);assert.equal(host.querySelector("img"),null);assert.equal(calls.filter(x=>x==="preview").length,1);assert.equal(calls.filter(x=>x==="seal").length,0);}));
it("an unknown command exposes exact retry and disables new mutations",async()=>mounted(async({host,calls})=>{const text=host.querySelector("textarea")!;const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!;await act(async()=>{setter.call(text,"Synthetic withdrawal");text.dispatchEvent(new Event("input",{bubbles:true}));text.dispatchEvent(new Event("change",{bubbles:true}));});assert.equal(button(host,"Withdraw current revision").disabled,false);await act(async()=>button(host,"Withdraw current revision").click());assert.equal(button(host,"Withdraw current revision").disabled,true);assert(button(host,"Retry exact command"));await act(async()=>button(host,"Retry exact command").click());assert.equal(calls.filter(x=>x==="withdraw").length,2);}));
