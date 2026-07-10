const CODEX_BIN_ENV = "AHO_CODEX_BIN";

export function resolveCodexExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[CODEX_BIN_ENV]?.trim();
  return configured || "codex";
}

export function codexExecutableEnvironmentKey(): string {
  return CODEX_BIN_ENV;
}
