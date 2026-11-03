// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getMasterOfferingDetail } from "./catalogApi";
import { MasterOfferingDetailSurface } from "./MasterOfferingDetailSurface";
import { detail } from "./catalog-test-fixtures";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const family = "research_vials" as const;
const slug = "requested-synthetic-item";
const path = "/api/research/catalog-display/v2/products/research_vials/requested-synthetic-item";
const product = () => detail({ slug, displayName: "Requested synthetic item", family });
const envelope = () => ({ ok: true, audience: "member", launchScope: "founder_admin", product: product() });
let root: Root | undefined, host: HTMLDivElement;
let calls: Array<{url: string; init: RequestInit | undefined}>;
function responses(...bodies: unknown[]) {
 let index = 0;
 vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  calls.push({url:String(url),init});
  if(String(url)!==path || init?.method!=="GET") throw new Error("Unexpected synthetic request");
  const body=bodies[Math.min(index++,bodies.length-1)];
  return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
 }));
}
beforeEach(()=>{calls=[];host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root?.unmount());host.remove();vi.unstubAllGlobals();});
async function render() { await act(async()=>{root!.render(<MasterOfferingDetailSurface memberToken="synthetic-token" family={family} slug={slug}/>);}); }
function retry() { const button=host.querySelector<HTMLButtonElement>('[data-testid="mo-detail-retry"]');expect(button).not.toBeNull();return button!; }

describe("detail response belongs to the requested product address",()=>{
 it.each([
  ["different slug",()=>({...envelope(),product:detail({slug:"different-item",displayName:"Wrong synthetic item"})})],
  ["different family",()=>({...envelope(),product:{...product(),family:"different_family"}})],
  ["missing product",()=>({ok:true})],
  ["null product",()=>({...envelope(),product:null})],
  ["missing acknowledgment",()=>({product:product()})],
 ] as const)("refuses %s without returning product data",async(_name,body)=>{
  responses(body());const result=await getMasterOfferingDetail("synthetic-token",family,slug);
  expect(result.kind).toBe("error");
  if(result.kind==="error")expect(result.message).toBe("The requested product could not be confirmed.");
  expect("data" in result).toBe(false);expect(calls).toHaveLength(1);
 });
 it("preserves the matching response, exact path and Bearer transport",async()=>{
  const body=envelope();responses(body);const result=await getMasterOfferingDetail("synthetic-token",family,slug);
  expect(result).toEqual({kind:"ok",data:body});expect(calls[0].url).toBe(path);
  expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer synthetic-token");
 });
 it("preserves a server access refusal instead of reclassifying it as an identity error",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({ok:false,code:"master_offerings_launch_restricted"}),{status:403,headers:{"content-type":"application/json"}})));
  const result=await getMasterOfferingDetail("synthetic-token",family,slug);
  expect(result.kind).toBe("denied");if(result.kind==="denied")expect(result.code).toBe("master_offerings_launch_restricted");
 });
 it("keeps a wrong product and its action out of the page, then recovers the requested product explicitly",async()=>{
  responses({...envelope(),product:detail({slug:"wrong-item",displayName:"Wrong synthetic item"})},envelope());
  await render();expect(host.querySelector("h1")).toBeNull();expect(host.textContent).not.toContain("Wrong synthetic item");
  expect(host.querySelector('[data-testid="mo-cta"]')).toBeNull();expect(calls).toHaveLength(1);
  await act(async()=>retry().click());
  expect(host.querySelector("h1")?.textContent).toBe("Requested synthetic item");
  expect(calls.map(c=>c.url)).toEqual([path,path]);expect(host.querySelector('[data-testid="mo-detail-retry"]')).toBeNull();
 });
 it("keeps a repeated mismatch recoverable without automatic retry or a substitute product",async()=>{
  responses({...envelope(),product:detail({slug:"wrong-item",displayName:"Wrong synthetic item"})});
  await render();await act(async()=>retry().click());
  expect(calls).toHaveLength(2);expect(retry()).not.toBeNull();expect(host.querySelector("h1")).toBeNull();
  expect(host.textContent).not.toContain("Wrong synthetic item");
 });
});
