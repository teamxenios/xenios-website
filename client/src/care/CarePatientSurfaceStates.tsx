import { Link } from "wouter";
import {
  notServedExplanation,
  type CarePatientSurfaceState,
} from "./patient-surface";

/**
 * The non-ready states, rendered identically on all four patient service
 * surfaces.
 *
 * Sharing this keeps the four pages from drifting into different answers for
 * the same server response, and it puts every one of these sentences in one
 * reviewable place. None of them says or implies that a record exists, that a
 * record is absent, or that anybody has been told anything.
 */

export interface CareSurfaceSubject {
  /** Sentence-leading noun phrase, for example "Your instructions". */
  possessive: string;
  /** Lowercase noun phrase, for example "instructions". */
  plural: string;
}

export function careSurfaceHeadline(
  state: CarePatientSurfaceState<unknown>,
  subject: CareSurfaceSubject,
): string | null {
  switch (state.kind) {
    case "loading":
      return `Checking your private Care records…`;
    case "not_served":
      return `${subject.possessive} cannot be read in this release.`;
    case "disabled":
      return `Care is not available yet.`;
    case "auth_required":
      return "Sign in is required.";
    case "forbidden":
      return `This area is limited to patients in Care.`;
    case "error":
      return `${subject.possessive} are temporarily unavailable.`;
    case "ready":
      return null;
  }
}

export function CareSurfaceStateCard({
  state,
  subject,
  onRetry,
}: {
  state: CarePatientSurfaceState<unknown>;
  subject: CareSurfaceSubject;
  onRetry: () => void;
}) {
  if (state.kind === "ready") return null;

  if (state.kind === "loading") {
    return (
      <div className="card mt-6">
        <p className="body-m text-ink-mute">
          Nothing is claimed about your records while this check is in progress.
        </p>
      </div>
    );
  }

  if (state.kind === "not_served") {
    return (
      <div className="card mt-6">
        <p className="mono-label text-pulse mb-2">CONTRACT NOT SERVED</p>
        <p className="body-m text-ink-2 max-w-[64ch]">
          {notServedExplanation(state.contract, subject.possessive)}
        </p>
        <p className="mono-label text-ink-mute mt-4 break-words">
          {state.contract}
        </p>
        <Link href="/care" className="btn btn-secondary mt-6">
          View Care status
        </Link>
      </div>
    );
  }

  if (state.kind === "disabled") {
    return (
      <div className="card mt-6">
        <p className="body-m text-ink-2 max-w-[64ch]">{state.message}</p>
        <p className="body-m text-ink-2 mt-4 max-w-[64ch]">
          Care opens only after coverage, credentials, clinical partners,
          pharmacy readiness, content, and quality review are complete. Nothing
          about your own {subject.plural} is being claimed here.
        </p>
        <Link href="/care" className="btn btn-secondary mt-6">
          View Care status
        </Link>
      </div>
    );
  }

  if (state.kind === "auth_required") {
    return (
      <div className="card mt-6">
        <p className="mono-label text-pulse mb-2">AUTHORIZATION REQUIRED</p>
        <p className="body-m text-ink-2 max-w-[64ch]">
          This information is private and requires an authorized Care account.
          Nothing is shown and no action is available here.
        </p>
        <Link href="/research/sign-in" className="btn btn-primary mt-6">
          Sign in securely
        </Link>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className="card mt-6">
        <p className="mono-label text-pulse mb-2">NOT AUTHORIZED</p>
        <p className="body-m text-ink-2 max-w-[64ch]">
          Your account does not hold the patient permission this surface needs,
          so nothing is shown and no action is available here. This says nothing
          about whether any record exists.
        </p>
        <Link href="/care" className="btn btn-secondary mt-6">
          View Care status
        </Link>
      </div>
    );
  }

  return (
    <div className="card mt-6">
      <p className="body-m text-ink-2 max-w-[64ch]">
        Nothing was changed and nothing about your {subject.plural} is being
        claimed. Check again before relying on this page.
      </p>
      <button type="button" className="btn btn-secondary mt-6" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** The transmission and emergency boundary, repeated wherever a patient writes. */
export function CareNoTransmissionNotice({
  notice,
  emergency,
  id,
}: {
  notice: string;
  emergency: string;
  id?: string;
}) {
  return (
    <div className="card mt-6" id={id}>
      <p className="mono-label text-pulse mb-2">NOTHING IS SENT</p>
      <p className="body-m text-ink-2 max-w-[64ch]">{notice}</p>
      <p className="body-m text-ink-2 mt-4 max-w-[64ch]">{emergency}</p>
    </div>
  );
}
