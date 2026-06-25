# Plan: auto-evolve-post-integrationfix-apply-window

## Approach

1. Review pending candidate archives and current ECL/template/handoff rules.
2. Classify each lesson through the Experience Lifecycle:
   Promote, Retain, Merge, Retire, or Archive-only.
3. Ask the authorized subagent for independent review and score.
4. Compare main-agent and subagent recommendations.
5. If a durable gap exists, apply the smallest rule/template/docs delta.
   Otherwise record `noop`.
6. Run Harness checks, mark evolution complete, update handoff docs, close and
   git-settle.

## Minimality Decision

Current evidence appears covered by existing rules:

- Real repaired apply evidence is already covered by Source Apply Safety and
  Workbench User-Surface Honesty coverage.
- Integration apply/discard remaining human-gated is covered by ToolPolicy /
  human-gate and product boundary rules.
- Same-Change scheduler/IntegrationCheck constraints are covered by recent
  loop-per-Change, scoped payload, and source apply rules.
- Marker-only repair remaining deterministic test helper is a product/archive
  fact, not a new Harness-wide process rule.

Therefore the default implementation is no product code, no new template
field, no lint rule, and no expanded handoff history unless independent review
identifies a missing repeated rule.

## Verification

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Product test suites are not required unless product runtime files are changed.
