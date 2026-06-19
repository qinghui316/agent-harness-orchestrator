# Spec: Verification Scope Guidance Alignment

## Goal

Align current verification guidance so future agents default to targeted, risk-based validation instead of treating full product suites as mandatory for every bounded change.

## Users

- Future coding agents continuing AHO structured changes.
- Human maintainer reviewing why a phase did or did not run full product tests.

## Acceptance Criteria

- AC-001: `AGENTS.md` describes product verification as a scoped escalation ladder: targeted tests first, full `npm run test` or slow Workbench suites only when broad/high-impact boundaries require them.
- AC-002: Tracked handoff/rule docs map existing npm test scripts to their intended use and state when to escalate from targeted checks to aggregate/full suites.
- AC-003: ECL/review guidance requires close evidence to name the verification scope and the reason full suites were run or skipped, without creating a new validation framework.
- AC-004: `docs/STATUS.md` remains a short handoff and stays aligned with the updated verification guidance.
- AC-005: Documentation/Harness checks pass; product tests are not required because this change does not modify product source, package scripts, or test behavior.

## Non-Goals

- Do not change product runtime, Workbench behavior, gate behavior, source apply, scheduler, Goal Loop, remote handoff, maintenance runtime, package scripts, or test files.
- Do not weaken full verification as the appropriate gate for broad runtime or release-risk changes.
- Do not add a new validation runner, test framework, or evidence-only phase.
- Do not include unrelated `README.md` work.

## Constraints

- Preserve ECL workflow truth, human gates, ToolPolicyGate boundaries, and existing validation/audit/close behavior.
- Keep current documents compact; do not copy archive history into handoff docs.
- Reuse existing test script names and Harness review fields rather than inventing a feature-local verification protocol.
- Do not force-add ignored local docs such as `docs/DEVELOPMENT.md`; durable guidance for this phase belongs in tracked handoff/rule/template files.
- Follow the plan-first subagent review result: plan review `019ee223-7a6a-7b82-a10d-08ae23e7e9a0` returned PASS before ECL creation.

## Risks

- Guidance could be misread as permission to skip necessary coverage; mitigate by naming escalation conditions and requiring review rationale.
- Updating ECL without the review template could create rule/template drift; mitigate by updating the template verification guidance.
- Handoff docs could grow into another ledger; mitigate by keeping STATUS changes minimal.
