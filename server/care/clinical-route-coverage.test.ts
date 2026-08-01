import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import type { CareRecordId, CareRole } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import {
  CARE_CLINICAL_OPERATIONS,
  careClinicalGateOperationOf,
  careClinicalOperationCapability,
  type CareClinicalOperation,
} from "./clinical-write-gate";
import type { CareEligibilityRepository } from "./eligibility-repository";
import { registerCareEligibilityApi } from "./eligibility-routes";
import type { CareIntakeRepository } from "./intake-repository";
import { registerCareIntakeApi } from "./intake-routes";
import type { CarePrescriptionRepository } from "./prescription-repository";
import { registerCarePrescriptionApi } from "./prescription-routes";
import type { CareClinicianReviewRepository } from "./review-repository";

/**
 * Structural coverage for the Care clinical write chokepoint.
 *
 * The route table is not read from a hand written list. It is WALKED off a real
 * Express app with every Care route module registered, so a route that exists
 * is a route this test sees. Each registered route must then be classified in
 * exactly one of two maps below, and a route in neither map fails the suite by
 * name. That is the property worth having: a new clinical route cannot be added
 * without either mounting the centralized gate or being written down, in this
 * file, as deliberately nonclinical with a reason.
 *
 * Whether a route is gated is asked of the middleware itself, through
 * `careClinicalGateOperationOf`, which only answers for a middleware built by
 * `requireCareClinicalCapability`. So "gated" here means "goes through the one
 * centralized guard", not "looks like it does".
 */

const PATIENT = "11111111-1111-4111-8111-111111111111" as CareRecordId;
const CLINICIAN = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-08-01T20:00:00.000Z";

const ROUTE_MODULE_FILES = [
  "appointment-routes.ts",
  "prescription-routes.ts",
  "eligibility-routes.ts",
  "intake-routes.ts",
  // Registered transitively by appointment-routes, and therefore live.
  "review-routes.ts",
] as const;

/**
 * Every clinical route, with the operation the centralized gate must be
 * mounted for. Eleven writes and three reads.
 */
const CLINICAL_ROUTES: Readonly<Record<string, CareClinicalOperation>> = {
  "GET /api/care/intake": "intake.read",
  "POST /api/care/intake": "intake.start",
  "PATCH /api/care/intake/:intakeId/autosave": "intake.autosave",
  "POST /api/care/intake/:intakeId/submit": "intake.submit",
  "POST /api/care/appointments/:appointmentId/complete":
    "appointment.clinician_complete",
  "POST /api/care/reviews/:reviewId/action": "review.action",
  "GET /api/care/prescriptions": "prescription.read_self",
  "POST /api/care/prescriptions": "prescription.create_draft",
  "POST /api/care/prescriptions/:prescriptionId/sign": "prescription.sign",
  "GET /api/care/pharmacy/orders": "pharmacy.read_orders",
  "POST /api/care/pharmacy/orders/:orderId/action": "pharmacy.order_action",
  "POST /api/care/pharmacy/admin/prescriptions/:prescriptionId/assign":
    "prescription.assign_pharmacy",
  "POST /api/care/prescriptions/pharmacy-orders/:orderId/clarification/resolve":
    "pharmacy.resolve_clarification",
  "POST /api/care/pharmacy/admin/orders/:orderId/clarification/resolve":
    "pharmacy.resolve_clarification",
};

/**
 * Every route deliberately left ungated, each with the reason. A route may only
 * be listed here if it carries no clinical effect and returns no clinical
 * content. Adding a line here is the reviewable act.
 */
