# Review: workbench-cursor-incremental-transcript-projection-v2

Status: approved.

## Findings

None.

## Verification

- Selected verification scope: transcript/store/server/read-model/DOM targeted
  suites plus daily fast and Workbench aggregate.
- Targeted: `npx vitest run tests/unit/transcript-incremental-projection.test.ts tests/unit/parent-agent-transcript.test.ts tests/unit/transcript-virtual-list.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx` passed.
- Required: `npm run typecheck`, `npm run lint`, `npm run test:fast`, `npm run build`, and `npm run test:workbench` passed.
- Pressure acceptance: synthetic 100k / 500k message data generated under
  `E:\aho-accept\transcript-v2-pressure\temp`, measured, and deleted. 100k:
  latest 28.62 ms / earlier 19.21 ms / payload about 37 KB / virtual rows 17.
  500k: latest 93.28 ms / earlier 87.05 ms / payload about 37.5 KB /
  virtual rows 17.
- Full / aggregate suites run or skipped: `npm run test:workbench` was run
  because the Workbench projection contract changed. Slow/release suites were
  skipped because scheduler/apply/runtime behavior was not touched.

## Complexity Deletion Review

- delete: none.
- reuse: existing WorkbenchStore, thread-log, parent-agent transcript builder,
  server projection route, virtual list, and Pretext fallback.
- yagni: avoided central workflow database, second renderer, durable scroll
  cache, summary layer, and workflow/runtime changes.
- shrink: chose position-cursor paging over a new transcript index protocol.
- net: Lean already.

## Transcript Renderer Source-Boundary Coverage

- Canonical transcript projection checked: full projection remains available
  without paging params; paged route builds only the requested message page.
- Assistant markdown source checked: existing assistant block mapping is reused
  through thread-stream helpers.
- Process/tool row compactness checked: existing DOM/read-model tests remain
  passing.
- Derived workflow summary exclusion checked: existing forbidden transcript
  assertions remain in the targeted suite.
- Worker/role transcript scoping checked: no worker/role scoping behavior was
  changed.
- Private chain-of-thought exclusion checked: no new raw model source was added.

## Read Model Projection Coverage

- Checked scope: paged parent-agent transcript projection, full projection
  compatibility, and snapshot transcript shell.
- Result: paged route now uses SQLite message page reads; snapshot no longer
  constructs the selected topic full `parentAgentTranscript` by default.
- Tested with: targeted transcript/read-model/DOM suites and `npm run test:workbench`.

## Runtime Bridge Boundary Coverage

- Checked boundary: SQLite remains an interaction/projection store, not
  workflow truth.
- Result: no Change, run, validation, audit, worktree, apply, landing, close,
  scheduler, automation, or Goal Loop authority changed.
- Tested with: targeted transcript tests, `npm run test:fast`, and Workbench
  aggregate.

## Module Boundary Coverage

- Module owners checked: WorkbenchStore/thread-log/read-model transcript
  projection/server projection/frontend virtual transcript.
- Moved responsibilities: extracted a reusable message-page to thread-item
  helper inside the existing thread-stream owner.
- Retained facade responsibilities: Workbench manager/server projection exports
  remain compatibility surfaces.
- Forbidden write-back locations: no workflow artifacts, source roots, durable
  UI state, or central DB writes were added.
- Compatibility result: full transcript projection remains available; paged
  transcript response shape stays compatible.

## Core Mechanism Reuse Coverage

- Existing mechanisms reused or strengthened: Workbench SQLite message store,
  thread-log import/read path, parent-agent transcript cells, frontend virtual
  list, and Pretext fallback.
- New cross-cutting mechanism and owner: none.
- Local framework / state machine / projection / validation / gate avoided:
  no new workflow runtime, permission system, database, or renderer.
- Future-cost reduction result: later transcript compaction can reuse the same
  cursor/page boundary.

## Acceptance Feedback

- Real/manual acceptance performed: synthetic pressure acceptance only; no
  Codex tokens were used.
- External source/state safety: generated data stayed under
  `E:\aho-accept\transcript-v2-pressure\temp`; the temp directory was deleted.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none.
