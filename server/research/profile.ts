import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  PROFILE_SECTION_KEYS,
  RETENTION_ELECTIONS,
  SENSITIVE_PROFILE_SECTIONS,
  type MemberProfileView,
  type ProfileSection,
  type ProfileSectionKey,
} from "@shared/research/member-platform";
import { getSupabaseAdmin } from "../supabase";
import { requireActiveMember, type MemberRow } from "./member-auth";
import { rateLimitHit } from "./rate-limit";
import type { MemberPlatformDeps } from "./member-platform-deps";

// ---------------------------------------------------------------------------
// xenios research member profile (member platform G2).
//
// Structured, version-safe profile sections. Each of the 17 section keys has
// a server-owned zod schema at a current schema version; every write is
// validated against it and every schema is .strict() so unknown fields are
// rejected instead of silently stored. Health-adjacent sections
// (SENSITIVE_PROFILE_SECTIONS) are served ONLY through the sensitive
// endpoint, so ordinary account surfaces never fetch them. Section payloads
// are the member's own words about routine and preferences; there are no
// free-form medical history fields anywhere in the registry, and section
// contents are never logged.
// ---------------------------------------------------------------------------

const PROFILE_SECTIONS_TABLE = "research_member_profile_sections";

type SectionRow = {
  id: string;
  member_id: string;
  section_key: string;
  schema_version: number;
  data: Record<string, unknown> | null;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Section schema registry (schemaVersion 1 for every section).
//
// Honest but light: known fields with bounds, matching the canon. A future
// shape change bumps that section's version here; clients holding the old
// version get state_conflict and refetch. Free-text stays short and bounded.
// ---------------------------------------------------------------------------

const shortText = (max: number) => z.string().trim().min(1).max(max);
const textList = (maxItems: number, maxLength: number) =>
  z.array(shortText(maxLength)).max(maxItems);

type SectionRegistryEntry = { version: number; schema: z.ZodTypeAny };

export const PROFILE_SECTION_REGISTRY: Record<ProfileSectionKey, SectionRegistryEntry> = {
  basic_information: {
    version: 1,
    schema: z
      .object({
        preferredName: shortText(80).optional(),
        pronouns: z.string().trim().max(40).optional(),
        country: z.string().trim().max(56).optional(),
        timezone: z.string().trim().max(64).optional(),
        occupation: z.string().trim().max(80).optional(),
      })
      .strict(),
  },
  goals: {
    version: 1,
    schema: z
      .object({
        primaryGoal: shortText(200),
        secondaryGoals: textList(5, 200).default([]),
        motivation: z.string().trim().max(500).optional(),
      })
      .strict(),
  },
  body_and_routine: {
    version: 1,
    schema: z
      .object({
        heightCm: z.number().min(100).max(250).optional(),
        weightKg: z.number().min(30).max(300).optional(),
        activityLevel: z
          .enum(["sedentary", "lightly_active", "moderately_active", "very_active"])
          .optional(),
        typicalDayDescription: z.string().trim().max(300).optional(),
      })
      .strict(),
  },
  fitness: {
    version: 1,
    schema: z
      .object({
        trainingExperience: z.enum(["none", "beginner", "intermediate", "advanced"]).optional(),
        trainingStyles: textList(10, 60).default([]),
        sessionsPerWeek: z.number().int().min(0).max(14).optional(),
        equipmentAccess: z.enum(["none", "home_basic", "home_full", "commercial_gym"]).optional(),
      })
      .strict(),
  },
  nutrition: {
    version: 1,
    schema: z
      .object({
        mealsPerDay: z.number().int().min(1).max(8).optional(),
        cooksAtHome: z.enum(["rarely", "sometimes", "often"]).optional(),
        hydrationCupsPerDay: z.number().int().min(0).max(30).optional(),
        eatingPattern: z.string().trim().max(60).optional(),
      })
      .strict(),
  },
  sleep: {
    version: 1,
    schema: z
      .object({
        averageHoursPerNight: z.number().min(0).max(16).optional(),
        bedtimeConsistency: z.enum(["consistent", "varies", "shift_work"]).optional(),
        wakeRested: z.enum(["rarely", "sometimes", "often"]).optional(),
      })
      .strict(),
  },
  energy: {
    version: 1,
    schema: z
      .object({
        typicalEnergyLevel: z.number().int().min(1).max(10).optional(),
        afternoonDip: z.boolean().optional(),
        caffeineServingsPerDay: z.number().int().min(0).max(20).optional(),
      })
      .strict(),
  },
  stress: {
    version: 1,
    schema: z
      .object({
        typicalStressLevel: z.number().int().min(1).max(10).optional(),
        primaryStressors: textList(5, 100).default([]),
        recoveryPractices: textList(10, 100).default([]),
      })
      .strict(),
  },
  current_products: {
    version: 1,
    schema: z
      .object({
        products: z
          .array(
            z
              .object({
                name: shortText(120),
                purpose: z.string().trim().max(200).optional(),
              })
              .strict(),
          )
          .max(30)
          .default([]),
      })
      .strict(),
  },
  allergies_and_restrictions: {
    version: 1,
    schema: z
      .object({
        allergies: textList(30, 100).default([]),
        restrictions: textList(30, 100).default([]),
        noPork: z.boolean().optional(),
      })
      .strict(),
  },
  // Short structured flags only; the notes field is bounded and this section
  // is deliberately NOT a medical history.
  basic_safety_context: {
    version: 1,
    schema: z
      .object({
        injuries: textList(20, 120).default([]),
        conditionsDisclosed: z.boolean().default(false),
        notes: z.string().trim().max(500).optional(),
      })
      .strict(),
  },
  budget: {
    version: 1,
    schema: z
      .object({
        monthlyBudgetRange: z.enum(["under_50", "50_100", "100_250", "250_500", "over_500"]),
      })
      .strict(),
  },
  routine_complexity: {
    version: 1,
    schema: z
      .object({
        preferredComplexity: z.enum(["minimal", "moderate", "detailed"]).optional(),
        maxDailyMinutes: z.number().int().min(0).max(240).optional(),
      })
      .strict(),
  },
  format_preferences: {
    version: 1,
    schema: z
      .object({
        preferredFormats: z.array(z.enum(["pdf", "video", "audio", "text"])).max(4).default([]),
        wantsPrintable: z.boolean().optional(),
      })
      .strict(),
  },
  communication_preferences: {
    version: 1,
    schema: z
      .object({
        preferredChannel: z.enum(["email", "telegram", "web_only"]).optional(),
        checkInReminders: z.boolean().optional(),
        reminderTimeOfDay: z.enum(["morning", "midday", "evening"]).optional(),
      })
      .strict(),
  },
  // The standing raw-media election mirrors the private-media contract: there
  // is no automatic-delete default, the member chooses.
  media_settings: {
    version: 1,
    schema: z
      .object({
        defaultRetentionElection: z.enum(RETENTION_ELECTIONS),
        faceBlurByDefault: z.boolean().optional(),
      })
      .strict(),
  },
  // Opt-in areas default OFF; absence of a row means nothing is enabled.
  privacy_choices: {
    version: 1,
    schema: z
      .object({
        sexualWellnessEnabled: z.boolean().default(false),
        marketingOptIn: z.boolean().optional(),
      })
      .strict(),
  },
};

const SECTION_ORDER = new Map<ProfileSectionKey, number>(
  PROFILE_SECTION_KEYS.map((key, index) => [key, index]),
);
const SENSITIVE_SET = new Set<ProfileSectionKey>(SENSITIVE_PROFILE_SECTIONS);

const updateEnvelope = z
  .object({
    section: z.enum(PROFILE_SECTION_KEYS),
    schemaVersion: z.number().int(),
    data: z.record(z.unknown()),
  })
  .strict();

// zod's flatten() puts strict-mode unrecognized_keys issues in formErrors
// (root path); the contract wants them under the offending field name so the
// UI can highlight the exact input.
function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (key: string, message: string) => {
    (out[key] ??= []).push(message);
  };
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) add(key, "Unknown field.");
      continue;
    }
    add(issue.path.length ? issue.path.join(".") : "_", issue.message);
  }
  return out;
}

