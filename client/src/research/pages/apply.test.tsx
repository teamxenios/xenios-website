// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Apply from "./Apply";

vi.mock("@/components/SeoHead", () => ({ default: () => null }));

describe("closed Research membership application", () => {
  it("states the closed authority boundary and provides every supported next action", () => {
    const html = renderToStaticMarkup(<Apply />);
    expect(html).toContain("Formal membership applications are not open yet");
    expect(html).toContain("No application has been started");
    for (const href of [
      "/research/sign-in",
      "/research/order",
      "/care/schedule",
      "/research/organizations",
      "/research/partners",
      "/research/support",
    ]) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("Application received");
    expect(html).not.toContain("We received");
    expect(html).not.toContain("Submitted");
    expect(html).not.toContain("<form");
  });
});
