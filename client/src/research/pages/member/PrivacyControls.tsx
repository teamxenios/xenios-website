import { useEffect, useState } from "react";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchConfirmation,
  ResearchDataTable,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { apiGet, apiPost } from "../../lib/api";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";

// ---------------------------------------------------------------------------
// Privacy controls (/research/member/privacy). Three data rights (export,
// correction, deletion request) each post to their own endpoint and degrade
// honestly: an unpublished endpoint renders a clear "not available online
// yet, a person will handle it" message instead of pretending. The media and
// consent summary is server-supplied only, with the media portion behind the
// private_media capability boundary.
// ---------------------------------------------------------------------------

type ConsentRecord = {
  key: string;
  label: string;
  status: string;
  grantedAt?: string | null;
};

type MediaRecord = {
  id: string;
  kind: string;
  addedAt: string;
};

type PrivacySummary = {
  consents?: ConsentRecord[] | null;
  media?: MediaRecord[] | null;
};

type RequestState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "done" }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

function RequestStatusMessage({ state, doneMessage }: { state: RequestState; doneMessage: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-3">
      {state.phase === "done" && <p className="body-s text-ink-2">{doneMessage}</p>}
      {state.phase === "unavailable" && (
        <p className="body-s text-ink-2">
          This request is not available online yet. Email{" "}
          <a href="mailto:research@xeniostechnology.com" className="underline">
            research@xeniostechnology.com
          </a>{" "}
          and a person will handle it for you.
        </p>
      )}
      {state.phase === "error" && <p className="body-s text-ink-2">{state.message}</p>}
    </div>
  );
}

