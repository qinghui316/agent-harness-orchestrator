import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { buildAgentSystemPrompt, buildRunAgentRecord, resolveAgentRole } from "../../agent/catalog.js";
import { detectCodexAppServerCapability, runCodexAppServerTurn, type CodexAppServerNotification } from "../../codex/app-server.js";
import { buildCodexReadonlyArgv, buildCodexReadonlyResumeArgv, detectCodexCapabilities } from "../../codex/capabilities.js";
import { createCodexJsonlStreamParser, extractCodexSessionIdFromJsonl, extractFinalMessageFromCodexJsonl, truncateReadablePreview, type CodexJsonlStreamEvent } from "../../codex/jsonl.js";
import { writeJsonFile } from "../../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../../memory/resolver.js";
import { appendRunEvent, buildRunId } from "../../run/manager.js";
import { isRunStopRequested } from "../../run/control.js";
import { executeProcessStreaming } from "../../run/process.js";
import { getEnabledSkillContext } from "../../skill/catalog.js";
import type { ManagedProject, RunMetadata, RunStatus } from "../../types/index.js";
import { displayArtifactPath } from "../../workflow-artifacts/manager.js";
import { emitAssistantEvent, emitLive } from "../live-events.js";
import { appendTopicThreadEntry } from "../topic-thread.js";
import { readTopicRuntime, writeTopicRuntime } from "../topic-runtime.js";
import { resolveTopic } from "../topic-resolver.js";
import { readTopicThreadLog as readThreadLog } from "../thread-log.js";
import type {
  OrchestrationPlanCard,
  SuggestedAction,
  TopicMessageResult,
  TopicRoutingDecision,
  TopicThreadEntry,
  WorkbenchLiveSink,
} from "../types.js";
import { createAssistantTranscriptCapture } from "../live-transcript.js";
import { buildChatContext, buildOrchestratorContext } from "./context.js";
export async function runOrchestratorPlan(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<{
  run: RunMetadata;
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
}> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Orchestrator plan");
  const { changePath } = await resolveTopic(project, changeId);
  const role = await resolveAgentRole(memory, "orchestrator");
  const runId = buildRunId(changeId, ["orchestrator", userMessage]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    lastMessage: join(directory, "last-message.md"),
    orchestrationPlan: join(directory, "orchestration-plan.json"),
    orchestrationPlanMarkdown: join(directory, "orchestration-plan.md"),
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "orchestrator",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      lastMessage: `${relativeDir}/last-message.md`,
      orchestrationPlan: `${relativeDir}/orchestration-plan.json`,
      orchestrationPlanMarkdown: `${relativeDir}/orchestration-plan.md`,
    },
    promptStack: ["agent-role", "active-change", "topic-thread", "workflow-status", "user-message"],
    agent: buildRunAgentRecord(role),
  };
  await writeJsonFile(paths.run, run);
  live?.emit({ event: "run.started", data: { runId, changeId, runtime: "orchestrator", actionType: "orchestrator.plan" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "orchestrator" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "orchestrator.plan.started", runId, data: { changeId } });

  const contextResult = await buildOrchestratorContext(project, memory, changePath, changeId, userMessage);
  if (contextResult.goalLoopNextStepPacketId) {
    run = { ...run, promptStack: [...(run.promptStack ?? []), "goal-loop-next-step-packet"] };
    await writeJsonFile(paths.run, run);
  }
  if (contextResult.goalLoopControlledLoopState) {
    run = { ...run, promptStack: [...(run.promptStack ?? []), "goal-loop-controlled-loop-state"] };
    await writeJsonFile(paths.run, run);
  }
  if (contextResult.goalLoopControllerPolicyId) {
    run = { ...run, promptStack: [...(run.promptStack ?? []), "goal-loop-controller-policy"] };
    await writeJsonFile(paths.run, run);
  }
  const context = contextResult.context;
  await writeFile(paths.context, context, "utf8");
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "context.prepared",
    runId,
    data: {
      path: run.artifacts.context,
      goalLoopNextStepPacketId: contextResult.goalLoopNextStepPacketId,
      goalLoopControllerPolicyId: contextResult.goalLoopControllerPolicyId,
      goalLoopRoutingPosture: contextResult.goalLoopRoutingPosture,
      goalLoopRoutingLabel: contextResult.goalLoopRoutingLabel,
      goalLoopGuidedGateActionType: contextResult.goalLoopGuidedGateActionType,
      goalLoopGuidedGateScope: contextResult.goalLoopGuidedGateScope,
      goalLoopControlledLoopState: contextResult.goalLoopControlledLoopState,
    },
  });
  const prompt = `${buildAgentSystemPrompt(role)}\n\n${context}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");

  const capabilities = await detectCodexCapabilities();
  const heuristicDecision = classifyTopicRouting(userMessage, await readThreadLog(memory, changePath));
  if (capabilities.errors.length > 0) {
    const fallback = fallbackOrchestration(userMessage, heuristicDecision, capabilities.errors);
    await writeFile(paths.stdout, "", "utf8");
    await writeFile(paths.stderr, `${capabilities.errors.join("\n")}\n`, "utf8");
    await writeFile(paths.lastMessage, JSON.stringify(fallback, null, 2), "utf8");
    await writeJsonFile(paths.orchestrationPlan, fallback);
    await writeFile(paths.orchestrationPlanMarkdown, renderPlanCardMarkdown(fallback), "utf8");
    run = await finishOrchestratorRun(paths.run, run, "completed", 0, null);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "orchestrator.plan.completed", runId, data: { routingDecision: fallback.routingDecision } });
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: "run.completed", runId });
    return { ...fallback, run };
  }

  const argv = buildCodexReadonlyArgv(capabilities, {
    projectPath: project.path,
    lastMessagePath: paths.lastMessage,
    additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [],
  });
  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "orchestrator", command: run.command } });
  const parser = createLiveCodexParser(runId, live);
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onCallbackError: (_stream, error) => emitLive(live, { event: "error", data: { message: error instanceof Error ? error.message : String(error), runId } }),
    stopSignal: () => isRunStopRequested(runId),
  });
  parser.flush();
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(processResult.stdoutSample) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Orchestrator Plan Not Captured\n", "utf8");
  const parsed = parseOrchestrationOutput(lastMessage, userMessage, heuristicDecision);
  await writeJsonFile(paths.orchestrationPlan, parsed);
  await writeFile(paths.orchestrationPlanMarkdown, renderPlanCardMarkdown(parsed), "utf8");
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "orchestrator", exitCode: processResult.exitCode, signal: processResult.signal } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = await finishOrchestratorRun(paths.run, run, status, processResult.exitCode, processResult.signal);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "orchestrator.plan.completed" : "orchestrator.plan.failed", runId, data: { routingDecision: parsed.routingDecision } });
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { ...parsed, run };
}

export async function postTopicPlanMessage(project: ManagedProject, changeId: string, message: string, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const orchestration = await runOrchestratorPlan(project, changeId, message, capture.sink);
  const assistantText = orchestration.assistantMessage.trim() || capture.text.trim();
  if (orchestration.routingDecision !== "same-topic") {
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: assistantText,
      runId: orchestration.run.id,
      artifact: orchestration.run.artifacts.orchestrationPlanMarkdown,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return {
      user,
      assistant,
      run: orchestration.run,
      codexSessionId: null,
      mode: "plan",
      routingDecision: orchestration.routingDecision,
      assistantMessage: assistantText,
      planCard: orchestration.planCard,
      suggestedActions: orchestration.suggestedActions,
    };
  }
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "orchestrator.plan",
    text: assistantText,
    runId: orchestration.run.id,
    artifact: orchestration.run.artifacts.orchestrationPlanMarkdown,
    planCard: orchestration.planCard,
    activity: capture.activity,
    blocks: capture.blocks,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return {
    user,
    assistant,
    run: orchestration.run,
    codexSessionId: null,
    mode: "plan",
    routingDecision: orchestration.routingDecision,
    assistantMessage: assistantText,
    planCard: orchestration.planCard,
    suggestedActions: orchestration.suggestedActions,
  };
}

export async function runCodexChat(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<{ run: RunMetadata; message: string; codexSessionId: string | null }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Topic chat");
  const { changePath } = await resolveTopic(project, changeId);
  const runtime = await readTopicRuntime(memory, changePath, changeId);
  const skillContext = await getEnabledSkillContext(project, changeId);
  const runId = buildRunId(changeId, ["codex", "chat"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = {
    run: join(directory, "run.json"),
    context: join(directory, "context.md"),
    prompt: join(directory, "prompt.md"),
    events: join(directory, "events.jsonl"),
    stdout: join(directory, "stdout.log"),
    stderr: join(directory, "stderr.log"),
    codexEvents: join(directory, "codex-events.jsonl"),
    appServerEvents: join(directory, "app-server-events.jsonl"),
    appServerStderr: join(directory, "app-server-stderr.log"),
    appServerLastMessage: join(directory, "app-server-last-message.md"),
    agentSession: join(directory, "agent-session.json"),
    lastMessage: join(directory, "last-message.md"),
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "codex-readonly",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts: {
      base: memory.artifactBase,
      directory: relativeDir,
      context: `${relativeDir}/context.md`,
      prompt: `${relativeDir}/prompt.md`,
      events: `${relativeDir}/events.jsonl`,
      stdout: `${relativeDir}/stdout.log`,
      stderr: `${relativeDir}/stderr.log`,
      codexEvents: `${relativeDir}/codex-events.jsonl`,
      appServerEvents: `${relativeDir}/app-server-events.jsonl`,
      appServerStderr: `${relativeDir}/app-server-stderr.log`,
      appServerLastMessage: `${relativeDir}/app-server-last-message.md`,
      agentSession: `${relativeDir}/agent-session.json`,
      lastMessage: `${relativeDir}/last-message.md`,
    },
    promptStack: ["active-change", "topic-thread", "aho-skills", "user-message"],
    enabledSkills: skillContext.records,
  };
  await writeJsonFile(paths.run, run);
  live?.emit({ event: "run.started", data: { runId, changeId, runtime: "codex-readonly", actionType: "chat.ask" } });
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { changeId, runtime: "codex-chat", requestedResume: Boolean(runtime.codexSessionId), skills: skillContext.records.map((item) => item.id) } });
  const contextResult = await buildChatContext(project, memory, changeId, userMessage);
  if (contextResult.goalLoopNextStepPacketId) {
    run = { ...run, promptStack: [...(run.promptStack ?? []), "goal-loop-next-step-packet"] };
    await writeJsonFile(paths.run, run);
  }
  if (contextResult.goalLoopControlledLoopState) {
    run = { ...run, promptStack: [...(run.promptStack ?? []), "goal-loop-controlled-loop-state"] };
    await writeJsonFile(paths.run, run);
  }
  if (contextResult.goalLoopControllerPolicyId) {
    run = { ...run, promptStack: [...(run.promptStack ?? []), "goal-loop-controller-policy"] };
    await writeJsonFile(paths.run, run);
  }
  const context = contextResult.context;
  await writeFile(paths.context, context, "utf8");
  const prompt = `${context}${skillContext.promptSection ? `\n\n${skillContext.promptSection}` : ""}\n\n## User Message\n\n${userMessage}\n`;
  await writeFile(paths.prompt, prompt, "utf8");
  await appendRunEvent(paths.events, {
    timestamp: new Date().toISOString(),
    type: "context.prepared",
    runId,
    data: {
      path: run.artifacts.context,
      goalLoopNextStepPacketId: contextResult.goalLoopNextStepPacketId,
      goalLoopControllerPolicyId: contextResult.goalLoopControllerPolicyId,
      goalLoopRoutingPosture: contextResult.goalLoopRoutingPosture,
      goalLoopRoutingLabel: contextResult.goalLoopRoutingLabel,
      goalLoopGuidedGateActionType: contextResult.goalLoopGuidedGateActionType,
      goalLoopGuidedGateScope: contextResult.goalLoopGuidedGateScope,
      goalLoopControlledLoopState: contextResult.goalLoopControlledLoopState,
    },
  });

  const appServerCapabilities = await detectCodexAppServerCapability();
  if (appServerCapabilities.available) {
    run = { ...run, command: ["codex", "app-server", "--listen", "stdio://"], status: "running" };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.started", runId, data: { phase: "chat", resumed: Boolean(runtime.codexSessionId) } });
    const result = await runCodexAppServerTurn({
      projectId: project.id,
      changeId,
      roleId: "planning-agent",
      runId,
      cwd: project.path,
      prompt,
      sandboxPolicy: "read-only",
      paths: {
        events: paths.appServerEvents,
        stderr: paths.appServerStderr,
        lastMessage: paths.appServerLastMessage,
        session: paths.agentSession,
      },
      existingThreadId: runtime.codexSessionId,
      onTextDelta: (delta) => emitLive(live, { event: "assistant.delta", data: { delta, runId } }),
      onNotification: (notification) => forwardAppServerNotification(runId, notification, live),
      onError: (error) => emitLive(live, { event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    });
    const status: RunStatus = result.status === "completed" ? "completed" : "failed";
    const lastMessage = result.lastMessage.trim() || result.error || "Codex app-server did not return a final message.";
    await writeFile(paths.lastMessage, lastMessage, "utf8");
    await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: result.threadId ?? runtime.codexSessionId, updatedAt: new Date().toISOString() });
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.exited", runId, data: { phase: "chat", status: result.status, threadId: result.threadId, turnId: result.turnId, error: result.error } });
    run = { ...run, status, exitCode: status === "completed" ? 0 : 1, signal: null, finishedAt: new Date().toISOString() };
    await writeJsonFile(paths.run, run);
    await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
    live?.emit({ event: "run.status", data: { runId, status } });
    return { run, message: lastMessage, codexSessionId: result.threadId ?? runtime.codexSessionId };
  }
  emitAssistantEvent(live, {
    runId,
    kind: "status",
    phase: "fallback",
    title: "实时引导不可用",
    summary: "Codex app-server 不可用，当前输入会在下一轮生效。",
  });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "app-server.unavailable", runId, data: { errors: appServerCapabilities.errors } });

  const capabilities = await detectCodexCapabilities();
  const canResume = Boolean(runtime.codexSessionId) && capabilities.supportsSafeResume;
  const argv = canResume
    ? buildCodexReadonlyResumeArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, sessionId: runtime.codexSessionId as string, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] })
    : buildCodexReadonlyArgv(capabilities, { projectPath: project.path, lastMessagePath: paths.lastMessage, additionalReadDirs: memory.mode === "external-local" ? [memory.memoryRoot] : [] });

  run = { ...run, command: [argv.command, ...argv.args], status: "running" };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.started", runId, data: { phase: "chat", resumed: canResume, resumeFallback: Boolean(runtime.codexSessionId) && !canResume, skillWarnings: skillContext.warnings } });
  const parser = createLiveCodexParser(runId, live);
  const processResult = await executeProcessStreaming({
    cwd: project.path,
    command: argv.command,
    args: argv.args,
    stdin: prompt,
    stdoutPath: paths.stdout,
    stderrPath: paths.stderr,
    mirrorStdoutPath: paths.codexEvents,
    onStdoutChunk: (text) => parser.feed(text),
    onCallbackError: (_stream, error) => emitLive(live, { event: "error", data: { message: error instanceof Error ? error.message : String(error), runId } }),
    stopSignal: () => isRunStopRequested(runId),
  });
  parser.flush();
  const stdout = processResult.stdoutSample;
  const lastMessage = existsSync(paths.lastMessage)
    ? await readFile(paths.lastMessage, "utf8")
    : extractFinalMessageFromCodexJsonl(stdout) ?? "";
  if (!existsSync(paths.lastMessage)) await writeFile(paths.lastMessage, lastMessage || "# Codex Chat Not Captured\n", "utf8");
  const nextSessionId = extractCodexSessionIdFromJsonl(stdout) ?? runtime.codexSessionId;
  await writeTopicRuntime(memory, changePath, { version: "1.0", changeId, codexSessionId: nextSessionId, updatedAt: new Date().toISOString() });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "codex.exited", runId, data: { phase: "chat", exitCode: processResult.exitCode, signal: processResult.signal, sessionLinked: Boolean(nextSessionId) } });
  const status: RunStatus = processResult.exitCode === 0 ? "completed" : "failed";
  run = { ...run, status, exitCode: processResult.exitCode, signal: processResult.signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(paths.run, run);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  live?.emit({ event: "run.status", data: { runId, status } });
  return { run, message: lastMessage.trim() || processResult.stderrSample || "Codex did not return a final message.", codexSessionId: nextSessionId };
}

