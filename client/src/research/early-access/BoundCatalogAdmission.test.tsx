// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BoundCatalogAdmission } from "./BoundCatalogAdmission";
import type { CatalogAdmissionApi, CatalogAdmissionView } from "./PreCatalogContact";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const revision = "a".repeat(64);
const pending = { admitted: false, policyRevision: revision };
const granted = { ...pending, admitted: true };
let root: ReturnType<typeof createRoot>;
let host: HTMLElement;

function Cart() {
  const [quantity, setQuantity] = useState(0);
  return <button type="button" onClick={() => setQuantity(q => q + 1)}>Cart: {quantity}</button>;
}

async function mount(api: CatalogAdmissionApi) {
  host = document.createElement("main");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<BoundCatalogAdmission api={api}><Cart /></BoundCatalogAdmission>));
}
async function pageEvent(name: "pagehide" | "pageshow") {
  await act(async () => { window.dispatchEvent(new Event(name)); });
}
async function submitContact() {
  const form = host.querySelector("form")!;
  form.querySelector<HTMLInputElement>("[name=fullLegalName]")!.value = "Example";
  form.querySelector<HTMLInputElement>("[name=email]")!.value = "qa@example.invalid";
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("hides on page exit and discards the previous visitor's cart on a change of owner", async () => {
  let status = granted;
  await mount({ status: async () => status, record: vi.fn() });
  await act(async () => host.querySelector("button")!.click());
  await pageEvent("pagehide");
  expect(host.querySelector("button")?.closest("[hidden]")).toBeTruthy();
  status = { admitted: false, policyRevision: "b".repeat(64) };
  await pageEvent("pageshow");
  expect(host.textContent).not.toContain("Cart:");
  expect(host.querySelector("[name=email]")).not.toBeNull();
});

it("reopens contact after same-visitor expiry and accepts a new admission without reloading", async () => {
  let status = pending;
  const record = vi.fn(async () => (status = granted));
  await mount({ status: async () => status, record });
  await submitContact();
  expect(host.textContent).toContain("Cart: 0");
  await pageEvent("pagehide");
  status = pending;
  await pageEvent("pageshow");
  expect(host.textContent).not.toContain("Cart:");
  await submitContact();
  expect(record).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Cart: 0");
});

it("keeps the same visitor's in-progress contact form and active cart across returns", async () => {
  let status = pending;
  await mount({ status: async () => status, record: async () => (status = granted) });
  const name = host.querySelector<HTMLInputElement>("[name=fullLegalName]")!;
  name.value = "Partly entered";
  await pageEvent("pagehide");
  await pageEvent("pageshow");
  expect(host.querySelector("[name=fullLegalName]")).toBe(name);
  expect(name.value).toBe("Partly entered");
  await submitContact();
  await act(async () => host.querySelector("button")!.click());
  await pageEvent("pagehide");
  await pageEvent("pageshow");
  expect(host.textContent).toContain("Cart: 1");
});

it("ignores a superseded status read even if it resolves after the current denial", async () => {
  const status = vi.fn<CatalogAdmissionApi["status"]>().mockResolvedValue(granted);
  await mount({ status, record: vi.fn() });
  let finish!: (value: CatalogAdmissionView) => void;
  status.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await pageEvent("pageshow");
  status.mockResolvedValue(pending);
  await pageEvent("pageshow");
  await act(async () => finish(granted));
  expect(host.textContent).not.toContain("Cart:");
  expect(host.querySelector("[name=email]")).not.toBeNull();
});

it("ignores a contact save that finishes after a return reports expired admission", async () => {
  let finish!: (value: CatalogAdmissionView) => void;
  await mount({ status: async () => pending, record: () => new Promise(resolve => { finish = resolve; }) });
  await submitContact();
  await pageEvent("pagehide");
  await pageEvent("pageshow");
  await act(async () => finish(granted));
  expect(host.textContent).not.toContain("Cart:");
  expect(host.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false);
});

it("changes owners without carrying a cart across two successful admissions", async () => {
  let status = granted;
  await mount({ status: async () => status, record: vi.fn() });
  await act(async () => host.querySelector("button")!.click());
  status = { ...granted, policyRevision: "b".repeat(64) };
  await pageEvent("pageshow");
  expect(host.textContent).toBe("Cart: 0");
});

it("rechecks on tab visibility changes and hides content until the new result arrives", async () => {
  const status = vi.fn<CatalogAdmissionApi["status"]>().mockResolvedValue(granted);
  await mount({ status, record: vi.fn() });
  const visibility = vi.spyOn(document, "visibilityState", "get");
  try {
    visibility.mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(host.querySelector("button")?.closest("[hidden]")).toBeTruthy();
    let finish!: (value: CatalogAdmissionView) => void;
    status.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(host.querySelector("button")?.closest("[hidden]")).toBeTruthy();
    await act(async () => finish(pending));
    expect(host.textContent).not.toContain("Cart:");
    expect(host.querySelector("input[name=email]")).not.toBeNull();
  } finally {
    visibility.mockRestore();
  }
});