const NONCLINICAL_ROUTES: Readonly<Record<string, string>> = {
  "GET /api/care/eligibility":
    "a coverage answer and consent status, no clinical content",
  "POST /api/care/eligibility/location":
    "a state attestation used for the coverage answer",
  "POST /api/care/eligibility/waitlist": "a waitlist record",
  "POST /api/care/consents":
    "consent is the prerequisite for care rather than an act of care, and a person has to be able to revoke one at any time",
  "GET /api/care/appointments":
    "the patient's own appointment list and a readiness flag, no clinical content",
  "POST /api/care/appointments": "a patient asking for a slot",
  "POST /api/care/appointments/:appointmentId/action":
    "a patient cancelling or checking in",
  "GET /api/care/appointments/admin/readiness":
    "a deployment readiness projection built from verification booleans",
  "POST /api/care/appointments/:appointmentId/assign":
    "an administrator routing work to a clinician, no clinical effect",
  "POST /api/care/appointments/:appointmentId/schedule":
    "an administrator recording the slot and the external session handoff reference",
  "POST /api/care/appointments/:appointmentId/no-show":
    "an administrator recording attendance",
  "GET /api/care/reviews": "the assigned review list, workflow state only",
  "GET /api/care/reviews/queue":
    "the review queue projection, which drops the patient id, the clinician identity, and every intake answer",
  "GET /api/care/reviews/:reviewId":
    "the review detail projection, workflow state plus a truthful report of the capability state",
  "GET /api/care/pharmacy/admin/readiness":
    "a deployment readiness projection built from verification booleans",
};

interface RegisteredRoute {
  key: string;
  method: string;
  path: string;
  gateOperation: CareClinicalOperation | null;
  gateCount: number;
}

