export type ShareOutcome = "shared" | "copied" | "cancelled" | "copy_unavailable" | "invalid_link";

/** Only the canonical opaque public link, on this exact application origin. */
export function safeRecommendationUrl(value: unknown, origin = window.location.origin): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== origin || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return /^\/r\/r1_[A-Za-z0-9_-]{43}$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export async function copyRecommendation(value: unknown): Promise<ShareOutcome> {
  const url = safeRecommendationUrl(value);
  if (!url) return "invalid_link";
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch { return "copy_unavailable"; }
}

export async function shareRecommendation(value: unknown): Promise<ShareOutcome> {
  const url = safeRecommendationUrl(value);
  if (!url) return "invalid_link";
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Explore Xenios", text: "Explore the appropriate Care or nonclinical Research pathway with Xenios.", url });
      return "shared";
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    }
  }
  return copyRecommendation(url);
}

export function shareOutcomeMessage(outcome: ShareOutcome): string {
  switch (outcome) {
    case "shared": return "Share sheet completed. Xenios does not know whether a message was delivered.";
    case "copied": return "Link copied. It is ready to paste into your message.";
    case "cancelled": return "Sharing cancelled. Your link is unchanged.";
    case "copy_unavailable": return "Copy is unavailable in this browser. Select the visible link to copy it manually.";
    case "invalid_link": return "This link cannot be shared safely. Refresh your links or contact support.";
  }
}
