// Guides adapter: the single home for the member knowledge endpoints
// (guides, guide corrections and topic requests, questions, answer ratings,
// Telegram linking, referrals). Pages import these functions instead of
// spelling URL strings inline. Behavior is identical to the previous inline
// calls: the same ApiResult envelope, payload types supplied by the caller.

import { apiDelete, apiGet, apiPost, type ApiResult } from "../lib/api";
import type { GuideDetailDto, GuideSummaryDto } from "@shared/research/commerce-api";
import {
  QUESTION_CATEGORIES,
  QUESTION_STATUSES,
  type MemberQuestion,
  type QuestionCreateRequest,
  type QuestionRateRequest,
  type TelegramLinkStart,
  type TelegramLinkState,
} from "@shared/research/member-platform";

const BASE = "/api/research/member";

// Contract note (2026-07-31 adapter audit): there is no `${BASE}/guides`
// surface on the server and there never was. The guide library and one guide
// live on the FROZEN commerce paths below (`/api/research/guides`), which is
// what the member pages call. The member-prefixed list and detail entries that
// used to sit here, and the two unused functions that read them, resolved to
// nothing and have been removed rather than left as a trap for the next page
// that reaches for them.
export const guidesPaths = {
  guideCorrections: (slug: string) => `${BASE}/guides/${encodeURIComponent(slug)}/corrections`,
  guideTopicRequests: `${BASE}/guide-topic-requests`,
  questions: "/api/research/questions",
  questionRating: (questionId: string) =>
    `/api/research/questions/${encodeURIComponent(questionId)}/rate`,
  telegram: "/api/research/telegram",
  telegramLink: "/api/research/telegram/link",
  referrals: `${BASE}/referrals`,
} as const;

// Frozen commerce-lane guide routes (docs/research-commerce/
// API_CONTRACTS_COMMERCE.md). Distinct from the member paths above, which stay
// untouched. An unpublished guide appears in the list with status only and the
// detail route answers with the guide_not_published denial code.
export const frozenGuidePaths = {
  guides: "/api/research/guides",
  guide: (slug: string) => `/api/research/guides/${encodeURIComponent(slug)}`,
} as const;

/** Frozen surface: list the guide library (published and unpublished statuses). */
export function listGuides(token: string | null): Promise<ApiResult<{ guides: GuideSummaryDto[] }>> {
  return apiGet(frozenGuidePaths.guides, token);
}

/** Frozen surface: fetch one guide by slug (denies with guide_not_published). */
export function getGuide(token: string | null, slug: string): Promise<ApiResult<{ guide: GuideDetailDto }>> {
  return apiGet(frozenGuidePaths.guide(slug), token);
}

/**
 * Submit a correction on a guide. A guide payload may carry its own
 * corrections path; when present (non-empty) it wins over the default,
 * mirroring the page's previous `path || defaultEndpoint` behavior.
 *
 * Contract note: no server route collects corrections yet, and no store
 * exists to put one in. The unavailable result is therefore correct and the
 * page says so plainly, naming the email address that does reach a person.
 * That is a real fallback, not a dead end, so this call is left pointing at
 * the path the editorial store will publish on.
 */
export function submitGuideCorrection<T>(
  slug: string,
  body: unknown,
  token?: string | null,
  overridePath?: string | null,
): Promise<ApiResult<T>> {
  return apiPost<T>(overridePath || guidesPaths.guideCorrections(slug), body, token);
}

/**
 * Ask for a new guide topic to be covered. Same posture as corrections: not
 * published yet, and the page names the email that reaches a person.
 */
export function requestGuideTopic<T>(body: unknown, token?: string | null): Promise<ApiResult<T>> {
  return apiPost<T>(guidesPaths.guideTopicRequests, body, token);
}

