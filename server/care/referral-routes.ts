import type { Express, Response } from "express";
import { z } from "zod";
import type { CarePrincipal } from "@shared/care/contracts";
import {
  CARE_CLINICAL_CAPABILITIES_DISABLED,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import {
  CARE_REFERRAL_ROUTES,
  CARE_SERVICE_CATEGORIES,
  type CareReferral,
} from "@shared/care/referral";
import {
  screenCareConciergeMessage,
  type CareHandoffConfig,
} from "@shared/care/referral-handoff";
import {
  requireCarePermission,
  sendCareTemporarilyUnavailable,
  type CareAccessDependencies,
} from "./access";
import {
  availableServiceCategories,
  careHandoffFromEnv,
  selectCareReferralRouting,
} from "./referral";
import {
  guardedCareReferralRepository,
  type CareReferralRepository,
} from "./referral-repository";

const createBody = z
  .object({
    serviceCategory: z.enum(CARE_SERVICE_CATEGORIES),
    stateCode: z.string().trim().min(2).max(2),
  })
  .strict();

const conciergeBody = z
  .object({
    /** How to reach the person. Never what is wrong with them. */
    contactMethod: z.enum(["email", "phone"]),
    serviceCategory: z.enum(CARE_SERVICE_CATEGORIES),
    stateCode: z.string().trim().min(2).max(2),
    message: z.string(),
  })
  .strict();

export interface CareReferralDependencies {
  repository: CareReferralRepository;
  readFlags?: () => CareClinicalCapabilityFlags;
  handoff?: () => CareHandoffConfig;
  now?: () => Date;
  newReferralId?: () => string;
}

function principal(res: Response): CarePrincipal | null {
  return (res.locals.carePrincipal as CarePrincipal | undefined) ?? null;
}

function sendInvalidRequest(res: Response, code = "care_invalid_request") {
  return res.status(400).json({ ok: false, code });
}

/**
 * The bridge API.
 *
 * Every write runs through the guarded repository, so the data boundary is
 * enforced by code that a route cannot step around. The identity of the person
 * always comes from the authenticated principal and never from the body.
 */
export function registerCareReferralApi(
  app: Express,
  access: CareAccessDependencies,
  deps: CareReferralDependencies,
) {
  const repository = guardedCareReferralRepository(
    deps.repository,
    deps.readFlags ?? (() => CARE_CLINICAL_CAPABILITIES_DISABLED),
  );
  const handoff = deps.handoff ?? (() => careHandoffFromEnv());
  const now = deps.now ?? (() => new Date());
  const newReferralId =
    deps.newReferralId ?? (() => globalThis.crypto.randomUUID());

  // The person's own thin status, plus the truthful handoff configuration.
  app.get(
    CARE_REFERRAL_ROUTES.referrals,
    requireCarePermission("care:read_self", access),
    async (_req, res) => {
      const actor = principal(res);
      if (!actor?.patientId) return sendCareTemporarilyUnavailable(res);
      try {
        const referrals = await repository.listForUser(actor.patientId);
        res.json({ ok: true, referrals, handoff: handoff() });
      } catch {
        sendCareTemporarilyUnavailable(res);
      }
    },
  );

  // The operations queue. Thin status only, for every person.
  app.get(
    CARE_REFERRAL_ROUTES.queue,
    requireCarePermission("care:administer", access),
    async (_req, res) => {
      try {
        const referrals = await repository.listForOperations();
        res.json({ ok: true, referrals, handoff: handoff() });
      } catch {
        sendCareTemporarilyUnavailable(res);
      }
    },
  );

  // Create a referral. State aware, and refused rather than promised.
  app.post(
    CARE_REFERRAL_ROUTES.referrals,
    requireCarePermission("care:appointments_self", access),
    async (req, res) => {
      const actor = principal(res);
      if (!actor?.patientId) return sendCareTemporarilyUnavailable(res);
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) return sendInvalidRequest(res);

      try {
        const stateCode = parsed.data.stateCode.trim().toUpperCase();
        const coverage = await repository.loadCoverage(stateCode);
        const routing = selectCareReferralRouting({
          careEnabled: true,
          stateCode,
          serviceCategory: parsed.data.serviceCategory,
          coverage,
        });
        if (!routing.routable) {
          return res.status(409).json({
            ok: false,
            code: routing.reason,
            message: routing.publicMessage,
            waitlistAvailable: routing.waitlistAvailable,
            availableServiceCategories: availableServiceCategories(coverage),
          });
        }

        const configured = handoff();
        const timestamp = now().toISOString();
        const written = await repository.saveGuarded({
          referralId: newReferralId(),
          internalUserId: actor.patientId,
          emrVendor: "tebra",
          externalEmrId: null,
          serviceCategory: routing.serviceCategory,
          stateCode: routing.stateCode,
          // Never "scheduled". Xenios has not scheduled anything, and it will
          // not claim Tebra did.
          status: configured.configured ? "handoff_pending" : "draft",
          appointmentAt: null,
          operationsOwner: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          synchronizedAt: null,
          errorCode: configured.configured ? null : "handoff_not_configured",
        });
        if (!written.ok) return sendWriteRefusal(res, written);
        return res
          .status(201)
          .json({ ok: true, referral: written.referral, handoff: configured });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );

  // The concierge fallback. It is a contact request and nothing else, and the
  // server screens it whether or not the browser did.
  app.post(
    CARE_REFERRAL_ROUTES.concierge,
    requireCarePermission("care:appointments_self", access),
    async (req, res) => {
      const actor = principal(res);
      if (!actor?.patientId) return sendCareTemporarilyUnavailable(res);
      const parsed = conciergeBody.safeParse(req.body);
      if (!parsed.success) return sendInvalidRequest(res);

      const screen = screenCareConciergeMessage(parsed.data.message);
      if (!screen.ok) {
        // Nothing is written. The message is not echoed back, and it is not
        // logged, so a person who ignored the notice does not leave clinical
        // narrative in a Xenios record.
        return res.status(422).json({
          ok: false,
          code: "care_concierge_content_rejected",
          reason: screen.reason,
          marker: screen.marker,
          message: screen.message,
        });
      }

      try {
        const stateCode = parsed.data.stateCode.trim().toUpperCase();
        const coverage = await repository.loadCoverage(stateCode);
        const routing = selectCareReferralRouting({
          careEnabled: true,
          stateCode,
          serviceCategory: parsed.data.serviceCategory,
          coverage,
        });
        if (!routing.routable) {
          return res.status(409).json({
            ok: false,
            code: routing.reason,
            message: routing.publicMessage,
            waitlistAvailable: routing.waitlistAvailable,
            availableServiceCategories: availableServiceCategories(coverage),
          });
        }

        const timestamp = now().toISOString();
        const written = await repository.saveGuarded({
          referralId: newReferralId(),
          internalUserId: actor.patientId,
          emrVendor: "tebra",
          externalEmrId: null,
          serviceCategory: routing.serviceCategory,
          stateCode: routing.stateCode,
          status: "draft",
          appointmentAt: null,
          operationsOwner: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          synchronizedAt: null,
          errorCode: "handoff_not_configured",
        });
        if (!written.ok) return sendWriteRefusal(res, written);
        // The contact method is the person's own account detail, so it is not
        // copied onto the referral. Nothing is sent anywhere from here.
        return res.status(201).json({
          ok: true,
          referral: written.referral,
          contactMethod: parsed.data.contactMethod,
          dispatched: false,
        });
      } catch {
        return sendCareTemporarilyUnavailable(res);
      }
    },
  );
}

function sendWriteRefusal(
  res: Response,
  refusal: { code: string; field: string | null; message: string },
) {
  if (refusal.code === "capability_disabled") {
    return res
      .status(503)
      .json({ ok: false, code: "care_referrals_disabled", message: refusal.message });
  }
  return res.status(422).json({
    ok: false,
    code: refusal.code,
    field: refusal.field,
    message: refusal.message,
  });
}
