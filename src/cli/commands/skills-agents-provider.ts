import type { Command } from "commander";
import { listAgentRoles, showAgentRole } from "../../agent/catalog.js";
import { defaultProviderRegistry } from "../../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { ProjectRuntimeCoordinator } from "../../project-runtime/coordinator.js";
import { addSkillRoot, listSkillRoots, listSkills, setSkillEnabled } from "../../skill/catalog.js";
import { getSystemSkillsRoot } from "../../template-source/paths.js";
import type { ManagedProject } from "../../types/index.js";
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

  skill
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveRegisteredSkillProject(query);
      const catalog = await nativeCatalog(project);
      const skills = catalog.skills;
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
    .command("root-add")
    .argument("<project>", "registered project id/name/path")
    .requiredOption("--path <skills-root>", "local directory containing one or more native Skills")
    .option("--json", "print JSON")
    .action(async (query: string, options: { path: string; json?: boolean }) => {
      const project = await resolveRegisteredSkillProject(query);
      const runtime = await runtimeCoordinator().requireReady(project);
      const roots = await addSkillRoot(runtime.paths, options.path);
      if (options.json) printJson({ roots });
      else {
        console.log(`Registered native Skill root ${options.path}.`);
      }
    });

  skill
    .command("enable")
    .argument("<project>", "registered project id/name/path")
    .argument("<skill-id>", "skill id")
    .option("--topic <change-id>", "enable only for a specific Topic/Change")
    .option("--json", "print JSON")
    .action(async (query: string, skillId: string, options: { topic?: string; json?: boolean }) => {
      const project = await resolveRegisteredSkillProject(query);
      const catalog = await nativeCatalog(project);
      const result = await setSkillEnabled(catalog.runtime.paths, catalog.snapshot, skillId, { conversationId: options.topic, enabled: true }, [catalog.runtime.providerInput]);
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
      const project = await resolveRegisteredSkillProject(query);
      const catalog = await nativeCatalog(project);
      const result = await setSkillEnabled(catalog.runtime.paths, catalog.snapshot, skillId, { conversationId: options.topic, enabled: false }, [catalog.runtime.providerInput]);
      if (options.json) printJson(result);
      else console.log(`Disabled skill ${skillId}${options.topic ? ` for Topic ${options.topic}` : " for project"}.`);
    });

  function runtimeCoordinator(): ProjectRuntimeCoordinator {
    return new ProjectRuntimeCoordinator({ store, discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
  }

  async function resolveRegisteredSkillProject(query: string): Promise<ManagedProject> {
    const project = await store.resolveProject(query);
    if (!project) throw new Error("Project must be registered before using Skill commands.");
    await runtimeCoordinator().requireReady(project);
    return project;
  }

  async function nativeCatalog(project: ManagedProject) {
    const runtime = await runtimeCoordinator().requireReady(project);
    const provider = project.defaultProviderId
      ? defaultProviderRegistry.get(project.defaultProviderId)
      : defaultProviderRegistry.requireOnly();
    const roots = await listSkillRoots(runtime.paths);
    const snapshot = await provider.skills.list({
      projectPath: project.path,
      extraRoots: [getSystemSkillsRoot(), ...roots.map((root) => root.rootPath)],
      forceReload: true,
    });
    return { runtime, snapshot, ...await listSkills(runtime.paths, snapshot, [runtime.providerInput]) };
  }
}
