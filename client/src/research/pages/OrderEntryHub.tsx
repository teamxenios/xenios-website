import { Link } from "wouter";
import type { ReactNode } from "react";
import SeoHead from "@/components/SeoHead";
import {
  ORDER_ENTRY_MODES,
  RESEARCH_ORDER_ENTRY_PATH,
  orderEntryDestination,
  safeOrderEntryReturnTo,
  type OrderEntryMode,
} from "@shared/research/order-entry";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { useResearch, type MemberInfo, type MemberSessionStatus } from "../core";
import { memberDestination } from "../lib/member-routing";
import {
  memberReturnToForIntent,
  signInHrefForIntent,
  type StorefrontIntent,
} from "../storefront/entry-intent";
import { orderEntryIntentFromSearch, orderEntryIntentFromReturnTo, orderEntryIntentHref } from "../early-access/orderEntryIntent";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchSecureNotice, ResearchStatusBadge } from "../ui/kit";
import "./public-editorial.css";

type AccountPresentation =
  | "checking"
  | "signed_out"
  | "active"
  | "inactive"
  | "verification_failed";

type OrderEntryContinuation = Readonly<{
  returnTo: string | null;
  intent: StorefrontIntent | null;
}>;

const EMPTY_CONTINUATION: OrderEntryContinuation = Object.freeze({
  returnTo: null,
  intent: null,
});

/**
 * Read exactly one bounded continuation shape from the public URL.
 *
 * A caller may supply either one encoded `returnTo` or the five fields of a
 * storefront selection. Mixing shapes, duplicates, unknown keys, referral
 * codes, claim/status credentials, or other arbitrary values drops the whole
 * continuation. Referral recognition remains in its signed HttpOnly cookie;
 * this page never copies it into browser-readable navigation.
 */
function orderEntryContinuationFromSearch(
  search: string,
): OrderEntryContinuation {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return EMPTY_CONTINUATION;
  }

  const keys = [...params.keys()];
  if (keys.length === 0) return EMPTY_CONTINUATION;

  if (keys.includes("returnTo")) {
    if (
      keys.some((key) => key !== "returnTo") ||
      params.getAll("returnTo").length !== 1
    ) {
      return EMPTY_CONTINUATION;
    }
    // Scrub the candidate before retaining it in component state. Each card
    // then applies the still-narrower mode-specific family check.
    return {
      returnTo: safeOrderEntryReturnTo(params.get("returnTo")),
      intent: null,
    };
  }

  const intent = orderEntryIntentFromSearch(search);
  return intent ? { returnTo: null, intent } : EMPTY_CONTINUATION;
}

function accountPresentation(
  member: MemberInfo | null,
  memberChecking: boolean,
  sessionStatus: MemberSessionStatus,
): AccountPresentation {
  if (memberChecking || sessionStatus === "checking") return "checking";
  if (member?.status === "active") return "active";
  if (member) return "inactive";
  return sessionStatus === "verification_failed"
    ? "verification_failed"
    : "signed_out";
}

function destinationForMode(
  mode: OrderEntryMode,
  continuation: OrderEntryContinuation,
): string {
  if (mode.id === "quick_early_access" || mode.id === "assisted_or_volume") {
    return orderEntryIntentHref("/research/early-access", continuation.intent ?? orderEntryIntentFromReturnTo(continuation.returnTo));
  }
  if (mode.id === "member_account") {
    if (continuation.intent) return memberReturnToForIntent(continuation.intent);
    return orderEntryDestination("member_account", continuation.returnTo);
  }
  if (mode.id === "resume_or_track") {
    return orderEntryDestination("resume_or_track", continuation.returnTo);
  }
  return mode.href;
}

type ResolvedAction = Readonly<{
  href: string | null;
  label: string;
}>;

