import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileSection, ProfileSectionKey } from "@shared/research/member-platform";
import { PROFILE_SECTION_KEYS, SENSITIVE_PROFILE_SECTIONS } from "@shared/research/member-platform";
import { useResearch } from "../../core";
import {
  getProfile,
  getSensitiveProfile,
  type ProfileResponse,
  type SensitiveProfileResponse,
} from "../../adapters/member";
import type { ApiResult } from "../../lib/api";
import { ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { ResearchMemberShell } from "../../ui/shells";

const SENSITIVE = new Set<ProfileSectionKey>(SENSITIVE_PROFILE_SECTIONS);
const PROFILE_KEYS = new Set<string>(PROFILE_SECTION_KEYS);

function isSection(value: unknown): value is ProfileSection {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ProfileSection>;
  return typeof row.key === "string"
    && PROFILE_KEYS.has(row.key)
    && Number.isInteger(row.schemaVersion)
    && row.schemaVersion! > 0
    && !!row.data
    && typeof row.data === "object"
    && !Array.isArray(row.data)
    && typeof row.updatedAt === "string";
}

function profileValid(value: ProfileResponse): boolean {
  return value?.ok === true
    && typeof value.profile?.memberId === "string"
    && Array.isArray(value.profile?.sections)
    && value.profile.sections.every((section) => isSection(section) && !SENSITIVE.has(section.key))
    && Number.isInteger(value.profile?.completeness?.completedSections)
    && Number.isInteger(value.profile?.completeness?.totalSections);
}

function sensitiveValid(value: SensitiveProfileResponse): boolean {
  return value?.ok === true
    && Array.isArray(value.sections)
    && value.sections.every((section) => isSection(section) && SENSITIVE.has(section.key));
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ");
  return "Saved securely";
}

function SectionCard({ section }: { section: ProfileSection }) {
  const sensitive = SENSITIVE.has(section.key);
  return (
    <section className="card" aria-labelledby={`profile-${section.key}`}>
      <h2 id={`profile-${section.key}`} className="body-m font-700">
        {section.key.replaceAll("_", " ")}
      </h2>
      <p className="mono-label text-ink-mute mt-1">
        Updated {new Date(section.updatedAt).toLocaleDateString()}
      </p>
      <dl className="grid gap-3 mt-4">
        {Object.entries(section.data).map(([key, value]) => (
          <div key={key}>
            <dt className="mono-label text-ink-mute">{key.replaceAll("_", " ")}</dt>
            <dd className="body-s text-ink-2 mt-1">{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
      {sensitive && (
        <div className="mt-4">
          <ResearchSecureNotice>
            Sensitive profile information is loaded separately and remains visible only to you and the review team.
          </ResearchSecureNotice>
        </div>
      )}
    </section>
  );
}

type LoadState = {
  ordinary: ApiResult<ProfileResponse> | null;
  sensitive: ApiResult<SensitiveProfileResponse> | null;
};

export default function Profile() {
  const { memberToken } = useResearch();
  const [loadState, setLoadState] = useState<LoadState>({ ordinary: null, sensitive: null });

  const load = useCallback(async () => {
    setLoadState({ ordinary: null, sensitive: null });
    const [ordinary, sensitive] = await Promise.all([
      getProfile(memberToken),
      getSensitiveProfile(memberToken),
    ]);
    setLoadState({ ordinary, sensitive });
  }, [memberToken]);

  useEffect(() => {
    let current = true;
    setLoadState({ ordinary: null, sensitive: null });
    void Promise.all([getProfile(memberToken), getSensitiveProfile(memberToken)]).then(([ordinary, sensitive]) => {
      if (current) setLoadState({ ordinary, sensitive });
    });
    return () => { current = false; };
  }, [memberToken]);

  const state = useMemo(() => {
    const { ordinary, sensitive } = loadState;
    if (!ordinary || !sensitive) return { kind: "loading" as const };
    if (ordinary.kind === "unauthorized" || sensitive.kind === "unauthorized") return { kind: "unauthorized" as const };
    if (ordinary.kind === "unavailable" || sensitive.kind === "unavailable"
      || ordinary.kind === "forbidden" || sensitive.kind === "forbidden"
      || ordinary.kind === "denied" || sensitive.kind === "denied") return { kind: "unavailable" as const };
    if (ordinary.kind === "error") return { kind: "error" as const, message: ordinary.message };
    if (sensitive.kind === "error") return { kind: "error" as const, message: sensitive.message };
    if (ordinary.kind !== "ok" || sensitive.kind !== "ok") {
      return { kind: "error" as const, message: "The profile response was incomplete." };
    }
    if (!profileValid(ordinary.data) || !sensitiveValid(sensitive.data)) {
      return { kind: "error" as const, message: "The profile response was incomplete." };
    }
    return {
      kind: "ok" as const,
      sections: [...ordinary.data.profile.sections, ...sensitive.data.sections],
      completeness: ordinary.data.profile.completeness,
    };
  }, [loadState]);

  return (
    <ResearchMemberShell title="Profile" lead="Your saved profile sections and completion status.">
      <ResearchRouteBoundary
        state={state.kind}
        errorMessage={state.kind === "error" ? state.message : undefined}
        unavailableTitle="Your profile is unavailable."
        unavailableBody="The member profile service is not available. No information has been inferred or filled in."
        onRetry={() => void load()}
      >
        {state.kind === "ok" && (
          <>
            <p className="body-s text-ink-2 mb-5" role="status">
              {state.completeness.completedSections} of {state.completeness.totalSections} sections complete.
            </p>
            {state.sections.length === 0 ? (
              <p className="card body-s">No profile sections are on file yet.</p>
            ) : (
              <div className="grid gap-5">
                {state.sections.map((section) => <SectionCard key={section.key} section={section} />)}
              </div>
            )}
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
