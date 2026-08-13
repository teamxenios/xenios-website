import type {
  KrisAccessPolicy,
  KrisChannel,
} from "@shared/research/kris-launch-a/contract";
import { ResearchStatusBadge, type BadgeTone } from "../ui/kit";

/**
 * ACCESS PRESENTATION. This is the part of Launch A that matters most.
 *
 * TWO SOURCES, BOTH SHOWN, NEITHER STANDING IN FOR THE OTHER
 * ---------------------------------------------------------
 * The server sends a `KrisAccessPolicy` derived from the item's channel, and it
 * separately sends the note supplied on the row. For 418 of the 420 rows the
 * supplied note happens to say roughly what the channel requires. For the two
 * rows with no price yet it says "Price pending." INSTEAD.
 *
 * So a surface that rendered the supplied note alone would drop "Research use
 * only" from BAM15 500 mcg and "Provider workflow required" from the syringes,
 * on precisely the two rows a reader looks at hardest. And a surface that
 * rendered only the policy would quietly discard what the supplier actually
 * wrote. Both are rendered, always, in every place an item appears.
 *
 * NOTHING HERE SELLS
 * ------------------
 * `purchasable` is `false` on every policy, and the browser contract has no
 * add-to-cart member at all, so there is no action for this component to reach
 * for even by accident. Signing in reaches a catalog, not a permission to buy,
 * and the detail disclosures say so in words rather than leaving it inferred.
 */

/**
 * Tone is a second signal, never the only one. The status label is always
 * rendered as text, so the meaning survives colour blindness, a greyscale
 * print, and a screen reader.
 */
export const KRIS_CHANNEL_TONE: Readonly<Record<KrisChannel, BadgeTone>> = {
  clinical_provider_only: "warning",
  ruo_research: "info",
  classification_pending: "pending",
  supplement: "neutral",
  nonclinical_topical: "neutral",
};

export function KrisAccessBadge({ access }: { access: KrisAccessPolicy }) {
  return (
    <span data-testid="kris-access-badge" data-channel={access.channel}>
      <ResearchStatusBadge
        label={access.statusLabel}
        tone={KRIS_CHANNEL_TONE[access.channel]}
      />
    </span>
  );
}

/**
 * The channel notices and the supplied note, in that order.
 *
 * The heading for each is explicit, because they have different authors: the
 * notices are what the channel requires, the note is what the supplier wrote.
 * Collapsing them into one list would hide which is which.
 */
export function KrisAccessNotices({
  access,
  suppliedNote,
  headingLevel = "p",
}: {
  access: KrisAccessPolicy;
  suppliedNote: string;
  headingLevel?: "p" | "h3";
}) {
  const Heading = headingLevel;
  const note = suppliedNote.trim();
  return (
    <div className="grid min-w-0 gap-2" data-testid="kris-access">
      <div className="min-w-0">
        <Heading className="mono-label text-ink-mute">Access</Heading>
        <ul className="grid min-w-0 gap-1 mt-1">
          {access.notices.map((notice) => (
            <li
              key={notice}
              className="body-s text-ink-2 min-w-0 break-words"
              data-testid="kris-access-notice"
            >
              {notice}
            </li>
          ))}
        </ul>
      </div>
      {note !== "" && (
        <div className="min-w-0">
          <Heading className="mono-label text-ink-mute">Note as supplied</Heading>
          <p
            className="body-s text-ink-2 mt-1 min-w-0 break-words"
            data-testid="kris-supplied-note"
          >
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
