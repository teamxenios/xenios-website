import { useResearch } from "../../core";
import { Link } from "wouter";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerTraining } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { readPartnerTrainingReport } from "../../partner-crm/training-records";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner training report: curriculum is static policy text; private module
// facts and the stored certification marker come only from the existing API.
// This report does not complete training, certify, activate, or grant access.
// ---------------------------------------------------------------------------

const CURRICULUM = [
  {
    title: "The program, honestly",
    body: "What Xenios Research is, how customer access works without a paid membership prerequisite, and what a partner's role is and is not.",
  },
  {
    title: "Compliance rules",
    body: "The three hard lines: no medical claims, no income claims, no recruitment. Plus disclosure requirements on every share.",
  },
  {
    title: "Approved content",
    body: "How the approved library works, what may be edited, and how to submit your own content for review before use.",
  },
  {
    title: "Certification check",
    body: "A short check on the rules above. Completion is reviewed with the other current requirements before certification and activation.",
  },
];

export default function Training() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Training and certification"
      lead="Certification comes before sharing. These modules cover the program, the compliance rules, and the approved content library."
    >
      <section aria-labelledby="pt-curriculum">
        <h2 id="pt-curriculum" className="mono-cap text-ink-mute">
          What the curriculum covers
        </h2>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {CURRICULUM.map((c) => (
            <div key={c.title} className="card">
              <p className="body-m font-700">{c.title}</p>
              <p className="body-s text-ink-2 mt-2">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <nav aria-label="Training help" className="flex flex-wrap gap-3 my-6">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link>
        <Link href={PARTNER_ROUTES.support} className="btn btn-secondary">Partner support</Link>
      </nav>
      <ResearchSecureNotice>
        The curriculum above describes the program, not your account status. Reported completion and certification
        markers do not establish current certification validity, partner activation, sharing permission, product eligibility,
        or payout readiness. This report does not change account access or record training completion.
      </ResearchSecureNotice>

      <section aria-labelledby="pt-modules" className="mt-10">
        <h2 id="pt-modules" className="mono-cap text-ink-mute">
          Reported training records
        </h2>
        <div className="mt-4">
          {memberChecking ? <ResearchLoadingState label="Checking your account" />
            : memberToken ? <TrainingReporting key={memberToken} token={memberToken} /> : <SignInNotice />}
        </div>
      </section>
    </ResearchPartnerShell>
  );
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view reported training records"
    body="Use your Xenios account. The server verifies partner reporting access separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function TrainingReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerTraining, token);
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner reporting access is separate from customer approval. This report does not change account permissions.</p></>;
  const report = state === "ok" ? readPartnerTrainingReport(data) : null;
  return <>
    <div className="flex justify-end mb-4"><button type="button" className="btn btn-secondary" onClick={() => void reload()}>Refresh training records</button></div>
    <ResearchRouteBoundary state={state === "ok" && report === null ? "error" : state}
      errorMessage="Training records could not be read safely. Please try again."
      onRetry={() => void reload()}
      unavailableTitle="Training reporting is unavailable right now"
      unavailableBody="The source could not be loaded. This does not establish whether you started training, completed a module, or have a recorded certification.">
      {report && <>
        <div className="card mb-4" aria-label="Reported certification marker">
          <ResearchStatusBadge label={report.certified ? "Certification recorded (reported)" : "No certification recorded in this response"} tone="neutral" />
          <p className="body-s text-ink-2 mt-2">
            This source reports only whether a stored certification marker exists. It does not supply its date,
            expiry, or requirements version. Module completion does not itself establish certification.
          </p>
          <p className="body-s text-ink-2 mt-2">Required modules are reviewed with identity, tax, payout, and agreement evidence before certification.</p>
        </div>
        {report.modules.length === 0 ? <ResearchEmptyState title="No module records were returned."
          body="This does not confirm that no modules are published, that you have not started, or that your training history is complete." />
          : <div className="grid gap-4" aria-label="Reported module records">
            {report.modules.map((module) => <div key={module.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div style={{ minWidth: 0 }}>
                <p className="body-m font-700">{module.title}</p>
                <p className="body-s text-ink-2 mt-1">{module.summary}</p>
                <p className="mono-label text-ink-mute mt-2">Required by the reported module list</p>
              </div>
              <div>
                <ResearchStatusBadge label={module.completed ? "Completion recorded (reported)" : "Completion not recorded in this response"} tone="neutral" />
                <p className="body-s text-ink-2 mt-2">{module.completedAt === null ? "Completion date not reported" : `Reported completion date: ${module.completedAt}`}</p>
              </div>
            </div>)}
          </div>}
      </>}
    </ResearchRouteBoundary>
  </>;
}
