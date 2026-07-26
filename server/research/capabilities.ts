import type { Express } from "express";
import type {
  AdminCapabilityDiagnostic,
  MemberCapabilitiesPayload,
  MemberPlatformCapability,
} from "@shared/research/member-platform";
import { MEMBER_PLATFORM_CAPABILITIES } from "@shared/research/member-platform";
import { requireActiveMember } from "./member-auth";
import { requireSupabaseAdmin } from "../routes";
import { healthAssessmentCollectionReady } from "./agreements";

// ---------------------------------------------------------------------------
// xenios research member platform: capability registry (G0 contract).
//
// Member-safe endpoint returns booleans ONLY. Admin diagnostics return
// missing environment-variable NAMES and approval labels, never values.
// Every capability here is keys-later by design: absent credentials mean a
// truthful disabled state, not a crash and not a fake success.
// ---------------------------------------------------------------------------

type CapabilityDefinition = {
  requiredEnv: string[];
  missingApprovals: string[];
  dynamicMissingApprovals?: () => string[];
  enabled?: () => boolean;
  flagEnv?: string; // additional explicit opt-in flag, default false
};

const DEFINITIONS: Record<MemberPlatformCapability, CapabilityDefinition> = {
  identity_verification: {
    requiredEnv: ["IDENTITY_PROVIDER", "IDENTITY_API_KEY", "IDENTITY_WEBHOOK_SECRET"],
    missingApprovals: ["identity provider contract and counsel-approved consent"],
    flagEnv: "RESEARCH_IDENTITY_ENABLED",
  },
  private_media: {
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEARCH_MEDIA_BUCKET"],
    missingApprovals: [],
    flagEnv: "RESEARCH_PRIVATE_MEDIA_ENABLED",
  },
  telegram_support: {
    requiredEnv: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_BOT_USERNAME"],
    missingApprovals: [],
    flagEnv: "RESEARCH_TELEGRAM_ENABLED",
  },
  infinity_events: {
    requiredEnv: ["INFINITY_EVENT_URL", "INFINITY_EVENT_SECRET"],
    missingApprovals: [],
    flagEnv: "RESEARCH_INFINITY_ENABLED",
  },
  document_rendering: {
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    missingApprovals: [],
    flagEnv: "RESEARCH_DOCUMENT_RENDERING_ENABLED",
  },
  assessment: {
    requiredEnv: [],
    missingApprovals: [],
    dynamicMissingApprovals: () =>
      healthAssessmentCollectionReady()
        ? []
        : ["counsel-approved immutable XR-MEM-012 consent"],
    flagEnv: "RESEARCH_HEALTH_DATA_ENABLED",
    enabled: healthAssessmentCollectionReady,
  },
};

function missingEnv(definition: CapabilityDefinition): string[] {
  return definition.requiredEnv.filter((name) => !process.env[name]);
}

function flagOn(definition: CapabilityDefinition): boolean {
  if (!definition.flagEnv) return true;
  return process.env[definition.flagEnv] === "true";
}

export function capabilityEnabled(capability: MemberPlatformCapability): boolean {
  const definition = DEFINITIONS[capability];
  return definition.enabled
    ? definition.enabled()
    : flagOn(definition) && missingEnv(definition).length === 0;
}

export function memberCapabilities(): MemberCapabilitiesPayload["capabilities"] {
  const out = {} as MemberCapabilitiesPayload["capabilities"];
  for (const capability of MEMBER_PLATFORM_CAPABILITIES) {
    out[capability] = { enabled: capabilityEnabled(capability) };
  }
  return out;
}

export function adminCapabilityDiagnostics(now: Date): AdminCapabilityDiagnostic[] {
  return MEMBER_PLATFORM_CAPABILITIES.map((capability) => {
    const definition = DEFINITIONS[capability];
    const missing = missingEnv(definition);
    const missingApprovals =
      definition.dynamicMissingApprovals?.() ?? definition.missingApprovals;
    const state: AdminCapabilityDiagnostic["state"] = capabilityEnabled(capability)
      ? "enabled"
      : !flagOn(definition)
        ? "disabled"
        : missing.length > 0
          ? "pending_credentials"
          : missingApprovals.length > 0
            ? "pending_approval"
            : "misconfigured";
    return {
      capability,
      state,
      missingEnvironmentVariables: missing, // names only, never values
      missingApprovals,
      checkedAt: now.toISOString(),
    };
  });
}

export function registerCapabilityApi(app: Express, clockNow: () => Date) {
  app.get("/api/research/capabilities", requireActiveMember, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.json({ ok: true, capabilities: memberCapabilities() });
  });

  app.get("/api/admin/research/capabilities", requireSupabaseAdmin, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.json({ ok: true, diagnostics: adminCapabilityDiagnostics(clockNow()) });
  });
}
