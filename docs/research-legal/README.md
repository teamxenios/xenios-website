# Research Legal Library README

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-REG-009 |
| Title | Research Legal Library README |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | updated when the library structure changes |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Permanent while the program operates; superseded versions archived per Document Control SOP (XR-REG-008) |
| Acceptance event | n/a (internal control document) |
| Withdrawal supported | No (internal control document) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-REG-001, XR-REG-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## What this library is

This folder is the counsel-ready drafting library for the Xenios Research Founding Membership,
a private, application-based, approval-required, 21+ membership program operated by Xenios
([ENTITY]; exact legal entity name and state of formation to be confirmed by counsel).

Every document in this library is a draft. Nothing in this library is in effect. No document
becomes binding, published, or operational until counsel approves it and it is formally
published under the Document Control SOP (XR-REG-008). Each document carries the same banner,
the same metadata table, and its own "Open items for counsel" section listing what still needs
a decision.

The library exists so that counsel can review one coherent, cross-referenced set of documents
instead of scattered files: 159 documents, one register, one key scheme, one dependency graph,
one trigger matrix, and one list of open decisions.

## Folder map

All paths are relative to the repository root. Counts reflect the current register
(159 documents total).

| Folder | Contents | Count |
| --- | --- | --- |
| `docs/research-legal/00-register/` | The control layer: register (human and machine readable), dependency graph, trigger matrix, jurisdiction matrix, open counsel decisions, source registry | 9 (with XR-REG-008 and this README) |
| `docs/research-legal/01-public-applicant/` | Public and applicant documents: entrance terms, application terms, pre-membership notices | 13 |
| `docs/research-legal/02-member/` | Member documents: the membership agreement, activation and recurring payment terms, cancellation acknowledgment, plan and support terms, consents | 27 |
| `docs/research-legal/03-tracker-media/` | Tracker, assessment, progress media, and health-data documents | 13 |
| `docs/research-legal/04-commerce-product/` | Commerce and product documents: store terms, shipping, returns, subscriptions, waitlist, large-order review | 19 |
| `docs/research-legal/05-affiliate-distribution/` | Referral, affiliate, Research Rep, and distribution documents (anti-MLM rules built in) | 18 |
| `docs/research-legal/06-fulfillment-suppliers/` | Fulfillment partner and supplier documents: split fulfillment, chain of custody, reseller authorization | 16 |
| `docs/research-legal/07-internal-policies-sops/` | Internal policies and SOPs: privacy, security, retention, HIPAA applicability, incident response, escalation | 36 |
| `docs/research-legal/08-quantum-placeholders/` | Quantum placeholders only. Quantum is Coming Soon: no commerce, no checkout, no sales agreement until its lane is approved | 8 |
| `docs/research-operations/document-control/` | The Document Control SOP (XR-REG-008), which governs versioning, approval, publication, and archiving for every document above | counted in the 9 register/control documents |

## How to find a document

1. Start at `00-register/DOCUMENT_REGISTER.md` (XR-REG-001). It lists every document with its
   key, title, path, audience, state, trigger, and route.
2. Or search the library by key. Every document key begins with `XR-`, so searching for a key
   such as `XR-MEM-004` finds both the document and every document that references it.
3. For automation, use `00-register/document-register.json` (XR-REG-002). It is the machine
   readable twin of the register and carries the same rows.
4. If you know the user-facing moment but not the document, use the Feature to Document
   Trigger Matrix (XR-REG-004), which maps product events (first visit, checkout, first photo
   upload) to the documents they surface.

## The key scheme

Every document has a unique key of the form `XR-<CAT>-<NNN>`:

| Prefix | Category | Folder |
| --- | --- | --- |
| XR-PUB | Public and applicant | 01-public-applicant |
| XR-MEM | Member | 02-member |
| XR-TRK | Tracker and media | 03-tracker-media |
| XR-COM | Commerce and product | 04-commerce-product |
| XR-AFF | Affiliate and distribution | 05-affiliate-distribution |
| XR-FUL | Fulfillment and suppliers | 06-fulfillment-suppliers |
| XR-POL | Internal policies and SOPs | 07-internal-policies-sops |
| XR-QTM | Quantum placeholders | 08-quantum-placeholders |
| XR-REG | Register and document control | 00-register and docs/research-operations/document-control |

Keys are stable. A document may be renamed or moved; its key does not change. Dependencies,
the trigger matrix, and acceptance records all reference keys, not paths.

## How the control documents relate

The 00-register folder is the control layer. Each control document answers one question:

- **Document Register (XR-REG-001, XR-REG-002)**: what exists. One row per document, human
  readable and machine readable. The register is the authoritative inventory; if a document is
  not in the register, it is not part of the library.
- **Document Dependency Graph (XR-REG-003)**: what depends on what. If counsel changes one
  document, the graph shows every document that must be re-checked.
- **Feature to Document Trigger Matrix (XR-REG-004)**: when each document surfaces. It maps
  product events and member states to the documents presented at that moment, and is the
  build specification for the acceptance flows.
