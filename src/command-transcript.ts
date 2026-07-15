import type { AssistantTurnBlock } from "./workbench/types.js";

export function commandRowTitle(block: AssistantTurnBlock): string {
  const preview = commandPreview(block.command);
  if (block.status === "failed" || block.isError) return `命令执行失败 · ${preview}`;
  if (block.status === "completed") return `命令已完成 · ${preview}`;
  return `正在运行命令 · ${preview}`;
}

export function commandGroupSummary(block: AssistantTurnBlock): string {
  const commands = block.children?.filter((child) => child.kind === "command") ?? [];
  const count = commands.length || 1;
  const failedCount = commands.filter((child) => child.status === "failed" || child.isError).length;
  if (failedCount > 0) return `运行了 ${count} 条命令 · ${failedCount} 条失败`;
  if (["processing", "running", "started"].includes(block.status ?? "")) return `正在运行 ${count} 条命令`;
  return `运行了 ${count} 条命令 · 全部完成`;
}

export function groupConsecutiveCommandBlocks(blocks: AssistantTurnBlock[]): AssistantTurnBlock[] {
  const result: AssistantTurnBlock[] = [];
  let commands: AssistantTurnBlock[] = [];
  const flush = (): void => {
    if (commands.length === 1) result.push(commands[0]);
    else if (commands.length > 1) {
      const failedCount = commands.filter((block) => block.status === "failed" || block.isError).length;
      const processing = commands.some((block) => ["processing", "running", "started"].includes(block.status ?? ""));
      result.push({
        id: commands[0].id,
        itemId: commands[0].itemId,
        runId: commands[0].runId,
        threadId: commands[0].threadId,
        turnId: commands[0].turnId,
        sequence: commands[0].sequence,
        kind: "command-group",
        timestamp: commands[0].timestamp,
        source: "provider",
        status: failedCount > 0 ? "failed" : processing ? "processing" : "completed",
        isError: failedCount > 0,
        children: commands,
      });
    }
    commands = [];
  };
  for (const block of blocks) {
    if (block.kind === "command") commands.push(block);
    else {
      flush();
      result.push(block);
    }
  }
  flush();
  return result;
}

export function commandGroupDetailText(children: AssistantTurnBlock[]): string | undefined {
  const details = children
    .filter((child) => child.kind === "command")
    .map(commandDetailText)
    .filter((item): item is string => Boolean(item));
  return details.length ? details.join("\n\n---\n\n") : undefined;
}

export function commandDetailText(block: AssistantTurnBlock): string | undefined {
  const sections: string[] = [];
  if (block.command) sections.push(`$ ${block.command}`);
  if (block.cwd) sections.push(`cwd: ${block.cwd}`);
  if (typeof block.exitCode === "number") sections.push(`exit: ${block.exitCode}`);
  const output = [block.text, block.preview].filter(Boolean).join("\n\n").trim();
  if (output && block.kind !== "error") sections.push(output);
  return sections.length ? sections.join("\n") : undefined;
}

function commandPreview(command: string | undefined): string {
  const normalized = (command ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "运行命令";
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