function createLiveCodexParser(runId: string, live: WorkbenchLiveSink | undefined): ReturnType<typeof createCodexJsonlStreamParser> {
  return createCodexJsonlStreamParser((event: CodexJsonlStreamEvent) => {
    forwardCodexStreamEvent(runId, event, live);
  });
}

function forwardCodexStreamEvent(runId: string, event: CodexJsonlStreamEvent, live: WorkbenchLiveSink | undefined): void {
    if (!live) return;
    if (event.type === "readable_event") {
      emitAssistantEvent(live, { ...event.event, runId });
      return;
    }
    if (event.type === "text_delta") {
      emitLive(live, { event: "assistant.delta", data: { delta: event.delta, runId } });
      return;
    }
    if (event.type === "status") {
      emitLive(live, { event: "run.status", data: { runId, status: event.label } });
      return;
    }
    if (event.type === "usage") {
      emitLive(live, { event: "usage", data: { runId, usage: event.usage } });
      emitAssistantEvent(live, {
        runId,
        kind: "usage",
        phase: "completed",
        title: "Usage recorded",
        summary: formatUsageSummary(event.usage),
      });
      return;
    }
    if (event.type === "error") {
      emitLive(live, { event: "error", data: { runId, message: event.message } });
      emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex error", summary: event.message, isError: true });
      return;
    }
    if (event.type === "tool_event") {
      const preview = truncateReadablePreview(event.output);
      emitLive(live, {
        event: "tool.event",
        data: {
          runId,
          itemId: event.id,
          phase: event.phase,
          name: event.name,
          command: event.command,
          outputTail: preview.preview,
          isError: event.isError,
          exitCode: typeof event.raw === "object" && event.raw && "item" in event.raw ? exitCodeFromRaw(event.raw) : undefined,
        },
      });
    }
}

