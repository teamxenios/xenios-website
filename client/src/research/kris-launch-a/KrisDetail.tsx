import { Link } from "wouter";
import type { KrisCatalogDetailView } from "@shared/research/kris-launch-a/contract";
import { KrisAccessBadge, KrisAccessNotices } from "./KrisAccess";
import { KrisPrice } from "./KrisPrice";
import { krisCatalogHref } from "./integration-packet";

/**
 * One Launch A item.
 *
 * Everything consequential is decided by the server and rendered as given: the
 * access policy for the channel, the note as supplied, the price or its honest
 * absence, and the disclosures.
 *
 * THERE IS NO PURCHASE CONTROL ON THIS PAGE, and there is no way to add one
 * without changing the contract: `KrisAccessPolicy.purchasable` is typed as the
 * literal `false`, and the item union has no action member at all. Signing in
 * reaches a catalog, not a permission to buy, and the disclosures say that in
 * words rather than leaving it to be inferred.
 */
export function KrisDetail({ item }: { item: KrisCatalogDetailView }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Specification", value: item.specification },
    { label: "Family", value: item.familyLabel },
    { label: "Access channel", value: item.channelLabel },
    { label: "Format", value: item.format || "Not stated" },
    { label: "Pack and price basis", value: item.packBasis || "Not stated" },
    {
      label: "Minimum order quantity",
      value: item.moq === null ? "Not stated" : String(item.moq),
    },
    { label: "Dosage form", value: item.dosageForm ?? "Not stated" },
  ];

  return (
    <main className="grid min-w-0 gap-6">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <Link
          className="body-s underline-offset-4 hover:underline"
          href={krisCatalogHref()}
          data-testid="kris-detail-back"
        >
          Back to the catalog
        </Link>
      </nav>

      <header className="grid min-w-0 gap-3">
        <p className="mono-label text-ink-mute min-w-0 break-words">
          {item.familyLabel}
        </p>
        <h1 className="display-s min-w-0 break-words" data-testid="kris-detail-name">
          {item.displayName}
        </h1>
        <p className="body-m text-ink-2 min-w-0 break-words">{item.specification}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <KrisAccessBadge access={item.access} />
        </div>
      </header>

      <section className="card grid min-w-0 gap-3" aria-labelledby="kris-detail-price">
        <h2 id="kris-detail-price" className="body-l font-700">
          Your price
        </h2>
        <p className="body-l font-700 min-w-0 break-words">
          <KrisPrice price={item.price} />
        </p>
        <p className="body-s text-ink-mute min-w-0 break-words">
          Partner price, confidential to your account.
        </p>
      </section>

      <section className="card grid min-w-0 gap-3" aria-labelledby="kris-detail-access">
        <h2 id="kris-detail-access" className="body-l font-700">
          Access
        </h2>
        <KrisAccessNotices
          access={item.access}
          suppliedNote={item.suppliedNote}
          headingLevel="h3"
        />
      </section>

      <section className="min-w-0" aria-labelledby="kris-detail-attributes">
        <h2 id="kris-detail-attributes" className="body-l font-700">
          Details
        </h2>
        <dl className="grid min-w-0 gap-3 mt-3 body-s sm:grid-cols-2">
          {rows.map((row) => (
            <div className="min-w-0" key={row.label}>
              <dt className="mono-label text-ink-mute min-w-0 break-words">
                {row.label}
              </dt>
              <dd className="mt-1 min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {item.disclosures.length > 0 && (
        <section className="min-w-0" aria-labelledby="kris-detail-disclosures">
          <h2 id="kris-detail-disclosures" className="body-l font-700">
            What this catalog is
          </h2>
          <ul className="grid min-w-0 gap-2 mt-3">
            {item.disclosures.map((line) => (
              <li
                key={line}
                className="body-s text-ink-2 min-w-0 break-words"
                data-testid="kris-disclosure"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default KrisDetail;
