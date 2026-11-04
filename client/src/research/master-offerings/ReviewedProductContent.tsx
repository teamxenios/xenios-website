import type { ReviewedProductContent as ProductContent } from "../../../../shared/research/master-offerings/approved-content";

export function ReviewedProductContent({ content, inDialog = false }: { content: ProductContent; inDialog?: boolean }) {
  const Heading = inDialog ? "h3" : "h2";
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
        <p>{content.overview}</p>
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
        <div key={label}><Heading className="font-semibold">{label}</Heading><p>{value}</p></div>
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