function forwardAppServerNotification(runId: string, notification: CodexAppServerNotification, live: WorkbenchLiveSink | undefined): void {
  if (!live) return;
  const method = notification.method;
  if (method === "turn/completed") {
    emitLive(live, { event: "run.status", data: { runId, status: "completed" } });
    return;
  }
  if (method === "turn/failed") {
    const message = JSON.stringify(notification.params);
    emitLive(live, { event: "error", data: { runId, message } });
    emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex app-server turn failed", summary: message, isError: true });
    return;
  }
  if (method.includes("commandExecution")) {
    const command = commandFromAppServerParams(notification.params);
    emitAssistantEvent(live, {
      runId,
      itemId: itemIdFromAppServerParams(notification.params),
      kind: "command",
      phase: method.includes("completed") || method.includes("finished") ? "completed" : "running",
      title: "Command event",
      summary: command ?? method,
      command,
      preview: previewFromAppServerParams(notification.params),
    });
    return;
  }
  if (method.startsWith("item/") || method.startsWith("tool/")) {
    emitAssistantEvent(live, {
      runId,
      itemId: itemIdFromAppServerParams(notification.params),
      kind: "status",
      phase: "running",
      title: "Codex activity",
      summary: method,
    });
  }
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  const pieces = [
    input === undefined ? null : `${input} input tokens`,
    output === undefined ? null : `${output} output tokens`,
  ].filter((item): item is string => Boolean(item));
  return pieces.length > 0 ? pieces.join(" · ") : "Usage recorded.";
}

