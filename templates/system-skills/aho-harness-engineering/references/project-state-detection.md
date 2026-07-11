# Project State Detection

This reference adapts the useful detection rules from `ecl-harness-engineer`
for AHO onboarding.

## Bounded Evidence

Prefer these signals:

- `AGENTS.md`;
- `.agent-harness/project.json`;
- resolved AHO `docs/`, `harness/`, and `scripts/` roots;
- README files;
- package manifests such as `package.json`, `pyproject.toml`, `go.mod`,
  `Cargo.toml`;
- source entrypoints and test configuration;
- CI files.

Avoid secrets, `.git`, dependency caches, build output, generated files, and
large binary data.

## Project State

| State | Criteria | Response |
| --- | --- | --- |
| Empty | No meaningful source or docs | Record missing product/stack/entrypoint decisions; do not invent them |
| Code Only | Source exists but no useful AHO map | Create the assigned minimal Harness Markdown from verified project evidence |
| Partial Harness | Some AHO files or marker exist, but gaps remain | Reconcile assigned Markdown and report non-Markdown gaps to Runtime |
| Harness Ready | AHO map, ECL, status, scripts, and handoff exist | Refresh only stale assigned context |

## ECL Readiness

| ECL State | Criteria | Response |
| --- | --- | --- |
| Missing | `docs/ECL.md` or change directories absent | Create assigned core ECL Markdown; report lifecycle-script needs to Runtime |
| Partial | ECL exists but scripts/templates/lints missing | Edit assigned Markdown only and report executable gaps to Runtime |
| Ready | ECL docs, changes, templates, reindex, evolve check, and lints exist | Check freshness and documentation entropy only |

## Small vs Structured Work

Carry forward this rule for later planning:

- Small work is local, low-risk, and does not touch interface, data,
  permission, architecture, runtime, validation chain, or cross-module
  behavior.
- Structured work uses AHO Change artifacts and requires user-reviewable
  spec/plan/tasks before implementation.

If impact is unclear, inspect read-only first. Do not guess that unclear work is
small.

## Baseline Verification Snapshot

For existing projects, capture available verification commands as bounded
evidence for assigned Markdown:

- TypeScript/Node: existing `lint`, `typecheck`, `test`, `build` scripts;
- Go: existing `go test ./...`, `go build ./...`, or Makefile scripts;
- Python: existing test/lint scripts or `python -m compileall`;
- other stacks: only commands already documented or inferable from manifests.

Record missing or failing commands as project context, not as permission to
weaken AHO gates.

## Failure Handling

| Trigger | First response | If still blocked |
| --- | --- | --- |
| Project state matches multiple rows | Prefer the stricter state and list the conflicting evidence | Ask for read-only follow-up instead of guessing readiness |
| ECL files exist but active/archive shape is inconsistent | Classify as Partial Harness and name the broken invariant | Do not treat it as Harness Ready until AHO checks pass |
| Verification command cannot be inferred | Record it as unknown, not failed | Ask for the expected command or defer to project docs |
| Baseline command fails before onboarding changes | Record failure as pre-existing project context | Do not relax future validation gates based on this Skill |
| Evidence volume is too large | Sample manifests, entrypoints, tests, and docs first | Record skipped directories and continue with bounded confidence |
