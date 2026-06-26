# workbench-transcript-one-time-pressure-acceptance-v1

## Purpose

Validate that Workbench transcript V1 can handle very large local conversations
without spending Codex tokens or committing large generated fixtures. This
change uses synthetic transcript pressure data for one-time measurement and
keeps only small regression tests for paging, virtual range bounds, and
long-message folding behavior.

## Scope

In scope:

- Synthetic transcript pressure acceptance for 1k / 10k / 50k cells.
- Lightweight regression coverage for transcript paging and virtual rendering.
- Recording whether V2 cursor-aware incremental transcript projection is needed.

Out of scope:

- Real Codex pressure testing or token-consuming acceptance.
- Durable large fixtures, generated pressure data, or default package-script
  pressure gates.
- Central database, transcript workflow-truth changes, scroll-state persistence,
  a second markdown renderer, or V2 incremental projection unless pressure data
  proves V1 is insufficient.

## Current Status

Completed.

Synthetic pressure acceptance passed. V1 remains acceptable for the current
local-use target, so V2 cursor-aware incremental transcript projection is not
needed now.

## Verification

- `npx vitest run tests/unit/parent-agent-transcript.test.ts tests/unit/transcript-virtual-list.test.ts`: passed.
- `npx vitest run tests/unit/web-app.test.tsx -t "loads a paged transcript|folds very long transcript"`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:fast`: passed.
- `npm run build`: passed.
- `npm run test:workbench`: skipped; this change did not alter Workbench runtime
  projection/UI contracts, and `test:fast` covered the touched transcript,
  server, and DOM regression surfaces.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`: passed; no active change.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`: passed; no pending evolution.

One-time pressure command used temporary in-memory/E-drive data only and
deleted `E:\aho-accept\transcript-pressure-v1\temp` after each run.

| Synthetic input | Built cells | Build ms | Latest page ms | Earlier page ms | Latest payload | Virtual rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1k mixed items | 981 | 4.4 | 0.2 | 0.2 | 45,892 bytes | 18 |
| 10k mixed items | 9,801 | 26.6 | 0.5 | 2.7 | 46,493 bytes | 18 |
| 50k mixed items | 49,001 | 110.3 | 3.3 | 5.9 | 47,093 bytes | 18 |

Long-message folding check on a 50k synthetic transcript found long cell
`cell:assistant:block-1`: original 4,139 chars, folded preview 842 chars,
sentinel hidden, folded height 1,362, expanded height 6,354.

Decision: do not start V2 now. Backend full-build-before-slice was not the
dominant bottleneck under this synthetic pressure. Revisit V2 only if real
local usage shows backend projection time, memory, or payload size exceeding
this baseline.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: synthetic pressure metrics above; no real
  Codex run artifacts were produced or needed.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: V2 incremental transcript
  builder deferred until measured backend projection cost justifies it.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.

