import { careBoundaryContent, type CareBoundaryKind } from "./care-surface-contract";

export interface CareBoundaryNoticeProps {
  readonly kind: CareBoundaryKind;
  readonly headingLevel?: "h2" | "h3";
}

export function CareBoundaryNotice({
  kind,
  headingLevel: Heading = "h2",
}: CareBoundaryNoticeProps) {
  const content = careBoundaryContent(kind);

  return (
    <aside
      className="w-full min-w-0 border-l-2 border-pulse bg-white px-4 py-4 sm:px-5"
      data-care-boundary={kind}
      aria-label={content.label}
    >
      <p className="mono-cap text-pulse break-words">{content.label}</p>
      <Heading className="mt-2 text-ink break-words">{content.title}</Heading>
      <p className="body-s mt-2 max-w-prose text-ink-mute break-words">
        {content.description}
      </p>
    </aside>
  );
}

export default CareBoundaryNotice;