function exitCodeFromRaw(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object" || !("item" in raw)) return undefined;
  const item = (raw as { item?: unknown }).item;
  if (!item || typeof item !== "object" || !("exit_code" in item)) return undefined;
  const exitCode = (item as { exit_code?: unknown }).exit_code;
  return typeof exitCode === "number" ? exitCode : undefined;
}

function itemIdFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.itemId === "string") return params.itemId;
  if (typeof params.id === "string") return params.id;
  if (isRecord(params.item) && typeof params.item.id === "string") return params.item.id;
  return undefined;
}

function commandFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.command === "string") return params.command;
  if (Array.isArray(params.command)) return params.command.filter((part): part is string => typeof part === "string").join(" ");
  if (isRecord(params.item) && typeof params.item.command === "string") return params.item.command;
  if (isRecord(params.item) && Array.isArray(params.item.command)) return params.item.command.filter((part): part is string => typeof part === "string").join(" ");
  return undefined;
}

function previewFromAppServerParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.output === "string") return truncateReadablePreview(params.output).preview;
  if (typeof params.text === "string") return truncateReadablePreview(params.text).preview;
  if (isRecord(params.item) && typeof params.item.output === "string") return truncateReadablePreview(params.item.output).preview;
  return undefined;
}

function parseOrchestrationOutput(message: string, userMessage: string, fallbackDecision: TopicRoutingDecision): {
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
} {
  const json = extractJsonObject(message);
  if (!json) return fallbackOrchestration(userMessage, fallbackDecision, ["Orchestrator output did not include parseable JSON."]);
  try {
    const parsed = orchestrationOutputSchema.parse(JSON.parse(json));
    return {
      routingDecision: parsed.routingDecision,
      assistantMessage: parsed.assistantMessage,
      planCard: {
        title: parsed.planCard.title,
        summary: parsed.planCard.summary,
        steps: parsed.planCard.steps,
        warnings: parsed.planCard.warnings,
      },
      suggestedActions: parsed.suggestedActions.filter(isAllowedSuggestedAction),
    };
  } catch (cause) {
    return fallbackOrchestration(userMessage, fallbackDecision, [`Orchestrator JSON was invalid: ${cause instanceof Error ? cause.message : String(cause)}`]);
  }
}

