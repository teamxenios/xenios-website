# Refund execution candidate rollback

This candidate is additive but begins protecting active refund intents as soon
as it is installed. First disable checkout and
`RESEARCH_REFUND_EXECUTION_ENABLED`, then run a read-only inventory. If any
refund execution or refund-bound webhook receipt exists, preserve the schema
and history: revoke service-role EXECUTE on the refund transition functions and
the capability function, leave the guards and evidence intact, and stop. A
committed row is a business record, not permission to drop the table.

A destructive schema rollback is allowed only before activation when a
read-only precheck proves both `research_refund_executions` and refund-bound
inbox receipts are empty. In one authorized transaction, drop only the refund
foreign-key constraint from `research_payment_webhook_inbox` (the nullable
`refund_execution_id` column belongs to the base checkout-inbox candidate and
must remain), restore the base candidate's checkout-only terminalizer, drop the
three refund guard triggers and their trigger functions, drop the five refund
transition functions plus `research_checkout_money_capability()`, and finally
drop `research_refund_executions`. Do not delete or rewrite
`research_refund_keys`, claims, orders, inbox receipts, or order-state events.
Abort if an active execution exists, a provider refund awaits reconciliation,
or any evidence row would be lost.
