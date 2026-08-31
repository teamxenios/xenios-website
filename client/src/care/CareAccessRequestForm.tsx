import { useCallback, useEffect, useState } from "react";
import Turnstile from "@/components/Turnstile";
import {
  CARE_CONTACT_METHOD_LABELS,
  CARE_CONTACT_METHOD_VALUES,
  CARE_CONTACT_WINDOW_LABELS,
  CARE_CONTACT_WINDOW_VALUES,
  CARE_GOAL_LABELS,
  CARE_GOAL_VALUES,
  CARE_MANUAL_ACCESS_REQUEST_PATH,
  CARE_MANUAL_ACCESS_STATUS_PATH,
  CARE_US_STATE_LABELS,
  CARE_US_STATE_VALUES,
  type CareManualAccessAvailability,
  type CareManualAccessResponse,
} from "@shared/care/manual-access";

type AvailabilityState =
  | { kind: "loading" }
  | { kind: "open"; value: CareManualAccessAvailability }
  | { kind: "closed"; message: string };

function useCareAccessAvailability() {
  const [state, setState] = useState<AvailabilityState>({ kind: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    fetch(CARE_MANUAL_ACCESS_STATUS_PATH, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("status unavailable");
        return response.json() as Promise<CareManualAccessAvailability>;
      })
      .then((value) => {
        if (value.ok === true && value.acceptingRequests === true) {
          setState({ kind: "open", value });
        } else {
          setState({
            kind: "closed",
            message: "Care requests are temporarily unavailable. Please try again shortly.",
          });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          kind: "closed",
          message: "Care request status could not be verified. Please try again.",
        });
      });
    return () => controller.abort();
  }, [revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { state, retry };
}

