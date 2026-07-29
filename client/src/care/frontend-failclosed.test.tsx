import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { describe, expect, it } from "vitest";
import CareAppointmentsPage from "./CareAppointmentsPage";
import CareConsentPendingPage from "./CareConsentPendingPage";
import CarePharmacyOrdersPage from "./CarePharmacyOrdersPage";
import CarePrescriptionsPage from "./CarePrescriptionsPage";

const source = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8");

const appointments = source("./CareAppointmentsPage.tsx");
const consent = source("./CareConsentPendingPage.tsx");
const prescriptions = source("./CarePrescriptionsPage.tsx");
const pharmacy = source("./CarePharmacyOrdersPage.tsx");
const appointmentReadiness = source("./CareAppointmentReadinessPanel.tsx");
const pharmacyReadiness = source("./CarePharmacyReadinessPanel.tsx");
const careApi = source("./api.ts");
const careServer = source("../../../server/care/index.ts");

function renderRoute(path: string, Page: () => React.JSX.Element) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <Route path={path}>
        <Page />
      </Route>
    </Router>,
  );
}

describe("Care frontend fail-closed lease", () => {
  it.each([
    ["appointments", "/care/appointments", CareAppointmentsPage],
    ["consent", "/care/consent", CareConsentPendingPage],
    ["prescriptions", "/care/prescriptions", CarePrescriptionsPage],
    ["pharmacy", "/care/pharmacy", CarePharmacyOrdersPage],
  ] as const)(
    "keeps exactly one main and H1 with an in-page focus target on %s",
    (_label, path, Page) => {
      const html = renderRoute(path, Page);
      expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
      expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
      expect(html).toContain('id="main-content"');
    },
  );

  it("never routes to the missing intake destination", () => {
    expect(appointments).toContain('href="/care/eligibility"');
    expect(appointments).not.toContain("/care/intake");
  });

  it("distinguishes an unauthenticated consent response", () => {
    expect(consent).toContain("response.status === 401");
    expect(consent).toContain('{ kind: "auth_required" }');
    expect(consent).toContain("AUTHORIZATION REQUIRED");
    expect(consent).toContain("No consent action is available here.");
  });

  it("contains no client write path or operational pharmacy control", () => {
    const leasedSources = [
      appointments,
      consent,
      prescriptions,
      pharmacy,
      appointmentReadiness,
      pharmacyReadiness,
    ].join("\n");
    expect(leasedSources).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(leasedSources).not.toContain("/action");
    expect(pharmacy).not.toContain("CarePharmacyAction");
    expect(pharmacy).not.toContain("<input");
    expect(pharmacy).not.toContain("orders.map");
    expect(pharmacy).toContain('data-care-read-only="true"');
  });

  it("keeps readiness panels passive, unavailable, and non-operational", () => {
    for (const panel of [appointmentReadiness, pharmacyReadiness]) {
      expect(panel).toContain("FRONTEND ACCESS");
      expect(panel).toContain("Unavailable");
      expect(panel).toContain('data-care-readonly-readiness="true"');
      expect(panel).not.toContain('publicReady ? "Approved"');
    }
  });

  it.each(["1440", "720", "375", "320", "200%"])(
    "uses responsive, wrapping shells at the %s review target",
    () => {
      for (const page of [appointments, consent, prescriptions, pharmacy]) {
        expect(page).toContain("container-x");
        expect(page).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
        expect(page).not.toContain("overflow-x-auto");
      }
      expect(appointmentReadiness).toContain("grid-cols-1 sm:grid-cols-3");
      expect(pharmacyReadiness).toContain("grid-cols-1 sm:grid-cols-3");
      expect(pharmacyReadiness).toContain("break-words");
    },
  );

  it("inherits no-store, noindex, and no-referrer protections", () => {
    expect(careApi).toContain('cache: init.cache ?? "no-store"');
    expect(careServer).toContain('res.setHeader("Cache-Control", "no-store');
    expect(careServer).toContain('res.setHeader("X-Robots-Tag", "noindex');
    expect(careServer).toContain('res.setHeader("Referrer-Policy", "no-referrer")');
  });
});
