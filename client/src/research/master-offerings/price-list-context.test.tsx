// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MasterOfferingPriceListDownload } from "./MasterOfferingCatalogControls";
import type { MasterOfferingCatalogQuery } from "@shared/research/master-offerings/contract";
import type { MasterOfferingPriceListResult } from "./catalogApi";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root: Root, host: HTMLDivElement;
const result = (name="synthetic.csv"): MasterOfferingPriceListResult => ({ok:true,blob:new Blob(["synthetic,price\n"]),filename:name});
function pending(){let resolve!:(r:MasterOfferingPriceListResult)=>void;const promise=new Promise<MasterOfferingPriceListResult>(r=>{resolve=r;});return{promise,resolve};}
const save=vi.fn();
function render(fetcher:()=>Promise<MasterOfferingPriceListResult>,token="A",query:MasterOfferingCatalogQuery={q:"first"}){return act(async()=>{root.render(<MasterOfferingPriceListDownload query={query} memberToken={token} fetchPriceList={fetcher} savePriceList={save}/>);});}
function button(format="csv"){return host.querySelector<HTMLButtonElement>(`[data-testid="mo-download-${format}"]`)!;}
async function click(format="csv"){await act(async()=>{button(format).click();});}
const status=()=>host.querySelector('[data-testid="mo-download-status"]')!.textContent;
beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);save.mockReset();vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("Unexpected external request");}));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
describe("price-list download context ownership",()=>{
 it.each(["token","filters"])("does not save an old result after %s changes",async change=>{
  const old=pending(), fetcher=vi.fn(()=>old.promise);await render(fetcher);await click();
  await render(fetcher,change==="token"?"B":"A",{q:change==="filters"?"second":"first"});
  expect(button().disabled).toBe(false);expect(status()).toBe("");
  await act(async()=>old.resolve(result("old.csv")));expect(save).not.toHaveBeenCalled();expect(status()).toBe("");
 });
 it("does not resurrect an old download when the filters change away and back",async()=>{
  const old=pending(),fetcher=vi.fn(()=>old.promise);await render(fetcher);await click();
  await render(fetcher,"A",{q:"second"});await render(fetcher,"A",{q:"first"});
  await act(async()=>old.resolve(result("old.csv")));expect(save).not.toHaveBeenCalled();
 });
 it("does not let an old completion clear the new context's busy state",async()=>{
  const old=pending(),fresh=pending(),fetcher=vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  await render(fetcher);await click();await render(fetcher,"B");await click("json");
  await act(async()=>old.resolve(result("old.csv")));expect(button("json").disabled).toBe(true);expect(save).not.toHaveBeenCalled();
  await act(async()=>fresh.resolve(result("fresh.json")));expect(save).toHaveBeenCalledExactlyOnceWith(expect.any(Blob),"fresh.json");expect(button().disabled).toBe(false);
 });
 it("saves nothing after the control unmounts",async()=>{
  const old=pending();await render(()=>old.promise);await click();await act(async()=>root.render(null));
  await act(async()=>old.resolve(result()));expect(save).not.toHaveBeenCalled();
 });
 it("permits just one same-turn preparation across both formats",async()=>{
  const old=pending(),fetcher=vi.fn(()=>old.promise);await render(fetcher);
  await act(async()=>{button().click();button("json").click();});expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async()=>old.resolve(result()));expect(save).toHaveBeenCalledTimes(1);
 });
 it("does not invalidate a download just because pagination or sorting changes",async()=>{
  const old=pending(),fetcher=vi.fn(()=>old.promise);await render(fetcher,"A",{q:"first",page:1});await click();
  await render(fetcher,"A",{q:"first",page:2,sort:"name_desc"});expect(button().disabled).toBe(true);
  await act(async()=>old.resolve(result()));expect(save).toHaveBeenCalledTimes(1);
 });
 it("clears a previous status when the export filters change",async()=>{
  const fetcher=vi.fn(async()=>result());await render(fetcher);await click();expect(status()).toContain("download has started");
  await render(fetcher,"A",{q:"second"});expect(status()).toBe("");
 });
});

describe("price-list preparation and browser handoff recovery",()=>{
 it("reports an unconfirmed save and permits one explicit retry without raw diagnostics",async()=>{
  save.mockImplementationOnce(()=>{throw new Error("private save diagnostic");});const fetcher=vi.fn(async()=>result());
  await render(fetcher);await click();
  expect(status()).toBe("We couldn't confirm that the download started. Try again.");expect(host.textContent).not.toContain("private save diagnostic");
  expect(button().disabled).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(1);
  await click();expect(fetcher).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledTimes(2);expect(status()).toBe("Your price list download has started.");
 });
 it("recovers an unexpected preparation exception without saving or staying busy",async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error("private fetch diagnostic")).mockResolvedValueOnce(result());await render(fetcher);await click();
  expect(status()).toBe("We couldn't confirm that the download started. Try again.");expect(button().disabled).toBe(false);expect(save).not.toHaveBeenCalled();
  await click();expect(fetcher).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledTimes(1);
 });
});