function access(): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state: "enabled" as const,
      enabled: true,
      publicMessage: "Care enabled for test.",
      checkedAt: NOW,
    })),
    resolvePrincipal: vi.fn(async () => ({
      subjectId: CLINICIAN,
      patientId: PATIENT,
      roles: [
        "care_patient",
        "clinician",
        "clinical_admin",
        "pharmacy_operations",
      ] as readonly CareRole[],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

const unusedRepository = <T,>() => new Proxy({}, {
  get: () => async () => {
    throw new Error("this suite never issues a request");
  },
}) as T;

/**
 * Walk the registered Express stack. Nothing here is read from a source file,
 * so a route added anywhere in the four modules shows up automatically.
 */
function walkRegisteredCareRoutes(): RegisteredRoute[] {
  const app = express();
  app.use(express.json());
  const deps = access();
  registerCareEligibilityApi(
    app,
    deps,
    unusedRepository<CareEligibilityRepository>(),
  );
  registerCareIntakeApi(
    app,
    deps,
    unusedRepository<CareEligibilityRepository>(),
    unusedRepository<CareIntakeRepository>(),
  );
  registerCareAppointmentApi(
    app,
    deps,
    unusedRepository<CareAppointmentRepository>(),
    () => new Date(NOW),
    unusedRepository<CareClinicianReviewRepository>(),
  );
  registerCarePrescriptionApi(
    app,
    deps,
    unusedRepository<CarePrescriptionRepository>(),
  );

  const router = (app as unknown as {
    router?: { stack: unknown[] };
    _router?: { stack: unknown[] };
  });
  const stack = router.router?.stack ?? router._router?.stack ?? [];
  const routes: RegisteredRoute[] = [];
  for (const layer of stack as Array<{
    route?: {
      path: string | string[];
      methods?: Record<string, boolean>;
      stack: Array<{ handle: unknown; method?: string }>;
    };
  }>) {
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path)
      ? layer.route.path
      : [layer.route.path];
    const methods = Object.entries(layer.route.methods ?? {})
      .filter(([, enabled]) => enabled)
      .map(([method]) => method.toUpperCase());
    const gates = layer.route.stack
      .map((entry) => careClinicalGateOperationOf(entry.handle))
      .filter((operation): operation is CareClinicalOperation => operation !== null);
    for (const path of paths) {
      for (const method of methods) {
        routes.push({
          key: `${method} ${path}`,
          method,
          path,
          gateOperation: gates[0] ?? null,
          gateCount: gates.length,
        });
      }
    }
  }
  return routes;
}

describe("Care route coverage: every clinical route uses the one centralized gate", () => {
  const registered = walkRegisteredCareRoutes();

  it("registers routes from all four route modules plus the transitively registered review module", () => {
    // A sanity floor. If the walk returns nothing, or a module silently stops
    // registering, every other assertion in this file becomes vacuous.
    expect(registered.length).toBeGreaterThanOrEqual(
      Object.keys(CLINICAL_ROUTES).length + Object.keys(NONCLINICAL_ROUTES).length,
    );
    expect(new Set(registered.map((route) => route.key)).size).toBe(
      registered.length,
    );
  });

  it("classifies every registered route as clinical or nonclinical, so a new route cannot escape review", () => {
    const unclassified = registered
      .map((route) => route.key)
      .filter(
        (key) => !(key in CLINICAL_ROUTES) && !(key in NONCLINICAL_ROUTES),
      );

    // If this fails, a Care route was added without being classified. Decide
    // whether it is clinical. If it is, mount requireCareClinicalCapability on
    // it and add it to CLINICAL_ROUTES. If it is not, add it to
    // NONCLINICAL_ROUTES with the reason.
    expect(unclassified).toEqual([]);
  });

  it("mounts the centralized gate, with the right operation, on every clinical route", () => {
    for (const [key, operation] of Object.entries(CLINICAL_ROUTES)) {
      const route = registered.find((candidate) => candidate.key === key);
      expect(route, `clinical route not registered: ${key}`).toBeDefined();
      expect(route!.gateOperation, `clinical route not gated: ${key}`).toBe(
        operation,
      );
      expect(route!.gateCount, `clinical route gated twice: ${key}`).toBe(1);
    }
  });

  it("leaves no gate mounted on a route classified as nonclinical", () => {
    const wronglyGated = registered
      .filter((route) => route.key in NONCLINICAL_ROUTES && route.gateOperation)
      .map((route) => `${route.key} -> ${route.gateOperation}`);

    expect(wronglyGated).toEqual([]);
  });

  it("maps every clinical route to one of the five canonical capabilities", () => {
    for (const operation of Object.values(CLINICAL_ROUTES)) {
      if (operation === "review.action") {
        // Resolved per action through CARE_REVIEW_ACTION_CAPABILITY.
        expect(careClinicalOperationCapability(operation)).toBeNull();
        continue;
      }
      expect(careClinicalOperationCapability(operation)).not.toBeNull();
    }
  });

  it("uses every declared clinical operation on at least one registered route", () => {
    const used = new Set(
      registered
        .map((route) => route.gateOperation)
        .filter((operation): operation is CareClinicalOperation => operation !== null),
    );
    const unused = CARE_CLINICAL_OPERATIONS.filter(
      (operation) => !used.has(operation),
    );

    // An operation nobody mounts is either a route that lost its gate or a
    // name left behind. Either way it should be noticed here.
    expect(unused).toEqual([]);
  });

  it("keeps the eleven clinical writes and three clinical reads exactly", () => {
    const clinical = registered.filter((route) => route.gateOperation !== null);
    const reads = clinical.filter((route) => route.method === "GET");
    const writes = clinical.filter((route) => route.method !== "GET");

    expect(reads.map((route) => route.key).sort()).toEqual([
      "GET /api/care/intake",
      "GET /api/care/pharmacy/orders",
      "GET /api/care/prescriptions",
    ]);
    expect(writes).toHaveLength(11);
  });
});

describe("Care route coverage: no route module carries its own capability check", () => {
  const sources = new Map(
    ROUTE_MODULE_FILES.map((file) => [
      file,
      readFileSync(resolve(__dirname, file), "utf8"),
    ]),
  );

  /**
   * One module is allowed to read the flags without gating on them, and only
   * one: review-routes reports the capability state to the clinician in its
   * `actions` payload, which is a truthful description of what is turned off
   * rather than a decision about whether to act. Every other module reading the
   * flags would be a second, uncentralized gate, which is the shape this change
   * removed.
   */
  const DISPLAY_ONLY_FLAG_READERS: Readonly<Record<string, string>> = {
    "review-routes.ts":
      "reports the capability state in the actions payload through careReviewActionStates, and never decides with it",
  };

  it.each(ROUTE_MODULE_FILES.map((file) => [file] as const))(
    "%s reads the capability flags only through the centralized gate",
    (file) => {
      const source = sources.get(file)!;
      const registersClinicalRoutes = source.includes(
        "requireCareClinicalCapability(",
      );
      const readsFlagsDirectly = /readCareClinicalCapabilityFlags\s*\(/.test(
        source,
      );

      if (file in DISPLAY_ONLY_FLAG_READERS) {
        // The exception has to stay an exception: the flags may only travel
        // into the projection, and may never refuse a request.
        expect(readsFlagsDirectly).toBe(true);
        expect(source).toContain("careReviewActionStates(");
        expect(source).not.toContain("CARE_CLINICAL_REFUSED");
        expect(source).not.toContain("evaluateCareClinicalWrite");
        expect(source).not.toContain("runCareClinicalWrite");
      } else {
        expect(readsFlagsDirectly).toBe(false);
      }
      if (registersClinicalRoutes) {
        expect(source).toContain('from "./clinical-write-gate"');
      }
    },
  );

  it("keeps every clinical gate mounted directly after a permission gate", () => {
    for (const file of ROUTE_MODULE_FILES) {
      const source = sources.get(file)!;
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!line.includes("requireCareClinicalCapability(")) return;
        const preceding = lines
          .slice(Math.max(0, index - 8), index)
          .join("\n");
        expect(
          preceding,
          `${file}:${index + 1} clinical gate is not mounted after requireCarePermission`,
        ).toContain("requireCarePermission(");
      });
    }
  });
});

