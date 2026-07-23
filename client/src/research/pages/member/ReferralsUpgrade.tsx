import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney, useResearch } from "../../core";
import { fetchReferrals } from "../../adapters/guides";
import {
  fetchCapabilities,
  statusFor,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchLoadingState,
  ResearchMetricCard,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Member referrals (/research/member/referrals). Feature-gated premium
// surface behind the "referrals" capability. Everything shown comes from the
// real referral summary contract:
//   GET /api/research/member/referrals ->
//   { enabled, code, eligible, counts, creditAvailableCents, creditPendingCents }
// Counts are aggregates only; applicant identity is NEVER shown anywhere on
// this page, by design. When enabled is false the page renders a calm
// not-open panel. Dev builds may preview with devFixture; production renders
// honest pending states instead.
// ---------------------------------------------------------------------------

interface ReferralCounts {
  pending: number;
  approved: number;
  reversed: number;
}

interface ReferralSummary {
  enabled: boolean;
  code: string | null;
  eligible: boolean;
  counts: ReferralCounts;
  creditAvailableCents: number;
  creditPendingCents: number;
}

type StatusMap = Map<ResearchCapability, CapabilityStatus>;

type PageState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

function normalizeSummary(raw: Partial<ReferralSummary> | null | undefined): ReferralSummary {
  const counts = raw?.counts;
  return {
    enabled: raw?.enabled === true,
    code: typeof raw?.code === "string" && raw.code.length > 0 ? raw.code : null,
    eligible: raw?.eligible === true,
    counts: {
      pending: typeof counts?.pending === "number" ? counts.pending : 0,
      approved: typeof counts?.approved === "number" ? counts.approved : 0,
      reversed: typeof counts?.reversed === "number" ? counts.reversed : 0,
    },
    creditAvailableCents: typeof raw?.creditAvailableCents === "number" ? raw.creditAvailableCents : 0,
    creditPendingCents: typeof raw?.creditPendingCents === "number" ? raw.creditPendingCents : 0,
  };
}

function fixtureReferrals(): ReferralSummary {
  return {
    enabled: true,
    code: "XR-4F7K2M",
    eligible: true,
    counts: { pending: 1, approved: 3, reversed: 0 },
    creditAvailableCents: 4500,
    creditPendingCents: 1500,
  };
}

export default function ReferralsUpgrade() {
  const { memberToken } = useResearch();
  const [statuses, setStatuses] = useState<StatusMap | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [pageError, setPageError] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [isFixture, setIsFixture] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((s) => {
      if (alive) setStatuses(s);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  const load = useCallback(async () => {
    setPageState("loading");
    setPageError(undefined);
    const result = await fetchReferrals<Partial<ReferralSummary>>(memberToken);
    if (result.kind === "ok") {
      setSummary(normalizeSummary(result.data));
      setIsFixture(false);
      setPageState("ok");
      return;
    }
    if (result.kind === "unavailable") {
      const fixture = devFixture(fixtureReferrals);
      if (fixture) {
        setSummary(fixture);
        setIsFixture(true);
        setPageState("ok");
      } else {
        setSummary(null);
        setPageState("unavailable");
      }
      return;
    }
    if (result.kind === "unauthorized") {
      setPageState("unauthorized");
      return;
    }
    setPageError(result.kind === "forbidden" ? result.message : result.message);
    setPageState("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ResearchMemberShell
      eyebrow="Referrals"
      title="Invite someone you trust"
      lead="Share your personal invitation link with someone who would genuinely benefit. Rewards are store credit on both sides, and everything here stays aggregate: you will never see who applied."
    >
      {statuses === null ? (
        <ResearchLoadingState label="Checking availability" />
      ) : (
        <ResearchCapabilityBoundary status={statusFor(statuses, "referrals")}>
          <ResearchRouteBoundary
            state={pageState}
            errorMessage={pageError}
            onRetry={() => void load()}
            unavailableTitle="The referral program is not connected yet."
            unavailableBody="Your invitation link and reward balances will appear here once the program is connected to the server. Nothing is needed from you."
          >
            {summary &&
              (summary.enabled ? (
                <ReferralProgram summary={summary} isFixture={isFixture} />
              ) : (
                <NotOpenPanel />
              ))}
          </ResearchRouteBoundary>
        </ResearchCapabilityBoundary>
      )}
    </ResearchMemberShell>
  );
}

// ---------------------------------------------------------------------------
// The calm not-open panel: enabled=false means the program exists but is not
// open to this member yet. No countdown, no urgency, no invented dates.
// ---------------------------------------------------------------------------

function NotOpenPanel() {
  return (
    <section className="card" aria-label="Referral program status">
      <div className="flex items-center justify-between gap-4">
        <p className="mono-label text-ink-mute">Referral program</p>
        <ResearchStatusBadge label="Not open yet" tone="pending" />
      </div>
      <p className="body-m font-700 mt-1">The referral program is not open for your account yet.</p>
      <p className="body-s text-ink-2 mt-2" style={{ maxWidth: "56ch" }}>
        When it opens, your personal invitation link will appear here along with your reward balances. Nothing is needed
        from you, and you will not miss anything by waiting.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The open program: the purple invitation card, the exact reward explainer,
// aggregate counts, and credit balances. All numbers come from the summary
// contract; nothing on this page is computed or invented client-side beyond
// currency formatting.
// ---------------------------------------------------------------------------

function ReferralProgram({ summary, isFixture }: { summary: ReferralSummary; isFixture: boolean }) {
  return (
    <div className="grid gap-6">
      {isFixture && (
        <p className="body-s text-ink-mute" role="note">
          Development preview data. In production this page shows only your real referral record.
        </p>
      )}

      <InvitationCard code={summary.code} />

      {!summary.eligible && (
        <section className="card" aria-label="Referral eligibility" role="status">
          <p className="mono-label text-ink-mute">Eligibility</p>
          <p className="body-s text-ink-2 mt-2" style={{ maxWidth: "56ch" }}>
            Referral rewards require an active membership. Your link remains yours, and rewards resume once your
            membership is active again.
          </p>
        </section>
      )}

      <section aria-label="How rewards work" className="card">
        <p className="mono-label text-ink-mute">How rewards work</p>
        <p className="body-m mt-2" style={{ maxWidth: "56ch" }}>
          new members receive $10 store credit; you receive $15 store credit
        </p>
        <ul className="mt-3 grid gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li className="body-s text-ink-2">
            Credit is held for 14 days after the new membership activates, then released to your available balance.
          </li>
          <li className="body-s text-ink-2">
            If a membership is refunded during the hold, the associated credit is reversed instead of released.
          </li>
          <li className="body-s text-ink-2">
            Membership is $50 at activation, including the first 30 days, then $25 per additional 30-day
            period. There is no annual plan, and your invitation changes neither price.
          </li>
        </ul>
      </section>

      <section aria-label="Your referral record">
        <h2 className="mono-label text-ink-mute">Your record</h2>
        <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <ResearchMetricCard
            label="Available credit"
            value={formatMoney(summary.creditAvailableCents)}
            summary="Store credit released to you and ready to use."
          />
          <ResearchMetricCard
            label="Pending credit"
            value={formatMoney(summary.creditPendingCents)}
            summary="Store credit inside the 14-day hold, released automatically when the hold ends."
          />
          <ResearchMetricCard
            label="Pending referrals"
            value={String(summary.counts.pending)}
            summary={
              summary.counts.pending === 1
                ? "One referral is inside the 14-day hold."
                : `${summary.counts.pending} referrals are inside the 14-day hold.`
            }
          />
          <ResearchMetricCard
            label="Approved referrals"
            value={String(summary.counts.approved)}
            summary={
              summary.counts.approved === 1
                ? "One referral has completed the hold and been approved."
                : `${summary.counts.approved} referrals have completed the hold and been approved.`
            }
          />
          <ResearchMetricCard
            label="Reversed referrals"
            value={String(summary.counts.reversed)}
            summary={
              summary.counts.reversed === 1
                ? "One referral was reversed, usually after a refund during the hold."
                : `${summary.counts.reversed} referrals were reversed, usually after a refund during the hold.`
            }
          />
        </div>
      </section>

      <ResearchSecureNotice>
        Referral activity is shown as aggregate counts only. You will never see who applied, who joined, or any other
        applicant identity, and they will not see yours.
      </ResearchSecureNotice>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The premium purple invitation card. Deliberately committed to purple in
// both themes; every color inside is explicit so contrast holds regardless
// of the surrounding theme. Copy feedback is announced via aria-live and
// mirrored in the button label, never color alone.
// ---------------------------------------------------------------------------

function InvitationCard({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetRef = useRef<number | null>(null);

  const shareLink =
    code && typeof window !== "undefined" ? `${window.location.origin}/research?ref=${encodeURIComponent(code)}` : null;

  useEffect(() => {
    return () => {
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    };
  }, []);

  const copy = async () => {
    if (!shareLink) return;
    setCopyError(false);
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && inputRef.current) {
      // Fallback: select the text so the member can copy it manually.
      inputRef.current.focus();
      inputRef.current.select();
      setCopyError(true);
      return;
    }
    setCopied(ok);
    if (!ok) setCopyError(true);
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setCopied(false), 4000);
  };

  return (
    <section
      aria-label="Your invitation link"
      className="card"
      style={{
        background: "linear-gradient(135deg, #2e1065 0%, #5b21b6 55%, #7c3aed 100%)",
        border: "1px solid #7c3aed",
        color: "#f5f3ff",
      }}
      data-testid="referral-invitation-card"
    >
      <p className="mono-label" style={{ color: "#ddd6fe" }}>
        Your invitation
      </p>
      <p className="body-l font-700 mt-1" style={{ color: "#ffffff" }}>
        A personal link, just for the people you would actually recommend this to.
      </p>
      <p className="body-s mt-2" style={{ color: "#e9e2ff", maxWidth: "56ch" }}>
        Anyone who applies through your link is reviewed the same way as every applicant. Sharing it never affects your
        own membership.
      </p>

      {shareLink ? (
        <div className="mt-5">
          <label htmlFor="referral-link" className="form-label" style={{ color: "#ddd6fe" }}>
            Your unique link
          </label>
          <div className="flex flex-wrap gap-3 mt-1">
            <input
              id="referral-link"
              ref={inputRef}
              type="text"
              readOnly
              value={shareLink}
              onFocus={(e) => e.currentTarget.select()}
              className="input-field"
              style={{
                flex: "1 1 260px",
                minWidth: 0,
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.35)",
                color: "#ffffff",
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => void copy()}
              style={{ background: "#ffffff", color: "#4c1d95", border: "none" }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="body-s mt-2" role="status" aria-live="polite" style={{ color: "#e9e2ff" }}>
            {copied
              ? "Link copied to your clipboard."
              : copyError
                ? "Automatic copy is not available here. The link is selected, copy it with Ctrl+C or Cmd+C."
                : ""}
          </p>
        </div>
      ) : (
        <p className="body-s mt-5" role="status" style={{ color: "#e9e2ff", maxWidth: "52ch" }}>
          Your unique link is being prepared and will appear here shortly. Nothing is needed from you.
        </p>
      )}
    </section>
  );
}
