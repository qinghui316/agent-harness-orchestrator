# Bootstrap Project

## Inputs

- Evidence-limited L1, critical rules, Registry preflight, and current Structured Change.
- User-confirmed purpose, language, application type, package identity, runtime constraints, and acceptance.
- `references/bootstrap/project.md`, the selected language/application variant, and project-specific
  environment constraints.

## Agent Judgment

Choose the smallest architecture that satisfies the confirmed first scenario. Separate domain and
application behavior from CLI/HTTP/framework boundaries. Do not infer a framework, service, port,
endpoint, persistence model, authentication scheme, package manager, or CI provider.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime creates the one bootstrap Change for the user goal, publishes its scope, and runs
  preflight before plan approval and after material paths, contracts, or baseline changes.
- Runtime validates the approved plan and Change artifacts before implementation.
- Runtime assigns the approved variant to an AHO Worker and its worktree; the Worker implements only
  that assigned scope and does not create another Change, Lane, or worktree.
- Runtime runs the new project's declared build, test, lint, typecheck, start, and scenario checks.
- Runtime closes complete evidence after verification and establishes a commit boundary only when
  the user requests Integration.

## Actions

1. Propose WHAT/WHY, observable acceptance, non-goals, and confirmed product decisions for the spec.
2. Propose package layout, dependency direction, entrypoint, commands, environment, docs, tests, and CI for the plan.
3. Return each AC mapped to owner/path/validation tasks for Runtime publication and approval.
4. Implement source and project-owned files only in the assigned Worker worktree.
5. Return the primary-scenario result, declared-gate observations, review findings, and summary evidence.
6. Runtime performs Close and any explicitly authorized Integration through the normal I2 gate.

## Outputs

- Business source, tests, project commands, and evidence-supported documentation/CI.
- Complete Change evidence and optional Integration notes.
- Canonical project evidence suitable for a later project Harness refresh.

## Exit

The confirmed first scenario works, all accepted gates have outcomes, and the Change passes the
mature ECL close contract. No speculative service, secret, command, or architecture claim remains.

## Stop And Escalate

Stop on unresolved stack/application decisions, unavailable required runtime, security or public
contract ambiguity, failed plan review, or validation that contradicts completion.

## Rules

Apply HR-01 through HR-04, HR-18, HR-23, and HR-24 plus
`references/rules/by-stage/bootstrap-project.md`.
