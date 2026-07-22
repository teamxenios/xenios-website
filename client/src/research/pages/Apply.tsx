import { useMemo, useState } from "react";
import SeoHead from "@/components/SeoHead";
import { APPLICATION_INTERESTS } from "@shared/research/membership-types";
import { PageIntro } from "../components";

// xenios research: stage-one membership application (spec section 9).
// Four short steps, an editable review screen, then submit. No payment here,
// no medical history. Target: about five minutes.

type Form = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  city: string;
  ageConfirmed: boolean;
  applicantType: "individual" | "professional";
  occupation: string;
  organization: string;
  interests: string[];
  goalsText: string;
  fitText: string;
  referralSource: string;
  referralCode: string;
  acceptAccuracy: boolean;
  acceptNoGuarantee: boolean;
  acceptEducational: boolean;
  acceptTerms: boolean;
  marketingConsent: boolean;
  website: string; // honeypot
};

const EMPTY: Form = {
  firstName: "", lastName: "", email: "", phone: "", country: "", region: "", city: "",
  ageConfirmed: false, applicantType: "individual", occupation: "", organization: "",
  interests: [], goalsText: "", fitText: "", referralSource: "", referralCode: "",
  acceptAccuracy: false, acceptNoGuarantee: false, acceptEducational: false, acceptTerms: false,
  marketingConsent: false, website: "",
};

const STEPS = ["Identity", "Context", "Goals", "Acknowledgements", "Review"] as const;

