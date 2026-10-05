// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { OperatorDeclarations } from "./OperatorDeclarations";
describe("operator declaration fragment", () => {
  it("keeps declared and trusted sources distinct and safely renders user text", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div"), root = createRoot(host);
    act(() => root.render(<OperatorDeclarations declaration={{ source: "person", sourceDetail: "<script>alert(1)</script>", declaredCode: "DECLARED",
      affiliationKind: "clinic", affiliationDetail: "Synthetic clinic", confirmedAt: "2026-10-05T20:00:00Z", reviewState: "captured_unmatched",
      trustedAttribution: { state: "conflict", reference: "TRUSTED" }, nextAction: "Review the declared source and route provider interest." }} />));
    expect(host.textContent).toContain("<script>alert(1)</script>"); expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toContain("DECLARED"); expect(host.textContent).toContain("TRUSTED"); expect(host.textContent).toContain("Preserve both");
    expect(host.textContent).toContain("do not authorize commission"); expect(host.querySelector("button")).toBeNull();
    act(() => root.unmount());
  });
  it("does not invent evidence when the authorized reader has none", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div"), root = createRoot(host); act(() => root.render(<OperatorDeclarations declaration={null} />));
    expect(host.textContent).toContain("not available"); act(() => root.unmount());
  });
});
