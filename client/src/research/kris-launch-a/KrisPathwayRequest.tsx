import { useState } from "react";
import type {
  KrisCatalogDetailView,
  KrisPathwayView,
} from "@shared/research/kris-launch-a/contract";
import { apiPost } from "../lib/api";
import { useResearch } from "../core";
import { MEMBER_ROUTES } from "../lib/routes";

/**
 * The working end of the pathway descriptor.
 *
 * The contract has always said what a non-direct row offers: `request` is a
 * concierge-request descriptor rendered against the contact channel that
 * already exists, and no new server door is opened for it. Until now the
 * descriptor arrived on the wire and nothing rendered it, so the two
 * price-pending rows, the 32 classification-pending rows, and the 244
 * provider rows were dead ends: visible, honestly labeled, and inert.
 *
 * The contact channel that already exists is the member Questions door
 * (POST /api/research/questions): member-gated, durable, rate-limited, and
 * already worked by a named human through the admin queue. This component
 * submits the request there, carrying the exact catalog identity (name,
 * specification, id, slug, channel) so the team knows precisely which row
 * prompted it, which the old product-less provider link never did.
 *
 * It deliberately creates no order, no cart, no price, and no quantity
 * commitment. A recorded request is a question a person picks up.
 */

export const KRIS_REQUEST_CATEGORY = "product" as const;

/**
 * The pin can downgrade a drifted row, and a downgraded row carries the
 * envelope's pathway, which may be null. The request must still work: a
 * member on a refused row deserves a working ask, not a dead card. So the
 * fallback composes the same shape the server would have, from fields the
 * row itself carries.
 */
export function pathwayForRequest(item: KrisCatalogDetailView): KrisPathwayView {
  if (item.pathway) return item.pathway;
  const label =
    item.purchaseMode === "price_pending"
      ? "Request price"
      : item.purchaseMode === "classification_pending"
        ? "Register interest"
        : "Request provider pathway";
  const headline =
    item.purchaseMode === "price_pending"
      ? "Price pending"
      : item.purchaseMode === "classification_pending"
        ? "Pending activation"
        : "Provider workflow required";
  return {
    kind: item.purchaseMode === "direct_eligible" ? "price_pending" : item.purchaseMode,
    headline,
    explanation: "Send a request and the team will follow up on this exact item.",
    request: {
      label,
      subject: `${label}: ${item.displayName} (${item.specification})`,
    },
  };
}

/** The durable body. First line is the server-composed subject; the exact catalog identity follows. */
export function requestBodyText(item: KrisCatalogDetailView, note: string): string {
  const lines = [
    pathwayForRequest(item).request.subject,
    `Item: ${item.displayName} | ${item.specification}`,
    `Catalog id: ${item.id}`,
    `Slug: ${item.slug}`,
    `Channel: ${item.channelLabel}`,
  ];
  const trimmed = note.trim();
  if (trimmed) lines.push(`Note: ${trimmed}`);
  return lines.join("\n");
}

type SendState = "idle" | "sending" | "sent" | "rate_limited" | "error";

export function KrisPathwayRequest({ item }: Readonly<{ item: KrisCatalogDetailView }>) {
  const { memberToken } = useResearch();
  const pathway = pathwayForRequest(item);
  const [note, setNote] = useState("");
  const [state, setState] = useState<SendState>("idle");

  async function submit() {
    if (state === "sending") return;
    setState("sending");
    const result = await apiPost<{ ok: true }>(
      "/api/research/questions",
      { category: KRIS_REQUEST_CATEGORY, bodyText: requestBodyText(item, note) },
      memberToken,
    );
    if (result.kind === "ok") return setState("sent");
    if (result.kind === "denied" && result.code === "rate_limited") {
      return setState("rate_limited");
    }
    setState("error");
  }

  if (state === "sent") {
    return (
      <div className="grid gap-2" data-testid="kris-pathway-sent">
        <p className="body-s font-700">Your request is recorded.</p>
        <p className="body-s text-ink-2">
          The team follows up on it directly. You can track it, and any answer, under{" "}
          <a className="underline" href={MEMBER_ROUTES.questions}>
            your questions
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-testid="kris-pathway-request">
      <label className="grid gap-1">
        <span className="body-s text-ink-2">Anything the team should know (optional)</span>
        <textarea
          className="input"
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          data-testid="kris-pathway-note"
        />
      </label>
      <button
        type="button"
        className="btn btn-primary w-fit"
        onClick={() => void submit()}
        disabled={state === "sending"}
        data-testid="kris-pathway-submit"
      >
        {pathway.request.label}
      </button>
      {state === "rate_limited" ? (
        <p className="body-s text-ink-2" data-testid="kris-pathway-limited">
          Too many requests at once. Your earlier requests are recorded; try this one again shortly.
        </p>
      ) : null}
      {state === "error" ? (
        <p className="body-s text-ink-2" data-testid="kris-pathway-error">
          The request could not be recorded. Please try again.
        </p>
      ) : null}
    </div>
  );
}

export default KrisPathwayRequest;
