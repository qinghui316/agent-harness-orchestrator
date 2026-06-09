import type { Command } from "commander";
import { listAgentRoles, showAgentRole, syncAgentCatalog } from "../../agent/catalog.js";
import { startAgentRun } from "../../agent/runtime.js";
import { getCodexBridgeStatus, installCodexBridge, syncCodexBridge } from "../../codex/bridge.js";
import { importSkill, listSkills, setSkillEnabled } from "../../skill/catalog.js";
import { printJson, printTable } from "../output.js";
import { resolveManagedProject, type CliContext } from "../context.js";

export function installSkillAgentCodexCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const skill = program.command("skill").description("Manage AHO project skills");

  const agent = program.command("agent").description("Inspect and run AHO agent roles");

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
        runtime: role.runtime,
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
          hash: role.sourceHash.slice(0, 12),
          capability: role.writeCapability,
          runtime: role.runtime,
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

  agent
    .command("run")
    .argument("<project>", "registered project id/name/path")
    .argument("<role-id>", "agent role id")
    .requiredOption("--prompt <text>", "task prompt for the agent")
    .option("--worktree <worktree-id>", "required for worktree-write roles")
    .option("--model <model>", "Codex model to pass through")
    .option("--profile <profile>", "Codex config profile to pass through")
    .option("--json", "print JSON")
    .action(async (query: string, roleId: string, options: { prompt: string; worktree?: string; model?: string; profile?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startAgentRun(project, roleId, {
        prompt: options.prompt,
        worktreeId: options.worktree,
        model: options.model,
        profile: options.profile,
      });
      if (options.json) printJson(result);
      else {
        console.log(`Agent run ${result.run.id}: ${result.run.status}`);
        console.log(`Role: ${result.run.agent?.roleId ?? roleId}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
      }
      if (result.run.status === "failed") process.exitCode = result.run.exitCode ?? 1;
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
        synced: item.bridge ? !item.bridge.outOfSync : false,
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

  const codex = program.command("codex").description("Manage Codex runtime bridge");
  const codexBridge = codex.command("bridge").description("Install and sync the AHO Codex bridge");

  codexBridge
    .command("status")
    .argument("[project]", "optional registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string | undefined, options: { json?: boolean }) => {
      const project = query ? await resolveManagedProject(store, query) : undefined;
      const status = await getCodexBridgeStatus(project);
      if (options.json) printJson(status);
      else {
        printTable([{
          state: status.state,
          installed: status.installed,
          discoverable: status.discoverable,
          manifestValid: status.manifestValid,
          path: status.paths.root,
          project: status.project?.id ?? "",
          outOfSync: status.project?.outOfSync.join(", ") ?? "",
        }]);
        for (const diagnostic of status.diagnostics) console.log(`DIAGNOSTIC: ${diagnostic}`);
      }
    });

  codexBridge
    .command("install")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const result = await installCodexBridge();
      if (options.json) printJson(result);
      else {
        console.log(`Installed AHO Codex bridge at ${result.paths.root}`);
        console.log(`Manifest: ${result.manifest}`);
      }
    });

  codexBridge
    .command("sync")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await syncCodexBridge(project);
      if (options.json) printJson(result);
      else {
        console.log(`Synced ${result.synced.length} enabled skill(s) and ${result.syncedAgents.length} agent role(s) to ${result.status.paths.root}`);
        for (const item of result.synced) console.log(`- ${item.skillId} -> ${item.materializedSkillId}`);
        for (const item of result.syncedAgents) console.log(`- agent ${item.roleId}`);
        for (const diagnostic of result.status.diagnostics) console.log(`DIAGNOSTIC: ${diagnostic}`);
      }
    });


}
