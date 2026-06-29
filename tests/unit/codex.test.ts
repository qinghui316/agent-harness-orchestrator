import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateCodexAppServerCapabilities, shouldUseCodexAppServerForMemory } from "../../src/codex/app-server.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, buildCodexWorkspaceWriteArgv, evaluateCodexCapabilities } from "../../src/codex/capabilities.js";
import { createCodexJsonlStreamParser, extractFinalMessageFromCodexJsonl, truncateReadablePreview, type CodexJsonlStreamEvent } from "../../src/codex/jsonl.js";
import { candidatesFromModelListResponse, getCodexModelSettingsSnapshot, resolveCodexEffectiveModel, setSelectedCodexModel } from "../../src/codex/model-settings.js";
import { composeCodexPrompt, readPromptInput } from "../../src/codex/prompt.js";
import { readCodexConfigModelStatus } from "../../src/codex/trust.js";
import { codexProviderRunMetadata, isRunnableProductMode, RUNNABLE_PRODUCT_MODES, stableCapabilitySnapshotHash } from "../../src/provider-runtime/index.js";
import { renderTopicFileReferencesForPrompt } from "../../src/workbench/file-references.js";

const rootHelp = "Usage: codex [OPTIONS]\n  -a, --ask-for-approval <APPROVAL_POLICY>\n";
const execHelp = [
  "Usage: codex exec [OPTIONS]",
  "  --json",
  "  --color <COLOR>",
  "  -s, --sandbox <SANDBOX_MODE>",
  "  -C, --cd <DIR>",
  "  --add-dir <DIR>",
  "  -o, --output-last-message <FILE>",
].join("\n");

