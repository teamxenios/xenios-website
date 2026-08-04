import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CARE_BOUNDARY_KINDS } from "./care-surface-contract";
import CareBoundaryNotice from "./CareBoundaryNotice";

describe("CareBoundaryNotice", () => {
  it.each(CARE_BOUNDARY_KINDS)("renders the %s boundary as static accessible copy", (kind) => {
    const html = renderToStaticMarkup(<CareBoundaryNotice kind={kind} />);
    expect(html).toContain(`<aside`);
    expect(html).toContain(`data-care-boundary="${kind}"`);
    expect(html).toContain("aria-label=");
    expect(html.match(/<h2(?:\s|>)/g)).toHaveLength(1);
    expect(html).not.toMatch(/<(?:main|h1|form|input|select|textarea|button|a)\b/i);
  });

  it("states the clinical, emergency, and Research separation boundaries truthfully", () => {
    const clinical = renderToStaticMarkup(<CareBoundaryNotice kind="clinical" />);
    const emergency = renderToStaticMarkup(<CareBoundaryNotice kind="emergency" />);
    const privacy = renderToStaticMarkup(<CareBoundaryNotice kind="privacy" />);
    expect(clinical).toContain("No clinical service is active");
    expect(emergency).toContain("This site is not emergency care");
    expect(privacy).toContain("Research access does not authorize Care");
  });

  it.each([320, 375, 720, 1440, 2880])("is structurally reflow-safe at %ipx", () => {
    const html = renderToStaticMarkup(<CareBoundaryNotice kind="privacy" />);
    expect(html).toContain("w-full min-w-0");
    expect(html).toContain("break-words");
    expect(html).not.toMatch(/style="[^"]*(?:width|min-width):/i);
  });
});
