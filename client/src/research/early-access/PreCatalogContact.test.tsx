// @vitest-environment jsdom
import {act} from "react";import {createRoot} from "react-dom/client";import {afterEach,expect,it,vi} from "vitest";
import {PreCatalogContact,type CatalogAdmissionApi,type CatalogAdmissionView} from "./PreCatalogContact";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const key="a".repeat(64),pending={admitted:false,policyRevision:key},granted={...pending,admitted:true};
let root:ReturnType<typeof createRoot>|null=null;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());document.body.replaceChildren();root=null;});
function mount(){const host=document.createElement("main");document.body.append(host);root=createRoot(host);
 return {host,render:(epoch:string,api:CatalogAdmissionApi)=>act(async()=>root!.render(<PreCatalogContact api={api} sessionEpoch={epoch}><h2>Private catalog</h2></PreCatalogContact>))};}
it("withholds children until private save succeeds; contact input is not copied to browser storage",async()=>{
 const {host,render}=mount(),api={status:vi.fn(async()=>pending),record:vi.fn(async()=>granted)};await render("first",api);
 expect(host.textContent).not.toContain("Private catalog");const f=host.querySelector("form")!;f.querySelector<HTMLInputElement>('[name=fullLegalName]')!.value="Example";
 f.querySelector<HTMLInputElement>('[name=email]')!.value="qa@example.invalid";await act(async()=>{f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))});
 expect(api.record).toHaveBeenCalledWith({fullLegalName:"Example",email:"qa@example.invalid",policyRevision:key},expect.anything());
 expect(host.textContent).toBe("Private catalog");expect(localStorage.length+sessionStorage.length).toBe(0);
});
it("a superseded visitor's slow read does not unlock the new visitor on a shared device",async()=>{
 const {host,render}=mount();let resolve!: (v:CatalogAdmissionView)=>void;
 const old={status:vi.fn(()=>new Promise<CatalogAdmissionView>(ok=>{resolve=ok})),record:vi.fn()};
 await render("old",old);await render("new",{status:vi.fn(async()=>pending),record:vi.fn()});await act(async()=>resolve(granted));
 expect(host.querySelector("form")).not.toBeNull();expect(host.textContent).not.toContain("Private catalog");
});
it("a temporarily unavailable custodian offers a status retry and no catalog",async()=>{
 const {host,render}=mount(),api={status:vi.fn().mockRejectedValueOnce(new Error("private backend")).mockResolvedValueOnce(pending),record:vi.fn()};
 await render("one",api);expect(host.textContent).not.toContain("private backend");await act(async()=>host.querySelector('button')!.click());
 expect(host.querySelector("form")).not.toBeNull();expect(host.textContent).not.toContain("Private catalog");
});
