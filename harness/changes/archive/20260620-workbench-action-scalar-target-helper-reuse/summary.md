# Workbench Action Scalar Target Helper Reuse

## Purpose

Move repeated Workbench high-impact action scalar target-id matching into the existing Workbench action target revalidation owner.

This is a narrow Architecture Growth Control change. It strengthens an existing helper boundary and does not add runtime behavior, scheduler authority, action paths, or gates.

## Scope

In scope:

- Add a pure optional scalar target helper in `src/workbench/actions/active-target.ts`.
- Reuse it for seven existing scheduler integration/complete scalar target checks in `src/workbench/actions/boundary.ts`.
- Extend `tests/unit/workbench-module-boundaries.test.ts`.

Out of scope:

- Scheduler execution semantics, IntegrationCheck behavior, Workbench UI, action payload shapes, package scripts, `workflow-actions/registry.ts`, broader `boundary.ts` extraction, earlier worker-chain scalar checks, Goal Loop, ToolPolicyGate, human gates, and `README.md`.

## Current Status

Completed.

## Verification

Passed:

- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npx eslint src/workbench/actions/active-target.ts src/workbench/actions/boundary.ts tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- Close-ready review by subagent `019ee245-59c3-7141-9ac5-e4eebfefddfb`

Not run:

- Full `npm run test`, full `npm run test:workbench`, slow Workbench suites, and build. This change is a helper-level behavior-preserving Workbench action target revalidation reuse and did not change scheduler execution, Workbench UI, package scripts, IntegrationCheck behavior, ToolPolicyGate, human gates, or runtime semantics.

## Acceptance Feedback

- Plan review: subagent `019ee23f-eac4-7fb2-9c47-eaf9d41dfe9b` returned PASS.
- Close-ready review: subagent `019ee245-59c3-7141-9ac5-e4eebfefddfb` returned PASS.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: preserve missing/empty-request no-op behavior and exact target-name error text.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to `AGENTS.md`, `docs/STATUS.md`, and active change files; current docs/handoff updates are narrow current-state evidence only.
- Experience lifecycle result: not an auto-evolve change.
- Roadmap/current-direction stale language check: no roadmap direction changed; next resume remains Architecture Growth Control / core mechanism reuse.
- Old experience retained / merged / retired / archive-only: not applicable.
