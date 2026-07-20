import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchSelectCard,
  ResearchStatusBadge,
  ResearchTabs,
  capabilityStatusOrPending,
  useDebounced,
} from "../../ui/kit";
import { apiGet, apiPost, type ApiResult } from "../../lib/api";
import {
  fetchCapabilities,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";

// ---------------------------------------------------------------------------
// Member assessment (/research/member/assessment). The full adaptive form
// experience as presentation: sectioned progress, a local autosave draft
// (real, works today, stored on this device), choice batteries, word-counted
// text areas, a review step, and an honest submit path. The capability
// boundary for "assessment" wraps everything; submission posts to
// /api/research/member/assessment and an unavailable endpoint keeps the local
// draft intact while saying so plainly.
// ---------------------------------------------------------------------------

const DRAFT_KEY = "research-assessment-draft-v1";

type AnswerValue = string | string[];
type Answers = Record<string, AnswerValue>;

type QuestionKind = "single" | "multi" | "text";

interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

interface Question {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options?: QuestionOption[];
  placeholder?: string;
  checkin?: boolean;
}

interface AssessmentSection {
  key: string;
  title: string;
  description: string;
  sensitive: boolean;
  checkin: boolean;
  questions: Question[];
}

const SECTIONS: AssessmentSection[] = [
  {
    key: "basic",
    title: "Basic information",
    description: "A few essentials so your profile is addressed to you.",
    sensitive: false,
    checkin: false,
    questions: [
      {
        id: "basic.preferredName",
        prompt: "What should we call you?",
        kind: "text",
        placeholder: "Your preferred name",
      },
      {
        id: "basic.location",
        prompt: "Where are you based?",
        kind: "text",
        placeholder: "City and state, or country",
      },
    ],
  },
  {
    key: "goals",
    title: "Goals",
    description: "What you are working toward right now.",
    sensitive: false,
    checkin: true,
    questions: [
      {
        id: "goals.primary",
        prompt: "What is your primary goal?",
        kind: "single",
        options: [
          { value: "recomposition", label: "Body recomposition", description: "Build muscle while reducing body fat" },
          { value: "strength", label: "Strength", description: "Get stronger in key lifts" },
          { value: "energy", label: "Energy", description: "More consistent energy through the day" },
          { value: "sleep", label: "Sleep", description: "Better, more consistent sleep" },
          { value: "focus", label: "Focus", description: "Sharper attention and clarity" },
          { value: "overall", label: "Overall wellbeing", description: "A broad, sustainable baseline" },
        ],
      },
      {
        id: "goals.motivation",
        prompt: "Why does this matter to you right now?",
        kind: "text",
        placeholder: "A few honest sentences in your own words",
      },
    ],
  },
  {
    key: "routine",
    title: "Routine",
    description: "The real shape of your week, not the ideal one.",
    sensitive: false,
    checkin: true,
    questions: [
      {
        id: "routine.consistency",
        prompt: "How consistent is your weekly routine?",
        kind: "single",
        options: [
          { value: "very", label: "Very consistent", description: "Most days look the same" },
          { value: "mostly", label: "Mostly consistent", description: "A stable base with some variation" },
          { value: "varies", label: "It varies", description: "Weeks differ quite a bit" },
          { value: "unpredictable", label: "Unpredictable", description: "Hard to plan more than a few days out" },
        ],
      },
      {
        id: "routine.week",
        prompt: "Describe a typical week.",
        kind: "text",
        placeholder: "Work hours, commute, family time, training, anything that shapes your days",
      },
    ],
  },
  {
    key: "fitness",
    title: "Fitness",
    description: "Where your training is today.",
    sensitive: false,
    checkin: true,
    questions: [
      {
        id: "fitness.sessions",
        prompt: "How many training sessions in a typical week?",
        kind: "single",
        options: [
          { value: "0-1", label: "0 to 1" },
          { value: "2-3", label: "2 to 3" },
          { value: "4-5", label: "4 to 5" },
          { value: "6+", label: "6 or more" },
        ],
      },
      {
        id: "fitness.experience",
        prompt: "How would you describe your training experience?",
        kind: "single",
        options: [
          { value: "new", label: "New to training" },
          { value: "returning", label: "Returning after a break" },
          { value: "1-3", label: "1 to 3 years consistent" },
          { value: "3+", label: "More than 3 years consistent" },
        ],
      },
    ],
  },
  {
    key: "nutrition",
    title: "Nutrition",
    description: "How you actually eat, without judgment.",
    sensitive: false,
    checkin: true,
    questions: [
      {
        id: "nutrition.pattern",
        prompt: "Which best describes your eating pattern?",
        kind: "single",
        options: [
          { value: "structured", label: "Structured", description: "Planned meals most days" },
          { value: "semi", label: "Semi-structured", description: "A loose plan with flexibility" },
          { value: "intuitive", label: "Intuitive", description: "I eat when and what feels right" },
          { value: "irregular", label: "Irregular", description: "Meals are hard to predict" },
        ],
      },
      {
        id: "nutrition.challenge",
        prompt: "What is the hardest part of eating well for you?",
        kind: "text",
        placeholder: "Time, cravings, travel, cooking, anything at all",
      },
    ],
  },
  {
    key: "sleep",
    title: "Sleep",
    description: "Your sleep as it is right now.",
    sensitive: true,
    checkin: true,
    questions: [
      {
        id: "sleep.hours",
        prompt: "How many hours do you usually sleep?",
        kind: "single",
        options: [
          { value: "<6", label: "Under 6 hours" },
          { value: "6-7", label: "6 to 7 hours" },
          { value: "7-8", label: "7 to 8 hours" },
          { value: "8+", label: "More than 8 hours" },
        ],
      },
      {
        id: "sleep.quality",
        prompt: "How would you rate your sleep quality?",
        kind: "single",
        options: [
          { value: "poor", label: "Poor" },
          { value: "fair", label: "Fair" },
          { value: "good", label: "Good" },
          { value: "great", label: "Great" },
        ],
      },
    ],
  },
  {
    key: "energyStress",
    title: "Energy and stress",
    description: "How your days feel, honestly.",
    sensitive: true,
    checkin: true,
    questions: [
      {
        id: "energy.level",
        prompt: "How does your energy usually run through the day?",
        kind: "single",
        options: [
          { value: "steady", label: "Steady", description: "Fairly even from morning to night" },
          { value: "dips", label: "Afternoon dips", description: "A noticeable slump mid-afternoon" },
          { value: "slow-start", label: "Slow starts", description: "Mornings are the hard part" },
          { value: "low", label: "Generally low", description: "Most days feel like a grind" },
        ],
      },
      {
        id: "stress.sources",
        prompt: "What are your main sources of stress? Choose all that apply.",
        kind: "multi",
        options: [
          { value: "work", label: "Work" },
          { value: "family", label: "Family" },
          { value: "finances", label: "Finances" },
          { value: "habits", label: "My own habits" },
          { value: "travel", label: "Travel and schedule" },
          { value: "other", label: "Something else" },
        ],
      },
    ],
  },
  {
    key: "currentProducts",
    title: "Current products",
    description: "What you are currently using, so recommendations fit around it.",
    sensitive: true,
    checkin: true,
    questions: [
      {
        id: "products.categories",
        prompt: "Which categories are you currently using? Choose all that apply.",
        kind: "multi",
        options: [
          { value: "none", label: "None right now" },
          { value: "protein", label: "Protein" },
          { value: "creatine", label: "Creatine" },
          { value: "vitamins", label: "Vitamins and minerals" },
          { value: "other", label: "Other" },
        ],
      },
      {
        id: "products.detail",
        prompt: "List what you currently use, in your own words.",
        kind: "text",
        placeholder: "Names and how long you have used each",
      },
    ],
  },
  {
    key: "allergies",
    title: "Allergies and restrictions",
    description: "Anything the review team must know before recommendations.",
    sensitive: true,
    checkin: false,
    questions: [
      {
        id: "restrictions.list",
        prompt: "Do any of these apply to you? Choose all that apply.",
        kind: "multi",
        options: [
          { value: "none", label: "None of these" },
          { value: "vegetarian", label: "Vegetarian" },
          { value: "vegan", label: "Vegan" },
          { value: "halal", label: "Halal" },
          { value: "kosher", label: "Kosher" },
          { value: "gluten-free", label: "Gluten-free" },
          { value: "dairy-free", label: "Dairy-free" },
        ],
      },
      {
        id: "allergies.detail",
        prompt: "List any allergies or things you avoid.",
        kind: "text",
        placeholder: "Write \"none\" if nothing applies",
      },
    ],
  },
  {
    key: "budget",
    title: "Budget and preferences",
    description: "What you are comfortable investing, and how you like to work.",
    sensitive: false,
    checkin: false,
    questions: [
      {
        id: "budget.range",
        prompt: "What monthly range are you comfortable with?",
        kind: "single",
        options: [
          { value: "<100", label: "Under $100" },
          { value: "100-200", label: "$100 to $200" },
          { value: "200-400", label: "$200 to $400" },
          { value: "400+", label: "More than $400" },
        ],
      },
      {
        id: "preferences.cadence",
        prompt: "How often would you like to check in?",
        kind: "single",
        options: [
          { value: "weekly", label: "Weekly" },
          { value: "biweekly", label: "Every two weeks" },
          { value: "monthly", label: "Monthly" },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Local draft (real today): answers persist on this device under DRAFT_KEY.
// ---------------------------------------------------------------------------

interface DraftShape {
  answers: Answers;
  savedAt: string;
}

function loadDraft(): DraftShape | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftShape;
    if (parsed && typeof parsed === "object" && parsed.answers && typeof parsed.answers === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveDraft(answers: Answers): string | null {
  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, savedAt } satisfies DraftShape));
    return savedAt;
  } catch {
    return null;
  }
}

function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

function AutosaveIndicator({ savedAt }: { savedAt: string | null }) {
  return (
    <p role="status" aria-live="polite" className="mono-label text-ink-mute" data-testid="ra-autosave">
      {savedAt
        ? `Saved locally at ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Answers save locally on this device as you go."}
    </p>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Server state: deadline and prior submission, when the member platform
// publishes them. Absent endpoint stays honest (dev shows a fixture).
// ---------------------------------------------------------------------------

interface AssessmentServerState {
  status?: "not_started" | "in_progress" | "submitted" | null;
  deadlineAt?: string | null;
  submittedAt?: string | null;
}

function fixtureServerState(): AssessmentServerState {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 3);
  return { status: "not_started", deadlineAt: deadline.toISOString() };
}

function DeadlineBanner({ deadlineAt }: { deadlineAt: string }) {
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return null;
  const msLeft = deadline.getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  const dateLabel = deadline.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="card mb-6" role="status" data-testid="ra-deadline">
      <p className="mono-label text-ink-mute">Assessment window</p>
      <p className="body-m font-700 mt-1">
        {daysLeft === 0
          ? `Your assessment window closes today, ${dateLabel}.`
          : `Your assessment window closes in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}, on ${dateLabel}.`}
      </p>
      <p className="body-s text-ink-2 mt-2">
        Your answers save locally as you go, so you can return and finish any time before then.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question renderers
// ---------------------------------------------------------------------------

function QuestionBlock({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const promptId = `q-${question.id.replace(/\./g, "-")}`;
  if (question.kind === "text") {
    const text = typeof value === "string" ? value : "";
    const words = wordCount(text);
    return (
      <div className="mt-6">
        <label htmlFor={promptId} className="form-label">
          {question.prompt}
        </label>
        <textarea
          id={promptId}
          className="input-field mt-2"
          rows={4}
          value={text}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${promptId}-count`}
        />
        <p id={`${promptId}-count`} className="mono-label text-ink-mute mt-1">
          {words} {words === 1 ? "word" : "words"}
        </p>
      </div>
    );
  }
  const options = question.options ?? [];
  if (question.kind === "single") {
    const selected = typeof value === "string" ? value : null;
    return (
      <div className="mt-6" role="group" aria-labelledby={promptId}>
        <p id={promptId} className="form-label">
          {question.prompt}
        </p>
        <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {options.map((opt) => (
            <ResearchSelectCard
              key={opt.value}
              selected={selected === opt.value}
              onSelect={() => onChange(opt.value)}
              label={opt.label}
              description={opt.description}
            />
          ))}
        </div>
      </div>
    );
  }
  const selectedList = Array.isArray(value) ? value : [];
  const toggle = (v: string) =>
    onChange(selectedList.includes(v) ? selectedList.filter((x) => x !== v) : [...selectedList, v]);
  return (
    <div className="mt-6" role="group" aria-labelledby={promptId}>
      <p id={promptId} className="form-label">
        {question.prompt}
      </p>
      <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {options.map((opt) => (
          <ResearchSelectCard
            key={opt.value}
            selected={selectedList.includes(opt.value)}
            onSelect={() => toggle(opt.value)}
            label={opt.label}
            description={opt.description}
          />
        ))}
      </div>
    </div>
  );
}

function answered(question: Question, answers: Answers): boolean {
  const v = answers[question.id];
  if (v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return v.length > 0;
}

function summarizeAnswer(question: Question, answers: Answers): string | null {
  const v = answers[question.id];
  if (v === undefined) return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    if (question.options) {
      return question.options.find((o) => o.value === trimmed)?.label ?? trimmed;
    }
    return trimmed.length > 90 ? trimmed.slice(0, 90) + "..." : trimmed;
  }
  if (!v.length) return null;
  const labels = v.map((val) => question.options?.find((o) => o.value === val)?.label ?? val);
  return labels.join(", ");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Mode = "full" | "checkin";
type SubmitState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "submitted"; at: string }
  | { phase: "unavailable" }
  | { phase: "unauthorized" }
  | { phase: "error"; message: string };

export default function Assessment() {
  const { memberToken } = useResearch();
  const search = useSearch();
  const [, setLocation] = useLocation();

  const initialMode: Mode = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("mode") === "checkin" ? "checkin" : "full";
  }, [search]);
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Capabilities: fetched once per page; the assessment capability gates the
  // whole experience.
  const [caps, setCaps] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchCapabilities(memberToken).then((m) => {
      if (!cancelled) setCaps(m);
    });
    return () => {
      cancelled = true;
    };
  }, [memberToken]);

  // Server-published member state (deadline, prior submission). Optional and
  // honest: unavailable in production means no banner, not a fake one.
  const [serverState, setServerState] = useState<ApiResult<AssessmentServerState> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void apiGet<AssessmentServerState>("/api/research/member/assessment", memberToken).then((res) => {
      if (!cancelled) setServerState(res);
    });
    return () => {
      cancelled = true;
    };
  }, [memberToken]);

  const memberState: AssessmentServerState | null =
    serverState?.kind === "ok"
      ? serverState.data
      : serverState?.kind === "unavailable"
        ? devFixture(fixtureServerState)
        : null;

  // Answers with the local draft restored on first render.
  const [answers, setAnswers] = useState<Answers>(() => loadDraft()?.answers ?? {});
  const [savedAt, setSavedAt] = useState<string | null>(() => loadDraft()?.savedAt ?? null);
  const hydratedRef = useRef(false);
  const debouncedAnswers = useDebounced(answers, 500);
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const at = saveDraft(debouncedAnswers);
    if (at) setSavedAt(at);
  }, [debouncedAnswers]);

  const activeSections = useMemo(
    () => (mode === "checkin" ? SECTIONS.filter((s) => s.checkin) : SECTIONS),
    [mode],
  );
  const [step, setStep] = useState(0);
  const reviewIndex = activeSections.length;
  const clampedStep = Math.min(step, reviewIndex);
  const onReview = clampedStep === reviewIndex;
  const currentSection = onReview ? null : activeSections[clampedStep];

  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next);
      setStep(0);
      setSubmit({ phase: "idle" });
      setLocation(next === "checkin" ? `${MEMBER_ROUTES.assessment}?mode=checkin` : MEMBER_ROUTES.assessment, {
        replace: true,
      });
    },
    [setLocation],
  );

  const doSubmit = useCallback(async () => {
    setSubmit({ phase: "submitting" });
    const res = await apiPost<{ ok?: boolean }>(
      "/api/research/member/assessment",
      { mode, answers },
      memberToken,
    );
    if (res.kind === "ok") {
      // The server has the answers; the local draft has done its job.
      clearDraft();
      setSubmit({ phase: "submitted", at: new Date().toISOString() });
      return;
    }
    if (res.kind === "unavailable" || res.kind === "forbidden") {
      // Keep the draft. Nothing is lost; submission simply is not open yet.
      setSubmit({ phase: "unavailable" });
      return;
    }
    if (res.kind === "unauthorized") {
      setSubmit({ phase: "unauthorized" });
      return;
    }
    setSubmit({ phase: "error", message: res.message });
  }, [mode, answers, memberToken]);

  const sectionProgress = activeSections.map((s) => {
    const total = s.questions.length;
    const done = s.questions.filter((q) => answered(q, answers)).length;
    return { section: s, total, done };
  });
  const totalQuestions = sectionProgress.reduce((n, s) => n + s.total, 0);
  const totalAnswered = sectionProgress.reduce((n, s) => n + s.done, 0);

  const alreadySubmitted = memberState?.status === "submitted" && mode === "full";
  const modeLabel = mode === "checkin" ? "Monthly check-in" : "Full assessment";

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title={mode === "checkin" ? "Monthly check-in" : "Assessment"}
      lead={
        mode === "checkin"
          ? "A short check-in so your plan stays matched to your month."
          : "Your assessment builds your profile and shapes everything that follows. Take your time; answers save locally as you go."
      }
    >
      <ResearchCapabilityBoundary status={capabilityStatusOrPending(caps, "assessment")}>
        <ResearchRouteBoundary state="ok">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <ResearchTabs
              label="Assessment mode"
              tabs={[
                { key: "full", label: "Full assessment" },
                { key: "checkin", label: "Monthly check-in" },
              ]}
              active={mode}
              onSelect={(key) => switchMode(key === "checkin" ? "checkin" : "full")}
            />
            <AutosaveIndicator savedAt={savedAt} />
          </div>

          {memberState?.deadlineAt && submit.phase !== "submitted" && !alreadySubmitted && (
            <DeadlineBanner deadlineAt={memberState.deadlineAt} />
          )}

          <div className="mb-6">
            <ResearchSecureNotice>
              Your answers are private. They are stored on this device until you submit, and after submission
              they are visible only to you and the review team.
            </ResearchSecureNotice>
          </div>

          {submit.phase === "submitted" ? (
            <section className="card" role="status" aria-live="polite">
              <ResearchStatusBadge label="Received" tone="success" />
              <p className="body-m font-700 mt-3">Your {modeLabel.toLowerCase()} has been received.</p>
              <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                The review team will go through your answers and your profile will update from them. You can
                revisit this page any time.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={MEMBER_ROUTES.profile} className="btn btn-primary">
                  View your profile
                </Link>
                <Link href={MEMBER_ROUTES.home} className="btn btn-ghost">
                  Back to member home
                </Link>
              </div>
            </section>
          ) : alreadySubmitted ? (
            <section className="card" role="status">
              <ResearchStatusBadge label="Already submitted" tone="success" />
              <p className="body-m font-700 mt-3">Your full assessment is already on file.</p>
              <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                {memberState?.submittedAt
                  ? `Submitted ${new Date(memberState.submittedAt).toLocaleDateString()}. `
                  : ""}
                Use the monthly check-in to keep your plan current.
              </p>
              <button type="button" className="btn btn-secondary mt-4" onClick={() => switchMode("checkin")}>
                Start a monthly check-in
              </button>
            </section>
          ) : (
            <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)", alignItems: "start" }}>
              <nav aria-label="Assessment sections" className="card" style={{ position: "sticky", top: 16 }}>
                <p className="mono-label text-ink-mute">
                  {totalAnswered} of {totalQuestions} answered
                </p>
                <ol className="mt-3 grid gap-1" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {sectionProgress.map(({ section, total, done }, i) => (
                    <li key={section.key}>
                      <button
                        type="button"
                        className={`btn btn-ghost ${i === clampedStep ? "font-700" : "text-ink-2"}`}
                        style={{ width: "100%", justifyContent: "space-between", display: "flex", gap: 8 }}
                        aria-current={i === clampedStep ? "step" : undefined}
                        onClick={() => setStep(i)}
                      >
                        <span className="body-s">{section.title}</span>
                        <span className="mono-label text-ink-mute">
                          {done}/{total}
                        </span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className={`btn btn-ghost ${onReview ? "font-700" : "text-ink-2"}`}
                      style={{ width: "100%", justifyContent: "flex-start", display: "flex" }}
                      aria-current={onReview ? "step" : undefined}
                      onClick={() => setStep(reviewIndex)}
                    >
                      <span className="body-s">Review and submit</span>
                    </button>
                  </li>
                </ol>
              </nav>

              <div>
                {currentSection && (
                  <section className="card" aria-labelledby={`section-${currentSection.key}`}>
                    <p className="mono-label text-ink-mute">
                      Section {clampedStep + 1} of {activeSections.length}
                    </p>
                    <h2 id={`section-${currentSection.key}`} className="body-m font-700 mt-1">
                      {currentSection.title}
                    </h2>
                    <p className="body-s text-ink-2 mt-1">{currentSection.description}</p>
                    {currentSection.sensitive && (
                      <div className="mt-3">
                        <ResearchSecureNotice>
                          This section is sensitive and is treated with extra care.
                        </ResearchSecureNotice>
                      </div>
                    )}
                    {currentSection.questions.map((q) => (
                      <QuestionBlock
                        key={q.id}
                        question={q}
                        value={answers[q.id]}
                        onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                      />
                    ))}
                    <div className="mt-8 flex flex-wrap gap-3">
                      {clampedStep > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={() => setStep(clampedStep - 1)}>
                          Back
                        </button>
                      )}
                      <button type="button" className="btn btn-primary" onClick={() => setStep(clampedStep + 1)}>
                        {clampedStep + 1 === activeSections.length ? "Go to review" : "Continue"}
                      </button>
                    </div>
                  </section>
                )}

                {onReview && (
                  <section className="card" aria-labelledby="assessment-review">
                    <h2 id="assessment-review" className="body-m font-700">
                      Review before you submit
                    </h2>
                    <p className="body-s text-ink-2 mt-1">
                      A quick look at what you have answered. You can edit any section before submitting.
                    </p>
                    <div className="mt-4 grid gap-4">
                      {sectionProgress.map(({ section, total, done }, i) => (
                        <div key={section.key} className="flex flex-wrap items-start justify-between gap-3" style={{ borderTop: "1px solid var(--border, rgba(128,128,128,0.2))", paddingTop: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <p className="body-s font-700">{section.title}</p>
                            <p className="mono-label text-ink-mute mt-1">
                              {done} of {total} answered
                            </p>
                            {section.questions.map((q) => {
                              const summary = summarizeAnswer(q, answers);
                              return summary ? (
                                <p key={q.id} className="body-s text-ink-2 mt-1">
                                  {summary}
                                </p>
                              ) : null;
                            })}
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setStep(i)}
                            aria-label={`Edit ${section.title}`}
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>

                    {submit.phase === "unavailable" && (
                      <div className="mt-6 card" role="status" aria-live="polite">
                        <p className="body-m font-700">Submission opens when the member platform publishes.</p>
                        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                          Your answers are safe. Everything you entered is saved locally on this device
                          {savedAt
                            ? `, last saved at ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                            : ""}
                          , and nothing was lost. Come back and submit once this opens.
                        </p>
                      </div>
                    )}
                    {submit.phase === "unauthorized" && (
                      <div className="mt-6 card" role="alert">
                        <p className="body-m font-700">Please sign in again.</p>
                        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
                          Your session has ended. Your answers are saved locally on this device, so signing in
                          again will not lose them.
                        </p>
                        <a href="/research/sign-in" className="btn btn-primary mt-4 inline-block">
                          Member Login
                        </a>
                      </div>
                    )}
                    {submit.phase === "error" && (
                      <div className="mt-6 card" role="alert">
                        <p className="body-m font-700">The submission did not go through.</p>
                        <p className="body-s text-ink-2 mt-2">{submit.message}</p>
                        <p className="body-s text-ink-mute mt-1">Your answers are still saved locally on this device.</p>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void doSubmit()}
                        disabled={submit.phase === "submitting" || totalAnswered === 0}
                        data-testid="ra-assessment-submit"
                      >
                        {submit.phase === "submitting"
                          ? "Submitting..."
                          : mode === "checkin"
                            ? "Submit check-in"
                            : "Submit assessment"}
                      </button>
                      <span className="body-s text-ink-mute">
                        {totalAnswered === 0
                          ? "Answer at least one question to submit."
                          : `${totalAnswered} of ${totalQuestions} questions answered.`}
                      </span>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </ResearchRouteBoundary>
      </ResearchCapabilityBoundary>
    </ResearchMemberShell>
  );
}
