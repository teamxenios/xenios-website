import { useState } from "react";
import { useLocation } from "wouter";
import { setAuthenticatedExperience } from "../../adapters/authenticatedLanding";

export function AdminMemberExperienceSwitch({ token }: { token: string }) {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: 44 }}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void setAuthenticatedExperience(token, "member").then((result) => {
            setBusy(false);
            if (result.kind === "ok") {
              navigate(result.data.destination);
              return;
            }
            setMessage(
              result.kind === "denied" && result.code === "experience_unavailable"
                ? "No Research membership is connected to this administrator account."
                : "The member experience could not be opened. Try again.",
            );
          });
        }}
        data-testid="button-admin-member-experience"
      >
        {busy ? "Opening..." : "Member experience"}
      </button>
      {message && (
        <p className="body-s text-ink-mute mt-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