function setMemberHeaders(res: Response) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function memberOf(req: Request): MemberRow | undefined {
  return (req as { researchMember?: MemberRow }).researchMember;
}

function toSection(row: SectionRow): ProfileSection {
  return {
    key: row.section_key as ProfileSectionKey,
    schemaVersion: row.schema_version,
    data: row.data ?? {},
    updatedAt: row.updated_at,
  };
}

// Every read filters by the authenticated member id; there is no path that
// lists another member's rows.
async function listSectionRows(memberId: string): Promise<SectionRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(PROFILE_SECTIONS_TABLE)
    .select("*")
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as SectionRow[]).filter((row) =>
    SECTION_ORDER.has(row.section_key as ProfileSectionKey),
  );
  rows.sort(
    (a, b) =>
      (SECTION_ORDER.get(a.section_key as ProfileSectionKey) ?? 0) -
      (SECTION_ORDER.get(b.section_key as ProfileSectionKey) ?? 0),
  );
  return rows;
}

async function upsertSectionRow(
  memberId: string,
  key: ProfileSectionKey,
  version: number,
  data: Record<string, unknown>,
  nowIso: string,
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: existing, error: readError } = await db
    .from(PROFILE_SECTIONS_TABLE)
    .select("id")
    .eq("member_id", memberId)
    .eq("section_key", key)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) {
    const { error } = await db
      .from(PROFILE_SECTIONS_TABLE)
      .update({ data, schema_version: version, updated_at: nowIso })
      .eq("id", existing.id)
      .eq("member_id", memberId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error: insertError } = await db
    .from(PROFILE_SECTIONS_TABLE)
    .insert({ member_id: memberId, section_key: key, schema_version: version, data, updated_at: nowIso });
  if (!insertError) return;
  // A concurrent first save for the same section hits the unique constraint;
  // converge on the update path. Any other insert failure is a real error.
  if (!/duplicate|unique/i.test(insertError.message ?? "")) throw new Error(insertError.message);
  const { error: retryError } = await db
    .from(PROFILE_SECTIONS_TABLE)
    .update({ data, schema_version: version, updated_at: nowIso })
    .eq("member_id", memberId)
    .eq("section_key", key);
  if (retryError) throw new Error(retryError.message);
}

