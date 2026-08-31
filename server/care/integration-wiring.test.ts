import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Care shared integration wiring", () => {
  const serverSource = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
  const appSource = readFileSync(
    resolve(__dirname, "../../client/src/App.tsx"),
    "utf8",
  );
  const navbarSource = readFileSync(
    resolve(__dirname, "../../client/src/components/Navbar.tsx"),
    "utf8",
  );

  it("registers the production Care API before the API and SPA fallbacks", () => {
    const registration = serverSource.indexOf(
      "registerCareApi(app, careAccess)",
    );
    const eligibilityRegistration = serverSource.indexOf(
      "registerCareEligibilityApi(app, careAccess, careEligibility)",
    );
    const intakeRegistration = serverSource.indexOf(
      "registerCareIntakeApi(app, careAccess, careEligibility, careIntake)",
    );
    const appointmentRegistration = serverSource.indexOf(
      "registerCareAppointmentApi(app, careAccess, careAppointments)",
    );
    const prescriptionRegistration = serverSource.indexOf(
      "registerCarePrescriptionApi(app, careAccess, carePrescriptions)",
    );
    const apiFallback = serverSource.indexOf('app.use("/api/{*rest}"');
    const productionSpa = serverSource.indexOf("serveStatic(app,");
    const developmentSpa = serverSource.indexOf("setupVite(");

    expect(serverSource).toContain("app.use(carePageGate)");
    expect(registration).toBeGreaterThan(-1);
    expect(eligibilityRegistration).toBeGreaterThan(registration);
    expect(intakeRegistration).toBeGreaterThan(eligibilityRegistration);
    expect(appointmentRegistration).toBeGreaterThan(intakeRegistration);
    expect(prescriptionRegistration).toBeGreaterThan(appointmentRegistration);
    expect(registration).toBeLessThan(apiFallback);
    expect(intakeRegistration).toBeLessThan(apiFallback);
    expect(appointmentRegistration).toBeLessThan(apiFallback);
    expect(prescriptionRegistration).toBeLessThan(apiFallback);
    expect(registration).toBeLessThan(productionSpa);
    expect(registration).toBeLessThan(developmentSpa);
  });

  it("mounts focused Care routes before the broad Care route", () => {
    expect(appSource).toContain(
      'const CareSection = lazy(() => import("@/care/section"))',
    );
    expect(appSource).toContain(
      'const CareEligibility = lazy(() => import("@/care/EligibilityPendingPage"))',
    );
    expect(appSource).toContain(
      'const CareConsent = lazy(() => import("@/care/CareConsentPendingPage"))',
    );
    expect(appSource).toContain(
      'const CareAppointments = lazy(() => import("@/care/CareAppointmentsPage"))',
    );
    expect(appSource).toContain(
      'const CarePrescriptions = lazy(() => import("@/care/CarePrescriptionsPage"))',
    );
    expect(appSource).toContain(
      'const CarePharmacyOrders = lazy(() => import("@/care/CarePharmacyOrdersPage"))',
    );
    const eligibilityRoute = appSource.indexOf(
      '<Route path="/care/eligibility" component={CareEligibilityRoutes} />',
    );
    const consentRoute = appSource.indexOf(
      '<Route path="/care/consent" component={CareConsentRoutes} />',
    );
    const appointmentRoute = appSource.indexOf(
      '<Route path="/care/appointments" component={CareAppointmentRoutes} />',
    );
    const prescriptionRoute = appSource.indexOf(
      '<Route path="/care/prescriptions" component={CarePrescriptionRoutes} />',
    );
    const pharmacyRoute = appSource.indexOf(
      '<Route path="/care/pharmacy" component={CarePharmacyRoutes} />',
    );
    const broadRoute = appSource.indexOf(
      '<Route path="/care/*" component={CareRoutes} />',
    );
    expect(eligibilityRoute).toBeGreaterThan(-1);
    expect(consentRoute).toBeGreaterThan(eligibilityRoute);
    expect(appointmentRoute).toBeGreaterThan(consentRoute);
    expect(prescriptionRoute).toBeGreaterThan(appointmentRoute);
    expect(pharmacyRoute).toBeGreaterThan(prescriptionRoute);
    expect(broadRoute).toBeGreaterThan(pharmacyRoute);
    expect(appSource).toContain(
      '<Route path="/care" component={CareRoutes} />',
    );
    expect(appSource).toContain(
      '<Route path="/care/*" component={CareRoutes} />',
    );
  });

  it("applies no-store and noindex headers to every Care API response", () => {
    const careSource = readFileSync(resolve(__dirname, "index.ts"), "utf8");
    expect(careSource).toContain('app.use("/api/care"');
    expect(careSource).toContain('res.set("Cache-Control", "no-store")');
    expect(careSource).toContain('res.set("X-Robots-Tag", "noindex, nofollow")');
  });

  it("composes the Xenios-owned manual access workflow inside the existing Care registrar", () => {
    const careSource = readFileSync(resolve(__dirname, "index.ts"), "utf8");
    const manualSource = readFileSync(resolve(__dirname, "manual-access.ts"), "utf8");

    expect(careSource).toContain("registerCareManualAccessApi(");
    expect(careSource).toContain(
      "options.manualAccessDependencies ?? buildCareManualAccessProductionDependencies()",
    );
    expect(manualSource).toContain("CARE_MANUAL_ACCESS_STATUS_PATH");
    expect(manualSource).toContain("CARE_MANUAL_ACCESS_REQUEST_PATH");
    expect(manualSource).toContain("medicalFreeTextCollected: false");
    expect(serverSource).not.toContain("registerCareManualAccessApi(app");
  });

  it("keeps the desktop call to action hidden at mobile breakpoints", () => {
    expect(navbarSource).toContain(
      'className="btn btn-primary !hidden sm:!inline-flex"',
    );
    expect(navbarSource).not.toContain(
      'className="btn btn-primary hidden sm:inline-flex"',
    );
  });
});
