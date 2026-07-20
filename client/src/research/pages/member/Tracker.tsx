import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { logTrackerEntry, requestTrackerDeletion, requestTrackerExport } from "../../adapters/tracker";
import {
  fetchCapabilities,
  statusFor,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchConfirmation,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchSelectCard,
  ResearchStatusBadge,
  ResearchTabs,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Member tracker (/research/member/tracker). The whole surface sits behind
// the "tracker" capability boundary; media panels additionally sit behind
// "private_media". Honest states only: nothing here invents server data.
// Dev builds may show typed fixtures via devFixture; production renders
// "data appears as you log" empties until real entries exist. There is
// deliberately no overall health score anywhere on this page.
// ---------------------------------------------------------------------------

const TABS = [
  { key: "today", label: "Today" },
  { key: "log", label: "Log" },
  { key: "progress", label: "Progress" },
  { key: "plan", label: "Plan" },
  { key: "checkin", label: "Check-In" },
  { key: "media", label: "Media" },
  { key: "connections", label: "Connections" },
  { key: "privacy", label: "Data and Privacy" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type StatusMap = Map<ResearchCapability, CapabilityStatus>;

export default function Tracker() {
  const { memberToken } = useResearch();
  const [statuses, setStatuses] = useState<StatusMap | null>(null);
  const [tab, setTab] = useState<TabKey>("today");

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((s) => {
      if (alive) setStatuses(s);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  return (
    <ResearchMemberShell
      title="Tracker"
      lead="A private daily record of sleep, energy, and training that you and the research team read together. It never reduces your data to a single score."
    >
      {statuses === null ? (
        <ResearchLoadingState label="Checking availability" />
      ) : (
        <ResearchCapabilityBoundary status={statusFor(statuses, "tracker")}>
          <ResearchTabs
            tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
            active={tab}
            onSelect={(key) => setTab(key as TabKey)}
            label="Tracker areas"
          />
          <div className="mt-6">
            {tab === "today" && <TodayPanel />}
            {tab === "log" && <LogPanel token={memberToken} />}
            {tab === "progress" && <ProgressPanel />}
            {tab === "plan" && <PlanPanel />}
            {tab === "checkin" && <CheckInPanel />}
            {tab === "media" && <MediaPanel status={statusFor(statuses, "private_media")} />}
            {tab === "connections" && <ConnectionsPanel />}
            {tab === "privacy" && <PrivacyPanel token={memberToken} />}
          </div>
        </ResearchCapabilityBoundary>
      )}
    </ResearchMemberShell>
  );
}

// ---------------------------------------------------------------------------
// Today: adherence plus next actions. Fixture-backed in dev; honest empties
// in production until real log entries exist.
// ---------------------------------------------------------------------------

interface TodayData {
  adherence: { value: string; summary: string };
  loggedDays: { value: string; summary: string };
  nextActions: string[];
}

function fixtureToday(): TodayData {
  return {
    adherence: {
      value: "5 of 7",
      summary: "You logged five of the last seven days. Development preview data.",
    },
    loggedDays: {
      value: "12",
      summary: "Twelve entries so far this month. Development preview data.",
    },
    nextActions: ["Log today's sleep and energy", "Mark whether you trained today", "Review this week in Progress"],
  };
}

function TodayPanel() {
  const today = devFixture(fixtureToday);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {today ? (
          <>
            <ResearchMetricCard label="Adherence" value={today.adherence.value} summary={today.adherence.summary} />
            <ResearchMetricCard label="Entries this month" value={today.loggedDays.value} summary={today.loggedDays.summary} />
          </>
        ) : (
          <ResearchEmptyState
            title="Adherence appears as you log."
            body="Once you record a few daily entries, this panel shows how consistently you are logging. Nothing is scored."
          />
        )}
      </div>
      <section className="card" aria-label="Next actions">
        <p className="mono-label text-ink-mute">Next actions</p>
        {today && today.nextActions.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {today.nextActions.map((action) => (
              <li key={action} className="body-s text-ink-2">
                {action}
              </li>
            ))}
          </ul>
        ) : (
          <p className="body-s text-ink-2 mt-2 max-w-[52ch]">
            Next actions appear as your plan and your log entries come together. Start with a manual entry on the Log tab.
          </p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log: the manual daily entry form. Posts to the tracker log endpoint and
// tolerates an unpublished endpoint by keeping the entry as a local draft on
// this device only.
// ---------------------------------------------------------------------------

const DRAFT_KEY = "xenios-research-tracker-draft-v1";

interface LogDraft {
  sleepHours: string;
  energy: number | null;
  trainingDone: boolean;
  notes: string;
  savedAt?: string;
}

const EMPTY_DRAFT: LogDraft = { sleepHours: "", energy: null, trainingDone: false, notes: "" };

function readDraft(): LogDraft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<LogDraft>;
    return {
      sleepHours: typeof parsed.sleepHours === "string" ? parsed.sleepHours : "",
      energy: typeof parsed.energy === "number" && parsed.energy >= 1 && parsed.energy <= 10 ? parsed.energy : null,
      trainingDone: parsed.trainingDone === true,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(draft: LogDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // storage unavailable: the form still works for this session
  }
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

type LogFeedback =
  | { tone: "success" | "info"; text: string }
  | { tone: "error"; text: string }
  | null;

function LogPanel({ token }: { token: string | null }) {
  const [draft, setDraft] = useState<LogDraft>(() =>
    typeof window === "undefined" ? EMPTY_DRAFT : readDraft(),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<LogFeedback>(null);

  const update = (patch: Partial<LogDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      writeDraft(next);
      return next;
    });
  };

  const submit = async () => {
    const sleep = draft.sleepHours.trim() === "" ? null : Number(draft.sleepHours);
    if (sleep !== null && (!Number.isFinite(sleep) || sleep < 0 || sleep > 24)) {
      setFeedback({ tone: "error", text: "Sleep hours must be a number between 0 and 24." });
      return;
    }
    if (sleep === null && draft.energy === null && !draft.trainingDone && draft.notes.trim() === "") {
      setFeedback({ tone: "error", text: "Add at least one field before saving the entry." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result = await logTrackerEntry(
      {
        sleepHours: sleep,
        energy: draft.energy,
        trainingDone: draft.trainingDone,
        notes: draft.notes.trim() || null,
        loggedAt: new Date().toISOString(),
      },
      token,
    );
    setBusy(false);
    if (result.kind === "ok") {
      clearDraft();
      setDraft(EMPTY_DRAFT);
      setFeedback({ tone: "success", text: "Entry saved. It will appear in Progress as your record builds." });
      return;
    }
    if (result.kind === "unavailable") {
      setFeedback({
        tone: "info",
        text: "Logging is not connected to the server yet. Your entry is saved as a draft on this device and the form will keep it until submission opens.",
      });
      return;
    }
    if (result.kind === "unauthorized") {
      setFeedback({ tone: "error", text: "Your session has ended. Sign in again, your draft is kept on this device." });
      return;
    }
    setFeedback({
      tone: "error",
      text: result.kind === "forbidden" ? result.message ?? "This action is not allowed for your account." : result.message,
    });
  };

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Daily log entry"
    >
      <p className="mono-label text-ink-mute">Manual entry</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        A short daily record. Drafts stay on this device until the entry is submitted.
      </p>

      <div className="mt-6 grid gap-6">
        <div>
          <label htmlFor="tracker-sleep" className="form-label">
            Sleep hours
          </label>
          <input
            id="tracker-sleep"
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            className="input-field"
            style={{ maxWidth: 200 }}
            value={draft.sleepHours}
            onChange={(e) => update({ sleepHours: e.target.value })}
            placeholder="7.5"
          />
        </div>

        <fieldset>
          <legend className="form-label">Energy today, 1 to 10</legend>
          <div
            role="group"
            aria-label="Energy rating from 1, lowest, to 10, highest"
            className="grid gap-2 mt-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <ResearchSelectCard
                key={n}
                selected={draft.energy === n}
                onSelect={() => update({ energy: draft.energy === n ? null : n })}
                label={String(n)}
                description={n === 1 ? "Lowest" : n === 10 ? "Highest" : undefined}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="form-label">Training</legend>
          <div className="mt-2" style={{ maxWidth: 360 }}>
            <ResearchSelectCard
              selected={draft.trainingDone}
              onSelect={() => update({ trainingDone: !draft.trainingDone })}
              label="Training completed today"
              description="Select if you finished a planned session today."
            />
          </div>
        </fieldset>

        <div>
          <label htmlFor="tracker-notes" className="form-label">
            Notes
          </label>
          <textarea
            id="tracker-notes"
            className="input-field"
            rows={4}
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Anything worth remembering about today."
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`body-s mt-4 ${feedback.tone === "error" ? "" : "text-ink-2"}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.text}
        </p>
      )}
      {draft.savedAt && !feedback && (
        <p className="body-s text-ink-mute mt-4" role="status">
          Draft saved on this device.
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Save entry"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            clearDraft();
            setDraft(EMPTY_DRAFT);
            setFeedback({ tone: "info", text: "Draft cleared from this device." });
          }}
        >
          Clear draft
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Progress: metric cards with required text summaries. No charts without a
// text alternative, and no overall health score anywhere.
// ---------------------------------------------------------------------------

interface ProgressData {
  metrics: Array<{ label: string; value: string; summary: string }>;
}

function fixtureProgress(): ProgressData {
  return {
    metrics: [
      {
        label: "Average sleep, 7 days",
        value: "7.2 h",
        summary: "Average of your last seven sleep entries. Development preview data.",
      },
      {
        label: "Energy trend, 7 days",
        value: "6 to 7",
        summary: "Your self-rated energy moved from around 6 to around 7 across the week. Development preview data.",
      },
      {
        label: "Training sessions, 7 days",
        value: "4",
        summary: "Four days marked as training completed in the last seven. Development preview data.",
      },
    ],
  };
}

function ProgressPanel() {
  const progress = devFixture(fixtureProgress);
  return (
    <div className="grid gap-4">
      {progress ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {progress.metrics.map((m) => (
            <ResearchMetricCard key={m.label} label={m.label} value={m.value} summary={m.summary} />
          ))}
        </div>
      ) : (
        <ResearchEmptyState
          title="Data appears as you log."
          body="Sleep, energy, and training summaries build from your own entries over time. Each summary is written out in plain text, and nothing here is combined into an overall score."
        />
      )}
      <p className="body-s text-ink-mute max-w-[56ch]">
        Progress reflects only what you log. It is a record for you and the research team, not a score.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan: the plan itself lives in Xenios 30.
// ---------------------------------------------------------------------------

function PlanPanel() {
  return (
    <section className="card" aria-label="Your plan">
      <p className="mono-label text-ink-mute">Plan</p>
      <p className="body-m font-700 mt-1">Your plan lives in Xenios 30.</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        The tracker records your days; the Xenios 30 program holds the structured plan those days follow. Open it to see
        the current block and what comes next.
      </p>
      <div className="mt-4">
        <Link href={MEMBER_ROUTES.xenios30} className="btn btn-primary">
          Open Xenios 30
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Check-In: monthly check-in entry via the assessment in check-in mode.
// ---------------------------------------------------------------------------

function CheckInPanel() {
  return (
    <section className="card" aria-label="Monthly check-in">
      <p className="mono-label text-ink-mute">Monthly check-in</p>
      <p className="body-m font-700 mt-1">A short monthly review of how things are going.</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Once a month you revisit a short version of your assessment so the research team can see change over time in
        your own words. It takes a few minutes.
      </p>
      <div className="mt-4">
        <Link href={`${MEMBER_ROUTES.assessment}?mode=checkin`} className="btn btn-primary">
          Start monthly check-in
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Media: progress photos, voice notes, and video. Each panel states the
// face-blur and retention options in plain copy; the upload area itself sits
// behind the private_media capability boundary, so no upload control exists
// while the capability is disabled.
// ---------------------------------------------------------------------------

function MediaPanel({ status }: { status: CapabilityStatus }) {
  const panels: Array<{ key: string; title: string; body: string; uploadLabel: string }> = [
    {
      key: "photos",
      title: "Progress photos",
      body: "Private photos visible only to you and the research team.",
      uploadLabel: "Upload photos",
    },
    {
      key: "voice",
      title: "Voice notes",
      body: "Short private voice notes when typing is not convenient.",
      uploadLabel: "Record or upload a voice note",
    },
    {
      key: "video",
      title: "Video",
      body: "Private form-check or update videos for the research team.",
      uploadLabel: "Upload video",
    },
  ];
  return (
    <div className="grid gap-4">
      {panels.map((panel) => (
        <section key={panel.key} className="card" aria-label={panel.title}>
          <p className="mono-label text-ink-mute">{panel.title}</p>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">{panel.body}</p>
          <ul className="mt-3 grid gap-1">
            <li className="body-s text-ink-2">Option: automatic face blur can be applied before anything is stored.</li>
            <li className="body-s text-ink-2">
              Option: a retention window, after which media is deleted, is set by you when uploads open.
            </li>
          </ul>
          <div className="mt-4">
            <ResearchCapabilityBoundary status={status}>
              <button type="button" className="btn btn-secondary">
                {panel.uploadLabel}
              </button>
            </ResearchCapabilityBoundary>
          </div>
        </section>
      ))}
      <ResearchSecureNotice>
        Media is private storage, never public, and never used outside your own record without your explicit consent.
      </ResearchSecureNotice>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connections: wearables, honestly pending.
// ---------------------------------------------------------------------------

function ConnectionsPanel() {
  return (
    <section className="card" aria-label="Wearable connections">
      <div className="flex items-center justify-between gap-4">
        <p className="mono-label text-ink-mute">Wearables</p>
        <ResearchStatusBadge label="Pending" tone="pending" />
      </div>
      <p className="body-m font-700 mt-1">Wearable connections are being prepared.</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        When this opens, you will be able to connect a wearable so sleep and activity fill in automatically instead of
        manual entry. Until then, the Log tab is the way to record your days.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Data and Privacy: export and deletion requests, tolerant of unpublished
// endpoints, with an honest fallback path.
// ---------------------------------------------------------------------------

function PrivacyPanel({ token }: { token: string | null }) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const requestExport = async () => {
    setExportBusy(true);
    setExportMessage(null);
    const result = await requestTrackerExport(new Date().toISOString(), token);
    setExportBusy(false);
    if (result.kind === "ok") {
      setExportMessage("Export requested. The research team will prepare your data and contact you when it is ready.");
    } else if (result.kind === "unavailable") {
      setExportMessage(
        "Export requests are not connected to the server yet. Email research@xeniostechnology.com and your export will be handled by a person.",
      );
    } else if (result.kind === "unauthorized") {
      setExportMessage("Your session has ended. Sign in again to request an export.");
    } else {
      setExportMessage(result.kind === "forbidden" ? result.message ?? "This action is not allowed for your account." : result.message);
    }
  };

  const requestDeletion = async () => {
    setDeleteBusy(true);
    setDeleteMessage(null);
    const result = await requestTrackerDeletion(new Date().toISOString(), token);
    setDeleteBusy(false);
    setDeleteOpen(false);
    if (result.kind === "ok") {
      setDeleteMessage("Deletion requested. A person will confirm with you before anything is removed.");
    } else if (result.kind === "unavailable") {
      setDeleteMessage(
        "Deletion requests are not connected to the server yet. Email research@xeniostechnology.com and your request will be handled by a person.",
      );
    } else if (result.kind === "unauthorized") {
      setDeleteMessage("Your session has ended. Sign in again to request deletion.");
    } else {
      setDeleteMessage(result.kind === "forbidden" ? result.message ?? "This action is not allowed for your account." : result.message);
    }
  };

  return (
    <div className="grid gap-4">
      <section className="card" aria-label="Export your data">
        <p className="mono-label text-ink-mute">Export</p>
        <p className="body-m font-700 mt-1">Request a copy of your tracker data.</p>
        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
          You can request everything you have logged, in a readable format, at any time.
        </p>
        <div className="mt-4">
          <button type="button" className="btn btn-secondary" onClick={() => void requestExport()} disabled={exportBusy}>
            {exportBusy ? "Requesting..." : "Request export"}
          </button>
        </div>
        {exportMessage && (
          <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
            {exportMessage}
          </p>
        )}
      </section>

      <section className="card" aria-label="Delete your data">
        <p className="mono-label text-ink-mute">Deletion</p>
        <p className="body-m font-700 mt-1">Request deletion of your tracker data.</p>
        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
          A deletion request is reviewed and confirmed with you by a person before anything is removed. Nothing is
          deleted silently.
        </p>
        <div className="mt-4">
          <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(true)} disabled={deleteBusy}>
            Request deletion
          </button>
        </div>
        {deleteMessage && (
          <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
            {deleteMessage}
          </p>
        )}
      </section>

      <ResearchSecureNotice>
        Tracker data is private to you and the research team. It is never sold, never shared outside the program, and
        export and deletion requests are always honored through a named person.
      </ResearchSecureNotice>

      <ResearchConfirmation
        open={deleteOpen}
        title="Request deletion of tracker data"
        body={
          <>
            <p>
              This sends a deletion request for your tracker entries. A person will confirm the scope with you before
              anything is removed, so this action is not itself destructive.
            </p>
          </>
        }
        confirmLabel="Send deletion request"
        danger
        busy={deleteBusy}
        onConfirm={() => void requestDeletion()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