describe("codex capabilities", () => {
  it("detects app-server stdio lifecycle support from help", () => {
    const capabilities = evaluateCodexAppServerCapabilities("Usage: codex app-server [OPTIONS]\n  --listen <URL>  default: stdio://\nRun the app server");

    expect(capabilities).toMatchObject({
      available: true,
      supportsStdio: true,
      supportsRequiredLifecycle: true,
      errors: [],
    });
  });

  it("falls back when app-server stdio transport is unavailable", () => {
    const capabilities = evaluateCodexAppServerCapabilities("Usage: codex app-server [OPTIONS]", "spawn failed");

    expect(capabilities.available).toBe(false);
    expect(capabilities.errors).toEqual(expect.arrayContaining([
      "spawn failed",
      "Codex app-server does not advertise stdio transport.",
    ]));
  });

  it("skips app-server when project memory is external-local", () => {
    expect(shouldUseCodexAppServerForMemory("repo-local")).toBe(true);
    expect(shouldUseCodexAppServerForMemory("remote")).toBe(true);
    expect(shouldUseCodexAppServerForMemory("external-local")).toBe(false);
  });

  it("builds root-level approval argv", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp);

    const argv = buildCodexReadonlyArgv(capabilities, {
      projectPath: "C:/repo",
      lastMessagePath: "C:/repo/.agent-harness/runs/run/last-message.md",
      model: "gpt-5.3-codex",
      profile: "default",
    });

    expect(argv.args.slice(0, 6)).toEqual(["-c", 'service_tier="fast"', "--ask-for-approval", "never", "exec", "--json"]);
    expect(argv.args).toContain("--sandbox");
    expect(argv.args).toContain("read-only");
    expect(argv.args).toContain("--output-last-message");
    expect(argv.args).toContain("--model");
    expect(argv.args).toContain("--profile");
    expect(capabilities.supportsAddDir).toBe(true);
    expect(argv.args).toContain("-");
    expect(argv.args).not.toContain("--full-auto");
    expect(argv.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(argv.args).not.toContain("--ignore-user-config");
    expect(argv.args).not.toContain("--skip-git-repo-check");
    expect(argv.args).toContain('service_tier="fast"');
  });

  it("builds exec-level approval argv", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", "Usage: codex", `${execHelp}\n--ask-for-approval <APPROVAL_POLICY>`);

    const argv = buildCodexReadonlyArgv(capabilities, {
      projectPath: "/repo",
      lastMessagePath: "/repo/.agent-harness/runs/run/last-message.md",
    });

    expect(argv.args.slice(0, 6)).toEqual(["-c", 'service_tier="fast"', "exec", "--ask-for-approval", "never", "--json"]);
  });

  it("fails capability evaluation without safe required flags", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", "Usage: codex", "Usage: codex exec");

    expect(capabilities.errors).toEqual(expect.arrayContaining([
      "Codex exec does not support --json.",
      "Codex exec does not support --sandbox.",
      "Codex exec does not support --cd.",
    ]));
    expect(() => buildCodexReadonlyArgv(capabilities, { projectPath: "/repo", lastMessagePath: "/repo/out.md" })).toThrow("safe read-only");
  });

  it("allows missing output-last-message and relies on JSONL fallback", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp.replace("  -o, --output-last-message <FILE>", ""));
    const argv = buildCodexReadonlyArgv(capabilities, { projectPath: "/repo", lastMessagePath: "/repo/out.md" });

    expect(capabilities.supportsOutputLastMessage).toBe(false);
    expect(capabilities.errors).toHaveLength(0);
    expect(argv.args).not.toContain("--output-last-message");
  });

  it("adds optional read-only memory directories when supported", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp);
    const argv = buildCodexReadonlyArgv(capabilities, {
      projectPath: "/worktree",
      lastMessagePath: "/memory/runs/run/last-message.md",
      additionalReadDirs: ["/memory"],
    });

    expect(argv.args).toContain("--add-dir");
    expect(argv.args).toContain("/memory");
  });

  it("only allows resume when resume help exposes equivalent sandbox and cwd constraints", () => {
    const unsafe = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp, undefined, "Usage: codex exec resume [SESSION]");
    expect(unsafe.supportsSafeResume).toBe(false);
    expect(() => buildCodexReadonlyResumeArgv(unsafe, {
      projectPath: "/repo",
      lastMessagePath: "/repo/out.md",
      sessionId: "session-1",
    })).toThrow("equivalent read-only");

    const safe = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp, undefined, "Usage: codex exec resume --sandbox <MODE> --cd <DIR> --add-dir <DIR>");
    const argv = buildCodexReadonlyResumeArgv(safe, {
      projectPath: "/repo",
      lastMessagePath: "/repo/out.md",
      sessionId: "session-1",
      additionalReadDirs: ["/memory"],
    });
    expect(argv.args).toContain("--sandbox");
    expect(argv.args).toContain("read-only");
    expect(argv.args).toContain("--cd");
    expect(argv.args).toContain("/repo");
    expect(argv.args).toContain("--add-dir");
    expect(argv.args).toContain("/memory");

    const noAddDirResume = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp, undefined, "Usage: codex exec resume --sandbox <MODE> --cd <DIR>");
    expect(() => buildCodexReadonlyResumeArgv(noAddDirResume, {
      projectPath: "/repo",
      lastMessagePath: "/repo/out.md",
      sessionId: "session-1",
      additionalReadDirs: ["/memory"],
    })).toThrow("--add-dir");
  });

  it("omits optional read-only memory directories when unsupported", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp.replace("  --add-dir <DIR>\n", ""));
    const argv = buildCodexReadonlyArgv(capabilities, {
      projectPath: "/worktree",
      lastMessagePath: "/memory/runs/run/last-message.md",
      additionalReadDirs: ["/memory"],
    });

    expect(capabilities.supportsAddDir).toBe(false);
    expect(argv.args).not.toContain("--add-dir");
  });

  it("builds workspace-write argv without requiring approval support", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", "Usage: codex", execHelp);
    const argv = buildCodexWorkspaceWriteArgv(capabilities, {
      projectPath: "/repo/.agent-harness/worktrees/checkout",
      lastMessagePath: "/memory/runs/run/last-message.md",
    });

    expect(argv.args).toEqual([
      "-c",
      'service_tier="fast"',
      "exec",
      "--json",
      "--color",
      "never",
      "--sandbox",
      "workspace-write",
      "--cd",
      "/repo/.agent-harness/worktrees/checkout",
      "--output-last-message",
      "/memory/runs/run/last-message.md",
      "-",
    ]);
    expect(argv.args).not.toContain("read-only");
    expect(argv.args).not.toContain("--full-auto");
    expect(argv.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(argv.args).not.toContain("--ignore-user-config");
    expect(argv.args).not.toContain("--skip-git-repo-check");
  });

  it("adds optional workspace-write memory directories when supported", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", "Usage: codex", execHelp);
    const argv = buildCodexWorkspaceWriteArgv(capabilities, {
      projectPath: "/worktree",
      lastMessagePath: "/memory/runs/run/last-message.md",
      additionalReadDirs: ["/memory"],
    });

    expect(argv.args).toContain("--add-dir");
    expect(argv.args).toContain("/memory");
  });
});

