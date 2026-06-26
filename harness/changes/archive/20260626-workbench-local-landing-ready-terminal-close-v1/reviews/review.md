# Review: workbench-local-landing-ready-terminal-close-v1

Status: completed / ready to close.

## Findings

- [P1] Ready local landing no longer routes the selected Change to PR provider
  readiness when provider is unavailable. The primary gate becomes either
  existing `change.close` or a local terminal blocker.
- [P2] Close is still correctly blocked when the selected Change has real ECL
  close blockers. The E-drive acceptance surfaced `Review status is pending`;
  the UI now reports that as local terminal blocker instead of fake-closing.

## Verification

- `npx vitest run tests/unit/workbench-read-model.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed.
- `npm run test:workbench` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; close-ready with only closeout task pending before this update.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed.
- Release/slow suites were not run because this change only touches Workbench
  read-model projection and does not change scheduler execution, source apply,
  remote, or provider behavior.

## Complexity Deletion Review

- delete: none.
- reuse: existing landing confirmation builder, PR draft projection,
  confirmation queue promotion, close gate, and decision inspector alignment.
- yagni: avoided new local terminal runtime, permission system, projection
  framework, evidence family, PR provider setup, and remote flow.
- shrink: intercepted only provider-unavailable ready landing instead of
  rewriting PR/landing projection.
- net: small additive helper and tests; production behavior remains in existing
  owners.

## Coverage

- Workbench read-model / confirmation projection: covered by
  `workbench-read-model.test.ts`.
- Workbench user-surface honesty: ready local landing shows local close gate or
  local close blocker, not fake PR readiness as primary.
- Source apply safety: no source apply, PR, remote, merge, or Harness evolution
  behavior added.
- Module boundary / core reuse: logic stayed in Workbench confirmation /
  decision-inspector owners.
- Close / handoff drift: active pointers aligned before close; final handoff
  docs updated during closeout.

## Real Acceptance

- Browser connector limitation: in-app browser setup still failed with
  `failed to write kernel assets`.
- Workbench server snapshot used: `http://127.0.0.1:4375`.
- External source: `E:\aho-accept\integrationfix-real-ui-v1\src`.
- Runtime home: `E:\aho-accept\integrationfix-real-ui-v1\home`.
- Selected Change: `src-alpha-ts-alphamode-legacy-modern`.
- Landing package: `landing-integration-check-251e3dd502b9`.
- Observed primary: `landing:local-terminal-blocker:landing-integration-check-251e3dd502b9`.
- Observed background provider item:
  `pr-draft:provider:landing-integration-check-251e3dd502b9`.
- External source status: `M src/alpha.ts`, `M src/beta.ts`,
  `?? src/integration-note.ts`.
