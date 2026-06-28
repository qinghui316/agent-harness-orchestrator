# No-Docs Document Authoring

Use this reference when a project has no useful documentation or only generic
templates.

## Empty Project

Do not invent business docs from templates. First identify:

- product goal and target user;
- expected interface, such as CLI, web app, library, service, or tool;
- preferred stack and runtime;
- initial verification command expectations;
- whether Harness docs should be repo-local or external-local.

If these are unknown, ask focused questions or produce an onboarding proposal
with open decisions. Do not scaffold business code by default.

## Code Without Docs

Read bounded evidence before proposing docs:

- README/package/config files;
- primary source entrypoints;
- route/CLI/app shell files;
- tests and scripts;
- existing architecture hints in names and modules.

Then write a proposal that explains what each doc should capture. Do not
pretend a generated document is authoritative until accepted through AHO Change
and human confirmation.

## Mature Project Without Harness

Produce `ProjectContextPack` first. It should summarize:

- project identity;
- important directories;
- runtime commands;
- source-safety boundaries;
- likely high-risk areas;
- what is unknown.

Only then propose minimal AHO docs or scripts. Prefer deltas over generic
template replacement.

## Avoid

- fixed boilerplate that ignores the project's real shape;
- business code scaffolding unless the user explicitly asks for a new project
  scaffold;
- copying `greenfield-templates.md` output as default behavior;
- writing long historical ledgers into `AGENTS.md` or `docs/STATUS.md`.
