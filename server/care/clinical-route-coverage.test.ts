import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareRecordId, CareRole } from "@shared/care/contracts";
import type { CareAccessDependencies } from "./access";
import type { CareAppointmentRepository } from "./appointment-repository";
import { registerCareAppointmentApi } from "./appointment-routes";
import {
  CARE_CLINICAL_OPERATIONS,
  careClinicalGateOperationOf,
  careClinicalOperationCapability,
  requireCareClinicalCapability,
  type CareClinicalOperation,
} from "./clinical-write-gate";
import type { CareEligibilityRepository } from "./eligibility-repository";
import { registerCareEligibilityApi } from "./eligibility-routes";
import { registerCareApi } from "./index";
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
  // `registerCareApi` lives here and `server/index.ts` calls it, so it is a
  // route module like any other. It was previously omitted from this list AND
  // from the walk below, which meant a clinical route added to it would have
  // been live on the production app while the whole care suite stayed green.
  "index.ts",
] as const;

/**
 * The registrars this file's walk actually invokes. Kept as data so the case
 * below can compare it against what `server/index.ts` really calls, instead of
 * trusting that the two lists were kept in step by hand.
 */
const WALKED_REGISTRARS = [
  "registerCareApi",
  "registerCareEligibilityApi",
  "registerCareIntakeApi",
  "registerCareAppointmentApi",
  "registerCarePrescriptionApi",
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
  "GET /api/care/status":
    "the Care rail capability state and its public message, no person and no record",
  "GET /api/care/audit/access":
    "a role boundary probe whose entire success body is { ok: true }",
  "GET /api/care/reviews":
    "the assigned review list, projected through toCareReviewListItem, which drops the patient id, the assigned clinician identity, the patient state code, and the decision source",
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
  // Mirrors `server/index.ts` exactly, in the same order. `registerCareApi` is
  // easy to miss because it is the module's own entry point rather than a
  // "-routes" file, and missing it made this walk blind to two live routes.
  registerCareApi(app, deps);
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

/**
 * ITEM 3 FOLLOW UP. The walk above is only as good as the registrar list it
 * invokes, and that list used to be four hand written calls while
 * `server/index.ts` made five. The missing one, `registerCareApi`, registers
 * two live routes, so an ungated clinical route added there was invisible to
 * every case in this file.
 *
 * These cases stop that from happening again by deriving the expectation from
 * the real server entry point and from the real module sources rather than
 * from another hand written list.
 */
describe("Care route coverage: the walk covers every registrar the real server calls", () => {
  const serverEntry = readFileSync(
    resolve(__dirname, "..", "index.ts"),
    "utf8",
  );
  const careSources = new Map(
    ROUTE_MODULE_FILES.map((file) => [
      file,
      readFileSync(resolve(__dirname, file), "utf8"),
    ]),
  );

  it("invokes every Care registrar that server/index.ts invokes", () => {
    const entryRegistrars = [
      ...new Set(
        [...serverEntry.matchAll(/^\s*(registerCare[A-Za-z]*)\s*\(/gm)].map(
          (match) => match[1],
        ),
      ),
    ].sort();

    // A registrar the production server calls and this walk does not is a
    // registrar whose routes escape classification entirely.
    expect(entryRegistrars.length).toBeGreaterThan(0);
    expect(
      entryRegistrars.filter(
        (name) => !(WALKED_REGISTRARS as readonly string[]).includes(name),
      ),
    ).toEqual([]);
    expect(entryRegistrars).toEqual([...WALKED_REGISTRARS].sort());
  });

  it("accounts for every Care registrar declared anywhere in server/care", () => {
    const declared = new Set<string>();
    for (const source of careSources.values()) {
      for (const match of source.matchAll(
        /export function (registerCare[A-Za-z]*)\s*\(/g,
      )) {
        declared.add(match[1]);
      }
    }
    // review-routes declares one that nothing outside server/care calls.
    expect(declared.has("registerCareClinicianReviewApi")).toBe(true);

    const walked = new Set<string>(WALKED_REGISTRARS);
    const unaccounted = [...declared].filter((name) => {
      if (walked.has(name)) return false;
      // Not called directly by the walk, so to be covered at all it has to be
      // called from inside a module the walk DOES register. A call site is a
      // mention of the name that is not its own declaration.
      const calledFromWalkedModule = [...careSources.values()].some((source) =>
        source
          .split("\n")
          .some(
            (line) =>
              line.includes(`${name}(`) &&
              !line.includes(`export function ${name}(`),
          ),
      );
      return !calledFromWalkedModule;
    });

    // If this fails, a registrar exists that neither this walk nor a walked
    // module calls, so its routes are unclassified. Register it above.
    expect(unaccounted).toEqual([]);
  });

  it("registers the two routes registerCareApi owns, and classifies both", () => {
    const keys = walkRegisteredCareRoutes().map((route) => route.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "GET /api/care/status",
        "GET /api/care/audit/access",
      ]),
    );
    expect("GET /api/care/status" in NONCLINICAL_ROUTES).toBe(true);
    expect("GET /api/care/audit/access" in NONCLINICAL_ROUTES).toBe(true);
  });
});

/**
 * ITEM 5 FOLLOW UP. `careClinicalGateOperationOf` used to answer from a
 * `careClinicalOperation` property, which any object can set. A three line
 * middleware that set the property and called `next()` therefore read as
 * "gated" to every case in this file while enforcing nothing. The answer now
 * comes from a module private registry written only by
 * `requireCareClinicalCapability`, so resemblance is not enough.
 */
describe("Care route coverage: a forged gate marker cannot pass for the real gate", () => {
  it("answers null for a look-alike middleware that merely carries the property", () => {
    const forged = Object.assign(
      (_req: unknown, _res: unknown, next: () => void) => next(),
      { careClinicalOperation: "prescription.sign" as const },
    );

    expect(careClinicalGateOperationOf(forged)).toBeNull();
  });

  it("answers null for a forged marker copied off the real gate's own shape", () => {
    const real = requireCareClinicalCapability("prescription.sign");
    const forged = Object.assign(
      (_req: unknown, _res: unknown, next: () => void) => next(),
      Object.fromEntries(
        Object.getOwnPropertyNames(real)
          .filter((key) => key !== "length" && key !== "name")
          .map((key) => [key, (real as unknown as Record<string, unknown>)[key]]),
      ),
      Object.fromEntries(
        Object.getOwnPropertySymbols(real).map((key) => [
          key,
          (real as unknown as Record<symbol, unknown>)[key],
        ]),
      ),
    );

    expect(careClinicalGateOperationOf(forged)).toBeNull();
  });

  it("still answers for the middleware this module actually built", () => {
    const real = requireCareClinicalCapability("prescription.sign");
    expect(careClinicalGateOperationOf(real)).toBe("prescription.sign");
    // The readable tag stays, for debuggers and stack dumps. It is simply not
    // what the answer above is derived from.
    expect(real.careClinicalOperation).toBe("prescription.sign");
  });

  it("answers null for values that are not middleware at all", () => {
    for (const value of [null, undefined, "prescription.sign", 7, {}, []]) {
      expect(careClinicalGateOperationOf(value)).toBeNull();
    }
  });
});

/**
 * ITEM 4. A reason has to be TRUE, not merely present.
 *
 * Everything above proves that each route is LISTED with a reason. Nothing
 * above proved that a listed reason describes the response the route actually
 * sends, and that gap is how two defects survived review: a pharmacy worklist
 * described as a fulfillment queue that in fact joined in prescription
 * content, and an assigned review list described as "workflow state only" that
 * in fact returned the patient id, the assigned clinician identity, the
 * patient state code and the decision source.
 *
 * So each nonclinical route is DRIVEN here against repositories whose records
 * carry recognizable sentinel values, and the serialized response must contain
 * neither the sentinel value nor the field name that the route's own reason
 * claims it drops. A false reason now fails by route name.
 *
 * What this does and does not prove, stated plainly. It proves absence of the
 * declared fields from a real success response built from records that DO
 * carry them. It does not prove a route is harmless in some general sense, and
 * a sentinel that no record on that route's path carries would be a vacuous
 * line, so each `forbid` list names only fields that route's own records could
 * really have carried.
 */
const SENTINEL = {
  patientId: "sentinel-patient-id-9c41",
  clinicianUserId: "sentinel-clinician-user-id-9c41",
  stateCode: "sentinel-state-code-9c41",
  decisionSource: "sentinel-decision-source-9c41",
  intakeAnswer: "sentinel-intake-answer-9c41",
} as const;

type SentinelKey = keyof typeof SENTINEL;

/** The response field names that carry each sentinel in the underlying record. */
const SENTINEL_FIELD_NAMES: Readonly<Record<SentinelKey, readonly string[]>> = {
  patientId: ["patientId"],
  clinicianUserId: ["assignedClinicianUserId", "prescribingClinicianUserId"],
  stateCode: ["patientStateCode"],
  decisionSource: ["finalDecisionSource", "decisionSource"],
  intakeAnswer: ["answers"],
};

const SENTINEL_APPOINTMENT = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patientId: SENTINEL.patientId,
  intakeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  patientLocationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientStateCode: SENTINEL.stateCode,
  assignedClinicianUserId: SENTINEL.clinicianUserId,
  clinicianCoverageId: null,
  status: "completed",
  startsAt: NOW,
  endsAt: NOW,
  telehealthReady: true,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const SENTINEL_REVIEW = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  appointmentId: SENTINEL_APPOINTMENT.id,
  patientId: SENTINEL.patientId,
  assignedClinicianUserId: SENTINEL.clinicianUserId,
  patientStateCode: SENTINEL.stateCode,
  status: "decided",
  finalDecision: "approved",
  finalDecisionSource: SENTINEL.decisionSource,
  version: 3,
  createdAt: NOW,
  updatedAt: NOW,
};

