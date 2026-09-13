# Beaver Code Privacy

Beaver Code stores projects, conversations, drafts, queues, execution records, and local product
settings on the user's computer under `~/.agent-harness`. Updating or uninstalling the application
does not delete this directory by default. Beaver Code does not upload that directory to a Beaver
Code service.

When the user runs an Agent, Beaver Code sends the content required for that request to the AI
service the user selected, subject to that service's account, configuration, and privacy terms.
Commands, Git operations, terminals, and Skills may also access resources according to the
permissions the user grants. Users should review selected context before sending sensitive data.

The Windows application checks `qinghui316/beaver-code` GitHub Releases for updates. This request
discloses ordinary network metadata such as the user's IP address and user agent to GitHub. The
update client does not attach projects, conversations, prompts, account credentials, or Harness
evidence to update requests.

Diagnostic logs are local and intentionally bounded. They may contain version, Build Commit,
platform, architecture, update stage, and sanitized error categories. Before sharing a diagnostic
file, users should still review it for information they consider sensitive.

This document describes Beaver Code itself. AI providers, Git hosts, package registries, and links
opened in the system browser are independent services with their own terms and privacy practices.
