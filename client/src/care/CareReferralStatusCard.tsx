import {
  CARE_CONCIERGE_NOTICE,
  type CareHandoffConfig,
} from "@shared/care/referral-handoff";
import {
  careReferralRowView,
  type CareReferralViewState,
} from "./referral-view";

/**
 * The thin care status card.
 *
 * It renders the referral fields Xenios owns and nothing else. There is no
 * branch that reads a clinical value, so a clinical value cannot appear here
 * even if one somehow arrived in the payload.
 */
export default function CareReferralStatusCard({
  state,
}: {
  state: CareReferralViewState;
}) {
  if (state.kind === "loading") {
    return (
      <section className="mt-10 max-w-[920px]" aria-busy="true">
        <p className="mono-cap text-ink-3">Loading your care status.</p>
      </section>
    );
  }

  if (state.kind === "unauthorized") {
    return (
      <section className="mt-10 max-w-[920px]">
        <h2 className="display-s">Sign in to see your care status</h2>
        <p className="body-m text-ink-2 mt-3">
          Care status is private, so it is only shown to the signed in account
          it belongs to.
        </p>
      </section>
    );
  }

  if (state.kind === "disabled") {
    return (
      <section className="mt-10 max-w-[920px]">
        <h2 className="display-s">Care referrals are not open yet</h2>
        <p className="body-m text-ink-2 mt-3">{state.message}</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="mt-10 max-w-[920px]" role="alert">
        <h2 className="display-s">Care status is temporarily unavailable</h2>
        <p className="body-m text-ink-2 mt-3">
          Nothing was changed. Try again in a moment.
        </p>
      </section>
    );
  }

  if (state.kind === "not_configured" || state.kind === "empty") {
    return (
      <section className="mt-10 max-w-[920px]">
        <h2 className="display-s">No care referral yet</h2>
        <p className="body-m text-ink-2 mt-3">
          When you request care, the referral and its status appear here. Your
          medical record stays with the clinical practice, not with Xenios.
        </p>
        <CareHandoffNote handoff={state.handoff} />
      </section>
    );
  }

  return (
    <section className="mt-10 max-w-[920px]">
      <h2 className="display-s">Your care referral</h2>
      <p className="body-m text-ink-2 mt-3">
        Xenios holds the referral and its status. Your clinical record, notes,
        and any treatment stay with the practice.
      </p>
      <ul className="mt-6 space-y-4">
        {state.referrals.map((referral) => {
          const row = careReferralRowView(referral);
          return (
            <li
              key={row.referralId}
              className="border border-line rounded-lg p-5"
              data-testid="care-referral-card"
            >
              <p className="mono-cap text-pulse">{row.statusLabel}</p>
              <p className="body-l mt-2">{row.serviceLabel}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 body-s text-ink-2">
                <div>
                  <dt className="mono-cap">State</dt>
                  <dd>{row.stateCode}</dd>
                </div>
                <div>
                  <dt className="mono-cap">Appointment</dt>
                  <dd>{row.appointment}</dd>
                </div>
                <div>
                  <dt className="mono-cap">Assigned to</dt>
                  <dd>{row.owner}</dd>
                </div>
                <div>
                  <dt className="mono-cap">Updated</dt>
                  <dd>{row.updated}</dd>
                </div>
              </dl>
              {row.needsAttention ? (
                <p className="body-s text-ink-2 mt-4">
                  This referral needs a person to look at it. Our team has it.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <CareHandoffNote handoff={state.handoff} />
    </section>
  );
}

/**
 * What the person can actually do next, stated truthfully. A scheduling link
 * is only ever shown when one was configured.
 */
export function CareHandoffNote({ handoff }: { handoff: CareHandoffConfig }) {
  if (handoff.mode === "direct_url" && handoff.schedulingUrl) {
    return (
      <p className="body-m mt-6">
        <a
          className="underline"
          href={handoff.schedulingUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          Schedule with the clinical practice
        </a>
        . Scheduling happens in the practice's own system.
      </p>
    );
  }
  if (handoff.mode === "widget") {
    return (
      <p className="body-m text-ink-2 mt-6">
        Scheduling opens in the practice's own booking tool.
      </p>
    );
  }
  return (
    <p className="body-m text-ink-2 mt-6" data-testid="care-handoff-not-configured">
      Online scheduling is not connected yet. Our team arranges the appointment
      with you directly. {CARE_CONCIERGE_NOTICE}
    </p>
  );
}
