import type { Command } from "commander";
import { startWorkbenchServer } from "../../server/workbench-server.js";
import {
  getWorkbenchSnapshot,
  getWorkbenchStream,
  getWorkbenchTopic,
  listWorkbenchApprovals,
  listWorkbenchRoles,
  listWorkbenchTopics,
} from "../../workbench/projections/read-model/implementation.js";
import { printJson, printTable } from "../output.js";
import { openUrl, resolveRegisteredOrPath, type CliContext } from "../context.js";

export function installWorkbenchCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const workbench = program.command("workbench").description("Build GUI-ready Workbench read models");

  workbench
    .command("serve")
    .argument("[name-or-path]", "optional registered project id/name/path or local path")
    .option("--host <host>", "host to bind", "127.0.0.1")
    .option("--port <port>", "port to bind", (value) => Number.parseInt(value, 10), 4317)
    .option("--open", "open the local Workbench URL")
    .action(async (query: string | undefined, options: { host: string; port: number; open?: boolean }) => {
      const resolved = query ? await resolveRegisteredOrPath(store, query) : null;
      const input = resolved ? { project: resolved.project, path: resolved.path } : null;
      const handle = await startWorkbenchServer(input, { host: options.host, port: options.port, store });
      console.log(`AHO Workbench: ${handle.url}`);
      if (!query) console.log("Open the URL to add, create, initialize, and open projects.");
      console.log("Press Ctrl+C to stop.");
      if (options.open) openUrl(handle.url);
    });

  workbench
    .command("snapshot")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--topic <change-id>", "select a specific Topic/Change id")
    .option("--json", "print JSON")
    .action(async (query: string, options: { topic?: string; json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const snapshot = await getWorkbenchSnapshot({ project: resolved.project, path: resolved.path }, { topicId: options.topic });
      if (options.json) printJson(snapshot);
      else {
        printTable([{
          project: snapshot.project && typeof snapshot.project === "object" && "id" in snapshot.project ? snapshot.project.id : "(unregistered)",
          memory: snapshot.memory.memoryMode,
          topics: snapshot.left.topics.length,
          selected: snapshot.center.selectedTopic?.id ?? "",
          approvals: snapshot.right.approvals.length,
          gaps: snapshot.harnessGaps.length,
        }]);
        for (const warning of snapshot.warnings) console.log(`WARNING: ${warning}`);
      }
    });

  workbench
    .command("stream")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .argument("<run-id>", "run id")
    .option("--json", "print JSON")
    .action(async (query: string, runId: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const stream = await getWorkbenchStream({ project: resolved.project, path: resolved.path }, runId);
      if (options.json) printJson(stream);
      else {
        printTable([{
          run: stream.run.id,
          runtime: stream.run.runtime,
          status: stream.run.status,
          events: stream.events.length,
          artifacts: stream.artifacts.length,
          diagnostics: stream.diagnostics.length,
        }]);
        for (const diagnostic of stream.diagnostics) console.log(`DIAGNOSTIC: ${diagnostic}`);
      }
    });

  workbench
    .command("approvals")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--topic <change-id>", "filter displayed approvals by Topic/Change id")
    .option("--json", "print JSON")
    .action(async (query: string, options: { topic?: string; json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const approvals = await listWorkbenchApprovals({ project: resolved.project, path: resolved.path }, { topicId: options.topic });
      if (options.json) printJson(approvals);
      else printTable(approvals.map((item) => ({
        id: item.id,
        kind: item.kind,
        severity: item.severity,
        change: item.changeId ?? "",
        action: item.action?.actionId ?? "",
        confirmation: item.action?.requiresConfirmation ?? "",
      })));
    });

  workbench
    .command("topics")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const topics = await listWorkbenchTopics({ project: resolved.project, path: resolved.path });
      if (options.json) printJson(topics);
      else printTable(topics.map((item) => ({
        id: item.id,
        title: item.title,
        state: item.state,
        path: item.path,
        updatedAt: item.updatedAt ?? "",
      })));
    });

  workbench
    .command("topic")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .argument("<change-id>", "Topic/Change id")
    .option("--json", "print JSON")
    .action(async (query: string, changeId: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const topic = await getWorkbenchTopic({ project: resolved.project, path: resolved.path }, changeId);
      if (options.json) printJson(topic);
      else {
        printTable([{
          id: topic.id,
          title: topic.title,
          state: topic.state,
          runs: topic.runs.length,
          items: topic.threadItems.length,
          worktrees: topic.worktrees.length,
        }]);
      }
    });

  workbench
    .command("roles")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      await resolveRegisteredOrPath(store, query);
      const roles = await listWorkbenchRoles();
      if (options.json) printJson(roles);
      else printTable(roles.map((item) => ({
        id: item.id,
        capability: item.writeCapability,
        runtime: item.preferredRuntime,
        delegatable: item.delegatable,
        sections: item.sections.length,
      })));
    });


}
