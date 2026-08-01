import { useMemo, useState, type FormEvent } from "react";
import {
  CARE_CONCIERGE_MAX_LENGTH,
  CARE_CONCIERGE_NOTICE,
  screenCareConciergeMessage,
} from "@shared/care/referral-handoff";
import {
  CARE_SERVICE_CATEGORY_LABELS,
  type CareServiceCategory,
} from "@shared/care/referral";

export interface CareConciergeSubmission {
  contactMethod: "email" | "phone";
  serviceCategory: CareServiceCategory;
  stateCode: string;
  message: string;
}

/**
 * The concierge fallback, used when Tebra scheduling is not configured.
 *
 * It asks to be contacted. It does not ask what is wrong. The same shared
 * screen the server runs also runs here, so a person is told before they
 * submit, and the server still refuses independently if they submit anyway.
 */
export default function CareConciergeRequestForm({
  stateCode,
  serviceCategories,
  onSubmit,
  submitting = false,
  serverError = null,
}: {
  stateCode: string;
  serviceCategories: readonly CareServiceCategory[];
  onSubmit: (submission: CareConciergeSubmission) => void;
  submitting?: boolean;
  serverError?: string | null;
}) {
  const [contactMethod, setContactMethod] = useState<"email" | "phone">("email");
  const [serviceCategory, setServiceCategory] = useState<CareServiceCategory | "">(
    serviceCategories[0] ?? "",
  );
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  const screen = useMemo(() => screenCareConciergeMessage(message), [message]);
  const showProblem = touched && !screen.ok;
  const canSubmit =
    screen.ok && serviceCategory !== "" && !submitting && serviceCategories.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    const category: CareServiceCategory | "" = serviceCategory;
    if (!canSubmit || category === "") return;
    onSubmit({
      contactMethod,
      serviceCategory: category,
      stateCode,
      message: message.trim(),
    });
  }

  if (serviceCategories.length === 0) {
    return (
      <section>
        <h2 className="display-s">Care is not open in your state yet</h2>
        <p className="body-m text-ink-2 mt-3">
          There is nothing to request right now. We will not take a request we
          cannot fulfil.
        </p>
      </section>
    );
  }

  return (
    <form className="mt-8 max-w-[640px]" onSubmit={handleSubmit} noValidate>
      <h2 className="display-s">Ask our team to arrange care</h2>
      <p className="body-m text-ink-2 mt-3" data-testid="care-concierge-notice">
        {CARE_CONCIERGE_NOTICE}
      </p>

      <label className="block mt-6">
        <span className="mono-cap">Service</span>
        <select
          className="mt-2 w-full border border-line rounded p-3"
          value={serviceCategory}
          onChange={(event) =>
            setServiceCategory(event.target.value as CareServiceCategory)
          }
        >
          {serviceCategories.map((category) => (
            <option key={category} value={category}>
              {CARE_SERVICE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-6">
        <legend className="mono-cap">How should we reach you</legend>
        {(["email", "phone"] as const).map((method) => (
          <label key={method} className="body-m mr-6 inline-flex items-center gap-2">
            <input
              type="radio"
              name="care-concierge-contact"
              value={method}
              checked={contactMethod === method}
              onChange={() => setContactMethod(method)}
            />
            {method === "email" ? "Email" : "Phone"}
          </label>
        ))}
        <p className="body-s text-ink-3 mt-2">
          We use the contact details already on your account.
        </p>
      </fieldset>

      <label className="block mt-6">
        <span className="mono-cap">When is good to reach you</span>
        <textarea
          className="mt-2 w-full border border-line rounded p-3"
          maxLength={CARE_CONCIERGE_MAX_LENGTH}
          rows={3}
          value={message}
          onBlur={() => setTouched(true)}
          onChange={(event) => setMessage(event.target.value)}
          aria-invalid={showProblem}
          aria-describedby="care-concierge-problem"
          placeholder="Weekday mornings are best."
        />
      </label>

      <p
        className="body-s text-ink-2 mt-2"
        id="care-concierge-problem"
        role={showProblem ? "alert" : undefined}
        data-testid="care-concierge-problem"
      >
        {showProblem ? screen.message : ""}
      </p>

      {serverError ? (
        <p className="body-s text-ink-2 mt-2" role="alert">
          {serverError}
        </p>
      ) : null}

      <button className="btn-primary mt-6" type="submit" disabled={!canSubmit}>
        {submitting ? "Sending the request" : "Ask the team to contact me"}
      </button>
      <p className="body-s text-ink-3 mt-3">
        This is a request to be contacted. It is not an appointment, and it is
        not a confirmation.
      </p>
    </form>
  );
}