const SENTINEL_INTAKE = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  patientId: SENTINEL.patientId,
  definitionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  definitionVersion: "v1",
  status: "submitted",
  answers: { chiefComplaint: SENTINEL.intakeAnswer },
  submittedAt: NOW,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const SENTINEL_REVIEW_FACTS = {
  review: SENTINEL_REVIEW,
  appointment: SENTINEL_APPOINTMENT,
  intake: SENTINEL_INTAKE,
  consents: [
    { kind: "telehealth", satisfied: true, reason: null },
    { kind: "privacy_notice", satisfied: true, reason: null },
  ],
};

const READINESS = {
  medicalGroupVerified: true,
  clinicianRecordVerified: true,
  clinicianLicenseVerified: true,
  clinicianCredentialsVerified: true,
  clinicianCoverageVerified: true,
  operationalClinicianReady: true,
  supportedStateVerified: true,
  telehealthProviderVerified: true,
  schedulingProviderVerified: true,
  remindersConfigured: true,
  publicActivationApproved: true,
};

const PRESCRIPTION_READINESS = {
  pharmacyPartnerVerified: true,
  pharmacyIntegrationVerified: true,
  prescriberCredentialsVerified: true,
  prescriberStateCoverageVerified: true,
  contentSourceVerified: true,
  auditTrailVerified: true,
  publicActivationApproved: true,
};

