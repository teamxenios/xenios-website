/** Provider-neutral versioned affiliate templates. Explicit sender action is required. */
export type AffiliateTemplate = Readonly<{
  assetCode: string;
  version: 1;
  audience: "affiliate" | "existing_client";
  channel: "email" | "dm" | "sms" | "instagram_story" | "feed" | "support";
  status: "draft";
  subject: string | null;
  body: string;
  requiredDisclosure: string | null;
}>;

export const AFFILIATE_TEMPLATES: readonly AffiliateTemplate[] = Object.freeze([
  { assetCode: "AFF-CONDITIONAL-APPROVAL", version: 1, audience: "affiliate", channel: "email", status: "draft", subject: "Your Xenios affiliate application", body: "Your application has been conditionally approved. Agreement, tax, payout, privacy, training, offer assignment and test-flow requirements must be completed before activation.", requiredDisclosure: null },
  { assetCode: "AFF-TESTING-CODE", version: 1, audience: "affiliate", channel: "email", status: "draft", subject: "Your Xenios testing code", body: "Your testing code is for the approved test journey only. It is not your affiliate portal password and it does not grant admin access.", requiredDisclosure: null },
  { assetCode: "AFF-FORMAL-ACTIVATION", version: 1, audience: "affiliate", channel: "email", status: "draft", subject: "Your Xenios affiliate relationship is active", body: "Your approved offers, current content, masked code information, referral link and support route are available in the affiliate portal. Use only the current assigned versions.", requiredDisclosure: null },
  { assetCode: "AFF-CLIENT-WARM-DM", version: 1, audience: "existing_client", channel: "dm", status: "draft", subject: null, body: "I have access to a private Xenios Research early-access catalogue. I can share the approved access path and Xenios can answer product, order and support questions directly.", requiredDisclosure: "I may receive compensation from eligible purchases made through my approved Xenios link or code." },
  { assetCode: "AFF-CLIENT-SUPPORT-HANDOFF", version: 1, audience: "existing_client", channel: "support", status: "draft", subject: null, body: "Xenios support handles product specifications, order status, payment review and fulfillment. I do not provide dosing, administration or medical guidance.", requiredDisclosure: null },
  { assetCode: "AFF-CLINICAL-HANDOFF", version: 1, audience: "existing_client", channel: "support", status: "draft", subject: null, body: "That question requires the appropriate Xenios support or Care pathway. I cannot provide clinical evaluation, prescribing, administration or medical escalation.", requiredDisclosure: null },
]);
