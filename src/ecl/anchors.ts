import type { AcceptanceCriterion, AcMap, ParsedTask, ReviewStatus } from "../types/index.js";

export interface ParsedAcceptanceCriteria {
  criteria: Array<Omit<AcceptanceCriterion, "taskIds" | "validationRefs" | "warnings"> & { line: number }>;
  duplicateIds: string[];
}

export interface ParsedTasks {
  tasks: Array<ParsedTask & { line: number }>;
  coversWithoutTask: string[];
}

export interface PlaceholderWarning {
  file: string;
  line: number;
  text: string;
}

const acPattern = /\bAC-\d{3,}\b/gi;

export function parseAcceptanceCriteria(content: string): ParsedAcceptanceCriteria {
  const criteria: ParsedAcceptanceCriteria["criteria"] = [];
  const seen = new Set<string>();
  const duplicateSet = new Set<string>();
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = /^\s*[-*]\s*(?:\[[ xX]\]\s*)?(AC-\d{3,})\s*:\s*(.*?)\s*$/i.exec(line);
    if (!match) return;
    const id = match[1].toUpperCase();
    if (seen.has(id)) duplicateSet.add(id);
    seen.add(id);
    criteria.push({
      id,
      text: match[2],
      line: index + 1,
    });
  });

  return {
    criteria,
    duplicateIds: [...duplicateSet].sort(),
  };
}

export function parseTasks(content: string): ParsedTasks {
  const tasks: ParsedTasks["tasks"] = [];
  const coversWithoutTask: string[] = [];
  const lines = content.split(/\r?\n/);
  let currentTask: (ParsedTask & { line: number }) | null = null;

  lines.forEach((line, index) => {
    const taskMatch = /^\s*[-*]\s*\[([ xX])\]\s*(T-\d{3,})\s*:\s*(.*?)\s*$/i.exec(line);
    if (taskMatch) {
      currentTask = {
        id: taskMatch[2].toUpperCase(),
        text: taskMatch[3],
        acIds: [],
        done: taskMatch[1].toLowerCase() === "x",
        warnings: [],
        line: index + 1,
      };
      tasks.push(currentTask);
      return;
    }

    const coversMatch = /^\s*[-*]\s*Covers:\s*(.*?)\s*$/i.exec(line);
    if (!coversMatch) return;

    const acIds = extractAcIds(coversMatch[1]);
    if (!currentTask) {
      coversWithoutTask.push(`tasks.md:${index + 1} has Covers without a preceding task.`);
      return;
    }

    for (const acId of acIds) {
      if (!currentTask.acIds.includes(acId)) currentTask.acIds.push(acId);
    }
  });

  return { tasks, coversWithoutTask };
}

export function parseReviewStatus(content: string | null): ReviewStatus {
  if (content === null) return "missing";
  const match = /^\uFEFF?Status:\s*([a-z-]+)\s*\.?\s*$/im.exec(content);
  if (!match) return "missing";
  const normalized = match[1].toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "approved-with-notes" ||
    normalized === "blocked"
  ) {
    return normalized;
  }
  return "unknown";
}

export function detectPlaceholderWarnings(files: Array<{ path: string; content: string }>): PlaceholderWarning[] {
  const warnings: PlaceholderWarning[] = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isPlaceholderLine(line)) {
        warnings.push({ file: file.path, line: index + 1, text: line.trim() });
      }
    });
  }
  return warnings;
}

export function buildAcMap(input: {
  changeId: string;
  specContent: string;
  tasksContent: string;
  placeholderFiles: Array<{ path: string; content: string }>;
}): AcMap {
  const parsedAcs = parseAcceptanceCriteria(input.specContent);
  const parsedTasks = parseTasks(input.tasksContent);
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const acIds = new Set(parsedAcs.criteria.map((criterion) => criterion.id));
  const taskIdsByAc = new Map<string, string[]>();

  if (parsedAcs.criteria.length === 0) {
    blockingIssues.push("spec.md must contain at least one Acceptance Criterion ID such as AC-001.");
  }

  for (const duplicateId of parsedAcs.duplicateIds) {
    blockingIssues.push(`Duplicate Acceptance Criterion ID: ${duplicateId}.`);
  }

  for (const message of parsedTasks.coversWithoutTask) {
    warnings.push(message);
  }

  for (const task of parsedTasks.tasks) {
    if (task.acIds.length === 0) {
      task.warnings.push(`Task ${task.id} has no AC mapping.`);
      warnings.push(`Task ${task.id} has no AC mapping.`);
    }
    if (!task.done) {
      task.warnings.push(`Task ${task.id} is unchecked.`);
      warnings.push(`Task ${task.id} is unchecked.`);
    }
    for (const acId of task.acIds) {
      if (!acIds.has(acId)) {
        blockingIssues.push(`Task ${task.id} references unknown Acceptance Criterion ${acId}.`);
        continue;
      }
      const existing = taskIdsByAc.get(acId) ?? [];
      existing.push(task.id);
      taskIdsByAc.set(acId, existing);
    }
  }

  const acceptanceCriteria: AcceptanceCriterion[] = parsedAcs.criteria.map((criterion) => {
    const taskIds = taskIdsByAc.get(criterion.id) ?? [];
    const criterionWarnings = taskIds.length === 0 ? [`${criterion.id} has no task mapping.`] : [];
    warnings.push(...criterionWarnings);
    return {
      id: criterion.id,
      text: criterion.text,
      taskIds,
      validationRefs: [],
      warnings: criterionWarnings,
    };
  });

  for (const placeholder of detectPlaceholderWarnings(input.placeholderFiles)) {
    warnings.push(`${placeholder.file}:${placeholder.line} unresolved placeholder: ${placeholder.text}`);
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    changeId: input.changeId,
    acceptanceCriteria,
    tasks: parsedTasks.tasks.map(({ line: _line, ...task }) => task),
    warnings: uniqueSorted(warnings),
    blockingIssues: uniqueSorted(blockingIssues),
  };
}

function extractAcIds(value: string): string[] {
  return [...value.matchAll(acPattern)].map((match) => match[0].toUpperCase());
}

function isPlaceholderLine(line: string): boolean {
  const trimmed = line.trim();
  return /^TBD$/i.test(trimmed) || /^[-*]\s*TBD$/i.test(trimmed) || /^[-*]\s*\[\s\]\s*TBD$/i.test(trimmed);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
