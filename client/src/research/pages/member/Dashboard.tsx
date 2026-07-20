import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import { ResearchRouteBoundary, ResearchStatusBadge, capabilityStatusOrPending } from "../../ui/kit";
import { getMemberOverview } from "../../adapters/member";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";
import { MEMBER_ROUTES } from "../../lib/routes";

// ---------------------------------------------------------------------------
// Member home (/research/member). The first viewport is ONE next action, not
// a wall of equal cards: the step is derived from member state in priority
// order (assessment due, then plan state, then a Samuel-reviewed update, then
// an order or subscription problem, then an answered question). When the
// overview endpoint is not published yet the page stays honest: the default
// next step says the assessment opens soon, using the capability registry's
// own message. Everything below the fold is progressive disclosure: compact
// link rows into every member area.
// ---------------------------------------------------------------------------

type MemberOverview = {
  assessment?: { state: "due" | "in_progress" | "complete" | "locked" } | null;
  plan?: { state: "preparing" | "ready" | "updated"; updatedAt?: string | null } | null;
  reviewedUpdate?: { title: string; at?: string | null } | null;
  orderIssue?: { orderId: string; summary: string } | null;
  subscriptionIssue?: { summary: string } | null;
  supportAnswer?: { summary: string } | null;
};

type NextStep = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

function deriveNextStep(overview: MemberOverview | null, assessmentStatus: CapabilityStatus): NextStep {
  if (overview?.assessment && (overview.assessment.state === "due" || overview.assessment.state === "in_progress")) {
    return {
      eyebrow: "Next step",
      title: overview.assessment.state === "in_progress" ? "Finish your assessment" : "Complete your assessment",
      body: "Your plan starts from your assessment. It saves as you go, so you can stop and come back.",
      href: MEMBER_ROUTES.assessment,
      cta: overview.assessment.state === "in_progress" ? "Continue the assessment" : "Start the assessment",
    };
  }
  if (overview?.plan && (overview.plan.state === "ready" || overview.plan.state === "updated")) {
    return {
      eyebrow: "Next step",
      title: overview.plan.state === "updated" ? "Your Blueprint was updated" : "Your Blueprint is ready",
      body:
        overview.plan.state === "updated"
          ? "Your plan has changed since you last read it. Review the update before your next block."
          : "Your personal plan has been prepared and is ready to read.",
      href: MEMBER_ROUTES.blueprint,
      cta: "Open your Blueprint",
    };
  }
  if (overview?.reviewedUpdate) {
    return {
      eyebrow: "Next step",
      title: "A reviewed update is ready for you",
      body: overview.reviewedUpdate.title,
      href: MEMBER_ROUTES.documents,
      cta: "Read the update",
    };
  }
  if (overview?.orderIssue) {
    return {
      eyebrow: "Needs attention",
      title: "An order needs your attention",
      body: overview.orderIssue.summary,
      href: MEMBER_ROUTES.orders,
      cta: "Review the order",
    };
  }
  if (overview?.subscriptionIssue) {
    return {
      eyebrow: "Needs attention",
      title: "A subscription needs your attention",
      body: overview.subscriptionIssue.summary,
      href: MEMBER_ROUTES.subscriptions,
      cta: "Review subscriptions",
    };
  }
  if (overview?.supportAnswer) {
    return {
      eyebrow: "Next step",
      title: "Your question has an answer",
      body: overview.supportAnswer.summary,
      href: MEMBER_ROUTES.questions,
      cta: "Read the answer",
    };
  }
  // Honest default when no member state is available yet.
  return {
    eyebrow: "Next step",
    title: "Your assessment opens soon",
    body: assessmentStatus.publicMessage,
    href: MEMBER_ROUTES.assessment,
    cta: "About the assessment",
  };
}

