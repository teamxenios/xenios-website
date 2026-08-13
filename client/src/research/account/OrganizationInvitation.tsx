import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { PageIntro } from "../components";
import { acceptOrganizationInvitation } from "./api";

export default function OrganizationInvitation() {
  const [, navigate] = useLocation();
  const query = new URLSearchParams(window.location.search);
  const [invitationId] = useState(query.get("invitation") ?? "");
  const [invitationToken, setInvitationToken] = useState(query.get("token") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await acceptOrganizationInvitation(invitationId, invitationToken);
    setBusy(false);
    setInvitationToken("");
    if (result.kind !== "ok") return setError(result.message);
    navigate(`/research/account/organizations/${result.data.organizationId}`);
  }

  return (
    <>
      <PageIntro eyebrow="Organization access" title="Accept your invitation." lead="Sign in with the invited, verified email and confirm the one-time invitation." />
      <section className="container-x pb-20">
        <form onSubmit={accept} className="card max-w-[560px] space-y-5" data-testid="organization-invitation">
          <div><label className="form-label" htmlFor="organization-invitation-token">One-time invitation</label><input id="organization-invitation-token" className="input-field" required value={invitationToken} onChange={(event) => setInvitationToken(event.target.value)} /></div>
          {error && <p role="alert" className="body-s" style={{ color: "var(--error)" }}>{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || !invitationId}>{busy ? "Accepting" : "Accept invitation"}</button>
        </form>
      </section>
    </>
  );
}
