import { Command } from "commander";
import { installChangeCommands } from "./commands/change.js";
import { installCoreCommands } from "./commands/core.js";
import { installExecutionCommands } from "./commands/execution.js";
import { installSkillAgentCodexCommands } from "./commands/skills-agents-codex.js";
import { installWorkbenchCommands } from "./commands/workbench.js";
import { installWorktreeCommands } from "./commands/worktree.js";
import { createCliContext } from "./context.js";

export function createProgram(): Command {
  const program = new Command();
  const context = createCliContext();

  program.name("aho").description("Agent Harness Orchestrator").version("0.1.0");

  installCoreCommands(program, context);
  installSkillAgentCodexCommands(program, context);
  installWorkbenchCommands(program, context);
  installChangeCommands(program, context);
  installWorktreeCommands(program, context);
  installExecutionCommands(program, context);

  return program;
}
