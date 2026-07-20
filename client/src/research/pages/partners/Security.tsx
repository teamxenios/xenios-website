import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { getPartnerSecuritySessions } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, PARTNER_SUPPORT_EMAIL, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner account security (/research/partners/security). The basics every
// rep account follows, plus a session history surface served by the partner
// API (honest pending state until it is published).
// ---------------------------------------------------------------------------

interface SessionRecord {
  id: string;
  startedAt: string;
  device?: string | null;
  approximateLocation?: string | null;
  current?: boolean | null;
}

type SecurityPayload = { sessions?: SessionRecord[] };

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
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<SecurityPayload>(
    getPartnerSecuritySessions,
    memberToken,
  );

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

      <section aria-labelledby="psc-sessions" className="mt-10">
        <h2 id="psc-sessions" className="mono-cap text-ink-mute">
          Recent sessions
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your session history appears here when the partner platform launches, so you can spot a sign-in that was not you."
          >
            <ResearchDataTable<SessionRecord>
              caption="Recent sign-in sessions on your partner account"
              columns={[
                { key: "startedAt", header: "Signed in", render: (s) => s.startedAt },
                { key: "device", header: "Device", render: (s) => s.device ?? "Unknown device" },
                {
                  key: "location",
                  header: "Approximate location",
                  render: (s) => s.approximateLocation ?? "Not recorded",
                },
                { key: "current", header: "This session", render: (s) => (s.current ? "Yes" : "No") },
              ]}
              rows={data?.sessions ?? []}
              rowKey={(s) => s.id}
              empty="No session history recorded yet."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      <div className="mt-8">
        <ResearchSecureNotice>
          To report a security concern, email {PARTNER_SUPPORT_EMAIL} with "security" in the subject line. If you
          believe your account is compromised, say so plainly and the team will lock it first and sort it out second.
        </ResearchSecureNotice>
      </div>
    </ResearchPartnerShell>
  );
}
