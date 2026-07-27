import { useEffect, useState } from "react";
import type {
  AuthenticatedExperience,
  AuthenticatedLandingResponse,
} from "@shared/research/admin-authority";
import {
  getAuthenticatedLanding,
  setAuthenticatedExperience,
} from "../adapters/adminAuthority";

function commandKey(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `experience-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function AdminExperienceSwitch({
  accessToken,
  currentExperience,
}: {
  accessToken: string | null;
  currentExperience: AuthenticatedExperience;
}) {
  const [landing, setLanding] =
    useState<AuthenticatedLandingResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!accessToken) {
      setLanding(null);
      return;
    }
    void getAuthenticatedLanding(accessToken).then((result) => {
      if (alive) setLanding(result);
    });
    return () => {
      alive = false;
    };
  }, [accessToken]);

  if (
    !accessToken ||
    !landing?.adminAuthorized ||
    !landing.memberAuthorized
  ) {
    return null;
  }

  const next: AuthenticatedExperience =
    currentExperience === "admin" ? "member" : "admin";

  async function switchExperience() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setAuthenticatedExperience(
        accessToken as string,
        next,
        landing!.preferenceVersion,
        commandKey(),
      );
      if (!result) {
        setError("The experience could not be changed. Refresh and try again.");
        return;
      }
      setLanding(result);
      window.location.assign(result.destination);
    } catch {
      setError("The experience could not be changed. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => void switchExperience()}
        data-testid={`button-switch-to-${next}`}
      >
        {busy
          ? "Switching"
          : next === "member"
            ? "Open member experience"
            : "Return to admin"}
      </button>
      {error && (
        <p className="body-s text-ink-mute" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
