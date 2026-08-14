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
const fs = require("node:fs");
const path = require("node:path");
const rl = readline.createInterface({ input: process.stdin });
let threadSequence = 0;
let turnSequence = 0;
let threadId = "";
let turnId = "";
let extraRoots = [];
const disabledSkillPaths = new Set();
const reply = (id, result) => console.log(JSON.stringify({ id, result }));
const skillMetadata = (skillPath, scope) => {
  const raw = fs.readFileSync(skillPath, "utf8");
  const name = /^name:\\s*["']?([^\\r\\n"']+)/m.exec(raw)?.[1]?.trim() || path.basename(path.dirname(skillPath));
  const description = /^description:\\s*["']?([^\\r\\n"']*)/m.exec(raw)?.[1]?.trim() || "";
  return { name, description, path: skillPath, scope, enabled: !disabledSkillPaths.has(path.resolve(skillPath)) };
};
const scanRoot = (root, scope, found, errors) => {
  if (!root || !fs.existsSync(root)) return;
  const candidates = fs.existsSync(path.join(root, "SKILL.md"))
    ? [root]
    : fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
  for (const candidate of candidates) {
    const skillPath = path.join(candidate, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;
    try { found.set(path.resolve(skillPath), skillMetadata(path.resolve(skillPath), scope)); }
    catch (error) { errors.push({ path: skillPath, message: error instanceof Error ? error.message : String(error) }); }
  }
};
const listSkills = (cwd) => {
  const found = new Map();
  const errors = [];
  scanRoot(path.join(process.env.CODEX_HOME || "", "skills"), "user", found, errors);
  for (const root of extraRoots) scanRoot(root, "user", found, errors);
  scanRoot(path.join(cwd, ".agents", "skills"), "repo", found, errors);
  return { cwd, skills: [...found.values()], errors };
};
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    reply(request.id, {});
  } else if (request.method === "skills/extraRoots/set") {
    extraRoots = Array.isArray(request.params?.extraRoots) ? request.params.extraRoots : [];
    reply(request.id, {});
  } else if (request.method === "skills/list") {
    const cwds = Array.isArray(request.params?.cwds) && request.params.cwds.length > 0 ? request.params.cwds : [process.cwd()];
    reply(request.id, { data: cwds.map(listSkills) });
  } else if (request.method === "skills/config/write") {
    const skillPath = path.resolve(request.params.path);
    if (request.params.enabled) disabledSkillPaths.delete(skillPath);
    else disabledSkillPaths.add(skillPath);
    reply(request.id, { effectiveEnabled: !disabledSkillPaths.has(skillPath) });
  } else if (request.method === "model/list") {
    reply(request.id, { data: [{ id: "fake-model", model: "fake-model", displayName: "Fake Model" }] });
  } else if (request.method === "collaborationMode/list") {
    reply(request.id, { data: [{ name: "Plan", mode: "plan", model: "fake-model", reasoning_effort: null }] });
  } else if (request.method === "thread/start" || request.method === "thread/resume") {
    threadId = request.method === "thread/resume" && request.params?.threadId
      ? request.params.threadId
      : "thread-server-test-" + (++threadSequence);
    reply(request.id, { thread: { id: threadId } });
  } else if (request.method === "thread/goal/get") {
    reply(request.id, { goal: { id: "goal-server-test", objective: "Server test", status: "active", createdAt: "2026-07-16T00:00:00.000Z" } });
  } else if (request.method === "turn/start") {
    turnId = "turn-server-test-" + (++turnSequence);
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
