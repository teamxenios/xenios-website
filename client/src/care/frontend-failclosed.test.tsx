// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "./api";
import CareAppointmentsPage from "./CareAppointmentsPage";
import CareConsentPendingPage from "./CareConsentPendingPage";
import CarePharmacyOrdersPage from "./CarePharmacyOrdersPage";
import CarePrescriptionsPage from "./CarePrescriptionsPage";

vi.mock("./api", () => ({
  careApiFetch: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
const careApiFetchMock = vi.mocked(careApiFetch);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  careApiFetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderRoute(path: string, Page: () => React.JSX.Element) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <Route path={path}>
        <Page />
      </Route>
    </Router>,
  );
}

async function renderClientRoute(
  path: string,
  Page: () => React.JSX.Element,
  responseBody: Record<string, unknown>,
) {
  careApiFetchMock.mockImplementation(async (requestPath) => {
    if (requestPath.includes("/admin/readiness")) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const staticLocation = (): [string, (nextPath: string) => void] => [
    path,
    () => undefined,
  ];
  const staticSearch = () => "";

  await act(async () => {
    root.render(
      <Router
        hook={staticLocation}
        searchHook={staticSearch}
        ssrPath={path}
      >
        <Route path={path}>
          <Page />
        </Route>
      </Router>,
    );
  });
  await act(async () => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  });

  return container.textContent ?? "";
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

  it("renders hostile appointment records as a count-free redacted state", async () => {
    const markers = [
      "PRIVATE_APPOINTMENT_ID",
      "PRIVATE_PATIENT_ID",
      "PRIVATE_INTAKE_ID",
      "PRIVATE_LOCATION_ID",
      "PRIVATE_STATE_CODE",
      "PRIVATE_CLINICIAN_ID",
      "PRIVATE_COVERAGE_ID",
      "PRIVATE_APPOINTMENT_STATUS",
      "PRIVATE_START_TIME",
      "PRIVATE_END_TIME",
      "PRIVATE_TELEHEALTH_FLAG",
      "PRIVATE_APPOINTMENT_VERSION",
      "PRIVATE_APPOINTMENT_CREATED",
      "PRIVATE_APPOINTMENT_UPDATED",
    ];
    const hostileRecord = {
      id: markers[0],
      patientId: markers[1],
      intakeId: markers[2],
      patientLocationId: markers[3],
      patientStateCode: markers[4],
      assignedClinicianUserId: markers[5],
      clinicianCoverageId: markers[6],
      status: markers[7],
      startsAt: markers[8],
      endsAt: markers[9],
      telehealthReady: markers[10],
      version: markers[11],
      createdAt: markers[12],
      updatedAt: markers[13],
    };
    const text = await renderClientRoute(
      "/care/appointments",
      CareAppointmentsPage,
      {
        ok: true,
        requestAvailable: true,
        appointments: [hostileRecord, hostileRecord],
      },
    );

    expect(text).toContain("Restricted appointment records exist.");
    expect(text).toContain("This frontend displays no appointment details");
    for (const marker of markers) expect(text).not.toContain(marker);
    expect(text).not.toMatch(/\b2\s+(?:appointment|record)/i);
  });

  it("renders hostile prescription records as a count-free redacted state", async () => {
    const markers = [
      "PRIVATE_PRESCRIPTION_ID",
      "PRIVATE_PRESCRIPTION_PATIENT",
      "PRIVATE_PRESCRIPTION_APPOINTMENT",
      "PRIVATE_CLINICIAN_REVIEW",
      "PRIVATE_PRESCRIBER",
      "PRIVATE_PRESCRIPTION_STATUS",
      "PRIVATE_FORMULATION",
      "PRIVATE_CONCENTRATION",
      "PRIVATE_ROUTE",
      "PRIVATE_QUANTITY",
      "PRIVATE_DIRECTIONS",
      "PRIVATE_REFILLS",
      "PRIVATE_CONTENT_SOURCE",
      "PRIVATE_PRESCRIPTION_VERSION",
      "PRIVATE_SIGNED_TIME",
      "PRIVATE_SUPERSEDED_ID",
      "PRIVATE_PRESCRIPTION_CREATED",
      "PRIVATE_PRESCRIPTION_UPDATED",
    ];
    const hostileRecord = {
      id: markers[0],
      patientId: markers[1],
      appointmentId: markers[2],
      clinicianReviewId: markers[3],
      prescribingClinicianUserId: markers[4],
      status: markers[5],
      formulation: markers[6],
      concentration: markers[7],
      route: markers[8],
      quantity: markers[9],
      directions: markers[10],
      refills: markers[11],
      verifiedContentSourceId: markers[12],
      version: markers[13],
      signedAt: markers[14],
      supersedesPrescriptionId: markers[15],
      createdAt: markers[16],
      updatedAt: markers[17],
    };
    const text = await renderClientRoute(
      "/care/prescriptions",
      CarePrescriptionsPage,
      {
        ok: true,
        prescriptions: [hostileRecord, hostileRecord],
      },
    );

    expect(text).toContain("Restricted prescription records exist.");
    expect(text).toContain("This frontend displays no prescription details");
    for (const marker of markers) expect(text).not.toContain(marker);
    expect(text).not.toMatch(/\b2\s+(?:prescription|record)/i);
  });

  it("forbids record mapping and clinical-field projection in redacted pages", () => {
    expect(appointments).not.toContain("appointments.map");
    expect(appointments).not.toMatch(
      /appointment\.(?:id|patientId|intakeId|patientLocationId|patientStateCode|assignedClinicianUserId|clinicianCoverageId|status|startsAt|endsAt|telehealthReady|version|createdAt|updatedAt)/,
    );
    expect(prescriptions).not.toContain("prescriptions.map");
    expect(prescriptions).not.toMatch(
      /(?:item|prescription)\.(?:id|patientId|appointmentId|clinicianReviewId|prescribingClinicianUserId|status|formulation|concentration|route|quantity|directions|refills|verifiedContentSourceId|version|signedAt|supersedesPrescriptionId|createdAt|updatedAt)/,
    );
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
