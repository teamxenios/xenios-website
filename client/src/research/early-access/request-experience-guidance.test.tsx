// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EarlyAccessRequestGuide, EarlyAccessRequestNextSteps } from "./EarlyAccessRequestGuide";
import { EARLY_ACCESS_REQUEST_STEPS, EARLY_ACCESS_REQUEST_BOUNDARY } from "./request-experience-copy";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container=document.createElement("div"); document.body.appendChild(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function show(target?: string) {
  await act(async () => root.render(<EarlyAccessRequestGuide browseTargetId={target} />));
}
describe("how Early Access works", () => {
  it("renders all five stages in order", async () => {
    await show();
    expect([...container.querySelectorAll("h3")].map((n) => n.textContent))
      .toEqual(EARLY_ACCESS_REQUEST_STEPS.map((s) => s.title));
  });
  it("retains every sentence in optional guidance without hiding required boundaries", async () => {
    await show();
    for (const step of EARLY_ACCESS_REQUEST_STEPS) expect(container.textContent).toContain(step.description);
    expect(container.textContent).toContain(EARLY_ACCESS_REQUEST_BOUNDARY);
    const details=container.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).not.toContain(EARLY_ACCESS_REQUEST_BOUNDARY);
    expect(container.querySelector("summary")?.textContent).toBe("How review, decisions and payment work");
  });
  it("does not add any consent input or submission button", async () => {
    await show();
    expect(container.querySelectorAll("form,input,button,select,textarea")).toHaveLength(0);
  });
  it("does not show a dead browse link before the catalog is mounted", async () => {
    await show();
    expect(container.querySelector('a[href^="#"]')).toBeNull();
  });
  it("uses a local target for the mounted catalog", async () => {
    await show("early-access-catalog");
    const link=container.querySelector('a[href="#early-access-catalog"]');
    expect(link?.textContent).toBe("Browse products");
  });
  it("does not accept an arbitrary URL as a browse target", async () => {
    await show("https://example.invalid");
    expect(container.querySelector('a[href^="#"]')).toBeNull();
    await show("javascript:alert(1)");
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });
  it("keeps the existing support destination", async () => {
    await show();
    expect(container.querySelector('a[href="/research/support"]')?.textContent).toBe("Get help with your request");
  });
  it("uses an accessible heading with instance-specific identity", async () => {
    await act(async () => root.render(<><EarlyAccessRequestGuide /><EarlyAccessRequestGuide /></>));
    const regions=[...container.querySelectorAll("section")];
    const ids=regions.map((section) => section.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.getElementById(id ?? "")?.textContent).toBe("How Early Access works");
  });
});
describe("confirmed-request next steps", () => {
  it("states future checks and conditional payment, not an approval", async () => {
    await act(async () => root.render(<EarlyAccessRequestNextSteps />));
    expect(container.textContent).toContain("For clinical products");
    expect(container.textContent).toContain("For approved, available items");
    expect(container.textContent).toContain("has not collected payment");
    expect(container.querySelector("h2")?.textContent).toBe("What happens next");
  });
  it("supports an embedded receipt heading level", async () => {
    await act(async () => root.render(<EarlyAccessRequestNextSteps headingLevel={3} />));
    expect(container.querySelector("h3")?.textContent).toBe("What happens next");
    expect(container.querySelector("h2")).toBeNull();
  });
  it("adds no write, acceptance or payment controls", async () => {
    await act(async () => root.render(<EarlyAccessRequestNextSteps />));
    expect(container.querySelectorAll("form,input,button,a")).toHaveLength(0);
    expect(container.textContent).toContain("no need to send the same request again");
  });
});
