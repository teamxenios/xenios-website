import { useState, type FormEvent } from "react";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerOrganizations, requestOrganization, type SubmitOutcome } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, PARTNER_SUPPORT_EMAIL, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Organization partners (/research/partners/organizations). An organization
// account groups the links of ONE business (a gym, a clinic, a team) under
// one entity for reporting and payout. It is explicitly not a recruitment
// tier: organizations earn on their own referred activity exactly like an
// individual rep, and nothing cascades between accounts.
// ---------------------------------------------------------------------------

interface OrgPartner {
  id: string;
  name: string;
  role?: string | null;
  status?: string | null;
}

type OrganizationsPayload = { organizations?: OrgPartner[] };

const UNAVAILABLE_MESSAGE =
  "Organization requests are not being accepted through this form yet, so nothing was submitted. Email the team with the organization name, website, and a contact person instead.";

export default function Organizations() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<OrganizationsPayload>(
    getPartnerOrganizations,
    memberToken,
  );

  const [orgName, setOrgName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: "idle" });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (outcome.kind === "submitting") return;
    if (!orgName.trim() || !contactName.trim() || !contactEmail.trim() || !contactEmail.includes("@")) {
      setValidation("Please fill in the organization name, a contact person, and a valid contact email.");
      return;
    }
    setValidation(null);
    setOutcome({ kind: "submitting" });
    const result = await requestOrganization(
      {
        organization: orgName.trim(),
        website: website.trim() || null,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        description: description.trim() || null,
      },
      memberToken,
      UNAVAILABLE_MESSAGE,
    );
    setOutcome(result);
    if (result.kind === "accepted") {
      setOrgName("");
      setWebsite("");
      setContactName("");
      setContactEmail("");
      setDescription("");
      void reload();
    }
  };

  return (
    <ResearchPartnerShell
      title="Organizations"
      lead="An organization account groups one business under one entity: its links, its reporting, its payout. It earns only on its own referred activity."
    >
      <div className="card mb-8" style={{ maxWidth: 680 }}>
        <p className="body-m font-700">Not a tier, not a team, not a downline.</p>
        <p className="body-s text-ink-2 mt-2">
          Organizations exist so a gym, clinic, or team can operate as one account instead of many personal ones.
          Nothing cascades between accounts, no one earns on another rep's activity, and recruiting reps is prohibited
          for organizations exactly as it is for individuals.
        </p>
      </div>

      <section aria-labelledby="pog-list">
        <h2 id="pog-list" className="mono-cap text-ink-mute">
          Your organizations
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Organizations you belong to appear here when the partner platform launches."
          >
            <ResearchDataTable<OrgPartner>
              caption="Organizations you belong to with your role and their status"
              columns={[
                { key: "name", header: "Organization", render: (o) => o.name },
                { key: "role", header: "Your role", render: (o) => o.role ?? "Member" },
                {
                  key: "status",
                  header: "Status",
                  render: (o) => (
                    <ResearchStatusBadge
                      label={o.status ?? "In review"}
                      tone={o.status === "active" ? "success" : "pending"}
                    />
                  ),
                },
              ]}
              rows={data?.organizations ?? []}
              rowKey={(o) => o.id}
              empty="You are not part of an organization account. Request one below if you operate as a business."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      <section aria-labelledby="pog-request" className="mt-10">
        <h2 id="pog-request" className="mono-cap text-ink-mute">
          Request an organization account
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <label htmlFor="pog-name" className="form-label">
                Organization name
              </label>
              <input id="pog-name" className="input-field" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pog-website" className="form-label">
                Website (optional)
              </label>
              <input id="pog-website" className="input-field" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pog-contact" className="form-label">
                Contact person
              </label>
              <input
                id="pog-contact"
                className="input-field"
                type="text"
                autoComplete="name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="pog-email" className="form-label">
                Contact email
              </label>
              <input
                id="pog-email"
                className="input-field"
                type="email"
                autoComplete="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="pog-description" className="form-label">
              About the organization (optional)
            </label>
            <textarea
              id="pog-description"
              className="input-field"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {validation && (
            <p className="body-s mt-4" role="alert">
              {validation}
            </p>
          )}
          {outcome.kind === "accepted" && (
            <p className="body-s mt-4" role="status" aria-live="polite">
              {outcome.message}
            </p>
          )}
          {outcome.kind === "unavailable" && (
            <div className="mt-4" role="status" aria-live="polite">
              <p className="body-s text-ink-2">{outcome.message}</p>
              <a
                className="btn btn-secondary mt-3"
                href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=Organization%20partner%20request`}
              >
                Email the request
              </a>
            </div>
          )}
          {outcome.kind === "error" && (
            <p className="body-s mt-4" role="alert">
              {outcome.message}
            </p>
          )}

          <div className="mt-6">
            <button type="submit" className="btn btn-primary" disabled={outcome.kind === "submitting"}>
              {outcome.kind === "submitting" ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </form>
      </section>
    </ResearchPartnerShell>
  );
}
