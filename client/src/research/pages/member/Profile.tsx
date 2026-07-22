import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { type ApiResult } from "../../lib/api";
import { getProfile } from "../../adapters/member";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";

// ---------------------------------------------------------------------------
// Member profile (/research/member/profile). Read-only, structured sections.
// Every value comes from GET /api/research/member/profile; a missing endpoint
// or a missing section renders an honest empty state pointing at the
// assessment (the only place these answers originate today). Editing is
// deliberately disabled: the per-section edit contract is unpublished, so the
// buttons render disabled with a truthful note instead of pretending.
// ---------------------------------------------------------------------------

type ProfileFieldValue = string | number | string[] | null | undefined;
type ProfileSectionData = Record<string, ProfileFieldValue>;
type ProfileData = Record<string, ProfileSectionData | undefined>;

interface ProfileResponse {
  profile?: ProfileData;
  updatedAt?: string | null;
}

interface FieldDef {
  key: string;
  label: string;
}

interface SectionDef {
  key: string;
  title: string;
  description: string;
  sensitive: boolean;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    key: "basic",
    title: "Basic information",
    description: "Who you are and how we address you.",
    sensitive: false,
    fields: [
      { key: "fullName", label: "Full name" },
      { key: "preferredName", label: "Preferred name" },
      { key: "dateOfBirth", label: "Date of birth" },
      { key: "location", label: "Location" },
      { key: "timezone", label: "Time zone" },
    ],
  },
  {
    key: "goals",
    title: "Goals",
    description: "What you are working toward and why it matters to you.",
    sensitive: false,
    fields: [
      { key: "primaryGoal", label: "Primary goal" },
      { key: "secondaryGoals", label: "Secondary goals" },
      { key: "timeline", label: "Timeline" },
      { key: "motivation", label: "What is driving this" },
    ],
  },
  {
    key: "routine",
    title: "Routine",
    description: "The shape of your typical week.",
    sensitive: false,
    fields: [
      { key: "wakeTime", label: "Typical wake time" },
      { key: "workSchedule", label: "Work schedule" },
      { key: "trainingDays", label: "Training days" },
      { key: "travelFrequency", label: "Travel frequency" },
    ],
  },
  {
    key: "fitness",
    title: "Fitness",
    description: "Training history and current activity.",
    sensitive: false,
    fields: [
      { key: "trainingExperience", label: "Training experience" },
      { key: "currentActivity", label: "Current activity" },
      { key: "sessionsPerWeek", label: "Sessions per week" },
      { key: "limitations", label: "Movement limitations" },
    ],
  },
  {
    key: "nutrition",
    title: "Nutrition",
    description: "How you currently eat.",
    sensitive: false,
    fields: [
      { key: "eatingPattern", label: "Eating pattern" },
      { key: "mealsPerDay", label: "Meals per day" },
      { key: "cookingFrequency", label: "Cooking frequency" },
      { key: "hydration", label: "Daily hydration" },
    ],
  },
  {
    key: "sleep",
    title: "Sleep",
    description: "Your sleep pattern and quality.",
    sensitive: true,
    fields: [
      { key: "typicalHours", label: "Typical hours per night" },
      { key: "quality", label: "Sleep quality" },
      { key: "consistency", label: "Schedule consistency" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    key: "energyStress",
    title: "Energy and stress",
    description: "How your energy and stress levels run day to day.",
    sensitive: true,
    fields: [
      { key: "energyLevel", label: "Typical energy level" },
      { key: "stressLevel", label: "Typical stress level" },
      { key: "stressSources", label: "Main sources of stress" },
      { key: "recoveryPractices", label: "Recovery practices" },
    ],
  },
  {
    key: "currentProducts",
    title: "Current products",
    description: "Products and supplements you currently use.",
    sensitive: true,
    fields: [
      { key: "products", label: "Currently using" },
      { key: "duration", label: "How long" },
      { key: "priorExperience", label: "Prior experience" },
    ],
  },
  {
    key: "allergies",
    title: "Allergies and restrictions",
    description: "Anything the review team must know before recommendations.",
    sensitive: true,
    fields: [
      { key: "allergies", label: "Allergies" },
      { key: "dietaryRestrictions", label: "Dietary restrictions" },
      { key: "avoidList", label: "Things to avoid" },
    ],
  },
  {
    key: "budget",
    title: "Budget",
    description: "What you are comfortable investing monthly.",
    sensitive: false,
    fields: [
      { key: "monthlyRange", label: "Monthly range" },
      { key: "flexibility", label: "Flexibility" },
    ],
  },
  {
    key: "preferences",
    title: "Preferences",
    description: "How you like to work and what formats suit you.",
    sensitive: false,
    fields: [
      { key: "coachingStyle", label: "Preferred style" },
      { key: "contentFormats", label: "Preferred formats" },
      { key: "checkInCadence", label: "Check-in cadence" },
    ],
  },
  {
    key: "communications",
    title: "Communications",
    description: "Where and how we reach you.",
    sensitive: false,
    fields: [
      { key: "email", label: "Email" },
      { key: "preferredChannel", label: "Preferred channel" },
      { key: "quietHours", label: "Quiet hours" },
    ],
  },
  {
    key: "privacyMedia",
    title: "Privacy and media settings",
    description: "Your choices about photos, voice notes, and data use.",
    sensitive: true,
    fields: [
      { key: "progressPhotos", label: "Progress photos" },
      { key: "voiceNotes", label: "Voice notes" },
      { key: "dataSharing", label: "Data sharing" },
    ],
  },
];

// Development-only sample so the layout is reviewable locally. In production
// this is null and every section renders its honest empty state instead.
function fixtureProfile(): ProfileData {
  return {
    basic: {
      fullName: "Jordan Avery",
      preferredName: "Jordan",
      location: "Houston, TX",
      timezone: "Central (CT)",
    },
    goals: {
      primaryGoal: "Body recomposition",
      secondaryGoals: ["Better sleep", "More consistent energy"],
      timeline: "Six months",
      motivation: "Show up fully for work and family.",
    },
    routine: {
      wakeTime: "6:00 am",
      workSchedule: "Weekdays, mostly at a desk",
      trainingDays: ["Monday", "Wednesday", "Friday"],
    },
    fitness: {
      trainingExperience: "Three years of consistent lifting",
      currentActivity: "Strength training plus weekend walks",
      sessionsPerWeek: 3,
    },
    nutrition: {
      eatingPattern: "Three meals, high protein",
      mealsPerDay: 3,
      cookingFrequency: "Most nights",
    },
    sleep: {
      typicalHours: "6.5",
      quality: "Fair",
      consistency: "Weekdays consistent, weekends late",
    },
    energyStress: {
      energyLevel: "Afternoon dips",
      stressLevel: "Moderate",
      stressSources: ["Work deadlines"],
    },
    currentProducts: {
      products: ["Creatine", "Whey protein"],
      duration: "Over a year",
    },
    allergies: {
      allergies: ["None reported"],
      dietaryRestrictions: ["No pork"],
    },
    budget: {
      monthlyRange: "$100 to $200",
      flexibility: "Some",
    },
    preferences: {
      coachingStyle: "Direct, structured",
      contentFormats: ["Short written guides"],
      checkInCadence: "Monthly",
    },
    communications: {
      email: "jordan@example.com",
      preferredChannel: "Email",
    },
    privacyMedia: {
      progressPhotos: "Enabled, private",
      voiceNotes: "Disabled",
      dataSharing: "Review team only",
    },
  };
}

function formatValue(value: ProfileFieldValue): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const parts = value.filter((v) => typeof v === "string" && v.trim().length > 0);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "number") return String(value);
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function SectionCard({
  section,
  data,
}: {
  section: SectionDef;
  data: ProfileSectionData | undefined;
}) {
  const filled = section.fields
    .map((f) => ({ field: f, value: formatValue(data?.[f.key]) }))
    .filter((f) => f.value !== null);
  const editNoteId = `profile-edit-note-${section.key}`;
  return (
    <section className="card" aria-labelledby={`profile-section-${section.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <h2 id={`profile-section-${section.key}`} className="body-m font-700">
            {section.title}
          </h2>
          <p className="body-s text-ink-mute mt-1">{section.description}</p>
        </div>
        <div className="flex items-center gap-3">
          {filled.length > 0 && <ResearchStatusBadge label="On file" tone="success" />}
          <button
            type="button"
            className="btn btn-ghost"
            disabled
            aria-disabled="true"
            aria-describedby={editNoteId}
          >
            Edit
          </button>
        </div>
      </div>
      <p id={editNoteId} className="body-s text-ink-mute mt-2">
        Editing opens with the member platform update.
      </p>
      {filled.length > 0 ? (
        <dl className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {filled.map(({ field, value }) => (
            <div key={field.key}>
              <dt className="mono-label text-ink-mute">{field.label}</dt>
              <dd className="body-s text-ink-2 mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-4">
          <p className="body-s text-ink-2">
            Nothing on file for this section yet. Complete this in your assessment and it will appear here.
          </p>
          <Link href={MEMBER_ROUTES.assessment} className="btn btn-secondary mt-3 inline-block">
            Go to your assessment
          </Link>
        </div>
      )}
      {section.sensitive && (
        <div className="mt-4">
          <ResearchSecureNotice>
            This section is sensitive. It is stored securely and visible only to you and the review team.
          </ResearchSecureNotice>
        </div>
      )}
    </section>
  );
}

export default function Profile() {
  const { memberToken } = useResearch();
  const [result, setResult] = useState<ApiResult<ProfileResponse> | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    const res = await getProfile<ProfileResponse>(memberToken);
    setResult(res);
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Route state: "unavailable" is NOT terminal here; the page still renders
  // the section scaffold with per-section honest empty states (the endpoint
  // contract is not published yet, and pretending would be worse).
  const state: "loading" | "ok" | "error" | "unauthorized" =
    result === null
      ? "loading"
      : result.kind === "error"
        ? "error"
        : result.kind === "unauthorized"
          ? "unauthorized"
          : "ok";

  const profile: ProfileData | null =
    result?.kind === "ok"
      ? result.data.profile ?? null
      : result?.kind === "unavailable" || result?.kind === "forbidden"
        ? devFixture(fixtureProfile)
        : null;

  const updatedAt = result?.kind === "ok" ? result.data.updatedAt ?? null : null;

  return (
    <ResearchMemberShell
      title="Profile"
      lead="Everything the review team knows about you, in one place. Your assessment answers build this profile."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={result?.kind === "error" ? result.message : undefined}
        onRetry={() => void load()}
      >
        {result?.kind === "unavailable" && profile === null && (
          <div className="card mb-6" role="status">
            <p className="body-m font-700">Your profile view is being prepared.</p>
            <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
              Nothing is wrong with your account. Your assessment answers are stored safely and will appear
              here section by section when the member platform publishes this view.
            </p>
          </div>
        )}
        {updatedAt && (
          <p className="mono-label text-ink-mute mb-4">Last updated {updatedAt}</p>
        )}
        <div className="grid gap-6">
          {SECTIONS.map((section) => (
            <SectionCard key={section.key} section={section} data={profile?.[section.key]} />
          ))}
        </div>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
