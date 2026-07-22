-- xenios research member platform: member questions and the Telegram link
-- (Website 2 lane, Wave 5).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Members reach their own questions only through the server
-- routes, which scope every read and write by the session's member id.
--
-- HARD RULES this schema exists to keep honest:
-- - No queue position, anywhere. There is no column for a rank, a place in
--   line, or a count of anyone else's work, because a member is never shown
--   how many people are ahead of them and the server has nothing to serialize
--   even if a payload tried.
-- - sla_target_at is a TARGET, not a promise. It exists so Samuel's queue can
--   sort by what is aging, not so the member is told an answer is guaranteed
--   by a clock.
-- - A closed question is not reopened. A member who wants to continue files a
--   follow-up, linked by follow_up_of_question_id, so the record of what was
--   asked and answered stays intact.
-- - The raw link token is NEVER stored. Only its SHA-256 hash lands here, so a
--   database copy cannot be replayed to link a chat to a member's account.
-- - Telegram is never the system of record. chat_ref and display_name are
--   routing and display details; the questions, answers, and everything else
--   live in the tables above and in the member's account.

create extension if not exists "pgcrypto";

-- One row per question a member asked, whatever door it came through.
-- answered_by holds a DISPLAY NAME only ("Samuel"), never an admin email
-- address, because this row is serialized to the member who asked.
create table if not exists public.research_member_questions (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null,
  -- Not null with a default: the frozen contract types category as required,
  -- so a row without one would serialize a shape the UI cannot receive.
  category                text not null default 'other' check (category in (
                            'plan',
                            'product',
                            'account',
                            'shipping',
                            'privacy',
                            'other'
                          )),
  -- The member overview counts open questions off this column, so it is not
  -- nullable and it defaults to the state a brand new question is really in.
  status                  text not null default 'pending' check (status in (
                            'pending',
                            'being_reviewed',
                            'more_information_needed',
                            'answer_ready',
                            'completed'
                          )),
  source                  text not null default 'web' check (source in (
                            'web',
                            'telegram_text',
                            'telegram_voice'
                          )),
  body_text               text,
  -- A voice question carries a reference to its transcript in the private
  -- media table rather than the audio or the text itself.
  transcript_media_id     uuid,
  answer_text             text,
  answered_at             timestamptz,
  answered_by             text,
  rating                  int check (rating between 1 and 5),
  -- Set when this question continues a COMPLETED one. Closed questions get
  -- linked follow-ups rather than being reopened.
  follow_up_of_question_id uuid,
  sla_target_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- The member's own list, newest first.
create index if not exists research_member_questions_member_created_idx
  on public.research_member_questions (member_id, created_at desc);

-- Samuel's queue: what is open, ordered by what is aging fastest.
create index if not exists research_member_questions_status_sla_idx
  on public.research_member_questions (status, sla_target_at);

-- The one-time Telegram link. A row is minted when the member asks to link,
-- and is spent exactly once when the bot presents the matching token.
--
-- link_token_hash is the SHA-256 of the token. The raw token is shown to the
-- member once, in the response that mints it, and is never written down here
-- or anywhere else. The unique constraint is what makes a duplicate token
-- impossible to insert; used_at is what makes a replay impossible to spend.
create table if not exists public.research_telegram_links (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null,
  link_token_hash text not null unique,
  chat_ref        text,
  display_name    text,
  linked_at       timestamptz,
  revoked_at      timestamptz,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz default now()
);

create index if not exists research_telegram_links_member_idx
  on public.research_telegram_links (member_id);

-- One active link per chat, enforced by the database rather than by a query
-- that hopes for a single row. Without this, a chat could resolve to two
-- members and a message could be attributed to the wrong one.
create unique index if not exists research_telegram_links_active_chat_idx
  on public.research_telegram_links (chat_ref)
  where used_at is not null and revoked_at is null and chat_ref is not null;

alter table public.research_member_questions enable row level security;
alter table public.research_telegram_links enable row level security;
