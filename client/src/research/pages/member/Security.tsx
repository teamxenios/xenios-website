import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchStatusBadge,
} from "../../ui/kit";
import { getSecuritySessions } from "../../adapters/member";
import { devFixture } from "../../lib/fixtures";
import { ACCESS_ROUTES } from "../../lib/routes";

// ---------------------------------------------------------------------------
// Security (/research/member/security). Honest security surface: password
// change works today (the existing reset flow), signing out of this browser
// works today (provider), and everything not yet real (MFA, session history,
// sign out everywhere) renders as clearly pending. No capability in the
// registry covers MFA or sessions, so those use dedicated inline pending
// panels rather than misusing identity_verification.
// ---------------------------------------------------------------------------

type SessionInfo = {
  id: string;
  device: string;
  location?: string | null;
  lastActiveAt: string;
  current?: boolean;
};

export default function SecurityPage() {
  const { member, memberChecking, memberToken, signOutMember } = useResearch();
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!member || !memberToken) return;
    let alive = true;
    (async () => {
      const res = await getSecuritySessions<{ sessions: SessionInfo[] }>(memberToken);
      if (!alive) return;
      if (res.kind === "ok") {
        setSessions(res.data.sessions ?? []);
      } else if (res.kind === "unauthorized") {
        setSessionEnded(true);
      } else {
        // Endpoint unpublished: development shows a realistic fixture,
        // production renders the honest unavailable state below.
        setSessions(
          devFixture<SessionInfo[]>(() => [
            { id: "s1", device: "Chrome on Windows", location: "Houston, TX", lastActiveAt: "Today", current: true },
            { id: "s2", device: "Safari on iPhone", location: "Houston, TX", lastActiveAt: "Yesterday" },
          ]),
        );
      }
      setSessionsLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [member, memberToken]);

  async function signOutThisDevice() {
    setSigningOut(true);
    try {
      await signOutMember();
    } finally {
      setSigningOut(false);
      navigate(ACCESS_ROUTES.signIn);
    }
  }

  const state: "loading" | "ok" | "unauthorized" = memberChecking
    ? "loading"
    : !member || sessionEnded
      ? "unauthorized"
      : !sessionsLoaded
        ? "loading"
        : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Security"
      lead="Your password, your sign-ins, and your devices."
    >
      <ResearchRouteBoundary state={state}>
        {/* Password: real today, via the existing reset flow. */}
        <section aria-labelledby="ra-security-password" className="card">
          <h2 id="ra-security-password" className="body-m font-700">
            Password
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            Change your password at any time. We send a secure link to your email address, and the change takes
            effect on your next sign-in.
          </p>
          <div className="mt-4">
            <Link href={ACCESS_ROUTES.resetPassword} className="btn btn-secondary">
              Change password
            </Link>
          </div>
        </section>

        {/* MFA: a dedicated inline pending panel (no registry capability covers
            MFA, so this is NOT a capability boundary and does not pretend one). */}
        <section
          role="status"
          aria-live="polite"
          aria-labelledby="ra-security-mfa"
          className="card mt-6"
          data-testid="ra-mfa-pending"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ra-security-mfa" className="body-m font-700">
              Multi-factor authentication
            </h2>
            <ResearchStatusBadge label="Not available yet" tone="pending" />
          </div>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            A second sign-in factor for your account is being prepared. Until it opens, your account is protected
            by your password, and password changes always go through your email. You will see the setup here the
            moment it is ready.
          </p>
        </section>

        {/* Sessions and devices: server-supplied only. */}
        <section aria-labelledby="ra-security-sessions" className="mt-10">
          <h2 id="ra-security-sessions" className="body-m font-700">
            Sessions and devices
          </h2>
          <div className="mt-4">
            {sessions && sessions.length > 0 ? (
              <ResearchDataTable<SessionInfo>
                caption="Places your account is signed in"
                columns={[
                  {
                    key: "device",
                    header: "Device",
                    render: (row) => (
                      <span>
                        {row.device}
                        {row.current ? " (this device)" : ""}
                      </span>
                    ),
                  },
                  { key: "location", header: "Location", render: (row) => row.location ?? "Unknown" },
                  { key: "lastActiveAt", header: "Last active", render: (row) => <span className="tabular">{row.lastActiveAt}</span> },
                  {
                    key: "state",
                    header: "Status",
                    render: (row) => (
                      <ResearchStatusBadge label={row.current ? "Current" : "Signed in"} tone={row.current ? "success" : "neutral"} />
                    ),
                  },
                ]}
                rows={sessions}
                rowKey={(row) => row.id}
              />
            ) : (
              <ResearchEmptyState
                title="Session history is not available yet."
                body="A list of where your account is signed in will appear here once session tracking is connected. Nothing is wrong with your account."
              />
            )}
          </div>
        </section>

        {/* Sign out everywhere: pending until session management exists.
            Sign out here: real today. */}
        <section aria-labelledby="ra-security-signout" className="mt-10 card">
          <h2 id="ra-security-signout" className="body-m font-700">
            Sign out
          </h2>
          <div className="mt-4 grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="body-s font-700">This device</p>
                <p className="body-s text-ink-2 mt-1">Ends your session in this browser only.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void signOutThisDevice()}
                disabled={signingOut}
              >
                {signingOut ? "Signing out..." : "Sign out on this device"}
              </button>
            </div>
            <div
              className="flex flex-wrap items-center justify-between gap-3"
              role="status"
              aria-live="polite"
              data-testid="ra-signout-all-pending"
            >
              <div>
                <p className="body-s font-700">All devices</p>
                <p className="body-s text-ink-2 mt-1">
                  Signing out of every device at once opens with session management. Not available yet.
                </p>
              </div>
              <ResearchStatusBadge label="Not available yet" tone="pending" />
            </div>
          </div>
        </section>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