// Progressive disclosure: three compact groups, in the canonical order.
const AREA_GROUPS: Array<{ heading: string; links: Array<{ href: string; label: string }> }> = [
  {
    heading: "Your plan",
    links: [
      { href: MEMBER_ROUTES.blueprint, label: "Blueprint" },
      { href: MEMBER_ROUTES.xenios30, label: "Xenios 30" },
      { href: MEMBER_ROUTES.xenios90, label: "Xenios 90" },
      { href: MEMBER_ROUTES.tracker, label: "Tracker" },
      { href: MEMBER_ROUTES.goals, label: "Goals" },
    ],
  },
  {
    heading: "Products and orders",
    links: [
      { href: MEMBER_ROUTES.products, label: "Products" },
      { href: MEMBER_ROUTES.orders, label: "Orders" },
      { href: MEMBER_ROUTES.subscriptions, label: "Subscriptions" },
      { href: MEMBER_ROUTES.guides, label: "Guides" },
    ],
  },
  {
    heading: "Help and account",
    links: [
      { href: MEMBER_ROUTES.questions, label: "Questions" },
      { href: MEMBER_ROUTES.membership, label: "Membership" },
      { href: MEMBER_ROUTES.referrals, label: "Referrals" },
      { href: MEMBER_ROUTES.security, label: "Security" },
      { href: MEMBER_ROUTES.privacy, label: "Privacy" },
    ],
  },
];

export default function MemberDashboard() {
  const { member, memberChecking, memberToken } = useResearch();
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  const [overview, setOverview] = useState<MemberOverview | null>(null);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

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
      const res = await getMemberOverview<MemberOverview>(memberToken);
      if (!alive) return;
      if (res.kind === "ok") {
        setOverview(res.data);
      } else if (res.kind === "unauthorized") {
        setSessionEnded(true);
      } else {
        // Unpublished endpoint or a transient failure: development renders a
        // realistic fixture; production renders the honest default next step.
        setOverview(
          devFixture<MemberOverview>(() => ({
            assessment: { state: "due" },
            supportAnswer: { summary: "Your question about shipping timelines was answered." },
          })),
        );
      }
      setOverviewLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [member, memberToken]);

  const assessmentStatus = capabilityStatusOrPending(capabilities, "assessment");
  const nextStep = useMemo(() => deriveNextStep(overview, assessmentStatus), [overview, assessmentStatus]);

  const state: "loading" | "ok" | "unauthorized" = memberChecking
    ? "loading"
    : !member || sessionEnded
      ? "unauthorized"
      : !overviewLoaded
        ? "loading"
        : "ok";

  return (
    <ResearchMemberShell
      eyebrow="Member"
      title={member ? `Welcome back, ${member.firstName}` : "Member home"}
      lead="One place for your plan, your products, and your account."
    >
      <ResearchRouteBoundary state={state}>
        <section aria-labelledby="ra-next-step-heading" className="card" style={{ borderWidth: 2 }}>
          <div className="flex items-center gap-3">
            <p className="mono-cap text-pulse">{nextStep.eyebrow}</p>
            {nextStep.eyebrow === "Needs attention" && <ResearchStatusBadge label="Action needed" tone="warning" />}
          </div>
          <h2 id="ra-next-step-heading" className="body-l font-700 mt-2">
            {nextStep.title}
          </h2>
          <p className="body-m text-ink-2 mt-2 max-w-[56ch]">{nextStep.body}</p>
          <div className="mt-5">
            <Link href={nextStep.href} className="btn btn-primary">
              {nextStep.cta}
            </Link>
          </div>
        </section>

        <div className="mt-10 grid gap-6">
          {AREA_GROUPS.map((group) => (
            <section key={group.heading} aria-label={group.heading}>
              <h2 className="mono-label text-ink-mute">{group.heading}</h2>
              <nav aria-label={`${group.heading} links`} className="flex flex-wrap gap-2 mt-3">
                {group.links.map((link) => (
                  <Link key={link.href} href={link.href} className="chip">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </section>
          ))}
        </div>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