describe("codex prompt and JSONL parsing", () => {
  it("composes a read-only prompt with context and user prompt", () => {
    const prompt = composeCodexPrompt({
      context: "- AC-001: Capture Codex proposal\n- [ ] T-001: Implement adapter",
      userPrompt: "Propose an implementation plan.",
    });

    expect(prompt).toContain("read-only proposal executor");
    expect(prompt).toContain("Do not edit files.");
    expect(prompt).toContain("AC-001");
    expect(prompt).toContain("T-001");
    expect(prompt).toContain("Propose an implementation plan.");
  });

  it("renders file references as bounded Codex runtime context", () => {
    const section = renderTopicFileReferencesForPrompt([
      { relativePath: "src/pricing.ts", name: "pricing.ts", kind: "file", extension: ".ts", size: 123 },
      { relativePath: "docs", name: "docs", kind: "directory", size: 0 },
    ]).join("\n");

    expect(section).toContain("file: src/pricing.ts");
    expect(section).toContain("directory: docs");
    expect(section).toContain("runtime context only");
    expect(section).not.toContain("export const");
  });

  it("requires exactly one prompt input", async () => {
    await expect(readPromptInput({})).rejects.toThrow("requires --prompt or --prompt-file");
    await expect(readPromptInput({ prompt: "x", promptFile: "y" })).rejects.toThrow("either --prompt or --prompt-file");
  });

  it("extracts final messages from common Codex JSONL events", () => {
    const output = [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final from item" } }),
      JSON.stringify({ type: "message", content: [{ type: "text", text: "final from message" }] }),
      "not json",
    ].join("\n");

    expect(extractFinalMessageFromCodexJsonl(output)).toBe("final from item\n\nfinal from message");
  });

  it("parses Codex JSONL chunks into UI-friendly streaming events", () => {
    const events: CodexJsonlStreamEvent[] = [];
    const parser = createCodexJsonlStreamParser((event) => events.push(event));
    const first = JSON.stringify({ type: "thread.started" });
    const second = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "hello" } });
    const third = JSON.stringify({ type: "item.completed", item: { type: "command_execution", id: "cmd-1", command: "npm test", exit_code: 0, aggregated_output: "ok" } });
    const fourth = JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 2 } });

    parser.feed(`${first}\n${second.slice(0, 20)}`);
    parser.feed(`${second.slice(20)}\nnot-json\n${third}\n${fourth}`);
    parser.flush();

    expect(events).toEqual(expect.arrayContaining([
      { type: "status", label: "initializing", raw: expect.any(Object) },
      { type: "text_delta", delta: "hello", raw: expect.any(Object) },
      expect.objectContaining({ type: "tool_event", phase: "completed", id: "cmd-1", command: "npm test", output: "ok", isError: false }),
      expect.objectContaining({ type: "readable_event", event: expect.objectContaining({ kind: "command", command: "npm test", preview: "ok" }) }),
      { type: "raw", line: "not-json" },
      { type: "usage", usage: { input_tokens: 1, output_tokens: 2 }, raw: expect.any(Object) },
      { type: "turn_completed", usage: { input_tokens: 1, output_tokens: 2 }, raw: expect.any(Object) },
    ]));
  });

  it("parses readable Codex model events without exposing raw JSONL as transcript", () => {
    const events: CodexJsonlStreamEvent[] = [];
    const parser = createCodexJsonlStreamParser((event) => events.push(event));
    parser.feed([
      JSON.stringify({ type: "item.completed", item: { type: "reasoning", id: "r1", summary: [{ text: "Checked the current workflow state." }], content: "hidden reasoning" } }),
      JSON.stringify({ type: "item.completed", item: { type: "file_change", id: "f1", changes: [{ path: "src/app.ts", kind: "modified", diff: "+ok" }] } }),
      JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", id: "m1", server: "openai", tool: "docs", arguments: { q: "SSE" }, result: "docs found" } }),
      JSON.stringify({ type: "item.completed", item: { type: "web_search", id: "w1", query: "Codex app" } }),
      JSON.stringify({ type: "item.completed", item: { type: "plan_update", id: "p1", text: "1. Inspect\n2. Patch" } }),
      JSON.stringify({ type: "item.completed", item: { type: "tool_result", id: "t1", content: "tool returned" } }),
      JSON.stringify({ type: "item.completed", item: { type: "unknown_payload", value: "raw only" } }),
      "",
    ].join("\n"));

    const readable = events.filter((event): event is Extract<CodexJsonlStreamEvent, { type: "readable_event" }> => event.type === "readable_event");
    expect(readable.map((event) => event.event.kind)).toEqual(expect.arrayContaining([
      "reasoning-summary",
      "file-change",
      "mcp-tool",
      "web-search",
      "plan-update",
      "tool-result",
    ]));
    expect(readable.find((event) => event.event.kind === "reasoning-summary")?.event.preview).toContain("Checked the current workflow state.");
    expect(readable.find((event) => event.event.kind === "reasoning-summary")?.event.preview).not.toContain("hidden reasoning");
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "raw" })]));
  });

  it("bounds readable command previews by byte and line limits", () => {
    const longOutput = Array.from({ length: 120 }, (_, index) => `${index}: ${"x".repeat(80)}`).join("\n");
    const preview = truncateReadablePreview(longOutput);

    expect(preview.truncated).toBe(true);
    expect(preview.preview).toContain("[truncated; see raw log]");
    expect(Buffer.byteLength(preview.preview ?? "", "utf8")).toBeLessThanOrEqual(2300);
    expect((preview.preview ?? "").split(/\r?\n/).length).toBeLessThanOrEqual(81);
  });

  it("records provider capability metadata for Codex run events", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp);

    const metadata = codexProviderRunMetadata({
      model: "gpt-5.5",
      modelSource: "selected",
      capabilities,
    });

    expect(metadata).toMatchObject({
      providerId: "codex",
      productMode: "harness",
      adapter: "codex-exec",
      model: "gpt-5.5",
      modelSource: "selected",
      capabilitySnapshotVersion: 2,
    });
    expect(typeof metadata.capabilitySnapshotHash).toBe("string");
    expect(String(metadata.capabilitySnapshotHash)).toHaveLength(16);
  });

  it("keeps provider capability snapshot identity stable across checkedAt refreshes", () => {
    const base = {
      providerId: "codex" as const,
      displayName: "Codex",
      productMode: "harness" as const,
      status: "degraded" as const,
      runnable: true,
      checkedAt: "2026-06-29T00:00:00.000Z",
      snapshotVersion: 2,
      effectiveModel: "gpt-5.5",
      effectiveModelSource: "selected" as const,
      degradedReasons: ["model list unavailable"],
      capabilities: [
        {
          key: "model.list" as const,
          label: "模型列表",
          spec: "supported" as const,
          runtime: "degraded" as const,
          summary: "模型列表不可用。",
          reason: "model list unavailable",
        },
      ],
    };

    expect(stableCapabilitySnapshotHash(base)).toBe(stableCapabilitySnapshotHash({
      ...base,
      checkedAt: "2026-06-29T01:00:00.000Z",
    }));
  });

  it("keeps normal Agent product mode typed but not runnable", () => {
    expect(RUNNABLE_PRODUCT_MODES).toEqual(["harness"]);
    expect(isRunnableProductMode("harness")).toBe(true);
    expect(isRunnableProductMode("agent")).toBe(false);
  });
});

