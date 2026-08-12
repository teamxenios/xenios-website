import { useMemo, useState, type FormEvent } from "react";
import type { AccountContextDto } from "@shared/research/account-identity";
import { PageIntro } from "../components";
import { confirmCustomerClaim, requestCustomerClaim } from "./api";

export default function ClaimOrderHistory({ context }: { context: AccountContextDto }) {
  const defaultTarget = context.organizations[0]?.id ?? "personal";
  const [target, setTarget] = useState(defaultTarget);
  const [customerRef, setCustomerRef] = useState("");
  const [claimId, setClaimId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(() => [
    ...(context.personal ? [{ value: "personal", label: "My personal account" }] : []),
    ...context.organizations.map((organization) => ({ value: organization.id, label: organization.displayName })),
  ], [context]);

  async function requestChallenge(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await requestCustomerClaim({
      customerRef: customerRef.trim(),
      target: target === "personal"
        ? { subjectType: "personal" }
        : { subjectType: "organization", organizationId: target },
    });
    setBusy(false);
    if (result.kind !== "ok") return setError(result.message);
    setClaimId(result.data.claimId);
    setNotice("A one-time ownership challenge was sent to your verified account email.");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await confirmCustomerClaim(claimId, token.trim());
    setBusy(false);
    if (result.kind !== "ok") return setError(result.message);
    setToken("");
    setNotice(result.data.replayed ? "This history was already linked to this account." : "Order history is now linked.");
  }

  return (
    <>
      <PageIntro eyebrow="Account identity" title="Claim earlier order history." lead="A customer reference alone is never enough. Your verified email and a one-time ownership challenge are both required." />
      <section className="container-x pb-20 max-w-[720px]">
        <form onSubmit={claimId ? confirm : requestChallenge} className="card space-y-5" data-testid="claim-order-history">
          {!claimId ? (
            <>
              <div>
                <label className="form-label" htmlFor="claim-target">Attach history to</label>
                <select id="claim-target" className="input-field" value={target} onChange={(event) => setTarget(event.target.value)}>
                  {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="customer-ref">Customer reference</label>
                <input id="customer-ref" className="input-field" required pattern="eac_[a-f0-9]{32}" value={customerRef} onChange={(event) => setCustomerRef(event.target.value)} />
              </div>
            </>
          ) : (
            <div>
              <label className="form-label" htmlFor="claim-token">One-time challenge</label>
              <input id="claim-token" className="input-field" required autoComplete="one-time-code" value={token} onChange={(event) => setToken(event.target.value)} />
            </div>
          )}
          {notice && <p role="status" className="body-s text-ink-2">{notice}</p>}
          {error && <p role="alert" className="body-s" style={{ color: "var(--error)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Working" : claimId ? "Confirm and link" : "Send ownership challenge"}</button>
        </form>
      </section>
    </>
  );
}
