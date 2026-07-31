import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileSection } from "@shared/research/member-platform";
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

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "Not provided";
}

function SectionCard({ section, sensitive = false }: { section: ProfileSection; sensitive?: boolean }) {
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
    const ordinaryKeys = new Set(ordinary.data.profile.sections.map((section) => section.key));
    if (sensitive.data.sections.some((section) => ordinaryKeys.has(section.key))) {
      return { kind: "error" as const, message: "The profile response was incomplete." };
    }
    return {
      kind: "ok" as const,
      ordinarySections: ordinary.data.profile.sections,
      sensitiveSections: sensitive.data.sections,
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
            <button type="button" className="btn btn-secondary mb-5" onClick={() => void load()}>
              Refresh profile
            </button>
            {state.ordinarySections.length === 0 && state.sensitiveSections.length === 0 ? (
              <p className="card body-s">No profile sections are on file yet.</p>
            ) : (
              <>
                {state.ordinarySections.length > 0 && (
                  <section aria-labelledby="ordinary-profile-sections">
                    <h2 id="ordinary-profile-sections" className="body-l font-700 mb-4">Profile details</h2>
                    <div className="grid gap-5">
                      {state.ordinarySections.map((section) => <SectionCard key={section.key} section={section} />)}
                    </div>
                  </section>
                )}
                {state.sensitiveSections.length > 0 && (
                  <section aria-labelledby="sensitive-profile-sections" className="mt-6">
                    <h2 id="sensitive-profile-sections" className="body-l font-700 mb-4">Sensitive profile details</h2>
                    <div className="grid gap-5">
                      {state.sensitiveSections.map((section) => (
                        <SectionCard key={section.key} section={section} sensitive />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
