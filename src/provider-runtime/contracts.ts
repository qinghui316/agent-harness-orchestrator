import type { ProviderSkillInput } from "../project-harness/contracts.js";
import type { ProviderCapabilitySnapshot, ProviderDiagnosticsSnapshot, ProviderId, ProviderModelRef, ProviderModelSettingsSnapshot, ProviderOperationProfile, ProviderRuntimeSummary } from "./types.js";

export interface ProviderSessionRef {
  providerId: ProviderId;
  sessionId: string;
}

export interface ProviderTurnRef extends ProviderSessionRef {
  turnId: string;
}

export interface ProviderItemRef extends ProviderTurnRef {
  itemId: string;
}

export interface ProviderAttemptRef {
  providerId: ProviderId;
  attemptId: string;
  runId: string;
  conversationId?: string;
  graphScopeId?: string;
}

export interface ProviderRealtimeIdentity {
  projectId: string;
  conversationId?: string;
  graphScopeId?: string;
  changeId?: string;
  runId: string;
  attemptId: string;
  providerId: ProviderId;
  sessionId?: string;
  threadId: string;
  parentThreadId?: string;
  turnId: string;
  itemId?: string;
  roleId: string;
  agentTaskId?: string;
  displayName?: string;
  targetAgentSurfaceId?: string;
  targetAgentDisplayName?: string;
  targetThreadId?: string;
}

export type ProviderReadableEventKind =
  | "status"
  | "reasoning-summary"
  | "command"
  | "file-change"
  | "mcp-tool"
  | "web-search"
  | "plan-update"
  | "tool-result"
  | "usage"
  | "error";

export interface ProviderReadableEvent {
  itemId: string;
  kind: ProviderReadableEventKind;
  phase?: string;
  status?: "processing" | "completed" | "failed";
  title?: string;
  summary?: string;
  preview?: string;
  artifactRef?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  isError?: boolean;
  truncated?: boolean;
}

export type ProviderStreamEvent =
  | { type: "status"; label: string; raw?: unknown }
  | { type: "turn_completed"; usage?: Record<string, unknown>; raw?: unknown }
  | { type: "text_delta"; delta: string; raw?: unknown }
  | { type: "tool_event"; phase: "started" | "updated" | "completed"; status: "processing" | "completed" | "failed"; id: string; name?: string; command?: string; output?: string; exitCode?: number; isError?: boolean; raw?: unknown }
  | { type: "readable_event"; event: ProviderReadableEvent; raw?: unknown }
  | { type: "usage"; usage: Record<string, unknown>; raw?: unknown }
  | { type: "error"; message: string; raw?: unknown }
  | { type: "raw"; line: string };

export interface ProviderRealtimeEvent extends ProviderRealtimeIdentity {
  streamEvent: ProviderStreamEvent;
  method: string;
}

export interface ProviderUserInputOption {
  value: string;
  label: string;
  description?: string;
}

export interface ProviderUserInputQuestion {
  id: string;
  header?: string;
  question: string;
  inputMode: "single" | "multiple" | "text" | "secret";
  allowCustom: boolean;
  options?: ProviderUserInputOption[];
}

export interface ProviderUserInputRequest {
  providerId: ProviderId;
  requestId: string;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  attemptId: string;
  runId: string;
  changeId?: string;
  runtimeScopeId: string;
  roleId: string;
  questions: ProviderUserInputQuestion[];
  expiresAt?: string;
}

export interface ProviderUserInputResponse {
  answers: Record<string, string | string[]>;
  skippedQuestionIds: string[];
  disposition: "answered" | "skipped";
}

export interface ProviderUserInputResolution {
  providerId: ProviderId;
  requestId: string;
  runtimeScopeId: string;
  runId: string;
  attemptId: string;
  threadId?: string;
}

export interface ProviderChildThreadResult {
  providerId: ProviderId;
  activityId?: string;
  parentThreadId: string;
  threadId: string;
  roleHint?: string;
  status?: string;
  initialInput?: {
    turnId: string;
    itemId: string;
    text: string;
  };
  model?: string;
  reasoningEffort?: string;
  displayName?: string;
  finalText: string;
  changedFiles: string[];
}

