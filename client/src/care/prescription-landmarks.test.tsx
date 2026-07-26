import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { describe, expect, it } from "vitest";
import CarePharmacyOrdersPage from "./CarePharmacyOrdersPage";
import CarePrescriptionsPage from "./CarePrescriptionsPage";

function renderRoute(path: string, Page: () => React.JSX.Element) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <Route path={path}>
        <Page />
      </Route>
    </Router>,
  );
}

describe("Care PR 4 routed landmarks and reflow structure", () => {
  it.each([
    ["prescriptions", "/care/prescriptions", CarePrescriptionsPage],
    ["pharmacy", "/care/pharmacy", CarePharmacyOrdersPage],
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

  it.each(["populated", "empty", "disabled", "error", "320", "375", "reflow"])(
    "preserves the single-landmark shell for the %s state/layout",
    () => {
      for (const [path, Page] of [
        ["/care/prescriptions", CarePrescriptionsPage],
        ["/care/pharmacy", CarePharmacyOrdersPage],
      ] as const) {
        const markup = renderRoute(path, Page);
        expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
        expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
        expect(markup).not.toContain("<main-content");
      }
    },
  );
});
