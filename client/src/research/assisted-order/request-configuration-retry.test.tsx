// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { useInitialRequestConfiguration } from "./useInitialRequestConfiguration";
import { RequestConfigurationNotice } from "./RequestConfigurationNotice";
import type { AssistedOrderWizardConfig } from "./wizard-state";
import type { RequestIntentApi } from "./request-intent-api";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const config = { legal: [], form: [] } as AssistedOrderWizardConfig;
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.useFakeTimers(); host=document.createElement("div");document.body.append(host);root=createRoot(host); });
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
function Probe({api, loaded, enabled=true}: {api:Pick<RequestIntentApi,"config">;loaded:(c:AssistedOrderWizardConfig|null)=>void;enabled?:boolean}) {
  const read=useInitialRequestConfiguration(api,enabled,loaded,100);
  return <RequestConfigurationNotice state={read.state} disabled={false} onRetry={read.retry} />;
}
async function render(api:Pick<RequestIntentApi,"config">,loaded=vi.fn(),enabled=true){await act(async()=>root.render(<Probe api={api} loaded={loaded} enabled={enabled}/>));return loaded;}
async function retry(){await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());}
describe("initial request configuration recovery",()=>{
 it("loads once and passes only the returned configuration",async()=>{const api={config:vi.fn(async()=>config)},loaded=await render(api);expect(api.config).toHaveBeenCalledTimes(1);expect(loaded).toHaveBeenLastCalledWith(config);expect(host.textContent).toBe("");});
 it("offers explicit retry after a rejection",async()=>{const api={config:vi.fn().mockRejectedValueOnce(Error("private failure")).mockResolvedValue(config)},loaded=await render(api);expect(host.textContent).toContain("Reload request options");expect(host.textContent).toContain("Current request requirements are unavailable. Submission remains closed.");expect(host.textContent).not.toContain("private failure");await retry();expect(api.config).toHaveBeenCalledTimes(2);expect(loaded).toHaveBeenLastCalledWith(config);});
 it("times out a stalled read without an automatic retry",async()=>{const api={config:vi.fn(()=>new Promise<AssistedOrderWizardConfig>(()=>{}))};await render(api);await act(async()=>vi.advanceTimersByTimeAsync(100));expect(host.textContent).toContain("Reload request options");expect(api.config).toHaveBeenCalledTimes(1);});
 it("ignores the timed-out response after a newer successful retry",async()=>{let resolve!:(v:AssistedOrderWizardConfig)=>void;const old={...config,legal:[]} as AssistedOrderWizardConfig;const api={config:vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue(config)},loaded=await render(api);await act(async()=>vi.advanceTimersByTimeAsync(100));await retry();await act(async()=>resolve(old));expect(loaded).toHaveBeenLastCalledWith(config);});
 it("does not read in a recovery or receipt mount",async()=>{const api={config:vi.fn(async()=>config)};await render(api,vi.fn(),false);expect(api.config).not.toHaveBeenCalled();expect(host.textContent).toBe("");});
 it("does not publish a late result after unmount",async()=>{let resolve!:(v:AssistedOrderWizardConfig)=>void;const api={config:vi.fn(()=>new Promise<AssistedOrderWizardConfig>(r=>{resolve=r}))},loaded=await render(api);await act(async()=>root.render(null));loaded.mockClear();await act(async()=>resolve(config));expect(loaded).not.toHaveBeenCalled();});
 it("keeps repeated parent renders from rereading a stable API",async()=>{const api={config:vi.fn(async()=>config)},loaded=vi.fn();await render(api,loaded);await render(api,loaded);expect(api.config).toHaveBeenCalledTimes(1);});
 it("catches a synchronous loader exception",async()=>{await render({config:()=>{throw Error("transport failed")}});expect(host.textContent).toContain("Reload request options");});
});
