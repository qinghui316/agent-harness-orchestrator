import type { Command } from "commander";
import { listAgentRoles, showAgentRole, syncAgentCatalog } from "../../agent/catalog.js";
import { defaultProviderRegistry } from "../../provider-runtime/index.js";
import { importSkill, listSkills, setSkillEnabled } from "../../skill/catalog.js";
import { printJson, printTable } from "../output.js";
import { resolveManagedProject, type CliContext } from "../context.js";

export function installSkillAgentProviderCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const skill = program.command("skill").description("Manage AHO project skills");

  const agent = program.command("agent").description("Inspect AHO agent roles");

  agent
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const roles = await listAgentRoles(project);
      if (options.json) printJson(roles.map(({ markdown: _markdown, ...role }) => role));
      else printTable(roles.map((role) => ({
        id: role.roleId,
        source: role.source,
        capability: role.writeCapability,
        compatibility: role.compatibility.requiredCapabilities.join(", "),
        delegatable: role.delegatable,
        gates: role.requiredGates.join(", "),
      })));
    });

  agent
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<role-id>", "agent role id")
    .option("--json", "print JSON")
    .action(async (query: string, roleId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const role = await showAgentRole(project, roleId);
      if (options.json) printJson(role);
      else {
        printTable([{
          id: role.roleId,
          source: role.source,
          profile: role.sourcePath,
          hash: role.contentHash.slice(0, 12),
          capability: role.writeCapability,
          compatibility: role.compatibility.requiredCapabilities.join(", "),
        }]);
      }
    });

  agent
    .command("sync")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await syncAgentCatalog(project);
      if (options.json) printJson(result);
      else {
        console.log(`Synced agent catalog at ${result.catalogPath}`);
        console.log(`Written: ${result.written.length}`);
      }
    });

  skill
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const skills = await listSkills(project);
      if (options.json) printJson(skills);
      else printTable(skills.map((item) => ({
        id: item.skillId,
        name: item.name,
        projectEnabled: item.enabledProject,
        topicEnabled: item.enabledTopics.join(", "),
        topicDisabled: item.disabledTopics.join(", "),
        compatibility: item.compatibility.requiredCapabilities.join(", "),
        bindings: item.providerBindings.map((binding) => `${binding.providerId}:${binding.status}`).join(", "),
      })));
    });

  skill
    .command("import")
    .argument("<project>", "registered project id/name/path")
    .requiredOption("--path <skill-dir>", "local skill directory containing SKILL.md")
    .option("--json", "print JSON")
    .action(async (query: string, options: { path: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await importSkill(project, options.path);
      if (options.json) printJson(result);
      else {
        console.log(`Imported skill ${result.skill.skillId}.`);
        console.log(`Copied: ${result.copied.join(", ") || "SKILL.md"}`);
      }
    });

  skill
    .command("enable")
    .argument("<project>", "registered project id/name/path")
    .argument("<skill-id>", "skill id")
    .option("--topic <change-id>", "enable only for a specific Topic/Change")
    .option("--json", "print JSON")
    .action(async (query: string, skillId: string, options: { topic?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await setSkillEnabled(project, skillId, { topic: options.topic, enabled: true });
      if (options.json) printJson(result);
      else console.log(`Enabled skill ${skillId}${options.topic ? ` for Topic ${options.topic}` : " for project"}.`);
    });

  skill
    .command("disable")
    .argument("<project>", "registered project id/name/path")
    .argument("<skill-id>", "skill id")
    .option("--topic <change-id>", "disable only for a specific Topic/Change")
    .option("--json", "print JSON")
    .action(async (query: string, skillId: string, options: { topic?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await setSkillEnabled(project, skillId, { topic: options.topic, enabled: false });
      if (options.json) printJson(result);
      else console.log(`Disabled skill ${skillId}${options.topic ? ` for Topic ${options.topic}` : " for project"}.`);
    });

  const providerCommand = program.command("provider").description("Manage Agent provider adapters");
  const providerBridge = providerCommand.command("bridge").description("Install and sync a provider Skill/role binding");

  providerBridge
    .command("status")
    .argument("<provider-id>", "registered provider id")
    .argument("[project]", "optional registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (providerId: string, query: string | undefined, options: { json?: boolean }) => {
      const project = query ? await resolveManagedProject(store, query) : undefined;
      const status = await defaultProviderRegistry.get(providerId).skillRoleBinding.status(project);
      if (options.json) printJson(status);
      else {
        printTable([{
          state: status.state,
          installed: status.installed,
          discoverable: status.discoverable,
          manifestValid: status.manifestValid,
          path: status.paths.root,
          project: status.project?.id ?? "",
          outOfSync: status.project?.outOfSync?.join(", ") ?? "",
        }]);
        for (const diagnostic of status.diagnostics) console.log(`DIAGNOSTIC: ${diagnostic}`);
      }
    });

  providerBridge
    .command("install")
    .argument("<provider-id>", "registered provider id")
    .option("--json", "print JSON")
    .action(async (providerId: string, options: { json?: boolean }) => {
      const result = await defaultProviderRegistry.get(providerId).skillRoleBinding.install();
      if (options.json) printJson(result);
      else {
        console.log(`Installed ${providerId} Skill/role binding at ${result.paths.root}`);
        console.log(`Manifest: ${result.manifest}`);
      }
    });

  providerBridge
    .command("sync")
    .argument("<provider-id>", "registered provider id")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (providerId: string, query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await defaultProviderRegistry.get(providerId).skillRoleBinding.sync(project);
      if (options.json) printJson(result);
      else {
        console.log(`Synced ${result.synced.length} enabled skill(s) and ${result.syncedAgents.length} agent role(s) through ${providerId}.`);
        for (const item of result.synced) console.log(`- ${item.skillId} -> ${item.materializedSkillId}`);
        for (const item of result.syncedAgents) console.log(`- agent ${item.roleId}`);
        for (const diagnostic of result.status.diagnostics) console.log(`DIAGNOSTIC: ${diagnostic}`);
      }
    });


}
