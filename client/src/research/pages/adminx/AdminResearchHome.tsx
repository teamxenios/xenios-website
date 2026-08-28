import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { getSystemStatus, listApplications, listReferralFraud } from "../../adapters/adminOps";
import {
  countAssistedOrdersSubmitted,
  listEarlyAccessAdminExceptions,
  listEarlyAccessFulfillmentQueue,
  listEarlyAccessPaymentQueue,
} from "../../adapters/earlyAccessAdminOrders";
import { ResearchAdminShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import {
  fmtDate,
  fmtDateTime,
  useAdminResource,
  useAdminSession,
  type AdminResource,
  type AdminResourceState,
  type AdminSession,
} from "./auth";

// ---------------------------------------------------------------------------
// /admin/research operations overview, plus the shared admin chrome every
// page in this family composes: AdminScreen (session gate inside the admin
// shell) and AdminBoundary (honest state branching for admin resources).
// The browser never grants authority. All data comes from admin-authorized
// APIs; 401/403 renders a denied state, an unpublished endpoint renders a
// pending state, and nothing on this surface is invented.
// ---------------------------------------------------------------------------

export function AdminScreen({
  title,
  lead,
  actions,
  children,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
  children: (token: string) => ReactNode;
}) {
  const session = useAdminSession();
  return (
    <ResearchAdminShell
      title={title}
      lead={lead}
      actions={
        session.state === "ready" ? (
          <div className="flex items-center gap-3 flex-wrap">
            {session.email && (
              <span className="body-s text-ink-mute" data-testid="text-adminx-email">
                {session.email}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
              onClick={() => void session.signOut()}
              data-testid="button-adminx-signout"
            >
              Sign out
            </button>
            {actions}
          </div>
        ) : undefined
      }
    >
      {session.state === "loading" && <ResearchLoadingState label="Checking your session" />}
      {session.state === "unconfigured" && (
        <ResearchEmptyState
          title="Admin is not configured yet."
          body="The admin identity provider is not configured in this environment, so operations pages cannot sign anyone in."
        />
      )}
      {session.state === "signed_out" && <AdminSignInForm session={session} />}
      {session.state === "ready" && session.token && children(session.token)}
    </ResearchAdminShell>
  );
}

function AdminSignInForm({ session }: { session: AdminSession }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      className="card"
      style={{ maxWidth: 440 }}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void session.signIn(email, password);
      }}
      aria-label="Admin sign in"
      data-testid="form-adminx-signin"
    >
      <p className="mono-label text-ink-mute">Sign in required</p>
      <p className="body-s text-ink-2 mt-2 max-w-[48ch]">
        Research operations requires an admin account. The same account signs in to the /admin dashboard.
      </p>
      <div className="mt-5">
        <label htmlFor="adminx-email" className="form-label">
          Email
        </label>
        <input
          id="adminx-email"
          type="email"
          required
          autoComplete="username"
          className="input-field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="mt-4">
        <label htmlFor="adminx-password" className="form-label">
          Password
        </label>
        <input
          id="adminx-password"
          type="password"
          required
          autoComplete="current-password"
          className="input-field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {session.signInError && (
        <p className="body-s mt-3" role="alert" style={{ color: "var(--error)" }}>
          {session.signInError}
        </p>
      )}
      <div className="mt-5 flex items-center gap-4 flex-wrap">
        <button type="submit" className="btn btn-primary" disabled={session.signingIn}>
          {session.signingIn ? "Signing in..." : "Sign in"}
        </button>
        <a href="/admin" className="body-s underline text-ink-mute">
          Password reset lives on /admin
        </a>
      </div>
    </form>
  );
}