const orchestrationOutputSchema = z.object({
  routingDecision: z.enum(["same-topic", "new-topic-required", "clarify"]).default("same-topic"),
  assistantMessage: z.string().default("I prepared a workflow plan."),
  planCard: z.object({
    title: z.string().default("Plan mode"),
    summary: z.string().default("Review the suggested action before advancing the workflow."),
    steps: z.array(z.object({
      label: z.string(),
      description: z.string(),
      actionId: z.string().optional(),
      requiresConfirmation: z.boolean().optional(),
    })).default([]),
    warnings: z.array(z.string()).default([]),
  }).default({ title: "Plan mode", summary: "Review the suggested action before advancing the workflow.", steps: [], warnings: [] }),
  suggestedActions: z.array(z.object({
    actionType: z.enum(["change.spec.propose", "change.plan.propose", "code.run", "spec-test.drift"]),
    label: z.string(),
    requiresConfirmation: z.boolean().default(true),
    prompt: z.string().optional(),
  })).default([]),
});

function fallbackOrchestration(userMessage: string, routingDecision: TopicRoutingDecision, warnings: string[]): {
  routingDecision: TopicRoutingDecision;
  assistantMessage: string;
  planCard: OrchestrationPlanCard;
  suggestedActions: SuggestedAction[];
} {
  const actionType: SuggestedAction["actionType"] = routingDecision === "same-topic" ? "change.spec.propose" : "spec-test.drift";
  const assistantMessage = routingDecision === "same-topic"
    ? "I prepared a controlled plan. Start with a Spec proposal so the request is anchored before coding."
    : routingDecision === "new-topic-required"
      ? "This looks like a different request. Create or switch Topic before continuing so the current Change stays clean."
      : "I need a routing decision before attaching this request to the current Topic.";
  return {
    routingDecision,
    assistantMessage,
    planCard: {
      title: routingDecision === "same-topic" ? "Controlled implementation plan" : "Topic routing required",
      summary: routingDecision === "same-topic"
        ? `Convert the request into a Spec proposal, then proceed through Plan, Coder, Validation, Audit, and explicit Apply/Close gates. Request: ${userMessage}`
        : "AHO will not mix unrelated or uncertain work into the current Topic.",
      steps: routingDecision === "same-topic"
        ? [
            { label: "Draft Spec", description: "Generate a proposal only; user acceptance writes canonical spec.md.", actionId: "change.spec.propose", requiresConfirmation: true },
            { label: "Draft Plan", description: "After Spec acceptance, generate plan.md and tasks.md proposal.", actionId: "change.plan.propose", requiresConfirmation: true },
            { label: "Code and verify", description: "After explicit Code confirmation, run Coder, validation, and audit on the same worktree.", actionId: "code.run", requiresConfirmation: true },
          ]
        : [{ label: "Resolve routing", description: "Create/switch/park/close a Topic before continuing.", requiresConfirmation: true }],
      warnings,
    },
    suggestedActions: routingDecision === "same-topic"
      ? [{ actionType, label: "Generate Spec proposal", requiresConfirmation: true, prompt: userMessage }]
      : [],
  };
}