describe("Care route coverage: the clinician review module is registered and stays classified", () => {
  /**
   * `server/index.ts` never names `registerCareClinicianReviewApi`, which makes
   * the module look inert. It is not: `registerCareAppointmentApi` calls it as
   * its last statement, so both of its routes are live on the production app
   * and `readCareClinicalCapabilityFlags` reaching `review-detail.ts` through
   * `careReviewActionStates` is a live call. These cases pin that down, so the
   * next reader does not mistake it for dead code, and so a clinical route
   * added to that module cannot land ungated.
   */
  const registered = walkRegisteredCareRoutes();
  const appointmentSource = readFileSync(
    resolve(__dirname, "appointment-routes.ts"),
    "utf8",
  );

  it("registers the review module transitively through the appointment module", () => {
    expect(appointmentSource).toContain(
      "registerCareClinicianReviewApi(app, access, reviewRepository)",
    );
    expect(registered.map((route) => route.key)).toEqual(
      expect.arrayContaining([
        "GET /api/care/reviews/queue",
        "GET /api/care/reviews/:reviewId",
      ]),
    );
  });

  it("registers the review reads and holds them to the same classification rule as every other route", () => {
    const reviewReads = registered.filter((route) =>
      ["GET /api/care/reviews/queue", "GET /api/care/reviews/:reviewId"].includes(
        route.key,
      ),
    );

    expect(reviewReads).toHaveLength(2);
    for (const route of reviewReads) {
      // Classified nonclinical today. If either ever returns clinical content,
      // the classification test above forces the gate to be mounted first.
      expect(route.key in NONCLINICAL_ROUTES).toBe(true);
      expect(route.gateOperation).toBeNull();
    }
  });

  it("registers the review reads after the literal review action route, so :reviewId never swallows it", () => {
    const keys = registered.map((route) => route.key);

    expect(keys.indexOf("GET /api/care/reviews/queue")).toBeLessThan(
      keys.indexOf("GET /api/care/reviews/:reviewId"),
    );
    expect(keys.indexOf("POST /api/care/reviews/:reviewId/action")).toBeLessThan(
      keys.indexOf("GET /api/care/reviews/:reviewId"),
    );
  });
});
