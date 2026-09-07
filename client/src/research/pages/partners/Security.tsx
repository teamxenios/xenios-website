import { useResearch } from "../../core";
import { Link } from "wouter";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { getPartnerSecuritySessions } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES } from "../../lib/routes";
import { readPartnerSecuritySessions, type ReportedPartnerSession } from "../../partner-crm/security-sessions";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner account security (/research/partners/security). The basics every
// rep account follows, plus a session history surface served by the partner
// API (honest pending state until it is published).
// ---------------------------------------------------------------------------

const BASICS = [
  {
    title: "One account, one person",
    body: "Your rep account is yours alone. Sharing credentials, running someone else's account, or operating multiple personal accounts is grounds for removal.",
  },
  {
    title: "A strong, unique password",
    body: "Use a password you use nowhere else, ideally from a password manager. If you suspect it is known to anyone, change it immediately.",
  },
  {
    title: "We never ask for credentials",
    body: "No one from the team will ever ask for your password, a sign-in code, or payout credentials by email, text, or phone. Treat any such request as an attack.",
  },
  {
    title: "Sign out on shared devices",
    body: "If you sign in on a device that is not yours, sign out when you are done. Your dashboard and ledger are nobody else's business.",
  },
  {
    title: "Report anything odd, fast",
    body: "Unexpected sign-in notices, changed details you did not change, or messages pretending to be the team: report them the moment you see them.",
  },
];

export default function Security() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Account security"
      lead="The basics that keep your rep account yours. Most of this is habits; the rest is knowing what the team will never ask for."
    >
      <section aria-labelledby="psc-basics">
        <h2 id="psc-basics" className="mono-cap text-ink-mute">
          The basics
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {BASICS.map((b) => (
            <div key={b.title} className="card">
              <p className="body-m font-700">{b.title}</p>
              <p className="body-s text-ink-2 mt-2">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="my-6"><Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link></div>
      <ResearchSecureNotice>
        This partner report is not a complete sign-in history or an account-safety check. Records do not prove
        who used a device, whether a session is still valid, or that other sessions were signed out. No sessions are revoked here.
      </ResearchSecureNotice>
      <section aria-labelledby="psc-sessions" className="mt-10">
        <h2 id="psc-sessions" className="mono-cap text-ink-mute">
          Reported session records
        </h2>
        <div className="mt-4">
          {memberChecking ? <ResearchLoadingState label="Checking your account" />
            : memberToken ? <SecurityReporting key={memberToken} token={memberToken} /> : <SignInNotice />}
        </div>
      </section>

      <div className="mt-8">
        <ResearchSecureNotice>
          To report a security concern, contact team@xeniostechnology.com. Do not include passwords, sign-in codes,
          tokens, or bank details. Contacting support does not itself lock the account, change a password, or revoke a session.
        </ResearchSecureNotice>
        <a className="btn btn-secondary mt-4" href="mailto:team@xeniostechnology.com?subject=Account%20security%20concern">Contact the security team</a>
      </div>
    </ResearchPartnerShell>
  );
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view reported session records"
    body="Use your Xenios account. The server verifies access to partner reporting separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function SecurityReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerSecuritySessions, token);
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner reporting access is separate from customer approval. This report does not change account access.</p></>;
  const sessions = state === "ok" ? readPartnerSecuritySessions(data) : null;
  const malformed = state === "ok" && sessions === null;
  return <>
    <div className="flex justify-end mb-4"><button type="button" className="btn btn-secondary" onClick={() => void reload()}>Refresh session records</button></div>
    <ResearchRouteBoundary state={malformed ? "error" : state}
      errorMessage="Session records could not be read safely. Please try again."
      onRetry={() => void reload()}
      unavailableTitle="Session reporting is unavailable right now"
      unavailableBody="The source could not be loaded. This does not mean there were no sign-ins or that your account is secure.">
      <ResearchDataTable<ReportedPartnerSession>
        caption="Reported session records: start time, device label, approximate location, and current-session marker"
        columns={[
          { key: "startedAt", header: "Reported start", render: (row) => row.startedAt },
          { key: "device", header: "Reported device", render: (row) => row.device ?? "Device not reported" },
          { key: "location", header: "Reported approximate location", render: (row) => row.approximateLocation ?? "Location not reported" },
          { key: "current", header: "Source current-session marker", render: (row) => row.current ? "Marked current (reported)" : "Not marked current (reported)" },
        ]}
        rows={sessions ?? []} rowKey={(row) => row.id}
        empty="No session records were returned. The source may be unavailable or incomplete; this is not evidence of no sign-ins, no other sessions, or account safety."
      />
    </ResearchRouteBoundary>
  </>;
}
