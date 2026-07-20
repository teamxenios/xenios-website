// Guides adapter: the single home for the member knowledge endpoints
// (guides, guide corrections and topic requests, questions, answer ratings,
// Telegram linking, referrals). Pages import these functions instead of
// spelling URL strings inline. Behavior is identical to the previous inline
// calls: the same ApiResult envelope, payload types supplied by the caller.

import { apiGet, apiPost, type ApiResult } from "../lib/api";

const BASE = "/api/research/member";

export const guidesPaths = {
  guides: `${BASE}/guides`,
  guide: (slug: string) => `${BASE}/guides/${encodeURIComponent(slug)}`,
  guideCorrections: (slug: string) => `${BASE}/guides/${encodeURIComponent(slug)}/corrections`,
  guideTopicRequests: `${BASE}/guide-topic-requests`,
  questions: `${BASE}/questions`,
  questionVoice: `${BASE}/questions/voice`,
  questionRating: (questionId: string) =>
    `${BASE}/questions/${encodeURIComponent(questionId)}/rating`,
  telegram: `${BASE}/telegram`,
  telegramLink: `${BASE}/telegram/link`,
  telegramUnlink: `${BASE}/telegram/unlink`,
  referrals: `${BASE}/referrals`,
} as const;

/** Fetch the member guide library. */
export function fetchGuides<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(guidesPaths.guides, token);
}

/** Fetch one guide by slug. */
export function fetchGuide<T>(slug: string, token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(guidesPaths.guide(slug), token);
}

/**
 * Submit a correction on a guide. A guide payload may carry its own
 * corrections path; when present (non-empty) it wins over the default,
 * mirroring the page's previous `path || defaultEndpoint` behavior.
 */
export function submitGuideCorrection<T>(
  slug: string,
  body: unknown,
  token?: string | null,
  overridePath?: string | null,
): Promise<ApiResult<T>> {
  return apiPost<T>(overridePath || guidesPaths.guideCorrections(slug), body, token);
}

/** Ask for a new guide topic to be covered. */
export function requestGuideTopic<T>(body: unknown, token?: string | null): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.guideTopicRequests, body, token);
}

/** Fetch the member's submitted questions. */
export function fetchQuestions<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(guidesPaths.questions, token);
}

/** Submit a written question. */
export function submitQuestion<T>(body: unknown, token?: string | null): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.questions, body, token);
}

/** Submit a recorded voice question. */
export function submitVoiceQuestion<T>(
  body: unknown,
  token?: string | null,
): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.questionVoice, body, token);
}

/** Rate the answer to a question. */
export function rateAnswer<T>(
  questionId: string,
  body: unknown,
  token?: string | null,
): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.questionRating(questionId), body, token);
}

/** Fetch the current Telegram link state. */
export function fetchTelegramLink<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(guidesPaths.telegram, token);
}

/** Start linking the member's Telegram account. */
export function linkTelegram<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.telegramLink, {}, token);
}

/** Unlink the member's Telegram account. */
export function unlinkTelegram<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.telegramUnlink, {}, token);
}

/** Fetch the member's referral summary. */
export function fetchReferrals<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(guidesPaths.referrals, token);
}
