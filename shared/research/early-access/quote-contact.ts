/** Team mailbox for Early Access listing, request and private-quote correspondence. */
export const EARLY_ACCESS_TEAM_EMAIL = "team@xeniostechnology.com";

/** User-initiated drafts only. Reference and topic validation belong to each caller. */
export function teamDraft(subject: string, body: string): string {
  return "mailto:" + EARLY_ACCESS_TEAM_EMAIL + "?subject=" + encodeURIComponent(subject)
    + "&body=" + encodeURIComponent(body);
}
