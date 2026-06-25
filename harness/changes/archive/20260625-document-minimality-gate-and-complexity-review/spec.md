# Spec: document-minimality-gate-and-complexity-review

## Goal

Reduce future AHO implementation bloat by adding a lightweight required check
for deletion, reuse, and YAGNI before new structured changes add product code,
Harness rules, templates, or cross-cutting architecture.

## Users

- Future AHO agents implementing structured changes.
- Reviewers checking whether a change added avoidable local frameworks,
  evidence layers, summary layers, or single-use abstractions.

## Acceptance Criteria

- AC-001: `AGENTS.md` contains a compact Minimal Implementation Gate that
  prioritizes no-op, reuse, shared-root fix, and smallest coherent
  implementation.
- AC-002: `docs/ECL.md` requires structured plans/reviews to record minimality
  decisions without weakening correctness, validation, source safety, stale
  revalidation, ToolPolicyGate, or human gates.
- AC-003: Harness change templates include a short minimality plan slot and a
  short `Complexity Deletion Review` section with `delete`, `reuse`, `yagni`,
  `shrink`, and `net` labels.
- AC-004: `docs/CURRENT-DEVELOPMENT-PLAN.md` architecture growth control
  describes the preferred order: delete, reuse, extend existing owner, add
  reusable owner, then feature-local logic only when justified.
- AC-005: The change remains documentation/template-only and does not install,
  vendor, or make Ponytail a runtime dependency.

## Non-Goals

- No product runtime changes.
- No new mandatory large review coverage block.
- No new linter or CI rule in this change.
- No Ponytail dependency or vendored code.

## Constraints

- Complexity review must stay lightweight: one-line short labels are enough.
- Docs-only wording changes may mark complexity review not applicable.
- Minimality guidance must not encourage skipping security, source safety,
  validation/audit, stale checks, ToolPolicyGate, or human gates.

## Risks

- The new review section could become another bureaucratic layer if it is too
  long; templates must keep it short and explicitly supplemental.
- Overemphasizing line count could encourage unsafe deletion; the rule must
  frame line count as a signal, not a correctness substitute.

