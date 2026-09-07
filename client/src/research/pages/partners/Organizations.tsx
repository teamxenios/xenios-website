import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerOrganizations, requestOrganization, type SubmitOutcome } from "../../adapters/partner";
import { ACCESS_ROUTES } from "../../lib/routes";
import { usePartnerResource } from "./shared";

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

type OrganizationsPayload = { ok: true; organizations: OrgPartner[] };

function readableOrganizations(value: unknown): value is OrganizationsPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.ok !== true || !Array.isArray(data.organizations)) return false;
  const ids = new Set<string>();
  return data.organizations.every((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
      || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300
      || (row.role != null && typeof row.role !== "string")
      || (row.status != null && typeof row.status !== "string") || ids.has(row.id)) return false;
    ids.add(row.id);
    return true;
  });
}

const UNAVAILABLE_MESSAGE =
  "Organization request intake is unavailable. This page cannot confirm a request was recorded or an account was created. Your entries are kept. Contact the team before retrying.";

export default function Organizations() {
  const { memberToken, memberChecking } = useResearch();
  return <ResearchPartnerShell title="Organizations"
    lead="Your server-reported organization relationships. Membership, role, referral eligibility, and payment authority remain separate decisions.">
    {memberChecking ? <ResearchLoadingState label="Checking your account" />
      : memberToken ? <OrganizationWorkspace key={memberToken} token={memberToken} />
        : <ResearchEmptyState title="Sign in to view organizations" body="Use your Xenios account to check its organization relationships."
          action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />}
  </ResearchPartnerShell>;
}

function OrganizationWorkspace({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(
    getPartnerOrganizations,
    token,
  );
  const readable = state === "ok" && readableOrganizations(data);
  const organizations = readable ? data.organizations : [];

  const [orgName, setOrgName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: "idle" });
  const mounted = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mounted.current || !readable || submitting.current) return;
    if (!orgName.trim() || !contactName.trim() || !contactEmail.trim() || !contactEmail.includes("@")) {
      setValidation("Please fill in the organization name, a contact person, and a valid contact email.");
      return;
    }
    setValidation(null);
    submitting.current = true;
    setOutcome({ kind: "submitting" });
    try {
      const result = await requestOrganization(
        {
          organization: orgName.trim(),
          website: website.trim() || null,
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          description: description.trim() || null,
        },
        token,
        UNAVAILABLE_MESSAGE,
      );
      // The request may have reached the server. Never replay it or publish
      // its result into the new account after this token-keyed body unmounts.
      if (!mounted.current) return;
      setOutcome(result.kind === "accepted"
        ? { kind: "accepted", message: "Request response received. Organization membership, roles, and permissions have not been changed by this page." }
        : result.kind === "unavailable" ? { kind: "unavailable", message: UNAVAILABLE_MESSAGE }
          : { kind: "error", message: "The request could not be confirmed. Your entries are kept. Check with the team before retrying." });
      if (result.kind === "accepted") {
        setOrgName("");
        setWebsite("");
        setContactName("");
        setContactEmail("");
        setDescription("");
        void reload();
      }
    } catch {
      if (mounted.current) setOutcome({ kind: "error", message: "The request could not be confirmed. Your entries are kept. Check with the team before retrying." });
    } finally {
      if (mounted.current) submitting.current = false;
    }
  };

  return (
    <>
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
          {denied ? <ResearchDenialNotice code={denied.code} /> : <ResearchRouteBoundary
            state={state === "ok" && !readable ? "error" : state}
            errorMessage="Organization records could not be read safely. Please try again."
            onRetry={() => void reload()}
            unavailableTitle="Organization records are unavailable right now"
            unavailableBody="The current relationships could not be loaded. This does not establish that you have no organizations or that your access changed."
          >
            <ResearchDataTable<OrgPartner>
              caption="Organizations you belong to with your role and their status"
              columns={[
                { key: "name", header: "Organization", render: (o) => o.name },
                { key: "role", header: "Reported role", render: (o) => o.role === "Owner" || o.role === "Representative" ? o.role : "Role not reported" },
                {
                  key: "status",
                  header: "Status",
                  render: (o) => (
                    <ResearchStatusBadge
                      label={o.status === "active" ? "Active record" : o.status === "suspended" ? "Suspended record" : o.status === "terminated" ? "Terminated record" : "Status not reported"}
                      tone="neutral"
                    />
                  ),
                },
              ]}
              rows={organizations}
              rowKey={(o) => o.id}
              empty="No organization rows were returned for this account. Completeness of organization history is not reported here."
            />
          </ResearchRouteBoundary>}
        </div>
      </section>

      {readable && <section aria-labelledby="pog-request" className="mt-10">
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
                href="mailto:team@xeniostechnology.com?subject=Organization%20partner%20request"
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
      </section>}
    </>
  );
}
