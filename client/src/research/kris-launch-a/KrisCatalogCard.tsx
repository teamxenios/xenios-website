import { Link } from "wouter";
import type { KrisCatalogItemView } from "@shared/research/kris-launch-a/contract";
import { KrisAccessBadge, KrisAccessNotices } from "./KrisAccess";
import { KrisPrice } from "./KrisPrice";
import { krisItemHref } from "./integration-packet";

/**
 * One catalog card.
 *
 * It states the family, the specification, the access status the channel
 * carries, the notices that go with it, the note as supplied, and the price or
 * an honest "Price pending".
 *
 * IT CARRIES NO PURCHASE CONTROL, and it cannot: Launch A is browse, login and
 * price, `purchasable` is false on every policy, and the browser contract has
 * no add-to-cart member for this file to reach for.
 */
export function KrisCatalogCard({ item }: { item: KrisCatalogItemView }) {
  const headingId = `kris-card-${item.id}`;
  return (
    <li className="min-w-0">
      <article
        className="card grid min-w-0 gap-3"
        aria-labelledby={headingId}
        data-testid="kris-card"
        data-item-id={item.id}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mono-label text-ink-mute min-w-0 break-words">
              {item.familyLabel}
            </p>
            <h3 id={headingId} className="body-l font-700 mt-1 min-w-0 break-words">
              {/* Family and slug, because the detail route and the detail API
                  both take both. A wouter Link keeps this a client-side
                  navigation, like every other member page. */}
              <Link
                className="underline-offset-4 hover:underline"
                href={krisItemHref(item.family, item.slug)}
                data-testid="kris-card-link"
              >
                {item.displayName}
              </Link>
            </h3>
            <p className="body-s text-ink-2 mt-1 min-w-0 break-words">
              {item.specification}
            </p>
          </div>
          <KrisAccessBadge access={item.access} />
        </div>

        <dl className="grid min-w-0 gap-3 body-s sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="mono-label text-ink-mute">Format</dt>
            <dd className="mt-1 min-w-0 break-words">{item.format || "Not stated"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="mono-label text-ink-mute">Price</dt>
            <dd className="mt-1 min-w-0 break-words">
              <KrisPrice price={item.price} />
            </dd>
          </div>
        </dl>

        <KrisAccessNotices access={item.access} suppliedNote={item.suppliedNote} />
      </article>
    </li>
  );
}

export default KrisCatalogCard;
