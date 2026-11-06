// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { EarlyAccessAgreementSection } from "./EarlyAccessAgreementSection";
import type { EarlyAccessAcceptResult } from "../adapters/earlyAccessAgreement";
import type { EarlyAccessAgreementSectionProps } from "./EarlyAccessAgreementSection";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const pair={kind:"early_access_terms",version:"v2"};
const policy={kind:"ok" as const,policy:{title:"Early Access Product Policy",updated:"Synthetic",agreement:pair,sections:[{heading:"Policy",paragraphs:["Synthetic policy wording."],bullets:[]}]}};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.useFakeTimers();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
function defaults():EarlyAccessAgreementSectionProps{return {loadPolicy:vi.fn(async()=>policy),loadState:vi.fn(async()=>({kind:"required" as const,agreement:pair})),accept:vi.fn(async()=>({kind:"accepted" as const,alreadyAccepted:false,agreement:pair})),onAccepted:vi.fn(),onBlocked:vi.fn()};}
async function mount(props:EarlyAccessAgreementSectionProps){await act(async()=>root.render(<EarlyAccessAgreementSection {...props}/>));}
async function click(id:string){const el=host.querySelector<HTMLElement>(`[data-testid="early-access-agreement-${id}"]`)!;expect(el).toBeTruthy();await act(async()=>el.click());}
async function accept(){await click("checkbox");await click("submit");}
describe("agreement network recovery",()=>{
 it("leaves consent unchecked before explicit acceptance",async()=>{await mount(defaults());expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);});
 it("recovers from a rejected policy read with an explicit read-only retry",async()=>{const p=defaults();p.loadPolicy=vi.fn().mockRejectedValueOnce(Error("private")).mockResolvedValue(policy);await mount(p);expect(host.textContent).not.toContain("private");await click("read-retry");expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);expect(p.accept).not.toHaveBeenCalled();});
 it("observes a rejected policy read and a synchronous standing exception", async () => {
   const props = defaults();
   props.loadPolicy = vi.fn().mockRejectedValue(new Error("policy read failed"));
   props.loadState = vi.fn(() => { throw new Error("standing read failed"); });
   await mount(props);

   expect(props.loadPolicy).toHaveBeenCalledTimes(1);
   expect(props.loadState).toHaveBeenCalledTimes(1);
   expect(host.textContent).toContain("Check agreement status");
   expect(host.textContent).not.toContain("policy read failed");
   expect(host.textContent).not.toContain("standing read failed");
   expect(props.onAccepted).toHaveBeenCalledExactlyOnceWith(false);
 });
 it("ends a stalled policy read without accepting anything",async()=>{const p=defaults();p.loadPolicy=()=>new Promise(()=>{});await mount(p);await act(async()=>vi.advanceTimersByTimeAsync(12_000));expect(host.textContent).toContain("Check agreement status");expect(p.accept).not.toHaveBeenCalled();expect(p.onAccepted).not.toHaveBeenCalledWith(true);});
 it("offers reload when the policy endpoint reports missing",async()=>{const p=defaults();p.loadPolicy=vi.fn(async()=>({kind:"missing" as const}));await mount(p);expect(host.textContent).toContain("Reload policy");expect(host.querySelector('input[type="checkbox"]')).toBeNull();});
 it("a mismatched standing pair never unlocks continuation",async()=>{const p=defaults();p.loadState=vi.fn(async()=>({kind:"accepted" as const,agreement:{...pair,version:"v1"}}));await mount(p);expect(p.onAccepted).not.toHaveBeenCalledWith(true);expect(host.textContent).toContain("Check agreement status");});
 it("observes a matching existing acceptance without posting again",async()=>{const p=defaults();p.loadState=vi.fn(async()=>({kind:"accepted" as const,agreement:pair}));await mount(p);expect(p.onAccepted).toHaveBeenLastCalledWith(true);expect(p.accept).not.toHaveBeenCalled();});
 it("does not start two writes from a rapid double click",async()=>{const p=defaults();p.accept=vi.fn(()=>new Promise<EarlyAccessAcceptResult>(()=>{}));await mount(p);await click("checkbox");const button=host.querySelector<HTMLButtonElement>('[data-testid="early-access-agreement-submit"]')!;await act(async()=>{button.click();button.click()});expect(p.accept).toHaveBeenCalledTimes(1);});
 it("a rejected acceptance becomes an uncertain state, not a false failure claim",async()=>{const p=defaults();p.accept=vi.fn(async()=>{throw Error("hidden secret")});await mount(p);await accept();expect(host.textContent).toContain("could not confirm whether");expect(host.textContent).not.toContain("hidden secret");expect(host.textContent).toContain("Check agreement status");expect(p.onAccepted).not.toHaveBeenCalledWith(true);});
 it("a timed-out write is followed only by a user-triggered status read",async()=>{const p=defaults();p.accept=vi.fn(()=>new Promise<EarlyAccessAcceptResult>(()=>{}));p.loadState=vi.fn().mockResolvedValueOnce({kind:"required",agreement:pair}).mockResolvedValue({kind:"accepted",agreement:pair});await mount(p);await accept();await act(async()=>vi.advanceTimersByTimeAsync(15_000));expect(p.accept).toHaveBeenCalledTimes(1);await click("read-retry");expect(p.accept).toHaveBeenCalledTimes(1);expect(p.onAccepted).toHaveBeenLastCalledWith(true,"accepted");});
 it("late acceptance cannot unlock after the observation timed out",async()=>{let resolve!:(value:EarlyAccessAcceptResult)=>void;const p=defaults();p.accept=vi.fn(()=>new Promise<EarlyAccessAcceptResult>(r=>{resolve=r}));await mount(p);await accept();await act(async()=>vi.advanceTimersByTimeAsync(15_000));await act(async()=>resolve({kind:"accepted",agreement:pair,alreadyAccepted:false}));expect(p.onAccepted).not.toHaveBeenCalledWith(true);});
 it("late callback after unmount cannot affect another customer",async()=>{let resolve!:(value:EarlyAccessAcceptResult)=>void;const p=defaults();p.accept=vi.fn(()=>new Promise<EarlyAccessAcceptResult>(r=>{resolve=r}));await mount(p);await accept();await act(async()=>root.render(null));vi.mocked(p.onAccepted!).mockClear();await act(async()=>resolve({kind:"accepted",agreement:pair,alreadyAccepted:false}));expect(p.onAccepted).not.toHaveBeenCalled();});
 it("requires a status check when a write reports a different pair", async () => {
   const props = defaults();
   props.accept = vi.fn(async () => ({
     kind: "accepted" as const,
     alreadyAccepted: false,
     agreement: { ...pair, version: "v1" },
   }));
   await mount(props);
   await accept();

   expect(host.textContent).toContain("could not match your agreement status");
   expect(host.textContent).not.toContain("Nothing has been recorded");
   expect(props.loadState).toHaveBeenCalledTimes(1);
   expect(props.onAccepted).toHaveBeenLastCalledWith(false, "error");
   expect(host.querySelector('input[type="checkbox"]')).toBeNull();
 });
 it("a normal explicit acceptance still reports the confirmed pair",async()=>{const p=defaults();await mount(p);await accept();expect(p.accept).toHaveBeenCalledWith(pair);expect(p.onAccepted).toHaveBeenLastCalledWith(true);});
});
