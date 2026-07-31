import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { describe, expect, it } from "vitest";
import CareAdverseEventPage, {
  CARE_ADVERSE_EVENT_PATH,
} from "./CareAdverseEventPage";
import CareLabResultsPage, { CARE_LAB_RESULTS_PATH } from "./CareLabResultsPage";
import CareSection from "./section";

function renderRoute(path: string, Page: () => React.JSX.Element) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <Route path={path}>
        <Page />
      </Route>
    </Router>,
  );
}

const labSource = readFileSync(
  resolve(__dirname, "./CareLabResultsPage.tsx"),
  "utf8",
);
const adverseSource = readFileSync(
  resolve(__dirname, "./CareAdverseEventPage.tsx"),
  "utf8",
);
const sectionSource = readFileSync(resolve(__dirname, "./section.tsx"), "utf8");

describe("Care safety surfaces are routed rather than dead", () => {
  it.each([
    ["lab results", CARE_LAB_RESULTS_PATH],
    ["adverse events", CARE_ADVERSE_EVENT_PATH],
  ] as const)("resolves the %s path inside the Care section", (_label, path) => {
    const markup = renderRoute(path, CareSection);
    expect(markup).not.toContain("Care is being prepared with the right");
    expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  });

  it("selects the surfaces from inside Care, not from the protected router", () => {
    expect(sectionSource).toContain("location === CARE_LAB_RESULTS_PATH");
    expect(sectionSource).toContain("location === CARE_ADVERSE_EVENT_PATH");
  });

  it("still falls through to the pending shell for an unknown Care path", () => {
    const markup = renderRoute("/care/not-a-surface", CareSection);
    expect(markup).toContain("Care is being prepared with the right boundaries");
  });

  it.each([
    ["lab results", CARE_LAB_RESULTS_PATH, CareLabResultsPage],
    ["adverse events", CARE_ADVERSE_EVENT_PATH, CareAdverseEventPage],
  ] as const)(
    "keeps one main, one H1, and the focus target on %s",
    (_label, path, Page) => {
      const markup = renderRoute(path, Page);
      expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
      expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
      expect(markup).toContain(
        '<div class="container-x pt-24 md:pt-36 pb-20" id="main-content">',
      );
    },
  );

  it.each([
    ["lab results", CARE_LAB_RESULTS_PATH, CareLabResultsPage],
    ["adverse events", CARE_ADVERSE_EVENT_PATH, CareAdverseEventPage],
  ] as const)(
    "opens in the checking state rather than an invented empty state on %s",
    (_label, path, Page) => {
      const markup = renderRoute(path, Page);
      expect(markup).toContain('aria-busy="true"');
      expect(markup).toContain("Check");
    },
  );

  it("carries the emergency boundary on both surfaces", () => {
    expect(renderRoute(CARE_LAB_RESULTS_PATH, CareLabResultsPage)).toContain(
      "contact local emergency services now",
    );
    expect(
      renderRoute(CARE_ADVERSE_EVENT_PATH, CareAdverseEventPage),
    ).toContain("contact local emergency services now");
  });
});

describe("Care lab results surface", () => {
  it("holds no control that could release a result and no write request", () => {
    expect(labSource).not.toMatch(/<(form|input|textarea|select)\b/i);
    expect(labSource).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/i);
    // The page reads released results. It never asks anything to release one.
    expect(labSource).not.toMatch(/\brelease\(/);
    expect(labSource).not.toMatch(/\/release\b/);
    // The only click handler on the page reloads the read.
    expect(labSource.match(/onClick=/g)).toHaveLength(1);
    expect(labSource).toContain("onClick={() => void load()}");
    expect(labSource).toContain('data-care-labs-read-only="true"');
  });

  it("states that a result is shown only after a clinician releases it", () => {
    const markup = renderRoute(CARE_LAB_RESULTS_PATH, CareLabResultsPage);
    expect(markup).toContain("after your clinician has released it");
    expect(markup).toContain("Nothing here interprets a result");
    expect(markup).toContain("nothing here is medical advice");
  });

  it("shows every honest state, including the missing record state", () => {
    for (const state of [
      '{ kind: "loading" }',
      '"auth_required"',
      '"forbidden"',
      '"disabled"',
      '"error"',
    ]) {
      expect(labSource).toContain(state);
    }
    expect(labSource).toContain("storageMissingExplanation");
    expect(labSource).toContain("Try again");
  });

  it("does not read an empty page as a result", () => {
    expect(labSource).toContain("Do not treat an empty page as a result");
  });
});

describe("Care adverse event surface", () => {
  it("cannot submit a report: there is no form and no submit handler", () => {
    expect(adverseSource).not.toMatch(/<form\b/i);
    expect(adverseSource).not.toContain("onSubmit");
    expect(adverseSource).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/i);
    expect(adverseSource).not.toContain("careApiFetch(");
    // The only click handler on the page reloads the read.
    expect(adverseSource.match(/onClick=/g)).toHaveLength(1);
    expect(adverseSource).toContain("onClick={() => void load()}");
  });

  it("renders the report control visibly disabled with a plain reason", () => {
    const markup = renderRoute(CARE_ADVERSE_EVENT_PATH, CareAdverseEventPage);
    expect(adverseSource).toContain('data-care-action-enabled="false"');
    expect(adverseSource).not.toContain('data-care-action-enabled="true"');
    expect(adverseSource).toContain("NO_WRITE_PATH_REASON");
    expect(adverseSource).toContain(
      "This release has no path from this screen to a record",
    );
    // Nothing renders the control enabled, whatever the server reports.
    expect(adverseSource).not.toMatch(/disabled=\{!/);
    expect(markup).toContain("Reporting is not open yet");
  });

  it("never claims a report was received", () => {
    const markup = renderRoute(CARE_ADVERSE_EVENT_PATH, CareAdverseEventPage);
    for (const claim of [
      "Thank you for your report",
      "Your report was received",
      "We have received your report",
      "Report sent",
      "We will be in touch",
    ]) {
      expect(adverseSource).not.toContain(claim);
      expect(markup).not.toContain(claim);
    }
    expect(adverseSource).toContain("No one has acknowledged this report yet.");
    expect(adverseSource).toContain("Nothing has been recorded for you.");
  });

  it("treats anything but an explicit yes as unavailable", () => {
    expect(adverseSource).toContain("body.submissionAvailable === true");
  });

  it("leads with the emergency boundary before the report control", () => {
    const markup = renderRoute(CARE_ADVERSE_EVENT_PATH, CareAdverseEventPage);
    expect(markup.indexOf("This form is not emergency care.")).toBeLessThan(
      markup.indexOf("NEW REPORT"),
    );
  });
});
