import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseJsonText } from "../fs/json.js";

export interface StructuredIdentityRewriteResult {
  content: string;
  matchCount: number;
  beforeIdentityNeutralHash: string;
  afterIdentityNeutralHash: string;
}

interface JsonLocation {
  pointer: string;
  key: string | null;
  value: unknown;
}

const IDENTITY_SENTINEL = "__AHO_CANONICAL_PROJECT_ID__";

export async function rewriteStructuredProjectIdentity(
  path: string,
  sourceProjectId: string,
  targetProjectId: string,
  allowedIdentityPaths: readonly string[],
  required = true,
): Promise<StructuredIdentityRewriteResult> {
  const raw = await readFile(path, "utf8");
  const parsed = parseJsonText(raw, path);
  const patterns = normalizePatterns(allowedIdentityPaths, path);
  const before = structuredClone(parsed);
  let matchCount = 0;

  walkJson(parsed, [], null, (location, parent, token) => {
    if (typeof location.value !== "string") return;
    const allowed = patterns.some((pattern) => matchPointer(pattern, location.pointer));
    const identityKey = location.key !== null && isIdentityKey(location.key);
    if (location.value === targetProjectId && (allowed || identityKey)) {
      throw new Error(`Structured identity document already contains target project id at ${path}#${location.pointer}.`);
    }
    if (location.value !== sourceProjectId) return;
    if (!allowed) {
      if (identityKey) {
        throw new Error(`Unknown structured project identity record at ${path}#${location.pointer}.`);
      }
      return;
    }
    if (parent === null) throw new Error(`Structured identity document root cannot be a scalar: ${path}`);
    if (Array.isArray(parent)) parent[Number(token)] = targetProjectId;
    else parent[token] = targetProjectId;
    matchCount += 1;
  });

  if (required && matchCount === 0) {
    throw new Error(`Structured identity document has no allowlisted source project id: ${path}`);
  }
  assertNoUnknownStructuredIdentity(parsed, path, sourceProjectId, targetProjectId, patterns, true);
  const beforeHash = hashIdentityNeutralJson(before, patterns, sourceProjectId, targetProjectId);
  const afterHash = hashIdentityNeutralJson(parsed, patterns, sourceProjectId, targetProjectId);
  if (beforeHash !== afterHash) {
    throw new Error(`Structured identity rewrite changed non-identity content: ${path}`);
  }
  return {
    content: `${JSON.stringify(parsed, null, 2)}\n`,
    matchCount,
    beforeIdentityNeutralHash: beforeHash,
    afterIdentityNeutralHash: afterHash,
  };
}

export async function auditStructuredProjectIdentity(
  path: string,
  sourceProjectId: string,
  targetProjectId: string,
  allowedIdentityPaths: readonly string[] = [],
): Promise<void> {
  const raw = await readFile(path, "utf8");
  const parsed = parseJsonText(raw, path);
  assertNoUnknownStructuredIdentity(
    parsed,
    path,
    sourceProjectId,
    targetProjectId,
    normalizePatterns(allowedIdentityPaths, path),
    true,
  );
}

export async function auditJsonLinesProjectIdentity(
  path: string,
  sourceProjectId: string,
  targetProjectId: string,
): Promise<void> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    const location = `${path}#line-${index + 1}`;
    const parsed = parseJsonText(lines[index]!, location);
    walkJson(parsed, [], null, ({ key, value, pointer }) => {
      if (key !== null && isIdentityKey(key) && (value === sourceProjectId || value === targetProjectId)) {
        throw new Error(`Unclassified JSONL project identity at ${location}${pointer}.`);
      }
    });
  }
}

function assertNoUnknownStructuredIdentity(
  value: unknown,
  path: string,
  sourceProjectId: string,
  targetProjectId: string,
  patterns: readonly string[][],
  allowTargetAtAllowlistedPath: boolean,
): void {
  walkJson(value, [], null, (location) => {
    if (typeof location.value !== "string") return;
    const allowed = patterns.some((pattern) => matchPointer(pattern, location.pointer));
    const identityKey = location.key !== null && isIdentityKey(location.key);
    if (location.value === sourceProjectId && (allowed || identityKey)) {
      throw new Error(`Structured document retains source project identity at ${path}#${location.pointer}.`);
    }
    if (location.value === targetProjectId && identityKey && !(allowTargetAtAllowlistedPath && allowed)) {
      throw new Error(`Unknown structured target project identity at ${path}#${location.pointer}.`);
    }
  });
}

function hashIdentityNeutralJson(
  value: unknown,
  patterns: readonly string[][],
  sourceProjectId: string,
  targetProjectId: string,
): string {
  const normalized = normalizeJson(value, [], patterns, sourceProjectId, targetProjectId);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizeJson(
  value: unknown,
  tokens: string[],
  patterns: readonly string[][],
  sourceProjectId: string,
  targetProjectId: string,
): unknown {
  const pointer = toPointer(tokens);
  if (typeof value === "string"
    && (value === sourceProjectId || value === targetProjectId)
    && patterns.some((pattern) => matchPointer(pattern, pointer))) {
    return IDENTITY_SENTINEL;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeJson(item, [...tokens, String(index)], patterns, sourceProjectId, targetProjectId));
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [
      key,
      normalizeJson(object[key], [...tokens, key], patterns, sourceProjectId, targetProjectId),
    ]));
  }
  return value;
}

function walkJson(
  value: unknown,
  tokens: string[],
  key: string | null,
  visitor: (location: JsonLocation, parent: Record<string, unknown> | unknown[] | null, token: string) => void,
  parent: Record<string, unknown> | unknown[] | null = null,
  token = "",
): void {
  visitor({ pointer: toPointer(tokens), key, value }, parent, token);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, [...tokens, String(index)], null, visitor, value, String(index)));
    return;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const [childKey, child] of Object.entries(object)) {
      walkJson(child, [...tokens, childKey], childKey, visitor, object, childKey);
    }
  }
}

function normalizePatterns(patterns: readonly string[], path: string): string[][] {
  const normalized = patterns.map((pattern) => {
    if (!pattern.startsWith("/") || pattern.endsWith("/")) {
      throw new Error(`Invalid JSON identity pointer for ${path}: ${pattern}`);
    }
    return pattern.slice(1).split("/").map(decodePointerToken);
  });
  if (new Set(patterns).size !== patterns.length) {
    throw new Error(`Duplicate JSON identity pointer for ${path}.`);
  }
  return normalized;
}

function matchPointer(pattern: readonly string[], pointer: string): boolean {
  const tokens = pointer === "" ? [] : pointer.slice(1).split("/").map(decodePointerToken);
  return pattern.length === tokens.length && pattern.every((part, index) => part === "*" || part === tokens[index]);
}

function toPointer(tokens: readonly string[]): string {
  return tokens.length === 0 ? "" : `/${tokens.map(encodePointerToken).join("/")}`;
}

function encodePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isIdentityKey(key: string): boolean {
  return /^(?:id|project[_-]?id)$/i.test(key);
}
