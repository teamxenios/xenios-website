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
  it.each([
    { status: 503, contentType: "application/json", redirected: false },
    { status: 200, contentType: "text/html", redirected: false },
    { status: 200, contentType: "application/json", redirected: true },
  ])("releases a rejected response body without enabling or retrying: %o",async ({status,contentType,redirected})=>{
    const cancel=vi.fn();
    const response=new Response(new ReadableStream<Uint8Array>({cancel}),{status,headers:{"Content-Type":contentType}});
    if(redirected)Object.defineProperty(response,"redirected",{value:true});
    const read=vi.spyOn(response,"text"),fetcher=vi.fn(async()=>response);vi.stubGlobal("fetch",fetcher);
    const{host}=await render();expect(cancel).toHaveBeenCalledTimes(1);expect(read).not.toHaveBeenCalled();
    expect(host.textContent).toBe("unavailable");expect(latest?.enabled).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps readiness unavailable when rejected-body cancellation fails",async()=>{
    const cancel=vi.fn(async()=>{throw new Error("body already unavailable")});
    const response=new Response(new ReadableStream<Uint8Array>({cancel}),{status:503,headers:{"Content-Type":"application/json"}});
    const fetcher=vi.fn(async()=>response);vi.stubGlobal("fetch",fetcher);
    const{host}=await render();expect(cancel).toHaveBeenCalledTimes(1);expect(host.textContent).toBe("unavailable");
    expect(latest?.enabled).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("consumes a valid response normally and preserves its server fence",async()=>{
    const response=new Response(JSON.stringify({enabled:true,attemptPrefix:"b".repeat(64)+"_"}),{headers:{"Content-Type":"application/json"}});
    const cancel=vi.spyOn(response.body!,"cancel"),fetcher=vi.fn(async()=>response);vi.stubGlobal("fetch",fetcher);
    const{host}=await render();expect(host.textContent).toBe("ready");expect(response.bodyUsed).toBe(true);
    expect(cancel).not.toHaveBeenCalled();expect(latest?.attemptPrefix).toBe("b".repeat(64)+"_");expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("releases a late response after unmount without publishing a new fence",async()=>{
    let deliver!:(response:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{deliver=resolve}));vi.stubGlobal("fetch",fetcher);
    const{root}=await render();const before=latest;await act(async()=>root.unmount());roots.splice(roots.indexOf(root),1);
    const cancel=vi.fn(),response=new Response(new ReadableStream<Uint8Array>({cancel}),{headers:{"Content-Type":"application/json"}});
    await act(async()=>deliver(response));expect(cancel).toHaveBeenCalledTimes(1);expect(latest).toBe(before);
    expect(latest?.enabled).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
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
