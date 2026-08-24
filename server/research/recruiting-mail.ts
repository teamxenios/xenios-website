import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { requireSupabaseAdmin } from "../routes";
import { getResendClient, TEAM_EMAIL } from "../services/email";
import { rateLimitHit } from "./rate-limit";

// ---------------------------------------------------------------------------
// Recruiting mail endpoint.
//
// The existing admin test-email route (research/outbox.ts) is deliberately capped to
// adminRecipients() so it can never become an open relay, and it carries no subject or body.
// Widening it would destroy that property, so recruiting mail gets its own narrow route instead.
//
// Three fixed kinds, nothing generic:
//   candidate_digest   -> Samuel only, subject must start [XENIOS CANDIDATE DIGEST]
//   recruiting_receipt -> Samuel only, subject must start [XENIOS RECRUITING RECEIPT]
//   interview_email    -> one candidate, only with a complete Samuel approval record
//
// The sender is server-controlled. A caller can never choose From or Reply-To, never supply CC or
// BCC, and never send to more than one recipient. This route is defence in depth: the recruiting
// operator is still responsible for verifying Samuel's actual approval before calling it.
// ---------------------------------------------------------------------------

export const RECRUITING_MAIL_PATH = "/api/admin/research/recruiting-mail";

const FROM = `xenios <${TEAM_EMAIL}>`;
const CONTROLLER_EMAIL = "samuel@xeniostechnology.com";
const REQUIRED_EMAIL_STATUS = "DIRECT_EMAIL_FOUND";
const AUTOMATION_HEADER = "x-recruiting-automation-token";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indeed's applicant relay domains. A relay address is never a direct candidate email.
const RELAY_RE = /@(.+\.)?(indeedemail|indeed)\.com$/i;

const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;
const MAX_FIELD = 200;

const KINDS = ["candidate_digest", "recruiting_receipt", "interview_email"] as const;
export type RecruitingMailKind = (typeof KINDS)[number];

const SUBJECT_PREFIX: Record<RecruitingMailKind, string | null> = {
  candidate_digest: "[XENIOS CANDIDATE DIGEST]",
  recruiting_receipt: "[XENIOS RECRUITING RECEIPT]",
  interview_email: null,
};

const INTERVIEW_REQUIRED = [
  "candidate_id",
  "candidate_email",
  "candidate_email_source",
  "candidate_email_status",
  "digest_id",
  "samuel_approval_reference",
  "template_version",
] as const;

export type SendMail = (input: {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}) => Promise<{ id?: string }>;

export type RecruitingMailDeps = {
  /** Interactive admin guard. Defaults to the standard Supabase admin gate. */
  requireAdmin?: RequestHandler;
  /** Mail transport. Defaults to the existing Resend-backed service. */
  sendMail?: SendMail;
  /** Returns the configured automation secret, or undefined when unset. */
  automationToken?: () => string | undefined;
  /** Rate limiter. Defaults to the shared research limiter. */
  rateLimit?: (key: string, windowSeconds: number, maxHits: number) => Promise<boolean>;
  log?: (message: string) => void;
};

/** Never let a recipient reach a log line intact. */
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "<redacted>";
  return `${email[0]}***${email.slice(at)}`;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // Compare lengths without leaking via early return on the secret itself.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function defaultSendMail(input: {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}): Promise<{ id?: string }> {
  const { client } = await getResendClient();
  const result: any = await client.emails.send({
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
  });
  return { id: result?.data?.id ?? result?.id };
}

/**
 * Authentication. Two accepted paths, checked in this order:
 *
 *  1. Automation token header. Durable, narrowly scoped, and valid ONLY on this route, so the
 *     unattended AM/PM runs never depend on a short-lived user session that will expire mid-schedule.
 *  2. The normal interactive Supabase admin session, for ad-hoc administrative use.
 *
 * A present-but-wrong automation token fails closed rather than falling through to the admin gate,
 * so a leaked-and-rotated token can never be retried against the interactive path.
 */
export function recruitingMailAuth(deps: RecruitingMailDeps = {}): RequestHandler {
  const readToken = deps.automationToken ?? (() => process.env.XENIOS_RECRUITING_AUTOMATION_TOKEN);
  const adminGuard = deps.requireAdmin ?? requireSupabaseAdmin;

  return (req: Request, res: Response, next: NextFunction) => {
    const presented = req.headers[AUTOMATION_HEADER];
    if (typeof presented === "string" && presented.length > 0) {
      const configured = (readToken() || "").trim();
      if (!configured) {
        return res.status(503).json({ ok: false, message: "Recruiting automation is not configured." });
      }
      if (!constantTimeEquals(presented, configured)) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
      }
      (req as any).recruitingActor = "automation";
      return next();
    }
    (req as any).recruitingActor = "admin-session";
    return adminGuard(req, res, next);
  };
}