function resolvedAction(
  mode: OrderEntryMode,
  continuation: OrderEntryContinuation,
  state: AccountPresentation,
  member: MemberInfo | null,
): ResolvedAction {
  const intent = continuation.intent ?? orderEntryIntentFromReturnTo(continuation.returnTo);
  if (intent?.action === "CARE" && ["member_account", "quick_early_access", "assisted_or_volume"].includes(mode.id)) {
    return { href: "/care/schedule", label: "Continue through Xenios Care" };
  }
  const destination = destinationForMode(mode, continuation);
  if (!mode.accountDestination) {
    return { href: destination, label: mode.actionLabel };
  }
  if (state === "checking") {
    return { href: null, label: "Checking your account…" };
  }
  if (state === "active") {
    return { href: destination, label: mode.actionLabel };
  }
  if (state === "inactive" && member) {
    const href = memberDestination(member, destination);
    const label =
      member.status === "pending_activation"
        ? "Continue account activation"
        : member.status === "past_due"
          ? "Review billing access"
          : "Review account access";
    return { href, label };
  }

  const href =
    mode.id === "member_account" && continuation.intent
      ? signInHrefForIntent(continuation.intent)
      : researchAuthPath("/research/sign-in", destination);
  return {
    href,
    label:
      state === "verification_failed"
        ? "Sign in again to continue"
        : mode.id === "resume_or_track"
          ? "Sign in to view orders"
          : "Sign in and continue",
  };
}

