# Intake

## Inputs

- User request and accepted user plan, when present.
- Critical rules, L1 overview, and current project evidence.
- Canonical project instructions and evidence relevant to scope.

## Agent Judgment

Classify the user goal as Small or Structured. Resolve goal, observable acceptance, non-goals,
dependencies, risk, and high-impact unknowns. One Structured goal has one Change even when Runtime
later decomposes it into parallel AgentTasks. Do not ask again for decisions already settled by an
accepted plan unless repository evidence conflicts with it.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime decides whether the goal requires a Structured Change and owns `change new`, scope
  publication, preflight, and the structural publication gate.
- Collaboration-mode metadata and expected worktree count do not split one goal into multiple Changes.
- Agents inspect the Runtime-provided Change and preflight evidence; internal Workers do not invoke
  lifecycle commands.

## Actions

1. Restate the intended outcome and evidence-backed constraints.
2. Identify API, schema, event, config, permission, module, release, or multi-step validation impact.
3. For Structured work, propose initial paths/contracts for Runtime publication. If Runtime's preflight reports
   `refresh-needed`, reload related Registry events/contracts and current implementation evidence
   before relying on periodic L1/L2/L3 assertions.
4. Record assumptions; ask at most three high-impact questions in one round, and only when their
   answers materially change implementation or safety.
5. Recommend whether Runtime should create or reuse one Change for the user goal. Workflow children
   inherit the Runtime-supplied Change and never create sub-Changes. If the request corrects or
   continues a terminal Change, read its archived summary and return a new-Change proposal that
   explains which accepted decisions still apply, which assumptions are superseded, and what work
   remains. Runtime creates and publishes that Change after rechecking those facts against the
   current baseline, contracts, and implementation; never reopen or edit archived evidence.
6. Recommend upgrading Small work to Structured when inspection reveals contract, cross-module,
   data, permission, architecture, release, or multi-step validation impact; Runtime performs the
   transition before implementation.

## Outputs

- Small-work decision, or one Runtime-initialized Change id and accepted scope.
- Observable acceptance, scope, non-goals, assumptions, risks, and unresolved blockers.

## Exit

Acceptance is testable and no unresolved high-impact ambiguity remains. Structured work has one
Change; small work records its verification expectation without entering the evolution count.

## Stop And Escalate

Stop when the target project, requested owner, safety boundary, or acceptance cannot be established
from evidence or one bounded user decision.

## Rules

Apply HR-01, HR-02, HR-22, and HR-23 plus `references/rules/by-stage/intake.md`.
