import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createFakeCodexRuntime(root: string): Promise<string> {
  const binDir = join(root, "fake-codex-runtime");
  await mkdir(binDir, { recursive: true });
  const script = join(binDir, "fake-codex.cjs");
  await writeFile(script, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli fake");
  process.exit(0);
}
if (args.includes("app-server") && args.includes("--help")) {
  console.log("Codex app server\\n--listen <stdio://>");
  process.exit(0);
}
if (args[0] === "--help") {
  console.log("Usage: codex [OPTIONS]\\n--ask-for-approval <APPROVAL_POLICY>");
  process.exit(0);
}
if (args[0] === "exec" && args[1] === "--help") {
  console.log("Usage: codex exec [OPTIONS]\\n--json\\n--sandbox <SANDBOX_MODE>\\n--cd <DIR>\\n--output-last-message <FILE>\\n--ask-for-approval <APPROVAL_POLICY>");
  process.exit(0);
}
if (args[0] === "exec" && args[1] === "resume" && args[2] === "--help") {
  console.log("Usage: codex exec resume [OPTIONS]\\n--sandbox <SANDBOX_MODE>\\n--cd <DIR>");
  process.exit(0);
}
if (!args.includes("app-server")) {
  console.error("Unsupported fake Codex command: " + args.join(" "));
  process.exit(1);
}

const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const threadId = "thread-server-test";
const turnId = "turn-server-test";
const reply = (id, result) => console.log(JSON.stringify({ id, result }));
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize" || request.method === "skills/extraRoots/set") {
    reply(request.id, {});
  } else if (request.method === "skills/list") {
    reply(request.id, { data: [{ skills: [] }] });
  } else if (request.method === "model/list") {
    reply(request.id, { data: [{ id: "fake-model", model: "fake-model", displayName: "Fake Model" }] });
  } else if (request.method === "thread/start" || request.method === "thread/resume") {
    reply(request.id, { thread: { id: threadId } });
  } else if (request.method === "thread/goal/get") {
    reply(request.id, { goal: { id: "goal-server-test", objective: "Server test", status: "active", createdAt: "2026-07-16T00:00:00.000Z" } });
  } else if (request.method === "turn/start") {
    reply(request.id, { turn: { id: turnId } });
    setImmediate(() => {
      console.log(JSON.stringify({ method: "turn/started", params: { threadId, turn: { id: turnId, status: "inProgress" } } }));
      console.log(JSON.stringify({ method: "item/completed", params: { threadId, turnId, item: { id: "message-server-test", type: "agentMessage", text: "主 Agent 已读取需求。" } } }));
      console.log(JSON.stringify({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } }));
    });
  }
});
`, "utf8");
  await chmod(script, 0o755).catch(() => undefined);
  const executable = process.platform === "win32" ? join(binDir, "codex.cmd") : join(binDir, "codex");
  const shim = process.platform === "win32"
    ? `@echo off\r\nnode "${script}" %*\r\n`
    : `#!/usr/bin/env sh\nnode "${script}" "$@"\n`;
  await writeFile(executable, shim, "utf8");
  await chmod(executable, 0o755).catch(() => undefined);
  return executable;
}
