import type { ReviewedProductContent as ProductContent } from "../../../../shared/research/master-offerings/approved-content";

/**
 * The overview's paragraphs: text separated by one or more blank lines, in
 * order. Reviewed copy leads with a plain-language paragraph and follows with
 * the full description; each is shown as its own paragraph and none is
 * clipped. A single line break does not start a paragraph.
 */
export function overviewParagraphs(overview: string): string[] {
  return overview
    .split(/\r?\n(?:[ \t]*\r?\n)+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function ReviewedProductContent({ content, inDialog = false }: { content: ProductContent; inDialog?: boolean }) {
  const Heading = inDialog ? "h3" : "h2";
  const overview = overviewParagraphs(content.overview);
  const sections = [
    ["Purpose", content.purpose],
    ["Ingredients", content.ingredients],
    ["Label information", content.label],
    ["Cautions", content.cautions],
    ["Storage", content.storage],
  ] as const;

  return (
    <section aria-label="Product information" className="grid min-w-0 max-w-[70ch] gap-4 break-words text-sm">
      {content.brand && <p className="text-ink-mute">{content.brand}</p>}
      <div>
        <Heading className="font-semibold">Overview</Heading>
        {overview.length > 1 ? (
          <div className="space-y-3">
            {overview.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        ) : <p>{overview[0] ?? content.overview}</p>}
      </div>
      {Boolean(content.specifications?.length) && (
        <div>
          <Heading className="font-semibold">Specifications</Heading>
          <dl className="grid min-w-0 gap-2">
            {content.specifications?.map(({ label, value }) => (
              <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
      )}
      {sections.map(([label, value]) => value && (
        <div key={label}>
          <Heading className="font-semibold">{label}</Heading>
          {label === "Cautions" && /\r?\n\r?\n/.test(value) ? (
            <div className="space-y-3">
              {value.split(/\r?\n\r?\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          ) : <p>{value}</p>}
        </div>
      ))}
      {Boolean(content.documentation?.length) && (
        <div>
          <Heading className="font-semibold">Documentation</Heading>
          <ul>
            {content.documentation?.map(({ label, href }) => (
              <li key={href}><a href={href} className="underline" target="_blank" rel="noreferrer">{label}</a></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