// Honest branching for every admin-authorized resource. Unavailable copy is
// overridable per surface so pages can say WHAT the surface publishes with.
export function AdminBoundary({
  state,
  message,
  deniedCode,
  onRetry,
  unavailableTitle = "This surface is not published yet.",
  unavailableBody = "It publishes with the member platform and commerce backend. Nothing is wrong with your access.",
  children,
}: {
  state: AdminResourceState;
  message?: string;
  /** The machine code when state is "denied"; UI copy routes on it, never on message. */
  deniedCode?: string;
  onRetry?: () => void;
  unavailableTitle?: string;
  unavailableBody?: string;
  children: ReactNode;
}) {
  if (state === "loading") return <ResearchLoadingState />;
  if (state === "error") return <ResearchErrorState message={message} onRetry={onRetry} />;
  if (state === "unavailable") return <ResearchEmptyState title={unavailableTitle} body={unavailableBody} />;
  if (state === "unauthorized")
    return (
      <ResearchEmptyState
        title="Your admin session has ended."
        body="Sign out and sign in again to continue. Authority is checked by the server on every request."
      />
    );
  if (state === "forbidden")
    return (
      <ResearchEmptyState
        title="Access denied."
        body={message ?? "This account is signed in but is not authorized for research operations."}
      />
    );
  if (state === "denied") return <ResearchDenialNotice code={deniedCode ?? "forbidden"} message={message} />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Shared application vocabulary (imported by Applications and
// ApplicationDetail; kept here so the import graph stays one-directional).
// ---------------------------------------------------------------------------

export type AdminApplication = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  country: string;
  region: string | null;
  city: string | null;
  applicant_type: string;
  occupation: string | null;
  organization: string | null;
  interests: string[];
  goals_text: string | null;
  fit_text: string | null;
  referral_source: string | null;
  referral_code: string | null;
  status: string;
  submitted_at: string;
  approval_expires_at: string | null;
};

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  resubmitted: "Resubmitted",
  under_review: "Under review",
  more_information_requested: "Needs information",
  approved_pending_payment: "Approved, awaiting activation",
  payment_pending: "Activation in progress",
  active: "Active",
  paused: "Paused",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export const APPLICATION_QUEUES: Array<{ key: string; label: string }> = [
  { key: "new", label: "New" },
  { key: "under_review", label: "Under review" },
  { key: "needs_information", label: "Needs info" },
  { key: "approved_awaiting_payment", label: "Approved" },
  { key: "active", label: "Active" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

// ---------------------------------------------------------------------------
// The overview page itself.
// ---------------------------------------------------------------------------

type SystemStatus = {
  supabaseConfigured: boolean;
  emailProvider: string;
  emailConfigured: boolean;
  verifiedSenderConfigured: boolean;
  adminRecipientCount: number;
  outbox: Record<string, number>;
  lastSuccessfulSend: string | null;
  workerRunning: boolean;
  driveExportsEnabled: boolean;
};

export default function AdminResearchHome() {
  return (
    <AdminScreen
      title="Research operations"
      lead="The daily operating picture for Xenios Research: the application queue, activation candidates, email delivery, and referral integrity, with links into every surface."
    >
      {(token) => <OverviewBody token={token} />}
    </AdminScreen>
  );
}

// Module-level loaders so the resource identity is stable across renders
// (the overview always reads the full queue and the open flags).
const loadAllApplications = (t: string) =>
  listApplications<{ ok: boolean; applications: AdminApplication[] }>(t, "all");
const loadOpenFraudFlags = (t: string) => listReferralFraud<{ ok: boolean; flags: Array<{ id: string }> }>(t, "open");

function OverviewBody({ token }: { token: string }) {
  const apps = useAdminResource(token, loadAllApplications);
  const system = useAdminResource<{ ok: boolean; system: SystemStatus }>(token, getSystemStatus);
  const fraud = useAdminResource(token, loadOpenFraudFlags);

  return (
    <div className="grid gap-8">
      <QueueOverview resource={apps} />
      <ActivationCandidates resource={apps} />
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
        <EmailDeliveryPanel resource={system} />
        <ReferralIntegrityPanel resource={fraud} />
      </div>
      <CommerceOperationsTiles token={token} />
      <ResearchSecureNotice>
        Operations views show account and workflow metadata only. Member health data never renders in lists; it stays
        inside each member's own record.
      </ResearchSecureNotice>
    </div>
  );
}

function countByStatus(applications: AdminApplication[], statuses: string[]): number {
  return applications.filter((a) => statuses.includes(a.status)).length;
}

function QueueOverview({
  resource,
}: {
  resource: AdminResource<{ ok: boolean; applications: AdminApplication[] }>;
}) {
  return (
    <section aria-label="Application queue overview">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h2 className="body-l font-700">Applications</h2>
        <Link href={ADMIN_ROUTES.applications} className="btn btn-secondary">
          Open the queue
        </Link>
      </div>
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The application queue is not reachable."
        unavailableBody="The applications API is not responding in this environment."
      >
        {(() => {
          const list = resource.data?.applications ?? [];
          const cards: Array<{ label: string; statuses: string[]; summary: string }> = [
            { label: "New", statuses: ["submitted", "resubmitted"], summary: "Waiting for a reviewer to begin." },
            { label: "Under review", statuses: ["under_review"], summary: "A reviewer has the file open." },
            {
              label: "Needs information",
              statuses: ["more_information_requested"],
              summary: "Waiting on the applicant to resubmit.",
            },
            {
              label: "Awaiting activation",
              statuses: ["approved_pending_payment"],
              summary: "Approved. Waiting on the $50 activation payment (includes the first 30 days).",
            },
            {
              label: "Activation in progress",
              statuses: ["payment_pending"],
              summary: "The activation payment is being verified by a person.",
            },
            { label: "Active members", statuses: ["active"], summary: "Fully activated memberships." },
          ];
          return (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {cards.map((c) => (
                <ResearchMetricCard
                  key={c.label}
                  label={c.label}
                  value={String(countByStatus(list, c.statuses))}
                  summary={c.summary}
                />
              ))}
            </div>
          );
        })()}
      </AdminBoundary>
    </section>
  );
}

function ActivationCandidates({
  resource,
}: {
  resource: AdminResource<{ ok: boolean; applications: AdminApplication[] }>;
}) {
  if (resource.state !== "ok") return null;
  const candidates = (resource.data?.applications ?? []).filter(
    (a) => a.status === "approved_pending_payment" || a.status === "payment_pending",
  );
  return (
    <section aria-label="Activation candidates">
      <h2 className="body-l font-700 mb-4">Activation candidates</h2>
      {candidates.length === 0 ? (
        <ResearchEmptyState
          title="No one is waiting on activation."
          body="Approved applicants appear here until their $50 activation payment (which includes the first 30 days of membership) is verified."
        />
      ) : (
        <div className="grid gap-3">
          {candidates.map((app) => (
            <Link
              key={app.id}
              href={`${ADMIN_ROUTES.applications}/${app.id}`}
              className="card flex flex-wrap items-center justify-between gap-3"
              style={{ textDecoration: "none" }}
              data-testid={`link-activation-candidate-${app.id}`}
            >
              <span style={{ minWidth: 0 }}>
                <span className="body-m font-700 block">
                  {app.first_name} {app.last_name}
                </span>
                <span className="body-s text-ink-mute block" style={{ overflowWrap: "anywhere" }}>
                  {app.email}
                </span>
              </span>
              <span className="flex items-center gap-3 flex-wrap">
                <ResearchStatusBadge
                  label={APPLICATION_STATUS_LABEL[app.status] ?? app.status}
                  tone={app.status === "payment_pending" ? "info" : "warning"}
                />
                {app.approval_expires_at && (
                  <span className="mono-label text-ink-mute">Expires {fmtDate(app.approval_expires_at)}</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function EmailDeliveryPanel({
  resource,
}: {
  resource: AdminResource<{ ok: boolean; system: SystemStatus }>;
}) {
  return (
    <section className="card" aria-label="Email delivery">
      <div className="flex items-center justify-between gap-4">
        <p className="mono-label text-ink-mute">Email delivery</p>
        <Link href={ADMIN_ROUTES.security} className="body-s underline text-ink-mute">
          Open system status
        </Link>
      </div>
      <div className="mt-3">
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          deniedCode={resource.deniedCode}
          onRetry={resource.reload}
          unavailableTitle="System status is not reachable."
          unavailableBody="The system status API is not responding in this environment."
        >
          {(() => {
            const s = resource.data?.system;
            if (!s) return <ResearchEmptyState title="No status returned." />;
            const failures = (s.outbox["failed_retryable"] ?? 0) + (s.outbox["failed_permanent"] ?? 0);
            return (
              <div className="grid gap-2">
                <p className="body-s text-ink-2">
                  Provider: <span className="font-700">{s.emailConfigured ? s.emailProvider : "not configured"}</span>
                  {s.verifiedSenderConfigured ? ", verified sender set" : ", verified sender missing"}
                </p>
                <p className="body-s text-ink-2">
                  Outbox: {s.outbox["pending"] ?? 0} pending, {s.outbox["processing"] ?? 0} processing,{" "}
                  {s.outbox["sent"] ?? 0} sent
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <ResearchStatusBadge
                    label={failures > 0 ? `${failures} failed email${failures === 1 ? "" : "s"}` : "No failures"}
                    tone={failures > 0 ? "danger" : "success"}
                  />
                  <ResearchStatusBadge
                    label={s.workerRunning ? "Worker running" : "Worker stopped"}
                    tone={s.workerRunning ? "success" : "warning"}
                  />
                </div>
                <p className="body-s text-ink-mute">
                  Last successful send: {s.lastSuccessfulSend ? fmtDateTime(s.lastSuccessfulSend) : "none recorded"}
                </p>
              </div>
            );
          })()}
        </AdminBoundary>
      </div>
    </section>
  );
}

function ReferralIntegrityPanel({
  resource,
}: {
  resource: AdminResource<{ ok: boolean; flags: Array<{ id: string }> }>;
}) {
  return (
    <section className="card" aria-label="Referral integrity">
      <div className="flex items-center justify-between gap-4">
        <p className="mono-label text-ink-mute">Referral integrity</p>
        <Link href={ADMIN_ROUTES.partners} className="body-s underline text-ink-mute">
          Open the review queue
        </Link>
      </div>
      <div className="mt-3">
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          deniedCode={resource.deniedCode}
          onRetry={resource.reload}
          unavailableTitle="The fraud queue is not reachable."
          unavailableBody="The referral fraud API is not responding in this environment."
        >
          {(() => {
            const open = resource.data?.flags?.length ?? 0;
            return (
              <div className="grid gap-2">
                <p className="display-s tabular">{open}</p>
                <p className="body-s text-ink-2">
                  Open referral flags awaiting human review. Signals only flag; nothing is auto-penalized.
                </p>
              </div>
            );
          })()}
        </AdminBoundary>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The commerce cockpit: four tiles, each wired to a REAL source or rendering
// its explicit unavailable state. No tile ever shows a number the server did
// not report - a fake zero on "settled awaiting fulfillment" is exactly how
// a paid order sits unshipped with every screen looking clean.
// ---------------------------------------------------------------------------

// Module-level loaders so each resource identity is stable across renders.
const loadEaPaymentQueue = (t: string) => listEarlyAccessPaymentQueue(t);
const loadEaFulfillmentQueue = (t: string) => listEarlyAccessFulfillmentQueue(t);
const loadEaExceptions = (t: string) => listEarlyAccessAdminExceptions(t);
const loadAssistedSubmitted = (t: string) => countAssistedOrdersSubmitted(t);

/**
 * One truthful count tile. The count renders ONLY from a live server answer;
 * every other state names itself. `unavailableBody` states WHAT the tile
 * publishes with, so "unavailable" reads as a fact about the deployment
 * rather than a bug on this screen.
 */
function OperationalCountTile({
  label,
  count,
  state,
  summary,
  unavailableBody,
  onRetry,
  href,
  linkLabel,
}: {
  label: string;
  count: number | null;
  state: AdminResourceState;
  summary: string;
  unavailableBody: string;
  onRetry: () => void;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="card" data-testid={`tile-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="mono-label text-ink-mute">{label}</p>
        {state === "ok" ? (
          <ResearchStatusBadge label="Live" tone="success" />
        ) : state === "loading" ? (
          <ResearchStatusBadge label="Loading" tone="neutral" />
        ) : state === "unavailable" ? (
          <ResearchStatusBadge label="Unavailable" tone="pending" />
        ) : state === "error" ? (
          <ResearchStatusBadge label="Error" tone="danger" />
        ) : (
          <ResearchStatusBadge label="Access denied" tone="danger" />
        )}
      </div>
      {state === "ok" && count !== null ? (
        <>
          <p className="display-s tabular mt-1">{String(count)}</p>
          <p className="body-s text-ink-2 mt-2">{summary}</p>
        </>
      ) : state === "unavailable" ? (
        <p className="body-s text-ink-2 mt-2">{unavailableBody}</p>
      ) : state === "error" ? (
        <p className="body-s text-ink-2 mt-2">
          The source did not answer.{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : state === "loading" ? (
        <p className="body-s text-ink-mute mt-2">Reading the live source…</p>
      ) : (
        <p className="body-s text-ink-2 mt-2">
          This account is signed in but not authorized for this source. Authority is checked by the server on every
          request.
        </p>
      )}
      <Link href={href} className="body-s underline text-ink-mute mt-3 inline-block">
        {linkLabel}
      </Link>
    </div>
  );
}

function CommerceOperationsTiles({ token }: { token: string }) {
  const payments = useAdminResource(token, loadEaPaymentQueue);
  const fulfillment = useAdminResource(token, loadEaFulfillmentQueue);
  const exceptions = useAdminResource(token, loadEaExceptions);
  const assisted = useAdminResource(token, loadAssistedSubmitted);

  return (
    <section aria-label="Commerce operations">
      <h2 className="body-l font-700 mb-4">Commerce</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <OperationalCountTile
          label="Payment review"
          state={payments.state}
          count={payments.data?.items.length ?? null}
          summary="Orders whose submitted payment proof is waiting on a named human."
          unavailableBody="The Early Access payments API is not responding in this environment."
          onRetry={payments.reload}
          href={ADMIN_ROUTES.earlyAccessFulfillment}
          linkLabel="Open fulfillment operations"
        />
        <OperationalCountTile
          label="Awaiting fulfillment"
          state={fulfillment.state}
          count={fulfillment.data?.items.length ?? null}
          summary="Settled orders with verified payment and no recorded shipment."
          unavailableBody="This list's read-only database function is a founder-gated candidate migration; the server refuses to invent the queue without it. Per-order dispatch works today from fulfillment operations."
          onRetry={fulfillment.reload}
          href={ADMIN_ROUTES.earlyAccessFulfillment}
          linkLabel="Open fulfillment operations"
        />
        <OperationalCountTile
          label="Assisted orders"
          state={assisted.state}
          count={assisted.data?.total ?? null}
          summary="Submitted assisted-order requests waiting for review."
          unavailableBody="Dark until the assisted-order bridge migration (M71) is applied and its routes are mounted. No request data exists to show."
          onRetry={assisted.reload}
          href={ADMIN_ROUTES.assistedOrders}
          linkLabel="Open assisted orders"
        />
        <OperationalCountTile
          label="Exceptions"
          state={exceptions.state}
          count={exceptions.data?.items.length ?? null}
          summary="Open admin exceptions (overpayments and friends) awaiting a named human."
          unavailableBody="The exceptions route is not mounted in this environment. The database function is deployed; the surface publishes with the fulfillment wiring."
          onRetry={exceptions.reload}
          href={ADMIN_ROUTES.earlyAccessFulfillment}
          linkLabel="Open fulfillment operations"
        />
      </div>
    </section>
  );
}
