import { useState } from "react";
import { LISTING_QUESTION_TOPICS, RESEARCH_SUPPORT_EMAIL, listingQuestionDraft, type ListingQuestionTopic } from "./listing-question";

/** Operational support only. This is never a request submission or a clinical inbox. */
export function ListingQuestion({ variantReference }: { variantReference?: string }) {
  const [topic, setTopic] = useState<ListingQuestionTopic>("listing");
  const { href, reference } = listingQuestionDraft(variantReference, topic);
  return <details className="min-w-0 max-w-full text-sm" data-testid="catalog-listing-question">
    <summary className="min-h-11 cursor-pointer content-center break-words font-semibold underline">
      Ask about this item
    </summary>
    <div className="grid min-w-0 gap-2 py-2">
      <p>A Xenios team member can help with the listing, packaging, availability or your quote request.</p>
      <label className="grid min-w-0 gap-1">What is your question about?
        <select className="min-h-11 max-w-full" value={topic}
          onChange={(event) => setTopic(event.currentTarget.value as ListingQuestionTopic)}>
          {Object.entries(LISTING_QUESTION_TOPICS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <p>Write your question in your email app. Please leave out health, prescription and payment details. For questions about your own care, ask your healthcare provider.</p>
      <a className="min-h-11 w-fit max-w-full content-center font-semibold underline" href={href}>Open email draft</a>
      <p className="min-w-0 break-words">If your email app does not open, write to <span>{RESEARCH_SUPPORT_EMAIL}</span>.
        {reference && <> Include catalog reference <code className="break-all">{reference}</code>.</>}
      </p>
      <p>Nothing is sent until you send the email. Your quote cart stays unchanged.</p>
    </div>
  </details>;
}
