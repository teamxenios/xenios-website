import { describe, expect, it } from "vitest";
import { evaluateCareAppointmentReadiness } from "./appointment-readiness";

const readyFacts = {
  medicalGroupVerified: true,
  clinicianRecordVerified: true,
  clinicianLicenseVerified: true,
  clinicianCredentialsVerified: true,
  clinicianCoverageVerified: true,
  supportedStateVerified: true,
  telehealthProviderVerified: true,
  schedulingProviderVerified: true,
  remindersConfigured: true,
  publicActivationApproved: true,
};

describe("Care PR 3 required-input application", () => {
  it("names exact missing real inputs and blocks operational/public readiness", () => {
    expect(
      evaluateCareAppointmentReadiness({
        ...readyFacts,
        clinicianLicenseVerified: false,
        clinicianCredentialsVerified: false,
        schedulingProviderVerified: false,
        publicActivationApproved: false,
      }),
    ).toEqual({
      softwareReady: true,
      operationalReady: false,
      publicReady: false,
      requiredInputs: [
        "CLINICIAN LICENSE REQUIRED",
        "CLINICIAN CREDENTIAL VERIFICATION REQUIRED",
        "SCHEDULING PROVIDER REQUIRED",
        "CARE ACTIVATION APPROVAL REQUIRED",
      ],
    });
  });

  it("distinguishes software readiness from verified operational and public readiness", () => {
    expect(evaluateCareAppointmentReadiness(readyFacts)).toEqual({
      softwareReady: true,
      operationalReady: true,
      publicReady: true,
      requiredInputs: [],
    });
  });
});
