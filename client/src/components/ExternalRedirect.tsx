import { useEffect } from "react";

// Sends a path on this site to an external URL (used for /kairos -> the deployed Kairos app, until a
// server-side path rewrite is wired). Client-side so it works on the static/SPA deploy.
export default function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <div className="container-x pt-36 pb-24">
      <p className="mono-cap text-ink-mute mb-4">REDIRECTING</p>
      <p className="body-l text-ink-2">
        Opening the app. If nothing happens,{" "}
        <a href={to} className="underline" style={{ color: "var(--pulse)" }}>
          continue here
        </a>
        .
      </p>
    </div>
  );
}
