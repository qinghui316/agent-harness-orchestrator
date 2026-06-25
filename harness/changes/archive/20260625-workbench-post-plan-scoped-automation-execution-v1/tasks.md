# Tasks: workbench-post-plan-scoped-automation-execution-v1

- [x] T-001: Update scoped automation policy so `planning.confirm-execution`
  is not an allowed automatic child action.
  - Covers: AC-001, AC-002
- [x] T-002: Update Workbench UI eligibility so plan-confirmation gates only
  expose `请求批准`, while post-plan execution gates keep scoped full-access
  behavior.
  - Covers: AC-001, AC-005
- [x] T-003: Strengthen server/revalidation tests so forged scoped automation
  requests targeting plan confirmation fail closed.
  - Covers: AC-001, AC-003
- [x] T-004: Preserve and test eligible execution-stage automation, including
  decomposition, code/validation/audit, recovery, safe `audit.accept`, and
  terminal human gate stop behavior.
  - Covers: AC-002, AC-003, AC-004
- [x] T-005: Run targeted and aggregate verification, update review evidence,
  close the change, and perform git settlement excluding unrelated `README.md`.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005
