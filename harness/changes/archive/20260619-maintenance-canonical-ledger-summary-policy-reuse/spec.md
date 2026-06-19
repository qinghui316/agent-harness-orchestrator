# Spec: maintenance-canonical-ledger-summary-policy-reuse

## Goal

AC-001: Centralize canonical maintenance ledger summary policy so feature modules do not hand-write repeated safety suffixes for canonical evidence ledger entries.

AC-002: Preserve existing maintenance ledger behavior: event types, artifact refs, idempotency, candidate-source exclusion, artifact JSON/Markdown output, and human-gated authority remain unchanged.

AC-003: Keep the change narrow and reusable: strengthen `ledger-event-policy` / `ledger` owners without introducing a new ledger framework, new artifact family, or new workflow transition.

## Users

- Future AHO agents extending maintenance / canonical patch evidence.
- Maintainers reviewing whether maintenance records can feed candidates, authorize canonical mutation, or remain read-only evidence.

## Acceptance Criteria

- AC-001: Canonical maintenance ledger summary suffixes for update proposal, update decision, patch proposal, application gate, manifest, result, and report are defined in one shared policy owner instead of feature-local string concatenation.
- AC-002: Existing canonical maintenance flows still write the same event types, artifact refs, JSON/Markdown artifacts, and idempotent single ledger entry per event/artifact ref.
- AC-003: `recordMaintenanceLedgerEntry()` and non-policy ledger events keep their existing raw-summary behavior.
- AC-004: Tests prove the shared policy output for the canonical event classes and no-policy fallback, and prove generated result/report ledger entries use the shared policy.
- AC-005: Candidate-source exclusion still treats canonical maintenance evidence and maintenance-review summary events as non-source events.

## Non-Goals

- No changes to canonical docs/stable-memory patch application authority or write behavior.
- No changes to ToolPolicyGate, human gate, Validation, Audit, IntegrationCheck, Workbench, scheduler, or Goal Loop behavior.
- No broad refactor of canonical maintenance builders, Markdown renderers, schemas, manager facade exports, or artifact store paths.

## Constraints

- `ledger-event-policy.ts` owns event classification and canonical evidence ledger summary policy.
- `ledger.ts` owns ledger entry construction and idempotent ensure semantics.
- Canonical feature modules should pass raw artifact summaries and event types, not policy suffix text.
- Keep summary text semantically and mechanically equivalent to existing strings.
- Do not apply policy suffixes to generic manual ledger entries.

## Risks

- Accidental double suffix if callers keep passing already-policy-extended summaries.
- Over-abstraction into a summary template system instead of a small event-type policy map.
- Changing ledger summaries in a way that weakens candidate exclusion or human-gate explanation.

