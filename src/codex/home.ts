import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveCodexHome(): string {
  return process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), ".codex");
}
