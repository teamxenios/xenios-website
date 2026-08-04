import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CARE_SURFACE_STATES, type CareSurfaceStateKind } from "./care-surface-contract";
import CareSurfaceState from "./CareSurfaceState";

describe("CareSurfaceState", () => {
  it.each(CARE_SURFACE_STATES)("renders the truthful %s state without controls", (state) => {
    const html = renderToStaticMarkup(<CareSurfaceState state={state} />);
    expect(html).toContain(`data-care-surface-state="${state}"`);
    expect(html.match(/<h2(?:\s|>)/g)).toHaveLength(1);
    expect(html).not.toMatch(/<(?:main|h1|form|input|select|textarea|button|a)\b/i);
    expect(html).not.toMatch(/\$\d|\b(?:our clinician|our pharmacy|available nationwide)\b/i);
  });

  it("uses accessible live-region semantics", () => {
    const loading = renderToStaticMarkup(<CareSurfaceState state="loading" />);
    const error = renderToStaticMarkup(<CareSurfaceState state="error" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('aria-busy="true"');
    expect(error).toContain('role="alert"');
    expect(error).toContain('aria-live="assertive"');
  });

  it.each([320, 375, 720, 1440, 2880])("keeps reflow-safe structural classes at %ipx", () => {
    const html = renderToStaticMarkup(<CareSurfaceState state="pending" />);
    expect(html).toContain("w-full min-w-0");
    expect(html).toContain("break-words");
    expect(html).not.toMatch(/style="[^"]*(?:width|min-width):/i);
  });

  it("fails a hostile runtime state closed and does not reflect its marker", () => {
    const marker = "PRIVATE_CLINICIAN_RECORD<script>";
    const html = renderToStaticMarkup(
      <CareSurfaceState state={marker as CareSurfaceStateKind} />,
    );
    expect(html).toContain("Care is not available");
    expect(html).not.toContain(marker);
    expect(html).not.toContain("PRIVATE_CLINICIAN_RECORD");
  });
});
