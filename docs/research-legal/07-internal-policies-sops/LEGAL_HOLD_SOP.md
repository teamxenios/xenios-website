# Legal Hold SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-036 |
| Title | Legal Hold SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | invoked when a hold trigger event occurs (section 2); in force from adoption |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | hold register entries, hold notices, acknowledgments, and release records retained for the life of the matter plus [COUNSEL: confirm period]; held data retained until release |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date; custodian acknowledgments recorded per hold) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-007, XR-POL-012, XR-POL-033, XR-MEM-027, XR-TRK-009, XR-COM-019, XR-FUL-001 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose and scope

A legal hold is the program's mechanism for preserving records when a legal matter requires it, overriding ordinary deletion until the hold is released. This SOP defines what triggers a hold, who declares it, how notice is given, exactly which deletion mechanisms are suspended, how scope is tracked, and how a hold is released. It covers every record class in the program: applications, agreements and acceptance records, identity verification results, member account and assessment records, tracker data, media, orders, subscriptions, payment references, support and Telegram records, audit logs, affiliate records, and fulfillment records held by partners.

## 2. Trigger events

Any of the following triggers a hold evaluation, and doubt resolves toward holding while counsel is consulted:

1. litigation filed against or by Xenios, or a credible written threat of it,
2. litigation reasonably anticipated for any other reason,
3. a subpoena, civil investigative demand, or other legal process,
4. a government or regulator inquiry (for example FDA, FTC, or a state attorney general),
5. a reported serious adverse event or a product concern with injury alleged (XR-COM-019),
6. a product recall (research.recall.opened),
7. an insurance claim or an insurer's request to preserve,
8. a payment dispute that escalates beyond routine chargeback handling, and
9. an instruction from counsel.

The preservation duty can begin when a matter is reasonably anticipated, not only when papers arrive. [COUNSEL: confirm the trigger standard and provide matter-type examples for this program]

## 3. Declaration and named accountability

Samuel Boadu, Founder, declares and owns every hold, on counsel's advice where time permits and immediately on his own judgment where it does not (with counsel review as soon as possible after). Each hold receives a unique hold identifier, a named matter description, and a declaration date, recorded in the hold register (section 6). No hold is informal: if records are being preserved for a matter, there is a register entry.

## 4. Hold notice

1. Internal custodians: during the founding phase the human custodian is Samuel himself; the operative "notice" is therefore primarily the system configuration in section 5, plus a written self-directed hold memo for the file, so the record shows when the duty was recognized and what was done. When staff exist, each custodian receives a written notice naming the matter (as counsel permits), the data in scope, the do-not-delete instruction, and a required acknowledgment.
2. Vendors and partners: where in-scope records sit with a vendor or the fulfillment partner (order, shipment, and inventory records under XR-FUL-001 and its schedules), Xenios sends a written preservation instruction and records the acknowledgment. [COUNSEL: provide the vendor preservation notice template]
3. Notices avoid unnecessary matter detail and never include privileged analysis.
4. Reminders are re-sent on a cadence while the hold is active [CONFIG: hold reminder cadence].

## 5. Suspension of deletion

On declaration, for in-scope records only:

1. Retention-schedule deletion is suspended. Automatic purges under the Retention and Deletion Schedule (XR-POL-005) are paused for held records; XR-POL-005 explicitly yields to an active hold.
2. Member deletion requests are handled with counsel. Privacy rights requests (XR-MEM-027) and media deletion elections (XR-TRK-009) are honored in the ordinary course, but for records within a hold's scope, deletion is deferred where law permits. [COUNSEL: confirm the interplay between legal hold and state privacy deletion rights, including what exemption language applies and what the member is told when deletion is deferred]
3. Cancellation-driven cleanup is deferred for held records. Cancellation already does not erase transaction, payment, agreement, safety, security, and audit records; a hold extends preservation to any additional in-scope records that would otherwise age out.
4. Destructive actions are blocked mechanically where possible: Infinity's approval layer (XR-POL-032) rejects destructive-action packets touching held records, media purges under XR-POL-033 skip held files, and quarantine purges skip held items.
5. Backups: ordinary backup rotation may continue for out-of-scope data; in-scope data is preserved by export or snapshot before any rotation would age it out [COUNSEL: confirm the backup preservation standard expected for this program's size].

Suspension is scoped, not global. A hold on one matter does not stop the program's deletion promises for unrelated members and records.

## 6. Scope tracking: the hold register

One register tracks every hold. Each entry carries:

```text
hold id
matter name and type
trigger event and date
declaration date and declarant
counsel contact
custodians and acknowledgment dates
systems and vendors in scope
record classes in scope
member references in scope (opaque references, per XR-POL-032 payload rules)
deletion mechanisms suspended
status (active, under review, released)
last review date
release date and authority
```

Scope is reviewed as the matter develops and widened or narrowed in writing. Register changes are audited (XR-POL-012).

## 7. Review and release

1. Active holds are reviewed on a cadence [CONFIG: hold review cadence; working target quarterly] against the matter's status.
2. Release requires counsel's written confirmation that the preservation duty has ended. Samuel records the release in the register with date and authority.
3. On release, normal retention resumes: records past their XR-POL-005 retention point are queued for ordinary deletion, and deferred member deletion requests and media elections are executed and confirmed. Nothing held is kept indefinitely by inertia.
4. The register entry, notices, acknowledgments, and release record are retained per the metadata table even after release, as the evidence that preservation was handled properly.

## 8. Interaction with incidents

A security or privacy incident (XR-POL-007) can itself create a preservation duty (regulatory inquiry, anticipated claims). The incident commander evaluates hold triggers as part of incident handling, and incident evidence exports are treated as in-scope records of any resulting hold.

## Open items for counsel

- [COUNSEL: confirm the trigger standard for reasonably anticipated litigation and provide matter-type examples for this program (section 2)]
- [COUNSEL: provide the vendor preservation notice template and confirm partner obligations under XR-FUL-001 support it (section 4)]
- [COUNSEL: confirm the interplay between legal hold and state privacy deletion rights, including member communications when deletion is deferred (section 5)]
- [COUNSEL: confirm the backup preservation standard expected for a program of this size (section 5)]
- [COUNSEL: confirm retention of hold register and release records, life of matter plus what period (metadata table)]
- [CONFIG: hold reminder cadence (section 4); hold review cadence, working target quarterly (section 7)]
- Reconcile with the earlier draft docs/privacy/RETENTION_POLICY.md; counsel to confirm XR-POL-005 plus this SOP supersede it on retention and hold behavior.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
