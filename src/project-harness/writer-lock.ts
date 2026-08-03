import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { assertPhysicalDirectory } from "./path-safety.js";

export interface ProjectHarnessWriterLock {
  schemaVersion: "1.0";
  projectId: string;
  ownerId: string;
  operation: "init" | "migrate" | "change-publish" | "change-finalize" | "workflow-start" | "audit-accept" | "integration-finalize" | "evolution-publish";
  token: string;
  pid: number;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface WriterLockOptions {
  projectId: string;
  ownerId: string;
  operation: ProjectHarnessWriterLock["operation"];
  ttlMs?: number;
  now?: () => Date;
}

export interface WriterLockScope {
  lock: ProjectHarnessWriterLock;
  assertCurrent(): Promise<ProjectHarnessWriterLock>;
  heartbeat(): Promise<ProjectHarnessWriterLock>;
}

const DEFAULT_TTL_MS = 5 * 60_000;

export function projectHarnessSharedWriterRoot(sidecarRoot: string): string {
  return dirname(resolve(sidecarRoot));
}

export async function withProjectHarnessWriterLock<T>(
  sidecarRoot: string,
  options: WriterLockOptions,
  action: (scope: WriterLockScope) => Promise<T>,
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  assertWriterLockOptions(options, ttlMs);
  const now = options.now ?? (() => new Date());
  const lock = await claimProjectHarnessWriterLock(sidecarRoot, options, ttlMs, now());
  let heartbeatError: unknown;
  let heartbeatInFlight: Promise<void> = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (heartbeatError !== undefined) return;
      try {
        await heartbeatProjectHarnessWriterLock(sidecarRoot, lock.token, ttlMs, now());
      } catch (error) {
        heartbeatError = error;
      }
    });
  }, Math.max(10, Math.floor(ttlMs / 3)));

  let result: T | undefined;
  let actionError: unknown;
  try {
    result = await action({
      lock,
      assertCurrent: () => assertProjectHarnessWriterLockCurrent(sidecarRoot, lock.token, now()),
      heartbeat: () => heartbeatProjectHarnessWriterLock(sidecarRoot, lock.token, ttlMs, now()),
    });
    await assertProjectHarnessWriterLockCurrent(sidecarRoot, lock.token, now());
  } catch (error) {
    actionError = error;
  } finally {
    clearInterval(heartbeatTimer);
    await heartbeatInFlight;
  }
  if (actionError === undefined && heartbeatError !== undefined) actionError = heartbeatError;
  try {
    await releaseProjectHarnessWriterLock(sidecarRoot, lock.token);
  } catch (error) {
    if (actionError === undefined) actionError = error;
  }
  if (actionError !== undefined) throw actionError;
  return result as T;
}

export async function claimProjectHarnessWriterLock(
  sidecarRoot: string,
  options: WriterLockOptions,
  ttlMs = options.ttlMs ?? DEFAULT_TTL_MS,
  now = options.now?.() ?? new Date(),
): Promise<ProjectHarnessWriterLock> {
  assertWriterLockOptions(options, ttlMs);
  await mkdir(sidecarRoot, { recursive: true });
  const physicalRoot = await assertPhysicalDirectory(sidecarRoot, "project runtime sidecar");
  const lockDir = join(physicalRoot, "writer-lock");
  for (;;) {
    try {
      await mkdir(lockDir);
      const lock = createLock(options, ttlMs, now);
      await writeJsonFile(join(lockDir, "owner.json"), lock);
      return lock;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const current = await readProjectHarnessWriterLock(sidecarRoot);
      if (!current || Date.parse(current.expiresAt) > now.getTime()) {
        const detail = current ? `${current.operation} by ${current.ownerId}` : "an uninitialized owner";
        throw new Error(`Project Harness writer lock is already held by ${detail}.`);
      }
      const stale = join(physicalRoot, `writer-lock.stale.${current.token}.${randomUUID()}`);
      try {
        await rename(lockDir, stale);
        await rm(stale, { recursive: true, force: true });
      } catch (reclaimError) {
        const code = (reclaimError as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "EEXIST" && code !== "EPERM") throw reclaimError;
      }
    }
  }
}

export async function readProjectHarnessWriterLock(sidecarRoot: string): Promise<ProjectHarnessWriterLock | null> {
  const path = join(sidecarRoot, "writer-lock", "owner.json");
  if (!existsSync(path)) return null;
  const raw = parseJsonText(await readFile(path, "utf8"), path) as Partial<ProjectHarnessWriterLock>;
  if (raw.schemaVersion !== "1.0" || typeof raw.projectId !== "string" || typeof raw.ownerId !== "string"
    || typeof raw.operation !== "string" || typeof raw.token !== "string" || typeof raw.pid !== "number"
    || typeof raw.acquiredAt !== "string" || typeof raw.heartbeatAt !== "string" || typeof raw.expiresAt !== "string") {
    throw new Error(`Project Harness writer lock owner is invalid: ${path}`);
  }
  return raw as ProjectHarnessWriterLock;
}

export async function assertProjectHarnessWriterLockCurrent(
  sidecarRoot: string,
  token: string,
  now = new Date(),
): Promise<ProjectHarnessWriterLock> {
  const current = await readProjectHarnessWriterLock(sidecarRoot);
  if (!current || current.token !== token) throw new Error("Project Harness writer lock is not owned by this token.");
  if (Date.parse(current.expiresAt) <= now.getTime()) throw new Error("Project Harness writer lock has expired.");
  return current;
}

export async function heartbeatProjectHarnessWriterLock(
  sidecarRoot: string,
  token: string,
  ttlMs: number,
  now = new Date(),
): Promise<ProjectHarnessWriterLock> {
  assertTtl(ttlMs);
  const current = await assertProjectHarnessWriterLockCurrent(sidecarRoot, token, now);
  const next = {
    ...current,
    heartbeatAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  await writeJsonFile(join(sidecarRoot, "writer-lock", "owner.json"), next);
  return next;
}

export async function releaseProjectHarnessWriterLock(sidecarRoot: string, token: string): Promise<void> {
  const current = await readProjectHarnessWriterLock(sidecarRoot);
  if (!current || current.token !== token) throw new Error("Refusing to release another Project Harness writer lock.");
  await rm(join(sidecarRoot, "writer-lock"), { recursive: true });
}

function createLock(options: WriterLockOptions, ttlMs: number, now: Date): ProjectHarnessWriterLock {
  const timestamp = now.toISOString();
  return {
    schemaVersion: "1.0",
    projectId: options.projectId,
    ownerId: options.ownerId,
    operation: options.operation,
    token: randomUUID(),
    pid: process.pid,
    acquiredAt: timestamp,
    heartbeatAt: timestamp,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

function assertWriterLockOptions(options: WriterLockOptions, ttlMs: number): void {
  if (!options.projectId.trim()) throw new Error("Writer lock projectId must not be empty.");
  if (!options.ownerId.trim()) throw new Error("Writer lock ownerId must not be empty.");
  assertTtl(ttlMs);
}

function assertTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error("Writer lock ttlMs must be a positive integer.");
}