function statusPresentation(
  mode: OrderEntryMode,
  accountState: AccountPresentation,
): { label: string; tone: "neutral" | "info" | "success" | "warning" } {
  if (mode.primary) return { label: "Recommended first path", tone: "success" };
  if (mode.lane === "care") return { label: "Separate Care path", tone: "info" };
  if (!mode.accountDestination) {
    return {
      label:
        mode.id === "organization_or_clinic"
          ? "Human-reviewed inquiry"
          : mode.lane === "support"
            ? "Human support"
            : "No full account required",
      tone: "neutral",
    };
  }
  switch (accountState) {
    case "checking":
      return { label: "Checking account", tone: "neutral" };
    case "active":
      return { label: "Account ready", tone: "success" };
    case "inactive":
      return { label: "Account action needed", tone: "warning" };
    case "verification_failed":
      return { label: "Sign-in check unavailable", tone: "warning" };
    case "signed_out":
      return { label: "Sign-in required", tone: "neutral" };
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-ink/10 pt-3">
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="body-s text-ink-2 mt-1 min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ModeCard({
  mode,
  continuation,
  accountState,
  member,
}: {
  mode: OrderEntryMode;
  continuation: OrderEntryContinuation;
  accountState: AccountPresentation;
  member: MemberInfo | null;
}) {
  const action = resolvedAction(mode, continuation, accountState, member);
  const badge = statusPresentation(mode, accountState);

  return (
    <article
      className={`card min-w-0 ${mode.primary ? "bg-paper-2" : ""}`}
      data-testid={`order-mode-${mode.id}`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono-label text-ink-mute break-words">{mode.eyebrow}</p>
          <h2 className="body-l font-700 mt-2 break-words">{mode.title}</h2>
        </div>
        <ResearchStatusBadge label={badge.label} tone={badge.tone} />
      </div>

      <p className="body-s text-ink-2 mt-4 max-w-[66ch] min-w-0 break-words">
        {mode.summary}
      </p>

      <p className="body-s text-ink-2 mt-3 min-w-0 break-words">
        <span className="font-700">For: </span>
        {mode.audience}
      </p>

      <details className="mt-4 min-w-0 border-t border-ink/10 pt-3">
        <summary className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center font-700 body-s">
          What you need, payment, status, and support
        </summary>
        <dl className="mt-2 grid min-w-0 gap-3">
          <Fact label="Who it is for">{mode.audience}</Fact>
          <Fact label="Information required">
            <ul className="list-disc pl-5 grid gap-1">
              {mode.requiredInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Fact>
          <Fact label="Account required">{mode.accountRequirement}</Fact>
          <Fact label="What happens next">{mode.nextStep}</Fact>
          <Fact label="Payment timing">{mode.paymentTiming}</Fact>
          <Fact label="Where status appears">{mode.statusLocation}</Fact>
          <Fact label="Human support">{mode.humanSupport}</Fact>
        </dl>

        <div className="mt-4 border-t border-ink/10 pt-4">
          <p className="mono-label text-ink-mute">What this does not mean</p>
          <ul className="body-s text-ink-2 mt-2 grid gap-2 list-disc pl-5">
            {mode.doesNotMean.map((item) => (
              <li key={item} className="min-w-0 break-words">{item}</li>
            ))}
          </ul>
        </div>
      </details>

      <div className="mt-5 flex min-w-0 flex-wrap gap-3">
        {action.href ? (
          <Link
            href={action.href}
            className={`btn ${mode.primary ? "btn-primary" : "btn-secondary"} public-editorial-action`}
            style={{ width: "100%", whiteSpace: "normal" }}
            data-testid={`order-mode-action-${mode.id}`}
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-secondary public-editorial-action"
            style={{ width: "100%", whiteSpace: "normal" }}
            data-testid={`order-mode-action-${mode.id}`}
            disabled
          >
            {action.label}
          </button>
        )}
        {mode.secondaryAction ? (
          <Link
            href={mode.secondaryAction.href}
            className="btn btn-ghost public-editorial-action"
            style={{ width: "100%", whiteSpace: "normal" }}
            data-testid={`order-mode-secondary-${mode.id}`}
          >
            {mode.secondaryAction.label}
          </Link>
        ) : null}
      </div>
      {mode.secondaryAction ? (
        <p className="body-s text-ink-mute mt-2 min-w-0 break-words">
          {mode.secondaryAction.explanation}
        </p>
      ) : null}
    </article>
  );
}

function accountStateLabel(state: AccountPresentation): string {
  switch (state) {
    case "checking":
      return "Checking for a Research account";
    case "active":
      return "Active Research account found";
    case "inactive":
      return "Research account needs an access step";
    case "verification_failed":
      return "Account check unavailable; sign-in remains available";
    case "signed_out":
      return "No active Research account in this browser";
  }
}

export default function OrderEntryHub() {
  const { member, memberChecking, memberSessionStatus } = useResearch();
  const accountState = accountPresentation(
    member,
    memberChecking,
    memberSessionStatus,
  );
  const continuation = orderEntryContinuationFromSearch(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const researchModes = ORDER_ENTRY_MODES.filter(
    (mode) => mode.lane === "research",
  );
  const separateModes = ORDER_ENTRY_MODES.filter(
    (mode) => mode.lane !== "research",
  );

  return (
    <>
      <SeoHead
        title="Choose how to order | Xenios Research"
        description="Choose Quick Research, account ordering, order tracking, assisted or volume help, organization access, Xenios Care, or manual support."
        path={RESEARCH_ORDER_ENTRY_PATH}
        robots="noindex, nofollow"
      />
      <ResearchPublicShell
        eyebrow="Research ordering"
        title="How would you like to begin?"
        lead="Choose the route that matches what you need. Each option below continues into an existing Xenios system with its own identity, availability, payment, status, and support checks."
        contentMaxWidth={1100}
      >
        <section
          className="card bg-paper-2 min-w-0"
          aria-labelledby="order-entry-summary"
        >
          <p className="mono-label text-ink-mute">Start here</p>
          <h2 id="order-entry-summary" className="body-l font-700 mt-2">
            Quick Research is the lightest supported way to start.
          </h2>
          <p className="body-s text-ink-2 mt-3 max-w-[72ch] min-w-0 break-words">
            It opens the existing passwordless Early Access session. It does
            not create a second account, cart, order, checkout, or price
            authority. If your need is personal and medical, choose Xenios Care
            instead of Research.
          </p>
          <div className="flex min-w-0 flex-wrap gap-2 mt-4">
            <ResearchStatusBadge label="Browse before full membership" tone="success" />
            <ResearchStatusBadge label="Server-confirmed facts only" tone="info" />
            <ResearchStatusBadge label="Care stays separate" tone="neutral" />
          </div>
          <p
            className="body-s text-ink-mute mt-4"
            aria-live="polite"
            data-testid="order-account-state"
          >
            {accountStateLabel(accountState)}.
          </p>
        </section>

        <section className="mt-8 min-w-0" aria-labelledby="research-ordering-options">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="mono-label text-ink-mute">Research pathways</p>
              <h2 id="research-ordering-options" className="body-l font-700 mt-1">
                Five ways to begin or return
              </h2>
            </div>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {researchModes.map((mode) => (
              <ModeCard
                key={mode.id}
                mode={mode}
                continuation={continuation}
                accountState={accountState}
                member={member}
              />
            ))}
          </div>
        </section>

        <section className="mt-8 min-w-0" aria-labelledby="separate-pathways">
          <p className="mono-label text-ink-mute">Separate pathways</p>
          <h2 id="separate-pathways" className="body-l font-700 mt-1">
            Care and manual help
          </h2>
          <div className="grid min-w-0 gap-4 mt-4 lg:grid-cols-2">
            {separateModes.map((mode) => (
              <ModeCard
                key={mode.id}
                mode={mode}
                continuation={continuation}
                accountState={accountState}
                member={member}
              />
            ))}
          </div>
        </section>

        <section className="card mt-8 min-w-0" aria-labelledby="order-facts-heading">
          <p className="mono-label text-ink-mute">Shared status rule</p>
          <h2 id="order-facts-heading" className="body-l font-700 mt-2">
            Request, payment, fulfillment, and tracking are separate facts.
          </h2>
          <ol className="grid min-w-0 gap-4 mt-4 sm:grid-cols-2">
            <li className="min-w-0">
              <p className="font-700 body-s">Request or order reference</p>
              <p className="body-s text-ink-2 mt-1">
                Confirms only that the owning server recorded the submitted
                details.
              </p>
            </li>
            <li className="min-w-0">
              <p className="font-700 body-s">Payment status</p>
              <p className="body-s text-ink-2 mt-1">
                Changes only from an approved provider fact or authorized human
                verification.
              </p>
            </li>
            <li className="min-w-0">
              <p className="font-700 body-s">Fulfillment status</p>
              <p className="body-s text-ink-2 mt-1">
                Begins only when the owning order and payment gates permit a
                release.
              </p>
            </li>
            <li className="min-w-0">
              <p className="font-700 body-s">Tracking</p>
              <p className="body-s text-ink-2 mt-1">
                Appears only after an authorized carrier fact is recorded for
                the correct order.
              </p>
            </li>
          </ol>
        </section>

        <section className="card mt-8 min-w-0" aria-labelledby="continuity-heading">
          <p className="mono-label text-ink-mute">Continuity without new authority</p>
          <h2 id="continuity-heading" className="body-l font-700 mt-2">
            Safe selections continue; private credentials do not travel in links.
          </h2>
          <p className="body-s text-ink-2 mt-3 max-w-[72ch]">
            A validated product, variant, and quantity continue into Quick Early
            Access, assisted ordering, or member sign-in for review against the
            current catalog. Account-order destinations continue through sign-in. Unknown destinations and
            credential-like query data are discarded. Any already-recognized
            referral remains with the server-owned referral session; this page
            does not copy a referral code into its links.
          </p>
        </section>

        <div className="mt-8">
          <ResearchSecureNotice>
            Research-designated products are for legitimate nonclinical work.
            Do not send symptoms, diagnoses, medications, medical history,
            laboratory results, passwords, sign-in tokens, or payment
            credentials through Research ordering or ordinary support messages.
          </ResearchSecureNotice>
        </div>
      </ResearchPublicShell>
    </>
  );
}