const SENTINEL_ELIGIBILITY_CONTEXT = {
  patientId: SENTINEL.patientId,
  capabilityEnabled: true,
  location: {
    id: "11111111-2222-4333-8444-555555555555",
    patientId: SENTINEL.patientId,
    stateCode: "IL",
    source: "patient_attestation",
    attestedAt: NOW,
    supersedesLocationId: null,
  },
  identity: { patientId: SENTINEL.patientId, state: "verified", verifiedAt: NOW },
  coverage: {
    stateCode: "IL",
    supportedStateActive: true,
    serviceCoverageActive: true,
    waitlistEnabled: true,
    activeClinicianCount: 1,
  },
  telehealthConsent: {
    kind: "telehealth",
    requiredDocument: null,
    activeEvent: null,
    satisfied: true,
    reason: null,
  },
  privacyConsent: {
    kind: "privacy_notice",
    requiredDocument: null,
    activeEvent: null,
    satisfied: true,
    reason: null,
  },
};

function proofAccess(): CareAccessDependencies {
  return {
    loadCapabilityStatus: vi.fn(async () => ({
      rail: "care" as const,
      state: "enabled" as const,
      enabled: true,
      publicMessage: "Care enabled for test.",
      checkedAt: NOW,
    })),
    // The caller's own identity is a sentinel too, so a route that echoes the
    // principal back is caught by the same check.
    resolvePrincipal: vi.fn(async () => ({
      subjectId: SENTINEL.clinicianUserId,
      patientId: SENTINEL.patientId as CareRecordId,
      roles: [
        "care_patient",
        "clinician",
        "clinical_admin",
        "pharmacy_operations",
        "care_security_admin",
      ] as readonly CareRole[],
    })),
    recordAccessDecision: vi.fn(async () => undefined),
  };
}