describe("codex model settings", () => {
  it("reads model from Codex config.toml with a TOML parser", async () => {
    const temp = await mkdtemp(join(tmpdir(), "aho-codex-model-"));
    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = temp;
    try {
      await writeFile(join(temp, "config.toml"), "model = \"gpt-5.5\"\n[profiles.dev]\nmodel = \"ignored-profile\"\n", "utf8");

      const status = await readCodexConfigModelStatus();

      expect(status.model).toBe("gpt-5.5");
      expect(status.configExists).toBe(true);
      expect(status.reason).toBeUndefined();
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("degrades cleanly when Codex config.toml is invalid", async () => {
    const temp = await mkdtemp(join(tmpdir(), "aho-codex-model-"));
    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = temp;
    try {
      await writeFile(join(temp, "config.toml"), "model = [", "utf8");

      const status = await readCodexConfigModelStatus();

      expect(status.model).toBeNull();
      expect(status.configExists).toBe(true);
      expect(status.reason).toContain("Invalid Codex config.toml");
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("extracts runtime model candidates from model_list responses", () => {
    const candidates = candidatesFromModelListResponse({
      data: [
        { id: "gpt-5.5", displayName: "GPT 5.5", isDefault: true },
        { model: "gpt-5.3-codex", display_name: "GPT 5.3 Codex" },
      ],
    });

    expect(candidates.map((candidate) => candidate.model)).toEqual(["gpt-5.5", "gpt-5.3-codex"]);
    expect(candidates[0]).toMatchObject({ label: "GPT 5.5", source: "runtime", isDefault: true });
  });

  it("resolves selected model before Codex config model", async () => {
    const temp = await mkdtemp(join(tmpdir(), "aho-codex-model-"));
    const previousCodexHome = process.env.CODEX_HOME;
    const previousAhoHome = process.env.AHO_HOME;
    const previousPath = process.env.PATH;
    process.env.CODEX_HOME = join(temp, "codex-home");
    process.env.AHO_HOME = join(temp, "aho-home");
    process.env.PATH = "";
    try {
      await mkdir(process.env.CODEX_HOME, { recursive: true });
      await writeFile(join(process.env.CODEX_HOME, "config.toml"), "model = \"config-model\"\n", "utf8");
      await setSelectedCodexModel("runtime-model");

      const effective = await resolveCodexEffectiveModel();

      expect(effective).toEqual({ model: "runtime-model", source: "selected" });
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = previousAhoHome;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("cleans legacy custom model settings from the visible model snapshot", async () => {
    const temp = await mkdtemp(join(tmpdir(), "aho-codex-model-"));
    const previousCodexHome = process.env.CODEX_HOME;
    const previousAhoHome = process.env.AHO_HOME;
    const previousPath = process.env.PATH;
    process.env.CODEX_HOME = join(temp, "codex-home");
    process.env.AHO_HOME = join(temp, "aho-home");
    process.env.PATH = "";
    try {
      await mkdir(process.env.CODEX_HOME, { recursive: true });
      await mkdir(process.env.AHO_HOME, { recursive: true });
      await writeFile(join(process.env.CODEX_HOME, "config.toml"), "model = \"config-model\"\n", "utf8");
      await writeFile(join(process.env.AHO_HOME, "settings.json"), JSON.stringify({
        version: "1.0",
        codex: {
          selectedModel: "custom-model",
          customModels: [{ id: "custom-model", updatedAt: "2026-06-27T00:00:00.000Z" }],
        },
      }, null, 2), "utf8");

      const snapshot = await getCodexModelSettingsSnapshot(temp);

      expect(snapshot.selectedModel).toBeNull();
      expect(snapshot.customModels).toEqual([]);
      expect(snapshot.candidates.some((candidate) => candidate.source === "config" && candidate.model === "config-model")).toBe(true);
      expect(snapshot.candidates.some((candidate) => candidate.model === "custom-model")).toBe(false);
      expect(snapshot.effectiveModel).toBe("config-model");
      expect(snapshot.effectiveModelSource).toBe("config");
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = previousAhoHome;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(temp, { recursive: true, force: true });
    }
  });
});
