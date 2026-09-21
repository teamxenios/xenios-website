# Refund execution candidate rollback

This candidate is additive but begins protecting active refund intents as soon as it is installed. Rollback is allowed only after checkout and `RESEARCH_REFUND_EXECUTION_ENABLED` are disabled and a read-only precheck proves there are no rows whose state is not `committed`.

In one authorized transaction, first drop `public.research_payment_webhook_inbox.refund_execution_id`, then drop the claim/order guard triggers, the five public execution RPCs, the three trigger functions, and finally `public.research_refund_executions`. Do not delete or rewrite `research_refund_keys`, claims, orders, or order-state events: committed rows are business records and remain authoritative. Abort rather than roll back if an active row exists or if any provider refund is awaiting reconciliation.
