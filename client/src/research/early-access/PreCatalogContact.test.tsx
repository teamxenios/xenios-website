// @vitest-environment jsdom
import {act} from "react";import {createRoot} from "react-dom/client";import {afterEach,expect,it,vi} from "vitest";
import {PreCatalogContact,type CatalogAdmissionApi,type CatalogAdmissionView} from "./PreCatalogContact";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const key="a".repeat(64),pending={admitted:false,policyRevision:key},granted={...pending,admitted:true};
let root:ReturnType<typeof createRoot>|null=null;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());document.body.replaceChildren();vi.unstubAllGlobals();root=null;});
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

it("displays the approved contact notice before the fields only on isolated staging", async () => {
  const { host, render } = mount();
  const api = { status: vi.fn(async () => pending), record: vi.fn() };
  vi.stubGlobal("location", new URL("https://xenios-research-staging.onrender.com/earlyaccess"));
  await render("visitor", api);
  const form = host.querySelector("form")!;
  const notice = form.querySelector("#staging-catalog-contact-notice")!;
  expect(form.getAttribute("aria-describedby")).toBe(notice.id);
  expect(notice.nextElementSibling?.querySelector("input")?.name).toBe("fullLegalName");
  expect(notice.textContent).toMatch(/two hours[\s\S]*five minutes[\s\S]*stored separately/);
  expect(api.record).not.toHaveBeenCalled();

  vi.stubGlobal("location", new URL("https://xeniostechnology.com/earlyaccess"));
  await render("visitor", api);
  expect(form.querySelector("#staging-catalog-contact-notice")).toBeNull();
  expect(form.hasAttribute("aria-describedby")).toBe(false);
});
