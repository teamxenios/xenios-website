import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchAgreementViewer, ResearchSelectCard } from "../../ui/kit";
import { applyAsPartner, type SubmitOutcome } from "../../adapters/partner";
import { PARTNER_SUPPORT_EMAIL } from "./shared";

// ---------------------------------------------------------------------------
// Partner application (/research/partners/apply). Presentation of the
// application form: name, email, audience description, channels (multi
// select), and the partner agreement shown in pending state (acceptance
// happens during onboarding, not here). Submission posts the LIVE wire shape
// (POST /api/research/partner/apply: role, legalName, contactEmail; this page
// applies as a Research Rep). The audience and channel answers ride along for
// the reviewer's context; the server's contract fields are the three above.
// The endpoint requires a signed-in member, and the flow stays
// unavailable-tolerant: if the endpoint is not live, the page says so
// honestly (nothing was submitted) and offers the email path.
// ---------------------------------------------------------------------------

const CHANNELS: Array<{ key: string; label: string; description: string }> = [
  { key: "instagram", label: "Instagram", description: "Posts, stories, or reels to your own audience." },
  { key: "youtube", label: "YouTube", description: "Long-form or short-form video content." },
  { key: "tiktok", label: "TikTok", description: "Short-form video content." },
  { key: "podcast", label: "Podcast", description: "Your own show or regular guest appearances." },
  { key: "newsletter", label: "Newsletter or email list", description: "An email audience you own." },
  { key: "in_person", label: "In-person events", description: "Talks, meetups, or community events you run." },
  { key: "practice", label: "Clinic or practice", description: "A professional practice with its own clients." },
  { key: "other", label: "Other", description: "Describe it in the audience section below." },
];

const UNAVAILABLE_MESSAGE =
  "Applications are not being accepted through this form yet, so nothing was submitted. Email the team with your name, where you share, and a short description of your audience, and they will take it from there.";

export default function Apply() {
  const { memberToken } = useResearch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState("");
  const [channels, setChannels] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: "idle" });

  const toggleChannel = (key: string) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (outcome.kind === "submitting") return;
    const problems: string[] = [];
    if (!name.trim()) problems.push("your name");
    if (!email.trim() || !email.includes("@")) problems.push("a valid email address");
    if (!audience.trim()) problems.push("a short description of your audience");
    if (channels.size === 0) problems.push("at least one channel");
    if (problems.length) {
      setValidation(`Please add ${problems.join(", ")}.`);
      return;
    }
    setValidation(null);
    // The apply endpoint is member-scoped (one partner per member), so an
    // unauthenticated submit cannot succeed. Say so before sending anything.
    if (!memberToken) {
      setOutcome({
        kind: "error",
        message:
          "Applying requires a signed-in member account. Sign in and submit again, or email the team with your application.",
      });
      return;
    }
    setOutcome({ kind: "submitting" });
    // The server's PartnerApplyWireInput: role, legalName, contactEmail. This
    // page is the Research Rep application, so the role is fixed here; the
    // audience and channel answers are carried alongside for review context.
    const result = await applyAsPartner(
      {
        role: "research_rep",
        legalName: name.trim(),
        contactEmail: email.trim(),
        audience: audience.trim(),
        channels: Array.from(channels),
      },
      memberToken,
      UNAVAILABLE_MESSAGE,
    );
    setOutcome(result);
  };

  return (
    <ResearchPartnerShell
      showNav={false}
      eyebrow="Xenios Research"
      title="Apply to become a Research Rep"
      lead="Tell us who you are and where you share. Applications are reviewed by a person, and compliance training comes before anything goes live."
    >
      {outcome.kind === "accepted" ? (
        <div className="card" role="status" aria-live="polite" style={{ maxWidth: 640 }}>
          <p className="body-m font-700">Application received.</p>
          <p className="body-s text-ink-2 mt-2">{outcome.message}</p>
          <div className="mt-4">
            <Link href={PARTNER_ROUTES.home} className="btn btn-secondary">
              Back to the program overview
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate style={{ maxWidth: 720 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div>
              <label htmlFor="pa-name" className="form-label">
                Full name
              </label>
              <input
                id="pa-name"
                className="input-field"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="pa-email" className="form-label">
                Email address
              </label>
              <input
                id="pa-email"
                className="input-field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="pa-audience" className="form-label">
              Your audience
            </label>
            <p className="body-s text-ink-mute mb-2">
              Who do you reach, roughly how many people, and what do they come to you for?
            </p>
            <textarea
              id="pa-audience"
              className="input-field"
              rows={5}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              required
            />
          </div>

          <fieldset className="mt-6" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="form-label">Where you share (select all that apply)</legend>
            <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {CHANNELS.map((c) => (
                <ResearchSelectCard
                  key={c.key}
                  selected={channels.has(c.key)}
                  onSelect={() => toggleChannel(c.key)}
                  label={c.label}
                  description={c.description}
                />
              ))}
            </div>
          </fieldset>

          <div className="mt-8">
            <ResearchAgreementViewer
              title="Research Rep Partner Agreement"
              version="Draft"
              accepted={false}
              content={
                <div>
                  <p>
                    The partner agreement covers the compliance rules in full: education-first sharing, mandatory
                    disclosure of the rep relationship, no medical claims, no income claims, and no recruitment of other
                    reps. It also covers commission terms, holds, reversals, and how the agreement ends.
                  </p>
                  <p className="mt-2">
                    You do not sign it here. If your application is approved, the full agreement is presented for review
                    and acceptance during onboarding, before anything is shared.
                  </p>
                </div>
              }
            />
          </div>

          {validation && (
            <p className="body-s mt-4" role="alert">
              {validation}
            </p>
          )}
          {outcome.kind === "unavailable" && (
            <div className="card mt-4" role="status" aria-live="polite">
              <p className="body-m font-700">This form is not live yet.</p>
              <p className="body-s text-ink-2 mt-2">{outcome.message}</p>
              <a
                className="btn btn-secondary mt-4"
                href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=Research%20Rep%20application`}
              >
                Email your application
              </a>
            </div>
          )}
          {outcome.kind === "error" && (
            <p className="body-s mt-4" role="alert">
              {outcome.message}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={outcome.kind === "submitting"}>
              {outcome.kind === "submitting" ? "Submitting..." : "Submit application"}
            </button>
            <Link href={PARTNER_ROUTES.home} className="btn btn-ghost">
              Back
            </Link>
          </div>
        </form>
      )}
    </ResearchPartnerShell>
  );
}
