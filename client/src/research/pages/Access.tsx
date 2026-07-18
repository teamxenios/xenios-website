import { useState } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { useResearch } from "../core";
import { NoticeBar } from "../components";

// Request access: an early-access inquiry for research, Quantum, supplements,
// and programs. The form composes a plain email inquiry to the research
// address; no unauthenticated API endpoint exists for it.

const INTERESTS = [
  { value: "research", label: "Research peptides" },
  { value: "quantum", label: "Quantum" },
  { value: "supplements", label: "Supplements" },
  { value: "programs", label: "Programs" },
  { value: "professional", label: "Professional or wholesale" },
] as const;

export default function Access() {
  const { email } = useResearch();
  const [name, setName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [interest, setInterest] = useState<string>("research");
  const [context, setContext] = useState("");

  const interestLabel = INTERESTS.find((option) => option.value === interest)?.label ?? interest;
  const subject = "Access request, xenios research";
  const body = [
    `Name: ${name}`,
    `Email: ${fromEmail}`,
    `Interest: ${interestLabel}`,
    "",
    "Context:",
    context,
  ].join("\n");
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <>
      <SeoHead
        title="Request access, xenios research"
        description="Join the platform before everything is public. Research access, Quantum, supplements, and programs follow different review and launch paths."
        path="/research/access"
      />

      <section className="container-x" style={{ paddingTop: 64, paddingBottom: 24 }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-start">
          <div>
            <p className="mono-cap text-pulse mb-5">Early access</p>
            <h1 className="display-m text-balance max-w-[18ch]">Join the platform before everything is public.</h1>
            <p className="mt-6 body-l text-ink-2 max-w-[58ch]">
              Choose the category that brought you here. Research access, Quantum, supplements, and programs follow different review and launch paths.
            </p>
          </div>

          <div className="card">
            <p className="mono-cap text-ink-mute mb-3">Access inquiry</p>
            <h2 className="h3 mb-3">Tell us where you fit.</h2>
            <p className="body-s text-ink-2">
              This is an inquiry, not an application form with automated processing. Submitting opens a pre-filled email to the research team, who review every request by hand.
            </p>
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                window.location.href = mailto;
              }}
              data-testid="form-access-inquiry"
            >
              <div>
                <label htmlFor="access-name" className="form-label">Name</label>
                <input
                  id="access-name"
                  className="input-field"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  data-testid="input-access-name"
                />
              </div>
              <div>
                <label htmlFor="access-email" className="form-label">Email</label>
                <input
                  id="access-email"
                  className="input-field"
                  type="email"
                  value={fromEmail}
                  onChange={(event) => setFromEmail(event.target.value)}
                  required
                  data-testid="input-access-email"
                />
              </div>
              <div>
                <label htmlFor="access-interest" className="form-label">Interest</label>
                <select
                  id="access-interest"
                  className="input-field"
                  value={interest}
                  onChange={(event) => setInterest(event.target.value)}
                  data-testid="select-access-interest"
                >
                  {INTERESTS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="access-context" className="form-label">Context</label>
                <textarea
                  id="access-context"
                  className="input-field"
                  rows={4}
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="Tell us what you are looking for. Do not submit medical information."
                  data-testid="input-access-context"
                />
              </div>
              <button type="submit" className="btn btn-primary" data-testid="button-request-access">
                Request access
              </button>
              <p className="mono-label text-ink-mute">
                Opens your email client addressed to {email}.
              </p>
            </form>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <NoticeBar>
          Research access does not guarantee approval or checkout. xenios may request organization, identity, intended-use, destination, and purchasing information before enabling a product.
        </NoticeBar>
      </div>

      <section className="container-x" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <Link href="/research/wholesale" className="btn btn-secondary">Professional access</Link>
      </section>
    </>
  );
}
