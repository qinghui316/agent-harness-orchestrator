# Auto-Evolve Proposal: Real Codex Acceptance Window

## Candidate Window

Pending source: `harness/evolution/pending.md`.

Candidate archives:

- `harness/changes/archive/20260621-controlled-scheduler-continuation-acceptance/summary.md`
- `harness/changes/archive/20260621-workbench-usable-manual-closed-loop/summary.md`
- `harness/changes/archive/20260621-workbench-demand-to-execution-golden-flow/summary.md`
- `harness/changes/archive/20260621-workbench-verification-signal-stability/summary.md`
- `harness/changes/archive/20260623-workbench-current-project-real-codex-acceptance/summary.md`

## Recommendation

Status: `template-update`.

Promote two compact ECL clarifications and corresponding review-template
fields:

1. Current-project real acceptance must isolate the AHO development checkout,
   the Workbench managed project under test, and the AHO runtime home unless
   same-root source safety is explicitly the target of the test.
2. Workbench aggregate or slow-suite tool-window timeouts without assertion
   failure must be paired with explicit split package-script or
   capability-domain suite results. Passing split members can support the
   product-health conclusion, while the aggregate timeout remains verification
   topology or runtime-cost debt.

Do not add a new evidence family, lint rule, or Workbench product behavior for
this evolution window.

## Evidence

- The controlled Scheduler continuation archive showed that product-health
  judgment was blurred by a slow scheduler aggregate timeout. The accepted
  result treated the timeout as test-stability debt after targeted evidence
  proved the actual path.
- The demand-to-execution golden-flow archive again hit `npm run
  test:workbench` timeouts while bounded Workbench unit suites and the new slow
  golden-flow acceptance passed.
- The verification-signal archive split Workbench suites into unit,
  scheduler-slow, slow, and aggregate layers, making the split evidence an
  implemented verification strategy.
- The current-project real Codex acceptance archive first used the AHO
  development repository as the managed project and correctly hit source-safety
  blockers. The successful `a10` run used external source and external runtime
  home and reached real UI -> Codex -> validation/audit -> apply -> close.

## Experience Retention Scan

- Promote:
  - Real self-acceptance isolation: keep development checkout, managed project,
    and runtime home separate for formal apply/close evidence.
  - Workbench aggregate timeout handling: record aggregate timeout plus split
    member results before classifying product health.
- Retain:
  - Existing Source Apply Safety Acceptance, Workbench User-Surface Honesty,
    Scoped Workbench Action Payload, Documentation Entropy, Experience
    Lifecycle, and Core Mechanism Reuse rules.
  - Current-plan statement that full-auto remains later and manual gates remain
    current authority.
- Merge:
  - Front-half and back-half Workbench usability evidence remains one
    manual-gated baseline in current handoff docs.
  - Repeated slow-suite timeout experience becomes one general aggregate
    timeout rule rather than multiple archive-specific warnings.
- Retire:
  - Same-root real acceptance as a recommended path; it remains useful only as
    negative source-safety evidence.
  - Stale "Workbench verification signal is unreliable" current wording where
    split-suite evidence is now the accepted mitigation.
- Archive-only:
  - Specific sandbox labels (`a6`, `a8`, `a9`, `a10`), run ids, screenshots,
    and exact Codex failure/rework details.
  - Controlled Scheduler phase-by-phase continuation evidence that does not
    alter current Harness rules.

## Independent Review

Authorized subagent review was performed by Boyle
(`019ef0cc-fab0-7172-bfae-fc13bf814ea4`). Scope was read-only review and
scoring; the subagent did not edit files, apply evolution, or replace ECL
lifecycle.

Recommendation: `template-update`, score `84/100`.

Reviewer summary:

- Existing ECL already covers the major concepts: verification scope, real
  acceptance feedback, source apply safety, scoped Workbench actions,
  documentation entropy, and experience lifecycle.
- Promote template/checklist tightening for real/self-acceptance source
  isolation, Workbench aggregate timeout split evidence, in-flight scoped
  action suppression, and explicit no-fake real Codex evidence.
- Retain current rules; merge manual-loop wording into one current baseline;
  retire same-root current-project acceptance as positive pass evidence; keep
  `a6/a8/a9/a10` rerun chronology and run ids archive-only.
- Wording risk: do not make real Codex acceptance mandatory for every change,
  and do not hard-code `C:\aho-accept\a10` or sandbox names into durable rules.

## Validation Plan

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

No product tests are required because this proposal changes Harness
documentation/evolution records only.
