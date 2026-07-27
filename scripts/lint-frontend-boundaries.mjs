import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const webRoot = resolve(root, "src/web/src");
const sourceRoot = resolve(root, "src");
const webFiles = await collectSourceFiles(webRoot);
const sourceFiles = await collectSourceFiles(sourceRoot);
const violations = [];

const timelineProtocolOwners = new Set([
  "src/web/src/canonicalTimelineController.ts",
  "src/web/src/canonicalTimelineStore.ts",
  "src/web/src/workbenchProjectionStream.ts",
  "src/web/src/types.ts",
]);
const projectionStreamOwner = "src/web/src/workbenchProjectionStream.ts";
const workspaceResourceOwner = "src/web/src/controllers/useWorkspaceResourceController.ts";
const appShellOwner = "src/web/src/App.tsx";
const appForbiddenDomainAccess = [
  "consumeWorkbenchLiveStream",
  "postJson",
  "/workbench/topics/live",
  "/messages/live",
  "/workbench/projections/agent-graph/",
  "/workspace-resources/resolve",
  "/providers/capabilities",
  "/providers/",
  "/skills",
  "/attachments",
];
const retiredSymbols = [
  "conversationTranscripts",
  "parentAgentTranscript",
  "messageCellIdsRef",
  "messagePlacementRef",
  "liveTranscript",
  "/workbench/projections/transcript/",
  "buildParentAgentTranscript",
  "buildAgentScopedTranscriptCells",
  "pageParentAgentTranscript",
  "appendConversationThreadEntry",
  "TopicThreadLogPage",
  "readConversationThreadPage",
  "encodeTopicThreadCursor",
  "decodeTopicThreadCursor",
  "listMessagesBeforePosition",
  "sendTopicMessageReplay",
  "/messages/stream",
  "inferStoredAgentSurfaceId",
  "child.canonicalId ??",
  "AgentOfficeProjection",
  "AgentOfficeSeat",
  "useAgentOfficeController",
  "/workbench/projections/agent-office/",
  "/agents/terminate",
  "terminateExactChildAgent",
  "pendingAgentTerminations",
  "terminateSelectedAgent",
  'event: "topic.message"',
  'event: "assistant.message"',
  "officeRuntimeCalibration.generated",
  "OFFICE_SCENE_CALIBRATION",
  "/__aho/agent-office-calibration",
  "calibrationAdjustment",
  "calibrationOffset",
];

for (const file of webFiles) {
  const relativePath = normalizePath(relative(root, file));
  const content = await readFile(file, "utf8");
  if (!timelineProtocolOwners.has(relativePath) && content.includes("timeline.patch")) {
    violations.push(`${relativePath}: Timeline SSE interpretation belongs to canonicalTimelineController`);
  }
  if (relativePath !== "src/web/src/canonicalTimelineController.ts"
    && /workbench\/conversations\/[^\s"'`]+\/timeline/.test(content)) {
    violations.push(`${relativePath}: Timeline HTTP requests belong to canonicalTimelineController`);
  }
  if (relativePath !== projectionStreamOwner && content.includes("/workbench/events/live")) {
    violations.push(`${relativePath}: project EventSource belongs to workbenchProjectionStream`);
  }
  if (relativePath !== workspaceResourceOwner && content.includes("/workspace-resources/resolve")) {
    violations.push(`${relativePath}: resource resolution belongs to useWorkspaceResourceController`);
  }
  if (relativePath === appShellOwner) {
    for (const symbol of appForbiddenDomainAccess) {
      if (content.includes(symbol)) violations.push(`${relativePath}: migrated domain access ${symbol} does not belong in the App shell`);
    }
  }
  if (content.includes("texture.trim")) {
    violations.push(`${relativePath}: Office/product coordinates must not compensate Pixi atlas trim`);
  }
  if (content.includes("new OfficeCalibrationResolver(")
    && relativePath !== "src/web/src/office/agentOfficeRuntimeComposition.ts") {
    violations.push(`${relativePath}: OfficeCalibrationResolver construction belongs to Agent Office runtime composition`);
  }
}

try {
  await readFile(resolve(root, "tests/unit/web-app.test.tsx"), "utf8");
  violations.push("tests/unit/web-app.test.tsx: retired giant App test must not return");
} catch (cause) {
  if (cause?.code !== "ENOENT") throw cause;
}

for (const file of sourceFiles) {
  const relativePath = normalizePath(relative(root, file));
  const content = await readFile(file, "utf8");
  for (const symbol of retiredSymbols) {
    if (content.includes(symbol)) violations.push(`${relativePath}: retired Timeline symbol ${symbol}`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`Frontend boundary lint failed:\n${violations.map((item) => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Frontend boundary lint passed (${webFiles.length} web files, ${sourceFiles.length} source files).\n`);

async function collectSourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectSourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}

function normalizePath(value) {
  return value.split(sep).join("/");
}
