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
  "src/web/src/types.ts",
]);
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
  'event: "topic.message"',
  'event: "assistant.message"',
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
