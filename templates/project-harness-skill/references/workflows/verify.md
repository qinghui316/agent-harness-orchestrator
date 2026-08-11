# Verify

## Inputs

- Acceptance criteria, changed paths, current contract, and implementation evidence.
- Project command/verification catalogs with configured/candidate/executed status.
- Review requirements and baseline failures.

## Agent Judgment

Select verification proportional to impact. Classify every failure as introduced, pre-existing,
environmental, or blocked; inspection alone is never completion evidence.

## Deterministic Commands

The following lifecycle commands are Runtime-owned:

- Runtime runs targeted checks first, then aggregate/full gates for shared or high-impact behavior.
- Runtime runs accepted project-specific mechanical checks and the close preflight, and persists the
  resulting validation evidence.
- Auditor and Spec-Test Agents inspect Runtime-provided artifacts read-only and return findings;
  internal Workers do not advance lifecycle state.

## Actions

1. Map each acceptance criterion to a command, test, runtime observation, or bounded review that
   Runtime can execute or verify.
2. Validate contracts, compatibility, documentation, encoding, and generated artifacts as applicable.
3. Compare failures with the captured baseline and return classification and residual risk to Runtime.

## Outputs

- Command, working directory, exit status, result evidence, and failure attribution.
- Acceptance matrix, review result, and residual risks.

## Exit

All required checks pass, or the Change is explicitly blocked with reproducible evidence and no
false completion claim.

## Stop And Escalate

Stop after the project-defined retry limit, on environmental prerequisites requiring user action,
or when a failure lies outside accepted scope.

## Rules

Apply HR-01, HR-04, and HR-18 plus `references/rules/by-stage/verify.md`.
