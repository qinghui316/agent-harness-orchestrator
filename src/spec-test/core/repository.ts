import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../../fs/json.js";
import type { SpecTestMapping, SpecTestRef, SpecTests } from "../../types/index.js";
import { specTestsSchema } from "./schemas.js";

export async function createEmptySpecTests(changeDir: string, changeId: string): Promise<SpecTests> {
  const specTests: SpecTests = {
    version: "1.0",
    changeId,
    updatedAt: new Date().toISOString(),
    mappings: [],
  };
  await writeJsonFile(join(changeDir, "spec-tests.json"), specTests);
  return specTests;
}

export async function readOrCreateSpecTests(changeDir: string, changeId: string): Promise<SpecTests> {
  const path = join(changeDir, "spec-tests.json");
  if (!existsSync(path)) return createEmptySpecTests(changeDir, changeId);
  const parsed = await readRequiredJsonFile(path, specTestsSchema) as SpecTests;
  if (parsed.changeId !== changeId) {
    throw new Error(`spec-tests.json changeId mismatch. Expected ${changeId}; found ${parsed.changeId}.`);
  }
  return normalizeSpecTests(parsed);
}

export async function readSpecTestsOrDefault(changeDir: string, changeId: string): Promise<SpecTests> {
  const path = join(changeDir, "spec-tests.json");
  if (!existsSync(path)) {
    return { version: "1.0", changeId, updatedAt: new Date(0).toISOString(), mappings: [] };
  }
  const parsed = await readRequiredJsonFile(path, specTestsSchema) as SpecTests;
  if (parsed.changeId !== changeId) {
    throw new Error(`spec-tests.json changeId mismatch. Expected ${changeId}; found ${parsed.changeId}.`);
  }
  return normalizeSpecTests(parsed);
}

export async function writeSpecTests(changeDir: string, value: SpecTests): Promise<void> {
  await mkdir(changeDir, { recursive: true });
  await writeJsonFile(join(changeDir, "spec-tests.json"), normalizeSpecTests(value));
}

export function normalizeSpecTests(value: SpecTests): SpecTests {
  return {
    ...value,
    mappings: value.mappings
      .map((mapping) => ({
        acId: normalizeAcId(mapping.acId),
        refs: dedupeRefs(mapping.refs.map(normalizeRef)),
      }))
      .filter((mapping) => mapping.refs.length > 0)
      .sort((a, b) => a.acId.localeCompare(b.acId)),
  };
}

export function normalizeRef(ref: SpecTestRef): SpecTestRef {
  if (ref.type === "file") return { type: "file", path: normalizeSafeRepoPath(ref.path) };
  if (ref.type === "testName") return { type: "testName", name: ref.name.trim(), path: normalizeSafeRepoPath(ref.path) };
  if (ref.type === "command") return { type: "command", commandName: ref.commandName.trim() };
  return { type: "note", text: ref.text.trim() };
}

export function normalizeSafeRepoPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Evidence file path cannot be empty.");
  if (isAbsolute(trimmed)) throw new Error(`Evidence file path must be repo-relative: ${path}.`);
  if (trimmed.split(/[\\/]+/).includes("..")) throw new Error(`Evidence file path must not escape the project root: ${path}.`);
  const normalized = normalize(trimmed).replace(/\\/g, "/");
  if (normalized === "." || normalized.startsWith("../") || normalized === ".." || normalized.includes("/../")) {
    throw new Error(`Evidence file path must not escape the project root: ${path}.`);
  }
  return normalized;
}

export function normalizeAcId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^AC-\d{3,}$/.test(normalized)) throw new Error(`Invalid Acceptance Criterion ID: ${value}.`);
  return normalized;
}

function dedupeRefs(refs: SpecTestRef[]): SpecTestRef[] {
  const seen = new Set<string>();
  const result: SpecTestRef[] = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result.sort((a, b) => refKey(a).localeCompare(refKey(b)));
}

function refKey(ref: SpecTestRef): string {
  if (ref.type === "file") return `file:${ref.path}`;
  if (ref.type === "testName") return `testName:${ref.path}:${ref.name}`;
  if (ref.type === "command") return `command:${ref.commandName}`;
  return `note:${ref.text}`;
}

export function upsertSpecTestRefs(mappings: SpecTestMapping[], acId: string, refs: SpecTestRef[]): SpecTestMapping[] {
  const existing = mappings.find((mapping) => mapping.acId === acId);
  if (!existing) return normalizeSpecTests({ version: "1.0", changeId: "", updatedAt: "", mappings: [...mappings, { acId, refs }] }).mappings;
  return normalizeSpecTests({
    version: "1.0",
    changeId: "",
    updatedAt: "",
    mappings: mappings.map((mapping) => mapping.acId === acId ? { ...mapping, refs: [...mapping.refs, ...refs] } : mapping),
  }).mappings;
}

export function removeSpecTestRefs(mappings: SpecTestMapping[], acId: string, refs: SpecTestRef[]): SpecTestMapping[] {
  const keys = new Set(refs.map(refKey));
  return normalizeSpecTests({
    version: "1.0",
    changeId: "",
    updatedAt: "",
    mappings: mappings.map((mapping) => mapping.acId === acId
      ? { ...mapping, refs: mapping.refs.filter((ref) => !keys.has(refKey(ref))) }
      : mapping),
  }).mappings;
}
