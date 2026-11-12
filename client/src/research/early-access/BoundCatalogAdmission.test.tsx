// @vitest-environment jsdom
import {act} from "react";import {createRoot} from "react-dom/client";import {expect,it,vi} from "vitest";
import {BoundCatalogAdmission} from "./BoundCatalogAdmission";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it("refreshes the non-bearer owner challenge on restore; the previous visitor's cart is never displayed to the next",async()=>{
 let revision="a".repeat(64),admitted=true;
 const api={status:vi.fn(async()=>({admitted,policyRevision:revision})),record:vi.fn()};
 const host=document.createElement("main");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<BoundCatalogAdmission api={api}><h2>Private catalog</h2></BoundCatalogAdmission>));expect(host.textContent).toBe("Private catalog");
 await act(async()=>{window.dispatchEvent(new Event("pagehide"))});expect(host.querySelector("h2")?.closest("[hidden]")).not.toBeNull();
 revision="b".repeat(64);admitted=false;await act(async()=>{window.dispatchEvent(new Event("pageshow"))});expect(host.textContent).not.toContain("Private catalog");expect(host.querySelector("input[name=email]")).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove()}
});