export default function Apply() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ resubmitted?: boolean } | null>(null);

  // Update mode: present only when the visitor arrived through their signed
  // status link (ApplyStatus stores the token for the session). An email match
  // alone can never update an application; the server verifies the token.
  const updateToken = useMemo(() => {
    try { return window.sessionStorage.getItem("xr-application-token") || ""; } catch { return ""; }
  }, []);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => {
      const next = { ...p };
      delete next[key as string];
      return next;
    });
  }

  const stepErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.firstName.trim()) e.firstName = "Please enter your first name.";
      if (!form.lastName.trim()) e.lastName = "Please enter your last name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Please enter a valid email address.";
      if (!form.country.trim()) e.country = "Please enter your country.";
      if (!form.ageConfirmed) e.ageConfirmed = "You must confirm you are at least 18.";
    }
    if (step === 1) {
      if (form.interests.length === 0) e.interests = "Choose at least one area of interest.";
    }
    if (step === 2) {
      if (form.goalsText.trim().length < 10) e.goalsText = "Tell us a little more about your goals.";
      if (form.fitText.trim().length < 10) e.fitText = "Tell us a little more about why xenios research fits.";
    }
    if (step === 3) {
      if (!form.acceptAccuracy || !form.acceptNoGuarantee || !form.acceptEducational || !form.acceptTerms) {
        e.acknowledgements = "All four acknowledgements are required.";
      }
    }
    return e;
  }, [form, step]);

  function next() {
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const resubmitting = Boolean(updateToken);
      const res = await fetch(
        resubmitting ? "/api/research/applications/resubmit" : "/api/research/applications",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            ...(resubmitting ? { token: updateToken } : {}),
            source_page: "/research/apply",
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setDone({ resubmitted: resubmitting });
        window.scrollTo({ top: 0 });
      } else if (resubmitting && (res.status === 401 || res.status === 409)) {
        setServerError(body?.message || "This update link is not valid. Use the most recent link from your email, or submit a new application.");
      } else {
        setServerError(body?.message || "The application could not be submitted. Please try again.");
      }
    } catch {
      setServerError("The application could not be submitted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "input-field";
  const labelCls = "form-label";
  const errStyle = { color: "var(--error)" } as const;

  if (done) {
    return (
      <>
        <SeoHead title="Application in review, xenios research" description="Your application is in review." path="/research/apply/success" />
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <p className="mono-cap text-pulse mb-5">{done.resubmitted ? "Update received" : "Application received"}</p>
          <h1 className="display-m max-w-[18ch]">
            {done.resubmitted ? "Your application is back in review." : "Your application is in review."}
          </h1>
          <p className="mt-6 body-l text-ink-2 max-w-[62ch]">
            xenios will review your application and contact you by email. You will not be charged unless your application is approved and you choose to activate the membership.
          </p>
          <div className="card mt-10 max-w-[480px]">
            <p className="mono-cap text-ink-mute mb-3">Status</p>
            <div className="space-y-2 body-s text-ink-2">
              <p>{done.resubmitted ? "Update received" : "Application received"}</p>
              <p>Review pending</p>
              <p>Next update by email</p>
            </div>
            <p className="body-s text-ink mt-6 font-700" data-testid="text-check-email">
              Check your email for your secure status link.
            </p>
            <p className="body-s text-ink-mute mt-3">
              A secure status email should arrive within a few minutes. Check spam or promotions if you do not see it. You can request a new secure link without submitting another application.
            </p>
          </div>
        </section>
      </>
    );
  }

  const review = step === STEPS.length - 1;

  return (
    <>
      <SeoHead title="Apply for membership, xenios research" description="Tell us who you are, what you are working toward, and whether the membership is a good fit. No payment is required to apply." path="/research/apply" />
      <PageIntro
        eyebrow="Membership application"
        title={review ? "Review your application." : "Tell us where you are now."}
        lead={review
          ? "Make sure the information below is accurate. You will be able to provide a deeper picture after approval."
          : "This first application helps xenios understand who you are, what you are working toward, and whether the membership is a good fit. No payment is required today."}
      />

      <section className="container-x pb-20">
        <div className="max-w-[640px]">
          {/* progress */}
          <ol className="flex flex-wrap gap-2 mb-10" aria-label="Application progress">
            {STEPS.map((label, i) => (
              <li key={label} className={`chip ${i === step ? "ra-chip-selected" : i < step ? "text-ink" : "text-ink-mute"}`} aria-current={i === step ? "step" : undefined} style={{ height: 32, fontSize: 12 }}>
                {i + 1}. {label}
              </li>
            ))}
          </ol>

          {/* honeypot */}
          <div aria-hidden="true" style={{ position: "absolute", left: -9999, height: 1, width: 1, overflow: "hidden" }}>
            <label htmlFor="ra-website">Leave this field empty</label>
            <input id="ra-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
          </div>

          {step === 0 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="ra-first" className={labelCls}>First name</label>
                  <input id="ra-first" className={inputCls} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} aria-invalid={!!errors.firstName} />
                  {errors.firstName && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="ra-last" className={labelCls}>Last name</label>
                  <input id="ra-last" className={inputCls} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} aria-invalid={!!errors.lastName} />
                  {errors.lastName && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.lastName}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="ra-email" className={labelCls}>Email</label>
                <input id="ra-email" type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
                {errors.email && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.email}</p>}
              </div>
              <div>
                <label htmlFor="ra-phone" className={labelCls}>Mobile phone (optional)</label>
                <input id="ra-phone" type="tel" className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label htmlFor="ra-country" className={labelCls}>Country</label>
                  <input id="ra-country" className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)} aria-invalid={!!errors.country} />
                  {errors.country && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.country}</p>}
                </div>
                <div>
                  <label htmlFor="ra-region" className={labelCls}>State or region (optional)</label>
                  <input id="ra-region" className={inputCls} value={form.region} onChange={(e) => set("region", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ra-city" className={labelCls}>City (optional)</label>
                  <input id="ra-city" className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} />
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer text-ink-2">
                <input type="checkbox" checked={form.ageConfirmed} onChange={(e) => set("ageConfirmed", e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--pulse)]" aria-invalid={!!errors.ageConfirmed} />
                <span className="body-s">I confirm I am at least 18 years old.</span>
              </label>
              {errors.ageConfirmed && <p className="body-s" role="alert" style={errStyle}>{errors.ageConfirmed}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <p className={labelCls}>Are you applying as an individual or a professional?</p>
                <div className="flex gap-3 mt-2">
                  {(["individual", "professional"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => set("applicantType", t)} className={`chip ${form.applicantType === t ? "ra-chip-selected" : "text-ink-2"}`} aria-pressed={form.applicantType === t}>
                      {t === "individual" ? "Individual" : "Professional"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="ra-occupation" className={labelCls}>Occupation (optional)</label>
                <input id="ra-occupation" className={inputCls} value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
              </div>
              <div>
                <label htmlFor="ra-org" className={labelCls}>Organization (optional)</label>
                <input id="ra-org" className={inputCls} value={form.organization} onChange={(e) => set("organization", e.target.value)} />
              </div>
              <div>
                <p className={labelCls}>Interests (choose all that apply)</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {APPLICATION_INTERESTS.map((interest) => {
                    const on = form.interests.includes(interest);
                    return (
                      <button key={interest} type="button" onClick={() => set("interests", on ? form.interests.filter((i) => i !== interest) : [...form.interests, interest])} className={`chip ${on ? "ra-chip-selected" : "text-ink-2"}`} aria-pressed={on} style={{ height: 34, fontSize: 13 }}>
                        {interest}
                      </button>
                    );
                  })}
                </div>
                {errors.interests && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.interests}</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label htmlFor="ra-goals" className={labelCls}>What are the three areas you most want to improve over the next 90 days?</label>
                <textarea id="ra-goals" rows={4} maxLength={1200} className={`${inputCls} textarea-field`} value={form.goalsText} onChange={(e) => set("goalsText", e.target.value)} aria-invalid={!!errors.goalsText} />
                {errors.goalsText && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.goalsText}</p>}
              </div>
              <div>
                <label htmlFor="ra-fit" className={labelCls}>Why are you interested in joining xenios research?</label>
                <textarea id="ra-fit" rows={4} maxLength={1200} className={`${inputCls} textarea-field`} value={form.fitText} onChange={(e) => set("fitText", e.target.value)} aria-invalid={!!errors.fitText} />
                {errors.fitText && <p className="body-s mt-2" role="alert" style={errStyle}>{errors.fitText}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="ra-ref" className={labelCls}>How did you hear about xenios? (optional)</label>
                  <input id="ra-ref" className={inputCls} value={form.referralSource} onChange={(e) => set("referralSource", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ra-refcode" className={labelCls}>Referral name or code (optional)</label>
                  <input id="ra-refcode" className={inputCls} value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {([
                ["acceptAccuracy", "I confirm that the information I provided is accurate."],
                ["acceptNoGuarantee", "I understand that applying does not guarantee approval."],
                ["acceptEducational", "I understand that xenios research is educational and membership-based and is not emergency or medical care."],
                ["acceptTerms", "I agree to the Membership Application Terms and Privacy Policy."],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer text-ink-2">
                  <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--pulse)]" />
                  <span className="body-s">{label}</span>
                </label>
              ))}
              {errors.acknowledgements && <p className="body-s" role="alert" style={errStyle}>{errors.acknowledgements}</p>}
              <div className="rule-top pt-4">
                <label className="flex items-start gap-3 cursor-pointer text-ink-2">
                  <input type="checkbox" checked={form.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--pulse)]" />
                  <span className="body-s">Optional: xenios may email me occasional research education and membership updates. I can opt out any time.</span>
                </label>
              </div>
            </div>
          )}

          {review && (
            <div className="space-y-4">
              {([
                ["Name", `${form.firstName} ${form.lastName}`, 0],
                ["Email", form.email, 0],
                ["Location", [form.city, form.region, form.country].filter(Boolean).join(", "), 0],
                ["Applying as", form.applicantType, 1],
                ["Interests", form.interests.join(", "), 1],
                ["90-day goals", form.goalsText, 2],
                ["Why xenios research", form.fitText, 2],
              ] as const).map(([label, value, target]) => (
                <div key={label} className="card flex items-start justify-between gap-4">
                  <div style={{ minWidth: 0 }}>
                    <p className="mono-label text-ink-mute">{label}</p>
                    <p className="body-s text-ink mt-1" style={{ overflowWrap: "anywhere" }}>{value || "Not provided"}</p>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => { setStep(target); window.scrollTo({ top: 0 }); }}>
                    Edit
                  </button>
                </div>
              ))}
              {serverError && <p className="body-s" role="alert" style={errStyle}>{serverError}</p>}
            </div>
          )}

          <div className="mt-10 flex items-center gap-4">
            {step > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => { setStep((s) => s - 1); window.scrollTo({ top: 0 }); }}>
                Back
              </button>
            )}
            {!review ? (
              <button type="button" className="btn btn-primary" onClick={next} data-testid="button-apply-next">
                {step === STEPS.length - 2 ? "Review application" : "Continue"}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting} data-testid="button-apply-submit">
                {submitting ? "Submitting" : "Submit application"}
              </button>
            )}
          </div>
          <p className="mt-8 body-s text-ink-mute max-w-[52ch]">
            Applications are reviewed individually. No payment is required to apply, and approval is never automatic.
          </p>
        </div>
      </section>
    </>
  );
}
