# Spec: auto-evolve-harness-workbench-rework-helper-reuse-window

## Goal

Complete the pending Harness evolution window by evaluating whether repeated Workbench optional target helper-reuse changes require durable Harness changes.

## Users

Future agents maintaining AHO's Harness and product code. The expected outcome is clearer evidence about whether current Architecture Growth Control and verification rules are sufficient.

## Acceptance Criteria

- AC-001: The five candidate archives are reviewed and summarized in an evolution proposal.
- AC-002: Independent subagent review evaluates whether to promote, retain, merge, retire, or archive-only the observed experience.
- AC-003: If no durable gap is found, the proposal records `keep / independent_review` without changing rules, templates, lint, docs, product runtime, or Workbench behavior.
- AC-004: `harness-evolve.ps1 mark-complete` records the result, removes `pending.md`, and updates evolution state.
- AC-005: Handoff files are aligned after close so no stale active path or pending evolution pointer remains.

## Non-Goals

- Do not add narrow action/field lists to reusable ECL or templates.
- Do not change product source, scheduler runtime semantics, Workbench payloads, ToolPolicyGate, or human gates.

## Constraints

- Harness evolution must use evidence, proposal, independent review, validation, results logging, and `mark-complete`.
- Current docs should remain compact derived memory; historical helper details should stay archive-only unless they change future agent behavior.
- Existing Architecture Growth Control, Module Boundary, targeted verification, Documentation Entropy, Experience Lifecycle, workflow truth, ToolPolicyGate, and human-gate rules should be reused if sufficient.

## Risks

- A false positive promotion would add narrow product history to durable process docs.
- A false negative keep decision would miss a repeated process gap. Independent review and validation mitigate this risk.

