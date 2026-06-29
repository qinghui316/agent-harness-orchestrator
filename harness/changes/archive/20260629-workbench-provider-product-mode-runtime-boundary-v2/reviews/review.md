# Review: workbench-provider-product-mode-runtime-boundary-v2

## Findings

No blocking issues found.

The implementation keeps the provider registry as a readiness and metadata
boundary. It does not introduce authorization logic, provider switching, normal
Agent mode, a new workflow scheduler, or a runner rewrite.

## Scope Review

- Provider / Product Mode / Harness Execution Mode are now represented as
  distinct types and API concepts.
- Codex remains the only runnable provider and Harness remains the only
  runnable product mode.
- Harness execution mode remains `request-approval` / `full-access` and is not
  mixed into provider/model selection.
- Workbench Settings shows the Codex capability matrix only.
- Codex run metadata records provider id, product mode, adapter, effective
  model/source, and a stable capability snapshot version/hash.

## Boundary Review

- Provider Registry is not used as ToolPolicyGate, confirmation, Goal Loop,
  Scheduler, validation/audit, apply/close, or Harness evolution authority.
- Capability snapshot hash excludes volatile `checkedAt` style refresh fields.
- Unsupported future provider/product-mode concepts are type-level only and not
  returned as runnable UI/API choices.
- Existing owners remain in place: Codex diagnostics, model settings, Skills,
  attachments, app-server, and exec fallback were not migrated.

## Complexity Deletion Review

- Delete/no-op considered: rejected because V1 lacked explicit three-layer
  vocabulary and stable metadata versioning.
- Reuse retained: `src/provider-runtime/`, existing Codex diagnostics/model
  settings/Skill/attachment readiness, Workbench Settings, and existing run
  metadata paths.
- New layers avoided: no provider selector, no normal Agent mode runtime, no
  central workflow engine, no permission framework, no projection framework.
- Net result: thin boundary consolidation, not a rewrite.

## Read Model / UI Coverage

Workbench API compatibility is preserved by keeping the `providers` capability
payload while adding `runtimeSummaries`. UI tests cover the Codex-only matrix,
execution-mode wording, and absence of fake providers/modes.

## Verification

- `npx vitest run tests/unit/codex.test.ts tests/unit/workbench-server.test.ts tests/unit/web-app.test.tsx` passed: 3 files, 129 tests.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test:fast` passed: 65 files, 644 tests.
- `npm run build` passed.
- `npm run test:workbench` passed: 9 files, 139 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` passed.

`scripts/lint-ecl.ps1` initially failed because `AGENTS.md` and
`docs/STATUS.md` still pointed to no active change; the active handoff pointers
were updated before final Harness checks.

## Residual Risk

No real UI screenshot was taken for this boundary-only change. The changed
surface is a Settings/API capability matrix and metadata contract, covered by
unit and Workbench contract tests. A future provider or normal Agent mode should
open a separate structured change rather than expanding this boundary pass.
