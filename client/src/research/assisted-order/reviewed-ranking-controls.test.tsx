// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,it,expect,vi} from "vitest";
import {ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair} from "../../../../shared/research/assisted-order/form";
import type {RequestIntentApi} from "./request-intent-api";
import {RequestIntentForm} from "./RequestIntentForm";
vi.mock("./assisted-order.css",()=>({default:{}}));
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;

describe("optional catalog rankings",()=>{it("shows only advertised choices and recovers to catalog order if the evidence expires",async()=>{
 let expired=false;
 const page={items:[],total:0,page:1,pageSize:24,families:[],channels:[],workflowModes:[]};
 const load=vi.fn<RequestIntentApi["catalog"]>(async query=>!expired
   ?{...page,availableRankSorts:["most_requested_research_peptides"]}
   : query.sort ? {...page,rankUnavailable:true} : page);
 const api:RequestIntentApi={
   config:vi.fn(async()=>({legal:[],form:ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map(a=>({id:a.id,scope:a.scope,copy:a.copy,...assistedOrderFormPair(a)}))})),
   catalog:load,submit:vi.fn(),staff:vi.fn(),staffQueue:vi.fn(),recover:vi.fn(),
 };
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<RequestIntentForm embedded api={api} storage={sessionStorage} ownerKey="early-access-session"/>));
  const select=[...host.querySelectorAll("label")].find(x=>x.textContent?.startsWith("Sort"))!.querySelector("select")!;
  expect([...select.options].map(x=>x.value)).toEqual(["","name_asc","name_desc","most_requested_research_peptides"]);
  expired=true;
  await act(async()=>{select.value="most_requested_research_peptides";select.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(load.mock.calls.some(([q])=>q.sort==="most_requested_research_peptides")).toBe(true);
  expect(load.mock.calls.at(-1)?.[0].sort).toBeUndefined();
  expect(select.value).toBe("");expect(host.textContent).toContain("This ranking is no longer available");
  expect([...select.options].map(x=>x.value)).toEqual(["","name_asc","name_desc"]);
 }finally{await act(async()=>root.unmount());host.remove();sessionStorage.clear();}
});});
