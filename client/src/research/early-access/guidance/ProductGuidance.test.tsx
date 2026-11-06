// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPathwayNotice } from "./ProductPathwayNotice";
import { SelectionCategorySummary } from "./SelectionCategorySummary";
vi.mock("./early-access-guidance.css", () => ({}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
const base = { clinicalReviewRequired: false, researchUseOnly: false, family: "supplements" };
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("server-flag category presentation", () => {
  it("shows supplement guidance without a research-only restriction", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={base} />));
    expect(host.textContent).toContain("Dietary supplement");
    expect(host.textContent).toContain("Internal review required.");
    expect(host.textContent).not.toContain("Not for human or veterinary use");
  });
  it("keeps laboratory restriction visible on compact cards", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={{ ...base, researchUseOnly: true }} />));
    expect(host.textContent).toContain("Research Use Only. Nonclinical use only.");
    expect(host.textContent).toContain("Not for human or veterinary use");
    expect(host.querySelector("details")).toBeNull();
  });
  it("keeps clinical review and no-prescription language visible", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={{ ...base, clinicalReviewRequired: true }} />));
    expect(host.textContent).toContain("Clinical review required. Not a prescription.");
    expect(host.textContent).toContain("does not approve treatment");
  });
  it("shows both restrictions for conflicting flags", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={{ ...base, researchUseOnly: true, clinicalReviewRequired: true }} detailed />));
    expect(host.textContent).toContain("conflicting");
    expect(host.textContent).toContain("Not for human or veterinary use");
    expect(host.textContent).toContain("Clinical review required. Not a prescription.");
  });
  it("shows detail explanation only when requested", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={base} detailed />));
    expect(host.textContent).toContain("selected manufacturer");
    await act(async () => root.render(<ProductPathwayNotice item={base} />));
    expect(host.textContent).not.toContain("selected manufacturer");
  });
  it("never renders a selectable, payment or acknowledgment control", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={base} detailed />));
    expect(host.querySelector("input,button,form,select")).toBeNull();
  });
  it("shows no summary for an empty selection", async () => {
    await act(async () => root.render(<SelectionCategorySummary items={[]} />));
    expect(host.childElementCount).toBe(0);
  });
  it("counts variants, not implied purchases or doses", async () => {
    await act(async () => root.render(<SelectionCategorySummary items={[
      { ...base, productId: "p1", variantId: "v1" },
      { ...base, productId: "p1", variantId: "v2" },
    ]} />));
    expect(host.textContent).toContain("2 variants");
    expect(host.textContent).toContain("does not collect payment");
  });
  it("keeps mixed request restrictions visible without another checkbox", async () => {
    await act(async () => root.render(<SelectionCategorySummary items={[
      { ...base, productId: "p1", variantId: "v1", clinicalReviewRequired: true },
      { ...base, productId: "p2", variantId: "v2", researchUseOnly: true },
    ]} />));
    expect(host.textContent).toContain("Not for human or veterinary use");
    expect(host.textContent).toContain("not a prescription or treatment approval");
    expect(host.querySelector("input,button,form")).toBeNull();
  });
  it("updates guidance when an existing component gets another variant", async () => {
    await act(async () => root.render(<ProductPathwayNotice item={{ ...base, researchUseOnly: true }} />));
    await act(async () => root.render(<ProductPathwayNotice item={base} />));
    expect(host.textContent).toContain("Dietary supplement");
    expect(host.textContent).not.toContain("Not for human or veterinary use");
  });
});
