import { careReferralRowView, type CareReferralViewState } from "./referral-view";

/**
 * The operations status queue.
 *
 * Same closed field set as the patient card. An operations owner sees where a
 * referral is, not what is wrong with anybody: there is no column that could
 * hold a clinical value.
 */
export default function CareReferralOperationsQueue({
  state,
}: {
  state: CareReferralViewState;
}) {
  if (state.kind === "loading") {
    return (
      <section aria-busy="true">
        <p className="mono-cap text-ink-3">Loading the referral queue.</p>
      </section>
    );
  }

  if (state.kind === "unauthorized") {
    return (
      <section>
        <h2 className="display-s">Sign in with an operations account</h2>
        <p className="body-m text-ink-2 mt-3">
          The referral queue is limited to the care operations role.
        </p>
      </section>
    );
  }

  if (state.kind === "disabled") {
    return (
      <section>
        <h2 className="display-s">The referral queue is not open yet</h2>
        <p className="body-m text-ink-2 mt-3">{state.message}</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section role="alert">
        <h2 className="display-s">The referral queue is unavailable</h2>
        <p className="body-m text-ink-2 mt-3">
          Nothing was changed. Try again in a moment.
        </p>
      </section>
    );
  }

  if (state.kind === "empty" || state.kind === "not_configured") {
    return (
      <section>
        <h2 className="display-s">No referrals in the queue</h2>
        <p className="body-m text-ink-2 mt-3">
          {state.handoff.configured
            ? "Nothing is waiting on the team right now."
            : "Online scheduling is not connected, so every referral will arrive here for a person to arrange."}
        </p>
      </section>
    );
  }

  const rows = state.referrals.map(careReferralRowView);
  const attention = rows.filter((row) => row.needsAttention).length;

  return (
    <section>
      <h2 className="display-s">Referral queue</h2>
      <p className="body-m text-ink-2 mt-3">
        {rows.length} referral{rows.length === 1 ? "" : "s"}
        {attention > 0 ? `, ${attention} needing attention` : ""}. Clinical
        records stay in the practice's system.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full body-s text-left">
          <thead className="mono-cap text-ink-3">
            <tr>
              <th scope="col" className="py-2 pr-4">Referral</th>
              <th scope="col" className="py-2 pr-4">Service</th>
              <th scope="col" className="py-2 pr-4">State</th>
              <th scope="col" className="py-2 pr-4">Status</th>
              <th scope="col" className="py-2 pr-4">Appointment</th>
              <th scope="col" className="py-2 pr-4">Owner</th>
              <th scope="col" className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.referralId}
                className="border-t border-line"
                data-testid="care-referral-queue-row"
              >
                <td className="py-3 pr-4">{row.referralId}</td>
                <td className="py-3 pr-4">{row.serviceLabel}</td>
                <td className="py-3 pr-4">{row.stateCode}</td>
                <td className="py-3 pr-4">{row.statusLabel}</td>
                <td className="py-3 pr-4">{row.appointment}</td>
                <td className="py-3 pr-4">{row.owner}</td>
                <td className="py-3">{row.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