export default function PrivacyControls() {
  const { member, memberChecking, memberToken } = useResearch();
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  const [exportState, setExportState] = useState<RequestState>({ phase: "idle" });
  const [correctionState, setCorrectionState] = useState<RequestState>({ phase: "idle" });
  const [correctionDetail, setCorrectionDetail] = useState("");
  const [correctionMissing, setCorrectionMissing] = useState(false);
  const [deletionState, setDeletionState] = useState<RequestState>({ phase: "idle" });
  const [deletionConfirming, setDeletionConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((statuses) => {
      if (alive) setCapabilities(statuses);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  useEffect(() => {
    if (!member || !memberToken) return;
    let alive = true;
    (async () => {
      const res = await apiGet<PrivacySummary>("/api/research/member/privacy/summary", memberToken);
      if (!alive) return;
      if (res.kind === "ok") {
        setSummary(res.data);
      } else if (res.kind === "unauthorized") {
        setSessionEnded(true);
      } else {
        setSummary(
          devFixture<PrivacySummary>(() => ({
            consents: [
              { key: "membership-terms", label: "Membership terms", status: "Granted", grantedAt: "2026-06-02" },
              { key: "progress-media", label: "Progress media storage", status: "Not granted" },
            ],
            media: [{ id: "m1", kind: "Progress photo", addedAt: "2026-07-01" }],
          })),
        );
      }
      setSummaryLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [member, memberToken]);

  async function runRequest(
    path: string,
    body: unknown,
    setState: (s: RequestState) => void,
  ): Promise<void> {
    if (!memberToken) return;
    setState({ phase: "busy" });
    const res = await apiPost<{ ok: boolean; message?: string }>(path, body, memberToken);
    if (res.kind === "ok") {
      setState({ phase: "done" });
    } else if (res.kind === "unavailable") {
      setState({ phase: "unavailable" });
    } else if (res.kind === "unauthorized") {
      setSessionEnded(true);
      setState({ phase: "idle" });
    } else {
      setState({
        phase: "error",
        message: res.kind === "forbidden" ? res.message ?? "This action is not permitted." : res.message,
      });
    }
  }

  function submitCorrection() {
    const detail = correctionDetail.trim();
    if (!detail) {
      setCorrectionMissing(true);
      return;
    }
    setCorrectionMissing(false);
    void runRequest("/api/research/member/privacy/correction", { detail }, setCorrectionState);
  }

  const mediaStatus = capabilityStatusOrPending(capabilities, "private_media");
  const consents = summary?.consents ?? null;
  const media = summary?.media ?? null;

  const state: "loading" | "ok" | "unauthorized" = memberChecking
    ? "loading"
    : !member || sessionEnded
      ? "unauthorized"
      : !summaryLoaded
        ? "loading"
        : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title="Privacy"
      lead="What we hold about you, who can see it, and your rights over it."
    >
      <ResearchRouteBoundary state={state}>
        <ResearchSecureNotice>
          Your answers, records, and media are visible only to you and the Xenios Research review team. Referral
          partners never see your personal information.
        </ResearchSecureNotice>

        {/* Data rights: export, correction, deletion request. */}
        <section aria-labelledby="ra-privacy-rights" className="mt-8">
          <h2 id="ra-privacy-rights" className="body-m font-700">
            Your data rights
          </h2>
          <div className="mt-4 grid gap-4">
            <div className="card">
              <h3 className="body-s font-700">Export your data</h3>
              <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
                Request a copy of the data held in your account, delivered to your email address.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void runRequest("/api/research/member/privacy/export", {}, setExportState)}
                  disabled={exportState.phase === "busy"}
                >
                  {exportState.phase === "busy" ? "Requesting..." : "Request export"}
                </button>
              </div>
              <RequestStatusMessage
                state={exportState}
                doneMessage="Your export request was received. You will be emailed when it is ready."
              />
            </div>

            <div className="card">
              <h3 className="body-s font-700">Correct your data</h3>
              <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
                If something we hold about you is wrong, tell us what to fix and a person will review it.
              </p>
              <div className="mt-3">
                <label htmlFor="ra-correction-detail" className="form-label">
                  What needs correcting
                </label>
                <textarea
                  id="ra-correction-detail"
                  className="input-field mt-1"
                  rows={3}
                  value={correctionDetail}
                  onChange={(e) => setCorrectionDetail(e.target.value)}
                  aria-invalid={correctionMissing || undefined}
                  aria-describedby={correctionMissing ? "ra-correction-missing" : undefined}
                />
                {correctionMissing && (
                  <p id="ra-correction-missing" role="alert" className="body-s text-ink-2 mt-1">
                    Please describe what needs correcting before you submit.
                  </p>
                )}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={submitCorrection}
                  disabled={correctionState.phase === "busy"}
                >
                  {correctionState.phase === "busy" ? "Submitting..." : "Submit correction"}
                </button>
              </div>
              <RequestStatusMessage
                state={correctionState}
                doneMessage="Your correction request was received. A person will review it and follow up by email."
              />
            </div>

            <div className="card">
              <h3 className="body-s font-700">Request deletion</h3>
              <p className="body-s text-ink-2 mt-1 max-w-[56ch]">
                Ask for your personal data to be deleted. A person reviews every deletion request; records we are
                required to keep may be retained.
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeletionConfirming(true)}
                  disabled={deletionState.phase === "busy"}
                >
                  Request deletion
                </button>
              </div>
              <RequestStatusMessage
                state={deletionState}
                doneMessage="Your deletion request was received. A person will confirm it with you by email before anything is removed."
              />
            </div>
          </div>
        </section>

        <ResearchConfirmation
          open={deletionConfirming || deletionState.phase === "busy"}
          title="Request deletion of your data?"
          danger
          busy={deletionState.phase === "busy"}
          confirmLabel="Yes, request deletion"
          onConfirm={() => {
            setDeletionConfirming(false);
            void runRequest("/api/research/member/privacy/deletion", {}, setDeletionState);
          }}
          onCancel={() => setDeletionConfirming(false)}
          body={
            <div>
              <p>This submits a deletion request for review. Before you confirm:</p>
              <ul className="mt-3 grid gap-2" style={{ paddingLeft: 18, listStyle: "disc" }}>
                <li>A person reviews and confirms every deletion request with you by email.</li>
                <li>Download your plans and data first.</li>
                <li>Records we are legally required to keep may be retained.</li>
              </ul>
            </div>
          }
        />

        {/* Consent summary: server-supplied only. */}
        <section aria-labelledby="ra-privacy-consent" className="mt-10">
          <h2 id="ra-privacy-consent" className="body-m font-700">
            Consent summary
          </h2>
          <div className="mt-4">
            {consents && consents.length > 0 ? (
              <ResearchDataTable<ConsentRecord>
                caption="Consents on record for your account"
                columns={[
                  { key: "label", header: "Consent", render: (row) => row.label },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => (
                      <ResearchStatusBadge label={row.status} tone={row.status === "Granted" ? "success" : "neutral"} />
                    ),
                  },
                  { key: "grantedAt", header: "Date", render: (row) => <span className="tabular">{row.grantedAt ?? "Not granted"}</span> },
                ]}
                rows={consents}
                rowKey={(row) => row.key}
              />
            ) : (
              <ResearchEmptyState
                title="Consent records are not available yet."
                body="The consents you have granted or declined will be listed here once consent records are connected."
              />
            )}
          </div>
        </section>

        {/* Media summary: provider-backed storage, behind its capability. */}
        <section aria-labelledby="ra-privacy-media" className="mt-10">
          <h2 id="ra-privacy-media" className="body-m font-700">
            Your media
          </h2>
          <div className="mt-4">
            <ResearchCapabilityBoundary status={mediaStatus}>
              {media && media.length > 0 ? (
                <ResearchDataTable<MediaRecord>
                  caption="Media stored for your account"
                  columns={[
                    { key: "kind", header: "Type", render: (row) => row.kind },
                    { key: "addedAt", header: "Added", render: (row) => <span className="tabular">{row.addedAt}</span> },
                  ]}
                  rows={media}
                  rowKey={(row) => row.id}
                />
              ) : (
                <ResearchEmptyState
                  title="No media stored."
                  body="Photos, voice notes, and videos you share will be listed here, and you can request their deletion at any time."
                />
              )}
            </ResearchCapabilityBoundary>
          </div>
        </section>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
