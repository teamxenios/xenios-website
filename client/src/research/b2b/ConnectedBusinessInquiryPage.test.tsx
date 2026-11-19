// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConnectedBusinessInquiryPage from "./ConnectedBusinessInquiryPage";

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let latest:Record<string,unknown>|undefined;
vi.mock("./OrganizationAccessPage",()=>({default:({businessInquiry}:{businessInquiry:Record<string,unknown>})=>{latest=businessInquiry;return <div>{businessInquiry.enabled?"ready":"unavailable"}</div>}}));
const roots:Array<ReturnType<typeof createRoot>>=[];
async function render(){const host=document.createElement("div");document.body.append(host);const root=createRoot(host);roots.push(root);await act(async()=>root.render(<ConnectedBusinessInquiryPage/>));return{host,root};}
const reply=(body:unknown,status=200)=>({status,redirected:false,headers:new Headers({"Content-Type":"application/json"}),text:async()=>JSON.stringify(body)});
afterEach(async()=>{await act(async()=>roots.splice(0).forEach(r=>r.unmount()));vi.unstubAllGlobals();document.body.replaceChildren();latest=undefined});
describe("connected public business page",()=>{
  it("binds only a valid server prefix after exact private readiness fetch",async()=>{
    const fetcher=vi.fn(async()=>reply({enabled:true,attemptPrefix:"a".repeat(64)+"_"}));vi.stubGlobal("fetch",fetcher);
    const {host}=await render();expect(host.textContent).toBe("ready");expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual(["/api/research/business-inquiries/config",expect.objectContaining({method:"GET",credentials:"same-origin",cache:"no-store",redirect:"error"})]);
    expect(latest?.attemptPrefix).toBe("a".repeat(64)+"_");const current=latest?.isContextCurrent as (value:string)=>boolean;expect(current(String(latest?.contextGeneration))).toBe(true);expect(current("another-context")).toBe(false);
  });
  it.each([reply({enabled:false},503),reply({enabled:true}),reply({enabled:true,attemptPrefix:"bad"}),reply({enabled:true,attemptPrefix:"a".repeat(64)+"_",actorId:"fake"})])("does not enable from unavailable or malformed metadata",async response=>{
    vi.stubGlobal("fetch",vi.fn(async()=>response));const{host}=await render();expect(host.textContent).toBe("unavailable");expect(latest?.enabled).toBe(false);
  });
  it("aborts and invalidates the old fence on unmount",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>reply({enabled:true,attemptPrefix:"a".repeat(64)+"_"})));
    const{root}=await render();const value=latest!,current=value.isContextCurrent as (s:string)=>boolean;expect(current(String(value.contextGeneration))).toBe(true);await act(async()=>root.unmount());roots.splice(roots.indexOf(root),1);expect(current(String(value.contextGeneration))).toBe(false);
  });
  it("discards a late readiness reply after the page is gone",async()=>{
    let deliver!:(r:unknown)=>void;vi.stubGlobal("fetch",vi.fn(()=>new Promise(r=>{deliver=r})));
    const{root}=await render();const before=latest;await act(async()=>root.unmount());roots.splice(roots.indexOf(root),1);
    await act(async()=>deliver(reply({enabled:true,attemptPrefix:"a".repeat(64)+"_"})));expect(latest).toBe(before);expect(latest?.enabled).toBe(false);
  });
});