- **Jurisdiction and Applicability Matrix (XR-REG-005)**: where each obligation applies. The
  library is drafted at national scope; this matrix tracks the pending state-by-state review.
- **Open Counsel Decisions (XR-REG-006)**: what is undecided. Every `[COUNSEL: ...]`
  placeholder in the library rolls up here as a numbered decision for counsel.
- **Source Registry (XR-REG-007)**: where claims come from. Every external source cited in the
  library is listed here with its URL and review date. Documents cite short source names; the
  registry carries the links.
- **Document Control SOP (XR-REG-008)**: how a draft becomes effective. Versioning, counsel
  approval, publication, supersession, and archiving.

## Standing rule: agreements precede payment

The activation order is fixed: approval, then identity and age verification, then agreements,
then the $50 activation payment, then the $25 recurring monthly membership authorization,
then password and mandatory MFA, then active membership. No payment is taken before the
member has been presented with, and accepted, the governing agreements. Every commerce and
member document in this library is drafted to that order, and the trigger matrix (XR-REG-004)
enforces it at the flow level.

## Reading order for counsel

1. **Start with `00-register/OPEN_COUNSEL_DECISIONS.md` (XR-REG-006).** It is the shortest
   path to every decision the library is waiting on.
2. **Then read the member core, XR-MEM-001 through XR-MEM-004:**
   - XR-MEM-001, Founding Membership Agreement
   - XR-MEM-002, $50 Activation Terms
   - XR-MEM-003, $25 Recurring Membership Authorization
   - XR-MEM-004, Immediate Cancellation and Access-Termination Acknowledgment
3. Then follow the Document Dependency Graph (XR-REG-003) outward from the member core, or
   review folder by folder in numeric order (01 through 08).
4. The Jurisdiction and Applicability Matrix (XR-REG-005) and the Source Registry (XR-REG-007)
   are reference material for the whole review rather than documents to read linearly.

## Standing rules for every document in this library

1. **Drafts only.** Every document is version 0.1.0-draft, status Draft, counsel status Not
   reviewed. Nothing is in effect. No draft creates rights, obligations, or representations.
2. **No HIPAA claims.** No document claims HIPAA compliance or "HIPAA compliant" status. The
   HIPAA applicability analysis is pending (XR-POL-009). Xenios does not represent itself as a
   HIPAA covered entity for direct-to-consumer services unless counsel concludes otherwise.
3. **No invented classifications.** Peptide products are described as research products whose
   classification and permitted marketing lane are under formal review. No document calls any
   product "FDA approved", "clinically proven", or "safe for everyone". Research-use language
   is never paired with human-outcome promises.
4. **No medical direction.** No diagnosis, no prescribing, no dosing instructions, and no
   outcome guarantees anywhere. Emergencies go to emergency services (911 in the US).
5. **Disclaimers do not erase duties.** No acknowledgment, waiver, or disclaimer in this
   library waives rights that cannot be waived under applicable law or relieves Xenios of
   duties imposed by law.
6. **Placeholders are deliberate.** Three placeholder forms appear throughout the library:
   - `[COUNSEL: ...]` marks a question counsel must decide; each one also appears in the
     document's "Open items for counsel" section and rolls up to XR-REG-006.
   - `[CONFIG: ...]` marks a value that is admin-configurable by design and intentionally not
     hardcoded (prices, rates, thresholds, timeframes).
   - `[ENTITY]` stands for the exact legal entity name and state of formation, which counsel
     will confirm. Prose refers to the business as "Xenios" or the program as "Xenios Research".
7. **No secrets.** No document contains credentials, API keys, tokens, or passwords.
8. **Consumer rights are preserved.** Cancellations, refunds, and consumer rights are always
   stated as subject to applicable law.

## Open items for counsel

- [ENTITY]: the exact legal entity name and state of formation must be confirmed by counsel;
  the confirmation applies library-wide and should be propagated through the register.
- Earlier drafts exist elsewhere in this repository under `docs/compliance/`, `docs/privacy/`,
  `docs/security/`, and `docs/risk/` (for example HIPAA_APPLICABILITY_ANALYSIS.md,
  MEMBERSHIP_COVENANT.md, RETENTION_POLICY.md, INCIDENT_RESPONSE_PLAN.md). Counsel to decide
  whether this library supersedes them and to reconcile any differences.
- Older top-level copies of DOCUMENT_REGISTER.md, SOURCE_REGISTRY.md, and
  document-register.json sit directly in `docs/research-legal/` alongside the canonical
  `00-register/` versions. Counsel and the document-control owner to confirm the `00-register/`
  paths as canonical and retire the duplicates under XR-REG-008.
- [COUNSEL: confirm the proposed reading order and whether counsel prefers a different review
  sequence or a phased review (member core first, commerce second, distribution third).]
- [COUNSEL: confirm the retention treatment of this README and the other register/control
  documents (currently: permanent while the program operates, superseded versions archived
  under XR-REG-008).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
