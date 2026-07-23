# Engineering Implementation Notes

## Agreement Records

Store document category, version, immutable hash, rendered snapshot, effective date, acceptance text, typed legal name, member ID, timestamp, IP, user agent, and electronic-consent version.

## Separate Acceptances

Do not bundle arbitration, release, electronic consent, and general membership into one checkbox. Each must be separately displayed and recorded.

## Identity Files

Use private storage, short-lived signed URLs, role checks, access logs, magic-byte validation, automatic deletion, and legal holds. Never send raw IDs through email, analytics, logs, Telegram, or Slack.

## Manual Payments

A member submission creates `under_review`, never `verified`. Verification requires an authorized admin to confirm actual receipt and record destination, date, amount, external reference, and idempotency key.

## Privacy by Design

Do not expose personal payment handles publicly. Do not record unrelated balances. Do not run analytics on ID and evidence pages unless verified to exclude content.

## Versioning

Published documents are immutable. New versions create new rows and can trigger reacceptance. Preserve historical signed versions.

## Access Gate

Activation requires all current required documents, identity approval, and verified $50 payment. The $50 begins a 30-day period. The first $25 renewal is due 30 days later.