export function registerProfileApi(app: Express, deps: MemberPlatformDeps) {
  // Non-sensitive sections plus completeness. Completeness COUNTS every
  // completed section (sensitive included) but the section list never carries
  // sensitive content; ordinary account surfaces call only this endpoint.
  app.get("/api/research/profile", requireActiveMember, async (req, res: Response) => {
    setMemberHeaders(res);
    const member = memberOf(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    try {
      const rows = await listSectionRows(member.id);
      const completedSections = new Set(rows.map((row) => row.section_key)).size;
      const profile: MemberProfileView = {
        memberId: member.id,
        sections: rows
          .filter((row) => !SENSITIVE_SET.has(row.section_key as ProfileSectionKey))
          .map(toSection),
        completeness: { completedSections, totalSections: PROFILE_SECTION_KEYS.length },
      };
      res.json({ ok: true, profile });
    } catch (err) {
      console.error("[research profile] read failed:", err);
      res.status(500).json({ ok: false, message: "The profile could not be loaded." });
    }
  });

  // The sensitive set only, on its own endpoint, so health-adjacent data is
  // fetched exclusively by surfaces that explicitly need it.
  app.get("/api/research/profile/sensitive", requireActiveMember, async (req, res: Response) => {
    setMemberHeaders(res);
    const member = memberOf(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    try {
      const rows = await listSectionRows(member.id);
      const sections = rows
        .filter((row) => SENSITIVE_SET.has(row.section_key as ProfileSectionKey))
        .map(toSection);
      res.json({ ok: true, sections });
    } catch (err) {
      console.error("[research profile] sensitive read failed:", err);
      res.status(500).json({ ok: false, message: "The profile could not be loaded." });
    }
  });

  // One section per call. The write is scoped to the authenticated member;
  // the body cannot name a member and the strict envelope rejects attempts.
  app.put("/api/research/profile", requireActiveMember, async (req, res: Response) => {
    setMemberHeaders(res);
    const member = memberOf(req);
    if (!member) return res.status(403).json({ ok: false, code: "membership_inactive" });
    try {
      const allowed = await rateLimitHit(`research_profile_put:${member.id}`, 60, 30);
      if (!allowed) {
        return res.status(429).json({
          ok: false,
          code: "rate_limited",
          message: "Too many profile updates. Please wait a moment.",
        });
      }

      const envelope = updateEnvelope.safeParse(req.body);
      if (!envelope.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: fieldErrorsFromZod(envelope.error),
        });
      }

      const { section, schemaVersion } = envelope.data;
      const entry = PROFILE_SECTION_REGISTRY[section];
      if (schemaVersion !== entry.version) {
        return res.status(409).json({
          ok: false,
          code: "state_conflict",
          message: `Profile section "${section}" is at schema version ${entry.version}. Reload the profile and try again.`,
        });
      }

      const parsed = entry.schema.safeParse(envelope.data.data);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "validation_failed",
          fieldErrors: fieldErrorsFromZod(parsed.error),
        });
      }

      const data = parsed.data as Record<string, unknown>;
      const nowIso = deps.clock.now().toISOString();
      await upsertSectionRow(member.id, section, entry.version, data, nowIso);

      const sectionView: ProfileSection = {
        key: section,
        schemaVersion: entry.version,
        data,
        updatedAt: nowIso,
      };
      res.json({ ok: true, section: sectionView });
    } catch (err) {
      console.error("[research profile] write failed:", err);
      res.status(500).json({ ok: false, message: "The profile could not be saved." });
    }
  });
}