function proofApp(serviceCoverageActive = true) {
  const app = express();
  app.use(express.json());
  const deps = proofAccess();
  const context = {
    ...SENTINEL_ELIGIBILITY_CONTEXT,
    coverage: { ...SENTINEL_ELIGIBILITY_CONTEXT.coverage, serviceCoverageActive },
  };
  const appointmentRepository = {
    listPatientAppointments: vi.fn(async () => [SENTINEL_APPOINTMENT]),
    listAssignedReviews: vi.fn(async () => [SENTINEL_REVIEW]),
    loadReadiness: vi.fn(async () => READINESS),
    requestAppointment: vi.fn(async () => SENTINEL_APPOINTMENT),
    patientAction: vi.fn(async () => SENTINEL_APPOINTMENT),
    assignClinician: vi.fn(async () => SENTINEL_APPOINTMENT),
    scheduleAppointment: vi.fn(async () => SENTINEL_APPOINTMENT),
    adminMarkNoShow: vi.fn(async () => SENTINEL_APPOINTMENT),
    clinicianComplete: vi.fn(async () => SENTINEL_APPOINTMENT),
    applyReviewAction: vi.fn(async () => SENTINEL_REVIEW),
  } as unknown as CareAppointmentRepository;
  const reviewRepository = {
    listAssignedReviewFacts: vi.fn(async () => [SENTINEL_REVIEW_FACTS]),
    loadAssignedReviewFacts: vi.fn(async () => SENTINEL_REVIEW_FACTS),
  } as unknown as CareClinicianReviewRepository;
  const eligibilityRepository = {
    loadContext: vi.fn(async () => context),
    recordEligibilityDecision: vi.fn(async () => undefined),
    recordLocation: vi.fn(async () => SENTINEL_ELIGIBILITY_CONTEXT.location),
    changeWaitlist: vi.fn(async () => ({
      id: "22222222-3333-4444-8555-666666666666",
      patientId: SENTINEL.patientId,
      stateCode: "IL",
      action: "joined",
      occurredAt: NOW,
    })),
    recordConsent: vi.fn(async () => ({
      kind: "telehealth",
      requiredDocument: null,
      activeEvent: null,
      satisfied: true,
      reason: null,
    })),
  } as unknown as CareEligibilityRepository;

  registerCareApi(app, deps);
  registerCareEligibilityApi(app, deps, eligibilityRepository);
  registerCareIntakeApi(
    app,
    deps,
    eligibilityRepository,
    unusedRepository<CareIntakeRepository>(),
  );
  registerCareAppointmentApi(
    app,
    deps,
    appointmentRepository,
    () => new Date(NOW),
    reviewRepository,
  );
  registerCarePrescriptionApi(
    app,
    deps,
    {
      loadReadiness: vi.fn(async () => PRESCRIPTION_READINESS),
    } as unknown as CarePrescriptionRepository,
  );
  return app;
}

interface ResponseProof {
  method: "get" | "post";
  path: string;
  body?: Record<string, unknown>;
  forbid: readonly SentinelKey[];
  /** The waitlist only opens when the state is supported but not yet serviced. */
  serviceCoverageActive?: boolean;
}

const ALL_SENTINELS: readonly SentinelKey[] = [
  "patientId",
  "clinicianUserId",
  "stateCode",
  "decisionSource",
  "intakeAnswer",
];

/** Routes that legitimately carry the caller's own record identity. */
const NO_IDENTITY_CLAIM: readonly SentinelKey[] = ["decisionSource", "intakeAnswer"];

const APPOINTMENT_PATH = SENTINEL_APPOINTMENT.id;
const REVIEW_PATH = SENTINEL_REVIEW.id;
const KEY = "idempotency-key-0001";

/**
 * One proof per nonclinical route. `forbid` names what that route's reason
 * claims is absent, so the claim itself is what gets checked.
 */