const malformed = <T>(): ApiResult<T> => ({
  kind: "error",
  code: "malformed_response",
  message: "The server returned an invalid response.",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
const CANONICAL_ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  CANONICAL_ISO_DATE_TIME.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export function isMemberQuestion(value: unknown): value is MemberQuestion {
  if (!isRecord(value)) return false;
  if (
    typeof value.source !== "string" ||
    !["web", "telegram_text", "telegram_voice"].includes(value.source)
  ) return false;
  const hasBody = typeof value.bodyText === "string" && value.bodyText.trim().length > 0;
  const hasTranscriptMedia =
    typeof value.transcriptMediaId === "string" && value.transcriptMediaId.trim().length > 0;
  const sourceRelationship =
    value.source === "telegram_voice"
      ? value.bodyText === null && hasTranscriptMedia
      : hasBody && value.transcriptMediaId === null;
  return (
    typeof value.questionId === "string" &&
    value.questionId.length > 0 &&
    QUESTION_CATEGORIES.includes(value.category as never) &&
    QUESTION_STATUSES.includes(value.status as never) &&
    sourceRelationship &&
    isNullableString(value.answerText) &&
    (value.answeredAt === null || isIsoDate(value.answeredAt)) &&
    (value.rating === null || [1, 2, 3, 4, 5].includes(value.rating as number)) &&
    isNullableString(value.followUpOfQuestionId) &&
    isIsoDate(value.createdAt) &&
    (value.slaTargetAt === null || isIsoDate(value.slaTargetAt))
  );
}

export function isTelegramLinkState(value: unknown): value is TelegramLinkState {
  return (
    isRecord(value) &&
    typeof value.linked === "boolean" &&
    (value.linkedAt === null || isIsoDate(value.linkedAt)) &&
    isNullableString(value.telegramDisplayName) &&
    (!value.linked || value.linkedAt !== null)
  );
}

export function isTelegramLinkStart(value: unknown): value is TelegramLinkStart {
  return (
    isRecord(value) &&
    typeof value.linkToken === "string" &&
    value.linkToken.length > 20 &&
    isIsoDate(value.expiresAt) &&
    isNullableString(value.botUsername)
  );
}

/** Fetch the member's submitted questions and reject malformed DTOs. */
export async function fetchQuestions(token?: string | null): Promise<ApiResult<{ questions: MemberQuestion[] }>> {
  const result = await apiGet<unknown>(guidesPaths.questions, token);
  if (result.kind !== "ok") return result;
  if (!isRecord(result.data) || result.data.ok !== true || !Array.isArray(result.data.questions)) return malformed();
  if (!result.data.questions.every(isMemberQuestion)) return malformed();
  return { kind: "ok", data: { questions: result.data.questions } };
}

/** Submit a written question. */
export async function submitQuestion(
  body: QuestionCreateRequest,
  token?: string | null,
): Promise<ApiResult<{ question: MemberQuestion }>> {
  const result = await apiPost<unknown>(guidesPaths.questions, body, token);
  if (result.kind !== "ok") return result;
  if (!isRecord(result.data) || result.data.ok !== true || !isMemberQuestion(result.data.question)) return malformed();
  return { kind: "ok", data: { question: result.data.question } };
}

/** Rate the answer to a question. */
export async function rateAnswer(
  questionId: string,
  body: QuestionRateRequest,
  token?: string | null,
): Promise<ApiResult<{ ok: true }>> {
  const result = await apiPost<unknown>(guidesPaths.questionRating(questionId), body, token);
  if (result.kind !== "ok") return result;
  if (!isRecord(result.data) || result.data.ok !== true) return malformed();
  return { kind: "ok", data: { ok: true } };
}

/** Fetch the current Telegram link state. */
export async function fetchTelegramLink(token?: string | null): Promise<ApiResult<{ state: TelegramLinkState }>> {
  const result = await apiGet<unknown>(guidesPaths.telegram, token);
  if (result.kind !== "ok") return result;
  if (!isRecord(result.data) || result.data.ok !== true || !isTelegramLinkState(result.data.state)) return malformed();
  return { kind: "ok", data: { state: result.data.state } };
}

/** Start linking the member's Telegram account. */
export async function linkTelegram(token?: string | null): Promise<ApiResult<{ link: TelegramLinkStart }>> {
  const result = await apiPost<unknown>(guidesPaths.telegramLink, {}, token);
  if (result.kind !== "ok") return result;
  if (!isRecord(result.data) || result.data.ok !== true || !isTelegramLinkStart(result.data.link)) return malformed();
  return { kind: "ok", data: { link: result.data.link } };
}

/** Unlink the member's Telegram account. */
export async function unlinkTelegram(token?: string | null): Promise<ApiResult<{ ok: true }>> {
  const result = await apiDelete<unknown>(guidesPaths.telegramLink, token);
  if (result.kind !== "ok") return result;
  if (!isRecord(result.data) || result.data.ok !== true) return malformed();
  return { kind: "ok", data: { ok: true } };
}

/** Fetch the member's referral summary. */
export function fetchReferrals<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(guidesPaths.referrals, token);
}
