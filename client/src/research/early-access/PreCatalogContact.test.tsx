// @vitest-environment jsdom
import {act} from "react";import {createRoot} from "react-dom/client";import {afterEach,expect,it,vi} from "vitest";
import {PreCatalogContact,type CatalogAdmissionApi,type CatalogAdmissionView} from "./PreCatalogContact";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const key="a".repeat(64),pending={admitted:false,policyRevision:key},granted={...pending,admitted:true};
let root:ReturnType<typeof createRoot>|null=null;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());document.body.replaceChildren();vi.unstubAllGlobals();root=null;});
function mount(){const host=document.createElement("main");document.body.append(host);root=createRoot(host);
 return {host,render:(epoch:string,api:CatalogAdmissionApi)=>act(async()=>root!.render(<PreCatalogContact api={api} sessionEpoch={epoch}><h2>Private catalog</h2></PreCatalogContact>))};}
function field(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
}
async function selectCountry(form: HTMLFormElement, code: string) {
  const select = field(form, "countryCode");
  await act(async () => {
    select.value = code;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit(form: HTMLFormElement) {
  await act(async () => { form.requestSubmit(); });
}
function fillContact(form: HTMLFormElement) {
  field(form, "fullLegalName").value = "Élodie Example";
  field(form, "email").value = "qa@example.invalid";
  field(form, "line1").value = "12 Example Lane";
  field(form, "city").value = "Montréal";
}
it("saves the contact and address only on submit and clears the form after admission", async () => {
  const { host, render } = mount();
  const api = { status: vi.fn(async () => pending), record: vi.fn(async () => granted) };
  await render("first", api);
  const form = host.querySelector("form")!;
  fillContact(form);
  await selectCountry(form, "CA");
  field(form, "line2").value = "Suite 2";
  field(form, "region").value = "Québec";
  field(form, "postalCode").value = "H1A 1A1";
  expect(api.record).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Private catalog");
  await submit(form);
  expect(api.record).toHaveBeenCalledWith({
    fullLegalName: "Élodie Example", email: "qa@example.invalid", policyRevision: key,
    postalAddress: { line1: "12 Example Lane", line2: "Suite 2", city: "Montréal", region: "Québec",
      postalCode: "H1A 1A1", countryCode: "CA" },
  }, expect.anything());
  expect(host.textContent).toBe("Private catalog");
  expect(host.querySelector("form")).toBeNull();
  expect(localStorage.length + sessionStorage.length).toBe(0);
});
it("captures an optional normal name separately from referral-code grammar",async()=>{
 const {host,render}=mount(),api={status:vi.fn(async()=>({...pending,referralEnabled:true})),record:vi.fn(async()=>({...granted,referralEnabled:true}))};
 await render("referral",api);const form=host.querySelector("form")!;
 fillContact(form);await selectCountry(form,"HK");field(form,"referralName").value="  Élodie  O’Neill-Smith ";
 await submit(form);
 expect(api.record).toHaveBeenCalledWith(expect.objectContaining({referralName:"Élodie O’Neill-Smith"}),expect.anything());
 expect(localStorage.length+sessionStorage.length).toBe(0);
});
it("refuses overlong optional names without losing contact values or calling custody",async()=>{
 const {host,render}=mount(),api={status:vi.fn(async()=>({...pending,referralEnabled:true})),record:vi.fn(async()=>({...granted,referralEnabled:true}))};
 await render("referral",api);const form=host.querySelector("form")!;
 fillContact(form);await selectCountry(form,"HK");field(form,"referralName").value="x".repeat(81);
 await submit(form);
 expect(api.record).not.toHaveBeenCalled();expect(host.textContent).toContain("up to 80 characters");
 expect(field(form,"fullLegalName").value).toBe("Élodie Example");
});
it("requires basic address fields and updates region and postal requirements when the country changes", async () => {
  const { host, render } = mount();
  const api = { status: vi.fn(async () => pending), record: vi.fn(async () => granted) };
  await render("guest", api);
  const form = host.querySelector("form")!;
  fillContact(form);
  expect(field(form, "countryCode").validity.valueMissing).toBe(true);
  for (const country of ["US", "CA"]) {
    await selectCountry(form, country);
    expect(field(form, "postalCode").validity.valueMissing).toBe(true);
    expect(field(form, "region").validity.valueMissing).toBe(true);
    await submit(form);
  }
  await selectCountry(form, "HK");
  field(form, "line1").value = "   ";
  expect(field(form, "line1").validity.patternMismatch).toBe(true);
  await submit(form);
  field(form, "line1").value = "8 Example Road";
  field(form, "city").value = "";
  expect(field(form, "city").validity.valueMissing).toBe(true);
  await submit(form);
  expect(api.record).not.toHaveBeenCalled();
  field(form, "city").value = "香港";
  await submit(form);
  expect(api.record.mock.calls[0]).toEqual([{
    fullLegalName: "Élodie Example", email: "qa@example.invalid", policyRevision: key,
    postalAddress: { line1: "8 Example Road", city: "香港", countryCode: "HK" },
  }, expect.anything()]);
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

it("shows the access record lifetime from the server and distinguishes the later quote request", async () => {
  const { host, render } = mount();
  const record = vi.fn();
  async function notice(retentionSeconds?: number) {
    await render("guest", { status: async () => ({ ...pending, retentionSeconds }), record });
    const form = host.querySelector("form")!;
    const text = document.getElementById(form.getAttribute("aria-describedby")!)!;
    expect(text.compareDocumentPosition(form.querySelector("input")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    return text.textContent;
  }
  // The privacy owner's approved wording, with the approved postal-address disclosure.
  expect(await notice(7200)).toBe("We use your name, work email and postal address to give you access to the Early Access catalog."
    + " Your catalog access expires after two hours. We run a cleanup every five minutes to remove expired access records."
    + " If you submit a request, we keep the request and any resulting quote separately so our team can respond.");
  expect(await notice(900)).toContain("15 minutes");
  expect(await notice(91)).toContain("91 seconds");
  expect(await notice()).not.toMatch(/expires after|five minutes/);
  expect(await notice(0)).not.toMatch(/expires after|five minutes/);
  expect(record).not.toHaveBeenCalled();
});
