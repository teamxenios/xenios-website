import {
  careSurfaceContent,
  isCareSurfaceStateKind,
  type CareSurfaceStateKind,
} from "./care-surface-contract";

export interface CareSurfaceStateProps {
  readonly state: CareSurfaceStateKind;
  readonly id?: string;
  readonly headingLevel?: "h2" | "h3";
}

export function CareSurfaceState({
  state,
  id,
  headingLevel: Heading = "h2",
}: CareSurfaceStateProps) {
  const resolvedState = isCareSurfaceStateKind(state) ? state : "unavailable";
  const content = careSurfaceContent(resolvedState);
  const isLoading = resolvedState === "loading";
  const isError = resolvedState === "error";

  return (
    <section
      id={id}
      className="card w-full min-w-0 border border-rule bg-white p-5 sm:p-7"
      data-care-surface-state={resolvedState}
      role={isError ? "alert" : "status"}
      aria-live={content.live}
      aria-busy={isLoading || undefined}
    >
      <p className="mono-cap text-pulse break-words">{content.eyebrow}</p>
      <Heading className="mt-3 text-ink break-words">{content.title}</Heading>
      <p className="body-s mt-3 max-w-prose text-ink-mute break-words">
        {content.description}
      </p>
    </section>
  );
}

export default CareSurfaceState;