function classifyTopicRouting(userMessage: string, recentMessages: TopicThreadEntry[]): TopicRoutingDecision {
  const normalized = userMessage.trim().toLowerCase();
  if (/新(topic|主题)|另一个|无关|换个需求|new topic/.test(normalized)) return "new-topic-required";
  if (/这个需求|继续|补充|修改上面|刚才|current|same topic/.test(normalized)) return "same-topic";
  if (recentMessages.length === 0) return "same-topic";
  if (normalized.length < 8) return "clarify";
  return "same-topic";
}

function extractJsonObject(text: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function isAllowedSuggestedAction(action: SuggestedAction): boolean {
  return action.actionType === "change.spec.propose" || action.actionType === "change.plan.propose" || action.actionType === "code.run" || action.actionType === "spec-test.drift";
}

function renderPlanCardMarkdown(plan: { routingDecision: TopicRoutingDecision; assistantMessage: string; planCard: OrchestrationPlanCard; suggestedActions: SuggestedAction[] }): string {
  return [
    `# ${plan.planCard.title}`,
    "",
    `Routing: ${plan.routingDecision}`,
    "",
    plan.assistantMessage,
    "",
    "## Summary",
    "",
    plan.planCard.summary,
    "",
    "## Steps",
    "",
    ...plan.planCard.steps.map((step) => `- ${step.label}: ${step.description}`),
    "",
    "## Suggested Actions",
    "",
    ...(plan.suggestedActions.length > 0 ? plan.suggestedActions.map((action) => `- ${action.actionType}: ${action.label}`) : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(plan.planCard.warnings.length > 0 ? plan.planCard.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

async function finishOrchestratorRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number | null, signal: NodeJS.Signals | null): Promise<RunMetadata> {
  const next = { ...run, status, exitCode, signal, finishedAt: new Date().toISOString() };
  await writeJsonFile(path, next);
  return next;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
