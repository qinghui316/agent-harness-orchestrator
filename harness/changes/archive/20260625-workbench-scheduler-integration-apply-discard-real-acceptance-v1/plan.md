# Plan

## Reference Evidence

Open Dynamic Workflows source was inspected for `runWorkflow`, `agent`, `parallel`, `pipeline`, worktree isolation, journal, and resume. It supports a future deterministic workflow artifact pattern, but it does not justify adding a runtime for the current apply/discard gate. AHO should keep IntegrationCheck final decisions in the existing human-gated apply/discard owner.

## Implementation

- Strengthen `discardIntegrationCheck` in the integration-check owner so only active non-terminal statuses can be discarded.
- Keep `applyIntegrationCheck` unchanged unless tests expose a regression.
- Add targeted tests that prove discard rejects applied/discarded and that Workbench keeps integration apply/discard outside full-access automation.
- Avoid new registries, permission systems, workflow runtimes, or projection systems.

## Real Acceptance

- Use `E:\aho-accept\scheduler-apply-discard-v1\src` and `E:\aho-accept\scheduler-apply-discard-v1\home`.
- Prepare a small Node/TS external source with dependencies installed as environment setup.
- Branch A: reach passed IntegrationCheck through Workbench UI and human-confirm apply.
- Branch B: reach passed IntegrationCheck through a fresh run and human-confirm discard.
- Record source status before/after each branch and whether any automatic source mutation occurred.

## Verification

- Start with targeted integration-check, Workbench read-model, and DOM tests.
- Run required product checks after code changes.
- Run Harness checks before close.