export interface ProviderChildLifecycleEvent {
  providerId: ProviderId;
  kind: "started" | "continued" | "closed";
  activityId: string;
  parentSession: ProviderSessionRef;
  childSession: ProviderSessionRef;
  turnId?: string;
  roleHint?: string;
  displayName?: string;
}

export interface ProviderToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderToolCall {
  providerId: ProviderId;
  requestId: string;
  sessionId?: string;
  threadId: string;
  turnId: string;
  callId: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ProviderToolResult {
  contentItems: Array<{ type: "inputText"; text: string }>;
  success: boolean;
  yieldAfterResponse?: boolean;
}

export interface ProviderObjectiveState {
  providerId: ProviderId;
  sessionId: string;
  objective: string;
  status: "active" | "paused" | "blocked" | "usage-limited" | "budget-limited" | "complete";
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderArtifactPaths {
  events: string;
  stderr: string;
  lastMessage: string;
  session: string;
}

export interface ProviderRuntimeHostRef {
  hostId: string;
  generation: number;
  pid: number | null;
}

export interface ProviderTurnRequest {
  providerId: ProviderId;
  operationProfile: ProviderOperationProfile;
  projectId: string;
  conversationId?: string;
  graphScopeId?: string;
  changeId?: string;
  runtimeScopeId?: string;
  roleId: string;
  agentTaskId?: string;
  runId: string;
  attemptId: string;
  cwd: string;
  prompt: string;
  sandboxPolicy: "read-only" | "workspace-write";
  paths: ProviderArtifactPaths;
  existingSession?: ProviderSessionRef | null;
  timeoutMs?: number;
  onRealtimeEvent?: (event: ProviderRealtimeEvent) => void;
  onChildLifecycleEvent?: (event: ProviderChildLifecycleEvent) => void;
  onChildThreadResult?: (result: ProviderChildThreadResult) => void;
  onUserInputRequest?: (request: ProviderUserInputRequest) => void;
  onUserInputResolved?: (resolution: ProviderUserInputResolution) => void;
  tools?: ProviderToolSpec[];
  onToolCall?: (call: ProviderToolCall) => Promise<ProviderToolResult>;
  onObjectiveUpdate?: (objective: ProviderObjectiveState) => void;
  objectiveSession?: boolean;
  objectiveResume?: { deliveryKey: string; contextText: string };
  onTextDelta?: (text: string) => void;
  onPlanDelta?: (text: string) => void;
  onPlanUpdate?: (text: string, params: Record<string, unknown>) => void;
  onError?: (error: unknown) => void;
  model?: ProviderModelRef | null;
  imageInputs?: Array<{ path: string; mediaType?: string; fileName?: string }>;
  skillInputs?: ProviderSkillInput[];
  nativeSkillRoots?: string[];
  requiredNativeSkills?: string[];
  runtimeWorkspaceRoots?: string[];
  additionalContext?: Record<string, { kind: "untrusted" | "application"; value: string }>;
  writableRoots?: string[];
  developerInstructions?: string;
  outputSchema?: Record<string, unknown>;
}

export interface ProviderChildTurnRequest extends Omit<ProviderTurnRequest, "existingSession" | "objectiveSession" | "objectiveResume"> {
  parentSession: ProviderSessionRef;
  targetSession: ProviderSessionRef;
  targetDisplayName?: string;
}

export interface ProviderChildCloseRequest {
  providerId: ProviderId;
  projectId: string;
  conversationId: string;
  graphScopeId?: string;
  changeId?: string;
  runtimeScopeId: string;
  roleId: string;
  runId: string;
  attemptId: string;
  cwd: string;
  parentSession: ProviderSessionRef;
  targetSession: ProviderSessionRef;
  targetDisplayName?: string;
  paths: ProviderArtifactPaths;
  timeoutMs?: number;
  onRealtimeEvent?: (event: ProviderRealtimeEvent) => void;
  onChildLifecycleEvent?: (event: ProviderChildLifecycleEvent) => void;
  onError?: (error: unknown) => void;
}

export interface ProviderChildSessionRequest {
  providerId: ProviderId;
  cwd: string;
  parentSession: ProviderSessionRef;
  targetSession: ProviderSessionRef;
}

export interface ProviderTurnResult {
  providerId: ProviderId;
  status: "completed" | "interrupted" | "failed";
  session: ProviderSessionRef | null;
  turnId: string | null;
  lastMessageItemId?: string | null;
  lastMessage: string;
  planText?: string;
  objective?: ProviderObjectiveState | null;
  childThreads: ProviderChildThreadResult[];
  changedFiles: string[];
  runtimeHost?: ProviderRuntimeHostRef;
  error?: string;
}

export interface ActiveProviderTurn {
  providerId: ProviderId;
  attemptId: string;
  changeId?: string;
  runtimeScopeId: string;
  roleId: string;
  runId: string;
  session: ProviderSessionRef;
  turnId: string;
  startedAt: string;
  steer(input: string): Promise<void>;
  interrupt(reason?: string): Promise<void>;
  respondToUserInput(requestId: string, response: ProviderUserInputResponse, expected?: { runId: string; sessionId?: string; turnId?: string }): Promise<void>;
}

export interface ConversationProviderPort {
  runTurn(request: ProviderTurnRequest): Promise<ProviderTurnResult>;
  inspectChild(request: ProviderChildSessionRequest): Promise<"available" | "stale">;
  continueChild(request: ProviderChildTurnRequest): Promise<ProviderTurnResult>;
  closeChild(request: ProviderChildCloseRequest): Promise<ProviderTurnResult>;
  getActiveTurn(runId: string): ActiveProviderTurn | null;
  listActiveTurns(): ActiveProviderTurn[];
}

export interface LeafExecutionProviderPort {
  runTurn(request: ProviderTurnRequest): Promise<ProviderTurnResult>;
}

export type ProviderSkillScope = "user" | "repo" | "system" | "admin";

export interface ProviderNativeSkill {
  name: string;
  description: string;
  path: string;
  scope: ProviderSkillScope;
  enabled: boolean;
  contentHash: string;
  interface?: {
    displayName?: string;
    shortDescription?: string;
  };
  dependencies?: Record<string, unknown>;
}

export interface ProviderSkillCatalogError {
  path: string;
  message: string;
}

export interface ProviderSkillCatalogSnapshot {
  providerId: ProviderId;
  projectPath: string;
  skills: ProviderNativeSkill[];
  errors: ProviderSkillCatalogError[];
}

export interface ProviderSkillCatalogPort {
  list(input: {
    projectPath: string;
    extraRoots?: readonly string[];
    forceReload?: boolean;
  }): Promise<ProviderSkillCatalogSnapshot>;
  setEnabled(input: {
    projectPath: string;
    path: string;
    enabled: boolean;
  }): Promise<{ effectiveEnabled: boolean }>;
}

export interface ProviderDescriptor {
  id: ProviderId;
  displayName: string;
  runtime: {
    shutdown(reason?: string): void | Promise<void>;
  };
  capabilitySnapshot(project: import("../types/index.js").ManagedProject | null, projectPath?: string): Promise<ProviderCapabilitySnapshot>;
  runtimeSummary(project: import("../types/index.js").ManagedProject | null, projectPath?: string): Promise<ProviderRuntimeSummary>;
  models: {
    read(projectPath?: string): Promise<ProviderModelSettingsSnapshot>;
    select(modelId: string | null, projectPath?: string): Promise<ProviderModelSettingsSnapshot>;
  };
  diagnostics(project: import("../types/index.js").ManagedProject | null, projectPath?: string): Promise<ProviderDiagnosticsSnapshot>;
  projectActions: {
    list(project: import("../types/index.js").ManagedProject | null, projectPath?: string): Promise<import("./types.js").ProviderProjectAction[]>;
    execute(actionId: string, project: import("../types/index.js").ManagedProject, projectPath: string): Promise<ProviderDiagnosticsSnapshot>;
  };
  skills: ProviderSkillCatalogPort;
  conversation: ConversationProviderPort;
  leafExecution: LeafExecutionProviderPort;
}
