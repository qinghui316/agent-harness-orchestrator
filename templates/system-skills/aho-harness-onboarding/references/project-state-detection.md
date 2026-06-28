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
| Empty | No meaningful source or docs | Ask for product/stack/entrypoint decisions and propose a minimal doc plan |
| Code Only | Source exists but no useful AHO map | Build `ProjectContextPack`, then propose Harness docs/scripts deltas |
| Partial Harness | Some AHO files or marker exist, but gaps remain | Identify missing or stale pieces and propose reconcile work |
| Harness Ready | AHO map, ECL, status, scripts, and handoff exist | Produce compact context refresh and continue ordinary planning |

## ECL Readiness

| ECL State | Criteria | Response |
| --- | --- | --- |
| Missing | `docs/ECL.md` or change directories absent | Propose core ECL docs and lifecycle scripts through a Change |
| Partial | ECL exists but scripts/templates/lints missing | Propose the smallest completion delta |
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

For existing projects, capture available verification commands as proposal
evidence:

- TypeScript/Node: existing `lint`, `typecheck`, `test`, `build` scripts;
- Go: existing `go test ./...`, `go build ./...`, or Makefile scripts;
- Python: existing test/lint scripts or `python -m compileall`;
- other stacks: only commands already documented or inferable from manifests.

Record missing or failing commands as project context, not as permission to
weaken AHO gates.
