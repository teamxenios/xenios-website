import { useMemo, useState } from "react";
import { Mail } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { useResearch } from "../core";
import { PageIntro } from "../components";

// xenios research: professional access (wholesale). The application form
// composes a mailto inquiry to the research email; no API endpoint exists here.

const GROUPS: Array<[string, string]> = [
  [
    "Research organizations",
    "Laboratories, biotechnology companies, contract research organizations, and qualified product-development teams.",
  ],
  [
    "Verified resellers",
    "Entity, website, policies, insurance, buyer controls, intended market, and audit rights are reviewed before approval.",
  ],
  [
    "Fitness and wellness partners",
    "Gyms, trainers, studios, and creators can access approved supplements, programs, education, and nonclinical partnership offers.",
  ],
  [
    "Clinics and medical businesses",
    "Clinical relationships are handled through a separate physician-led and pharmacy pathway, not the research catalog.",
  ],
];

const PARTNER_TYPES: Array<[string, string]> = [
  ["research", "Research organization"],
  ["reseller", "Verified reseller"],
  ["fitness", "Fitness or wellness partner"],
  ["clinical", "Clinical business development"],
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  background: "var(--paper)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: 14,
};

export default function Wholesale() {
  const { email } = useResearch();
  const [name, setName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [website, setWebsite] = useState("");
  const [partnerType, setPartnerType] = useState("research");
  const [context, setContext] = useState("");

  const ready = name.trim() !== "" && applicantEmail.trim() !== "" && organization.trim() !== "" && context.trim() !== "";

  const mailtoHref = useMemo(() => {
    const partnerLabel = PARTNER_TYPES.find(([value]) => value === partnerType)?.[1] ?? partnerType;
    const subject = `Professional application: ${organization || "organization"}`;
    const body = [
      `Name: ${name}`,
      `Email: ${applicantEmail}`,
      `Organization: ${organization}`,
      `Website: ${website || "(none provided)"}`,
      `Partner type: ${partnerLabel}`,
      "",
      "Business context:",
      context,
    ].join("\n");
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [email, name, applicantEmail, organization, website, partnerType, context]);

  return (
    <>
      <SeoHead
        title="Professional access, xenios research"
        description="A partner program for research organizations, verified resellers, fitness and wellness partners, and clinical business development."
        path="/research/wholesale"
      />
      <PageIntro
        eyebrow="Professional access"
        title="A partner program for the right category of buyer."
        lead="Research wholesale, consumer-product wholesale, lifestyle partnerships, and clinical business development require different agreements and controls."
      />

      <section className="container-x section-y">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {GROUPS.map(([title, body]) => (
            <div className="card" key={title} data-testid={`card-partner-${title.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
              <h2 className="h3 mb-3">{title}</h2>
              <p className="body-s text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2" style={{ padding: "clamp(24px, 4vw, 40px)" }}>
          <p className="mono-cap text-pulse mb-5">Apply</p>
          <h2 className="display-s max-w-[20ch] mb-8">Submit a professional application.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 max-w-[720px]">
            <label className="mono-label text-ink-mute block">
              Name
              <input style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} data-testid="input-name" />
            </label>
            <label className="mono-label text-ink-mute block">
              Email
              <input style={inputStyle} type="email" value={applicantEmail} onChange={(event) => setApplicantEmail(event.target.value)} data-testid="input-email" />
            </label>
            <label className="mono-label text-ink-mute block">
              Organization
              <input style={inputStyle} value={organization} onChange={(event) => setOrganization(event.target.value)} data-testid="input-organization" />
            </label>
            <label className="mono-label text-ink-mute block">
              Website
              <input style={inputStyle} value={website} onChange={(event) => setWebsite(event.target.value)} data-testid="input-website" />
            </label>
            <label className="mono-label text-ink-mute block sm:col-span-2">
              Partner type
              <select style={inputStyle} value={partnerType} onChange={(event) => setPartnerType(event.target.value)} data-testid="select-partner-type">
                {PARTNER_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mono-label text-ink-mute block sm:col-span-2">
              Business context
              <textarea style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} value={context} onChange={(event) => setContext(event.target.value)} data-testid="input-context" />
            </label>
            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-4">
              {ready ? (
                <a href={mailtoHref} className="btn btn-primary" data-testid="button-submit-application">
                  <Mail size={16} aria-hidden="true" className="mr-2" />
                  Submit professional application
                </a>
              ) : (
                <span className="btn btn-primary opacity-50 pointer-events-none" aria-disabled="true" data-testid="button-submit-application">
                  <Mail size={16} aria-hidden="true" className="mr-2" />
                  Submit professional application
                </span>
              )}
              <p className="body-s text-ink-mute">
                Submitting opens a prepared email to {email}. Name, email, organization, and business context are required.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
