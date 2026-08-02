# Project And Harness Detection

Start with the manifest project id and provider discovery result. A managed project has one physical
project Harness Skill under the project discovery root; Codex and Claude bindings must resolve to the
same physical target. The runtime sidecar is a separate operational owner and is never a Harness
layout mode.

Classify the state from Runtime evidence:

- Missing: no project Harness is discoverable; onboarding may create revision 1.
- Repair-required: a Skill is discoverable but doctor or audit is unhealthy; do not initialize a
  second Skill or overwrite the existing one.
- Ready: identity, bindings, doctor, and audit are healthy for the discovered Skill.

For semantic analysis, inspect project source, manifests, configuration, tests, accepted interfaces,
and explicit user facts. Use repository documents only as analysis leads. Do not infer purpose,
architecture, commands, or ownership from file names alone.