export function CareAccessAvailabilitySummary() {
  const { state, retry } = useCareAccessAvailability();

  if (state.kind === "loading") {
    return (
      <p className="body-m text-ink-2" aria-live="polite">
        Checking the Care request line…
      </p>
    );
  }

  if (state.kind === "closed") {
    return (
      <div role="alert">
        <p className="body-m text-ink-2">{state.message}</p>
        <button type="button" className="btn btn-secondary min-h-11 mt-5" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div aria-live="polite">
      <p className="body-l">Care access requests are open today.</p>
      <p className="body-m text-ink-2 mt-4 max-w-[64ch]">
        Share contact and routing details only. A Xenios team member will review the request and
        follow up through your preferred channel, typically within one business day. Medical
        information belongs only in a later authorized secure clinical system.
      </p>
    </div>
  );
}

type FieldName =
  | "fullName"
  | "email"
  | "phone"
  | "locationState"
  | "careGoal"
  | "contactMethod"
  | "contactWindow"
  | "adultConfirmation"
  | "boundaryAcknowledgement";

type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_IDS: Record<FieldName, string> = {
  fullName: "care-access-name",
  email: "care-access-email",
  phone: "care-access-phone",
  locationState: "care-access-state",
  careGoal: "care-access-goal",
  contactMethod: "care-access-contact-method",
  contactWindow: "care-access-contact-window",
  adultConfirmation: "care-access-adult",
  boundaryAcknowledgement: "care-access-boundary",
};

function fieldProps(errors: FieldErrors, name: FieldName) {
  return {
    "aria-invalid": errors[name] ? true : false,
    "aria-describedby": errors[name] ? `${FIELD_IDS[name]}-error` : undefined,
  } as const;
}

function FieldError({ errors, name }: { errors: FieldErrors; name: FieldName }) {
  if (!errors[name]) return null;
  return (
    <p id={`${FIELD_IDS[name]}-error`} className="body-s text-pulse mt-2">
      {errors[name]}
    </p>
  );
}

export default function CareAccessRequestForm() {
  const { state: availability, retry } = useCareAccessAvailability();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [locationState, setLocationState] = useState("");
  const [careGoal, setCareGoal] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [contactWindow, setContactWindow] = useState("");
  const [adultConfirmation, setAdultConfirmation] = useState(false);
  const [boundaryAcknowledgement, setBoundaryAcknowledgement] = useState(false);
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<CareManualAccessResponse | null>(null);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (fullName.trim().length < 2) next.fullName = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!CARE_US_STATE_VALUES.includes(locationState as (typeof CARE_US_STATE_VALUES)[number])) {
      next.locationState = "Choose your current state.";
    }
    if (!CARE_GOAL_VALUES.includes(careGoal as (typeof CARE_GOAL_VALUES)[number])) {
      next.careGoal = "Choose the broad category that fits best.";
    }
    if (!CARE_CONTACT_METHOD_VALUES.includes(contactMethod as (typeof CARE_CONTACT_METHOD_VALUES)[number])) {
      next.contactMethod = "Choose how you prefer to be contacted.";
    }
    if (!CARE_CONTACT_WINDOW_VALUES.includes(contactWindow as (typeof CARE_CONTACT_WINDOW_VALUES)[number])) {
      next.contactWindow = "Choose the best time to contact you.";
    }
    if (phone.trim() && !/^[+()0-9 .-]{7,40}$/u.test(phone.trim())) {
      next.phone = "Enter a valid phone number.";
    }
    if ((contactMethod === "phone" || contactMethod === "text") && !phone.trim()) {
      next.phone = "A phone number is required for calls or text messages.";
    }
    if (!adultConfirmation) {
      next.adultConfirmation = "Confirm that you are 18 or older and currently in the United States.";
    }
    if (!boundaryAcknowledgement) {
      next.boundaryAcknowledgement = "Acknowledge the non-emergency and non-clinical boundary.";
    }
    return next;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const nextErrors = validate();
    setErrors(nextErrors);
    const firstInvalid = (Object.keys(FIELD_IDS) as FieldName[]).find((name) => nextErrors[name]);
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }
    if (availability.kind !== "open") {
      setServerError("Care request status is not open yet. Retry the status check and submit again.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(CARE_MANUAL_ACCESS_REQUEST_PATH, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          locationState,
          careGoal,
          contactMethod,
          contactWindow,
          adultConfirmation,
          boundaryAcknowledgement,
          website,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const body = await response.json().catch(() => ({})) as Partial<CareManualAccessResponse> & {
        message?: string;
      };
      if (!response.ok || body.ok !== true || typeof body.reference !== "string") {
        throw new Error(body.message || "We could not save the request. Please try again.");
      }
      setErrors({});
      setSuccess(body as CareManualAccessResponse);
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "We could not save the request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="card max-w-[760px]" role="status" data-testid="care-access-success">
        <p className="mono-label text-pulse mb-3">REQUEST RECEIVED</p>
        <h2 className="h2">Your Care request is in.</h2>
        <p className="body-l text-ink-2 mt-5">
          Reference <strong>{success.reference}</strong>. A human will review your routing details
          and follow up through your preferred contact method, typically within one business day.
        </p>
        <p className="body-m text-ink-2 mt-4">
          {success.confirmationSent
            ? "We also sent a confirmation to your email address."
            : "Your request is saved. Email confirmation may be delayed, so keep this reference."}
        </p>
        <p className="body-m text-ink-2 mt-4">
          Do not email medical information. A secure clinical intake will be provided separately
          only when an appropriate handoff is available.
        </p>
      </div>
    );
  }

  const open = availability.kind === "open";

  return (
    <form className="card max-w-[900px]" onSubmit={submit} noValidate data-testid="care-access-form">
      <div className="border-l-2 border-[var(--pulse)] pl-5 mb-8">
        <p className="mono-label text-pulse mb-2">CONTACT AND ROUTING ONLY</p>
        <p className="body-m text-ink-2">
          Do not enter symptoms, diagnoses, medications, medical history, laboratory results, or
          other medical information. This public form intentionally has no clinical free-text field.
        </p>
      </div>

      {availability.kind === "loading" && (
        <p className="body-m text-ink-2 mb-6" aria-live="polite">Checking availability…</p>
      )}
      {availability.kind === "closed" && (
        <div role="alert" className="mb-6">
          <p className="body-m text-ink-2">{availability.message}</p>
          <button type="button" className="btn btn-secondary min-h-11 mt-4" onClick={retry}>
            Retry availability
          </button>
        </div>
      )}
      {open && (
        <p className="body-m mb-6" aria-live="polite">
          <strong>Requests are open.</strong> Required fields are marked below.
        </p>
      )}

      {Object.keys(errors).length > 0 && (
        <div role="alert" className="mb-6" data-testid="care-access-validation-summary">
          <p className="body-m text-pulse">Check the required fields and try again.</p>
        </div>
      )}
      {serverError && (
        <div role="alert" className="mb-6" data-testid="care-access-server-error">
          <p className="body-m text-pulse">{serverError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.fullName}>Full name *</label>
          <input
            id={FIELD_IDS.fullName}
            className="input min-h-11 w-full"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            {...fieldProps(errors, "fullName")}
          />
          <FieldError errors={errors} name="fullName" />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.email}>Email *</label>
          <input
            id={FIELD_IDS.email}
            className="input min-h-11 w-full"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            {...fieldProps(errors, "email")}
          />
          <FieldError errors={errors} name="email" />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.phone}>
            Phone {contactMethod === "phone" || contactMethod === "text" ? "*" : "(optional)"}
          </label>
          <input
            id={FIELD_IDS.phone}
            className="input min-h-11 w-full"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            {...fieldProps(errors, "phone")}
          />
          <FieldError errors={errors} name="phone" />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.locationState}>Current U.S. state *</label>
          <select
            id={FIELD_IDS.locationState}
            className="input min-h-11 w-full"
            autoComplete="address-level1"
            value={locationState}
            onChange={(event) => setLocationState(event.target.value)}
            {...fieldProps(errors, "locationState")}
          >
            <option value="">Choose a state</option>
            {CARE_US_STATE_VALUES.map((value) => (
              <option key={value} value={value}>{CARE_US_STATE_LABELS[value]}</option>
            ))}
          </select>
          <FieldError errors={errors} name="locationState" />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.careGoal}>Help me route *</label>
          <select
            id={FIELD_IDS.careGoal}
            className="input min-h-11 w-full"
            value={careGoal}
            onChange={(event) => setCareGoal(event.target.value)}
            {...fieldProps(errors, "careGoal")}
          >
            <option value="">Choose a broad category</option>
            {CARE_GOAL_VALUES.map((value) => (
              <option key={value} value={value}>{CARE_GOAL_LABELS[value]}</option>
            ))}
          </select>
          <FieldError errors={errors} name="careGoal" />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.contactMethod}>Preferred contact *</label>
          <select
            id={FIELD_IDS.contactMethod}
            className="input min-h-11 w-full"
            value={contactMethod}
            onChange={(event) => setContactMethod(event.target.value)}
            {...fieldProps(errors, "contactMethod")}
          >
            <option value="">Choose a contact method</option>
            {CARE_CONTACT_METHOD_VALUES.map((value) => (
              <option key={value} value={value}>{CARE_CONTACT_METHOD_LABELS[value]}</option>
            ))}
          </select>
          <FieldError errors={errors} name="contactMethod" />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor={FIELD_IDS.contactWindow}>Best time *</label>
          <select
            id={FIELD_IDS.contactWindow}
            className="input min-h-11 w-full"
            value={contactWindow}
            onChange={(event) => setContactWindow(event.target.value)}
            {...fieldProps(errors, "contactWindow")}
          >
            <option value="">Choose a time</option>
            {CARE_CONTACT_WINDOW_VALUES.map((value) => (
              <option key={value} value={value}>{CARE_CONTACT_WINDOW_LABELS[value]}</option>
            ))}
          </select>
          <FieldError errors={errors} name="contactWindow" />
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="flex min-h-11 items-start gap-3" htmlFor={FIELD_IDS.adultConfirmation}>
            <input
              id={FIELD_IDS.adultConfirmation}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--pulse)]"
              type="checkbox"
              checked={adultConfirmation}
              onChange={(event) => setAdultConfirmation(event.target.checked)}
              {...fieldProps(errors, "adultConfirmation")}
            />
            <span className="body-m">I am 18 or older and currently located in the United States. *</span>
          </label>
          <FieldError errors={errors} name="adultConfirmation" />
        </div>
        <div>
          <label className="flex min-h-11 items-start gap-3" htmlFor={FIELD_IDS.boundaryAcknowledgement}>
            <input
              id={FIELD_IDS.boundaryAcknowledgement}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--pulse)]"
              type="checkbox"
              checked={boundaryAcknowledgement}
              onChange={(event) => setBoundaryAcknowledgement(event.target.checked)}
              {...fieldProps(errors, "boundaryAcknowledgement")}
            />
            <span className="body-m">
              I understand this is not emergency care or a medical intake and does not create an
              appointment, clinician-patient relationship, treatment decision, or prescription. *
            </span>
          </label>
          <FieldError errors={errors} name="boundaryAcknowledgement" />
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="care-access-website">Website</label>
        <input
          id="care-access-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="mt-6">
        <Turnstile onToken={setTurnstileToken} />
      </div>

      <button
        type="submit"
        className="btn btn-primary min-h-11 mt-8"
        disabled={!open || submitting}
        data-testid="care-access-submit"
      >
        {submitting ? "Saving request…" : "Submit Care request"}
      </button>
      <p className="body-s text-ink-mute mt-4 max-w-[68ch]">
        Submitting authorizes Xenios to contact you about this request. It is not marketing consent
        and is not clinical consent.
      </p>
    </form>
  );
}
