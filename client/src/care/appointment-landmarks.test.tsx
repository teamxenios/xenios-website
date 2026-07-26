import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { describe, expect, it } from "vitest";
import CareAppointmentsPage from "./CareAppointmentsPage";

function renderAppointmentsRoute() {
  return renderToStaticMarkup(
    <Router ssrPath="/care/appointments">
      <Route path="/care/appointments">
        <CareAppointmentsPage />
      </Route>
    </Router>,
  );
}

describe("Care PR 3 routed landmarks", () => {
  it.each(["desktop", "mobile", "reflow"])(
    "keeps one main and one H1 in the %s layout structure",
    () => {
      const markup = renderAppointmentsRoute();
      expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
      expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
      expect(markup).toContain(
        '<div class="container-x pt-24 md:pt-36 pb-20" id="main-content">',
      );
    },
  );
});