const RESPONSE_PROOFS: Readonly<Record<string, ResponseProof>> = {
  "GET /api/care/status": {
    method: "get",
    path: "/api/care/status",
    forbid: ALL_SENTINELS,
  },
  "GET /api/care/audit/access": {
    method: "get",
    path: "/api/care/audit/access",
    forbid: ALL_SENTINELS,
  },
  "GET /api/care/eligibility": {
    method: "get",
    path: "/api/care/eligibility",
    forbid: NO_IDENTITY_CLAIM,
  },
  "POST /api/care/eligibility/location": {
    method: "post",
    path: "/api/care/eligibility/location",
    body: { stateCode: "IL", source: "patient_attestation", idempotencyKey: KEY },
    forbid: NO_IDENTITY_CLAIM,
  },
  "POST /api/care/eligibility/waitlist": {
    method: "post",
    path: "/api/care/eligibility/waitlist",
    body: { action: "joined", stateCode: "IL", idempotencyKey: KEY },
    forbid: NO_IDENTITY_CLAIM,
    serviceCoverageActive: false,
  },
  "POST /api/care/consents": {
    method: "post",
    path: "/api/care/consents",
    body: {
      kind: "telehealth",
      documentVersion: "v1",
      action: "granted",
      idempotencyKey: KEY,
    },
    forbid: NO_IDENTITY_CLAIM,
  },
  "GET /api/care/appointments": {
    method: "get",
    path: "/api/care/appointments",
    forbid: NO_IDENTITY_CLAIM,
  },
  "POST /api/care/appointments": {
    method: "post",
    path: "/api/care/appointments",
    body: { intakeId: SENTINEL_INTAKE.id, idempotencyKey: KEY },
    forbid: NO_IDENTITY_CLAIM,
  },
  "POST /api/care/appointments/:appointmentId/action": {
    method: "post",
    path: `/api/care/appointments/${APPOINTMENT_PATH}/action`,
    body: { action: "cancel", expectedVersion: 0, idempotencyKey: KEY },
    forbid: NO_IDENTITY_CLAIM,
  },
  "GET /api/care/appointments/admin/readiness": {
    method: "get",
    path: "/api/care/appointments/admin/readiness",
    forbid: ALL_SENTINELS,
  },
  "POST /api/care/appointments/:appointmentId/assign": {
    method: "post",
    path: `/api/care/appointments/${APPOINTMENT_PATH}/assign`,
    body: {
      clinicianUserId: "99999999-9999-4999-8999-999999999999",
      idempotencyKey: KEY,
    },
    forbid: NO_IDENTITY_CLAIM,
  },
  "POST /api/care/appointments/:appointmentId/schedule": {
    method: "post",
    path: `/api/care/appointments/${APPOINTMENT_PATH}/schedule`,
    body: {
      expectedVersion: 0,
      providerKey: "provider-key",
      providerSessionReference: "session-reference-1",
      startsAt: NOW,
      endsAt: NOW,
      idempotencyKey: KEY,
    },
    forbid: NO_IDENTITY_CLAIM,
  },
  "POST /api/care/appointments/:appointmentId/no-show": {
    method: "post",
    path: `/api/care/appointments/${APPOINTMENT_PATH}/no-show`,
    body: { expectedVersion: 0, idempotencyKey: KEY },
    forbid: NO_IDENTITY_CLAIM,
  },
  "GET /api/care/reviews": {
    method: "get",
    path: "/api/care/reviews",
    forbid: ALL_SENTINELS,
  },
  "GET /api/care/reviews/queue": {
    method: "get",
    path: "/api/care/reviews/queue",
    forbid: ALL_SENTINELS,
  },
  "GET /api/care/reviews/:reviewId": {
    method: "get",
    path: `/api/care/reviews/${REVIEW_PATH}`,
    // The detail projection reports the decision source deliberately, and its
    // reason does not claim otherwise, so it is not forbidden here.
    forbid: ["patientId", "clinicianUserId", "stateCode", "intakeAnswer"],
  },
  "GET /api/care/pharmacy/admin/readiness": {
    method: "get",
    path: "/api/care/pharmacy/admin/readiness",
    forbid: ALL_SENTINELS,
  },
};

describe("Care route coverage: a nonclinical reason is checked against the real response", () => {
  it("has a driven response proof for every route classified nonclinical", () => {
    const missing = Object.keys(NONCLINICAL_ROUTES).filter(
      (key) => !(key in RESPONSE_PROOFS),
    );
    // A nonclinical classification without a proof is an unchecked claim,
    // which is exactly the gap this block exists to close.
    expect(missing).toEqual([]);
    expect(Object.keys(RESPONSE_PROOFS).sort()).toEqual(
      Object.keys(NONCLINICAL_ROUTES).sort(),
    );
  });

  it.each(Object.entries(RESPONSE_PROOFS))(
    "%s returns none of the fields its reason says it drops",
    async (key, proof) => {
      const agent = request(proofApp(proof.serviceCoverageActive ?? true));
      const response =
        proof.method === "get"
          ? await agent.get(proof.path)
          : await agent.post(proof.path).send(proof.body ?? {});

      // A 4xx or 5xx proves nothing about the success payload, so a proof that
      // cannot reach a real response is a failed proof, not a passed one.
      expect(
        response.status,
        `${key} did not reach a success response: ${response.status} ${JSON.stringify(response.body)}`,
      ).toBeLessThan(300);

      const serialized = JSON.stringify(response.body);
      for (const sentinel of proof.forbid) {
        expect(
          serialized,
          `${key} leaked the ${sentinel} value its reason says it drops`,
        ).not.toContain(SENTINEL[sentinel]);
        for (const field of SENTINEL_FIELD_NAMES[sentinel]) {
          expect(
            serialized,
            `${key} carries the ${field} field its reason says it drops`,
          ).not.toContain(`"${field}"`);
        }
      }
    },
  );
});
