import { describe, expect, it } from "vitest";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, buildCodexWorkspaceWriteArgv, evaluateCodexCapabilities } from "../../src/codex/capabilities.js";
import { extractFinalMessageFromCodexJsonl } from "../../src/codex/jsonl.js";
import { composeCodexPrompt, readPromptInput } from "../../src/codex/prompt.js";

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
  it("builds root-level approval argv", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp);

    const argv = buildCodexReadonlyArgv(capabilities, {
      projectPath: "C:/repo",
      lastMessagePath: "C:/repo/.agent-harness/runs/run/last-message.md",
      model: "gpt-5.3-codex",
      profile: "default",
    });

    expect(argv.args.slice(0, 4)).toEqual(["--ask-for-approval", "never", "exec", "--json"]);
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
  });

  it("builds exec-level approval argv", () => {
    const capabilities = evaluateCodexCapabilities("codex-cli 1.0", "Usage: codex", `${execHelp}\n--ask-for-approval <APPROVAL_POLICY>`);

    const argv = buildCodexReadonlyArgv(capabilities, {
      projectPath: "/repo",
      lastMessagePath: "/repo/.agent-harness/runs/run/last-message.md",
    });

    expect(argv.args.slice(0, 4)).toEqual(["exec", "--ask-for-approval", "never", "--json"]);
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

    const safe = evaluateCodexCapabilities("codex-cli 1.0", rootHelp, execHelp, undefined, "Usage: codex exec resume --sandbox <MODE> --cd <DIR>");
    const argv = buildCodexReadonlyResumeArgv(safe, {
      projectPath: "/repo",
      lastMessagePath: "/repo/out.md",
      sessionId: "session-1",
    });
    expect(argv.args).toContain("--sandbox");
    expect(argv.args).toContain("read-only");
    expect(argv.args).toContain("--cd");
    expect(argv.args).toContain("/repo");
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
});
