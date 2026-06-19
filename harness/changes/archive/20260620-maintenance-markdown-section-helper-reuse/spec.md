# Spec: Maintenance Markdown Section Helper Reuse

## Goal

Reduce repeated maintenance Markdown section layout in canonical maintenance renderers by strengthening the existing maintenance Markdown helper owner.

## Users

- Future agents extending the maintenance canonical update / canonical patch chain.
- Maintainers reviewing generated maintenance evidence Markdown.

## Acceptance Criteria

- AC-001: `src/agent-task/maintenance-markdown.ts` owns a reusable section layout helper for `## Section` blocks.
- AC-002: Canonical update/proposal/gate/manifest/result/report renderers reuse the helper for generic section layout while retaining domain-specific content locally.
- AC-003: Generated Markdown remains semantically identical and avoids changes to schemas, artifact ids, authority flags, lineage, target validation, artifact refs, ledger events, gates, Workbench actions, runtime, scheduler, Goal Loop, and source mutation.
- AC-004: Tests and review prove the helper output, module boundary, Architecture Growth Control coverage, targeted verification, and close-ready handoff.

## Non-Goals

- New artifact family, report, manifest, descriptor, state machine, validation gate, ledger policy, projection, runtime protocol, markdown DSL, or framework.
- Behavior changes to maintenance canonical application, ToolPolicyGate, human gates, Workbench actions, source mutation, scheduler, Goal Loop, or Harness evolution.
- Broad maintenance-chain redesign or unrelated Workbench/test architecture changes.

## Constraints

- Follow current ECL lifecycle and active-change handoff rules.
- Preserve existing public exports and generated Markdown meaning.
- Reuse existing owner modules instead of adding a feature-local markdown framework.
- Keep `README.md` unrelated and untracked unless explicitly requested.

## Risks

- A too-general markdown DSL would add framework surface instead of reducing complexity.
- Renderer refactors can accidentally change evidence Markdown; tests should include exact helper output and boundary checks.
- Over-testing with full suites would slow iteration without adding coverage for a renderer-only helper change.