export function registerRecruitingMail(app: Express, deps: RecruitingMailDeps = {}) {
  const sendMail = deps.sendMail ?? defaultSendMail;
  const limit = deps.rateLimit ?? rateLimitHit;
  const log = deps.log ?? ((message: string) => console.log(message));

  app.post(RECRUITING_MAIL_PATH, recruitingMailAuth(deps), async (req: Request, res: Response) => {
    const actor =
      (req as any).recruitingActor === "automation"
        ? "automation"
        : ((req as any).adminEmail as string | undefined) ?? "admin-session";

    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      // The caller never controls the envelope.
      for (const forbidden of ["from", "From", "replyTo", "reply_to", "cc", "CC", "bcc", "BCC"]) {
        if (body[forbidden] !== undefined) {
          return res.status(400).json({ ok: false, message: `The ${forbidden} field is not accepted.` });
        }
      }

      const kind = String(body.kind ?? "") as RecruitingMailKind;
      if (!KINDS.includes(kind)) {
        return res.status(400).json({ ok: false, message: "Unsupported mail kind." });
      }

      // Exactly one recipient. An array is a multi-recipient attempt, not a convenience.
      if (Array.isArray(body.to)) {
        return res.status(400).json({ ok: false, message: "Exactly one recipient per request." });
      }
      const to = String(body.to ?? "").trim().toLowerCase();
      if (!to || to.length > MAX_FIELD || !EMAIL_RE.test(to)) {
        return res.status(400).json({ ok: false, message: "Invalid recipient." });
      }

      const subject = String(body.subject ?? "").trim();
      const text = String(body.text ?? "");
      if (!subject || !text) {
        return res.status(400).json({ ok: false, message: "Subject and text are both required." });
      }
      if (subject.length > MAX_SUBJECT) {
        return res.status(400).json({ ok: false, message: "Subject is too long." });
      }
      if (text.length > MAX_BODY) {
        return res.status(400).json({ ok: false, message: "Body is too long." });
      }

      const prefix = SUBJECT_PREFIX[kind];
      if (prefix && !subject.startsWith(prefix)) {
        return res.status(400).json({ ok: false, message: `Subject must begin with ${prefix}.` });
      }

      // Internal mail is locked to the controller mailbox, one recipient, no exceptions.
      if (kind !== "interview_email" && to !== CONTROLLER_EMAIL) {
        return res
          .status(400)
          .json({ ok: false, message: "Internal recruiting mail may only go to the controller mailbox." });
      }

      let auditFields: Record<string, string> = {};
      if (kind === "interview_email") {
        const missing = INTERVIEW_REQUIRED.filter((f) => !String(body[f] ?? "").trim());
        if (missing.length) {
          return res
            .status(400)
            .json({ ok: false, message: `Incomplete approval record: ${missing.join(", ")}` });
        }
        for (const field of INTERVIEW_REQUIRED) {
          if (String(body[field]).length > MAX_FIELD) {
            return res.status(400).json({ ok: false, message: `${field} is too long.` });
          }
        }
        if (String(body.candidate_email_status) !== REQUIRED_EMAIL_STATUS) {
          return res.status(400).json({
            ok: false,
            message: `candidate_email_status must be ${REQUIRED_EMAIL_STATUS}.`,
          });
        }
        if (String(body.candidate_email).trim().toLowerCase() !== to) {
          return res
            .status(400)
            .json({ ok: false, message: "candidate_email must match the recipient." });
        }
        if (RELAY_RE.test(to)) {
          return res
            .status(400)
            .json({ ok: false, message: "Indeed relay addresses are not a direct candidate email." });
        }
        if (to === CONTROLLER_EMAIL) {
          return res
            .status(400)
            .json({ ok: false, message: "The controller mailbox is not a candidate recipient." });
        }
        auditFields = {
          candidate_id: String(body.candidate_id),
          digest_id: String(body.digest_id),
          template_version: String(body.template_version),
          approval_ref: String(body.samuel_approval_reference),
        };
      }

      const windowSeconds = 3600;
      const maxHits = kind === "interview_email" ? 60 : 20;
      const allowed = await limit(`recruiting-mail:${kind}`, windowSeconds, maxHits);
      if (!allowed) {
        log(`[recruiting-mail] rate limited kind=${kind} actor=${actor}`);
        return res.status(429).json({ ok: false, message: "Rate limit reached for recruiting mail." });
      }

      const result = await sendMail({ from: FROM, to, replyTo: TEAM_EMAIL, subject, text });

      // Audit line: never the body, never the token, never the intact recipient.
      const extra = Object.entries(auditFields)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      log(
        `[recruiting-mail] ts=${new Date().toISOString()} kind=${kind} actor=${actor} ` +
          `to=${redactEmail(to)} ${extra} providerId=${result.id ?? "none"} ` +
          `outcome=${result.id ? "sent" : "rejected"}`,
      );

      if (!result.id) {
        return res.status(502).json({ ok: false, message: "The provider did not accept the message." });
      }
      return res.json({ ok: true, providerMessageId: result.id });
    } catch (error) {
      log(`[recruiting-mail] error kind=${String((req.body ?? {}).kind)} actor=${actor}`);
      console.error("[recruiting-mail] send failed:", (error as Error)?.name);
      return res.status(500).json({ ok: false, message: "The send failed." });
    }
  });
}
