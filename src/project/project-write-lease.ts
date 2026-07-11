import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ProjectWriteLease,
  ProjectWriteLeaseClaim,
  ProjectWriteLeaseIdentity,
} from "../types/index.js";

const LEASE_VERSION = "1.0" as const;
const DEFAULT_LEASE_TTL_MS = 5 * 60_000;

export interface ProjectWriteLeaseScope {
  lease: ProjectWriteLease;
  assertCurrent(): Promise<ProjectWriteLease>;
  heartbeat(): Promise<ProjectWriteLease>;
}

export interface ProjectWriteLeaseScopeOptions {
  holderId?: string;
  ttlMs?: number;
}

interface LeaseRow {
  lastFencingToken: number;
  holderId: string | null;
  fencingToken: number | null;
  acquiredAt: string | null;
  heartbeatAt: string | null;
  expiresAt: string | null;
}

export function projectWriteLeasePath(projectPath: string): string {
  return join(projectPath, ".agent-harness", "project-write-lease.sqlite");
}

export async function readProjectWriteLease(projectPath: string): Promise<ProjectWriteLease | null> {
  return withDatabase(projectPath, (database) => leaseFromRow(readRow(database)));
}

export async function withProjectWriteLease<T>(
  projectPath: string,
  options: ProjectWriteLeaseScopeOptions,
  action: (scope: ProjectWriteLeaseScope) => Promise<T>,
): Promise<T> {
  const holderId = options.holderId?.trim() || `project-write-${randomUUID()}`;
  const ttlMs = options.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const lease = await claimProjectWriteLease(projectPath, { holderId, ttlMs });
  if (!lease) throw new Error("Project write lease is already held by another operation.");
  const identity = { holderId: lease.holderId, fencingToken: lease.fencingToken };
  let heartbeatError: unknown;
  let heartbeatInFlight: Promise<void> = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (heartbeatError === undefined) {
        try {
          await heartbeatProjectWriteLease(projectPath, identity, ttlMs);
        } catch (error) {
          heartbeatError = error;
        }
      }
    });
  }, Math.max(1, Math.floor(ttlMs / 3)));

  let actionResult: T | undefined;
  let actionError: unknown;
  try {
    actionResult = await action({
      lease,
      assertCurrent: () => assertProjectWriteLeaseCurrent(projectPath, identity),
      heartbeat: () => heartbeatProjectWriteLease(projectPath, identity, ttlMs),
    });
  } catch (error) {
    actionError = error;
  }
  clearInterval(heartbeatTimer);
  await heartbeatInFlight;
  if (actionError === undefined && heartbeatError !== undefined) actionError = heartbeatError;
  try {
    await releaseProjectWriteLease(projectPath, identity);
  } catch (releaseError) {
    if (actionError === undefined) throw releaseError;
  }
  if (actionError !== undefined) throw actionError;
  return actionResult as T;
}

export async function claimProjectWriteLease(
  projectPath: string,
  claim: ProjectWriteLeaseClaim,
  now = new Date(),
): Promise<ProjectWriteLease | null> {
  assertClaim(claim);
  return withDatabase(projectPath, (database) => database.transaction(() => {
    const row = readRow(database);
    if (row.holderId && row.expiresAt && Date.parse(row.expiresAt) > now.getTime()) return null;
    const fencingToken = row.lastFencingToken + 1;
    const timestamp = now.toISOString();
    const lease: ProjectWriteLease = {
      version: LEASE_VERSION,
      holderId: claim.holderId,
      fencingToken,
      acquiredAt: timestamp,
      heartbeatAt: timestamp,
      expiresAt: new Date(now.getTime() + claim.ttlMs).toISOString(),
    };
    writeLease(database, lease, fencingToken);
    return lease;
  }).immediate());
}

export async function heartbeatProjectWriteLease(
  projectPath: string,
  identity: ProjectWriteLeaseIdentity,
  ttlMs: number,
  now = new Date(),
): Promise<ProjectWriteLease> {
  assertTtl(ttlMs);
  return withDatabase(projectPath, (database) => database.transaction(() => {
    const current = requireCurrentLease(readRow(database), identity, now);
    const renewed = {
      ...current,
      heartbeatAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    writeLease(database, renewed, current.fencingToken);
    return renewed;
  }).immediate());
}

export async function assertProjectWriteLeaseCurrent(
  projectPath: string,
  identity: ProjectWriteLeaseIdentity,
  now = new Date(),
): Promise<ProjectWriteLease> {
  return withDatabase(projectPath, (database) => requireCurrentLease(readRow(database), identity, now));
}

export async function releaseProjectWriteLease(
  projectPath: string,
  identity: ProjectWriteLeaseIdentity,
  now = new Date(),
): Promise<void> {
  withDatabase(projectPath, (database) => database.transaction(() => {
    const current = requireCurrentLease(readRow(database), identity, now);
    database.prepare(`
      UPDATE project_write_lease
      SET holder_id = NULL, fencing_token = NULL, acquired_at = NULL,
          heartbeat_at = NULL, expires_at = NULL
      WHERE id = 1 AND holder_id = ? AND fencing_token = ?
    `).run(current.holderId, current.fencingToken);
  }).immediate());
}

function withDatabase<T>(projectPath: string, action: (database: Database.Database) => T): T {
  const path = projectWriteLeasePath(projectPath);
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 10000");
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_write_lease (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_fencing_token INTEGER NOT NULL,
        holder_id TEXT,
        fencing_token INTEGER,
        acquired_at TEXT,
        heartbeat_at TEXT,
        expires_at TEXT
      );
      INSERT OR IGNORE INTO project_write_lease (id, last_fencing_token) VALUES (1, 0);
    `);
    return action(database);
  } finally {
    database.close();
  }
}

function readRow(database: Database.Database): LeaseRow {
  return database.prepare(`
    SELECT last_fencing_token AS lastFencingToken, holder_id AS holderId,
      fencing_token AS fencingToken, acquired_at AS acquiredAt,
      heartbeat_at AS heartbeatAt, expires_at AS expiresAt
    FROM project_write_lease WHERE id = 1
  `).get() as LeaseRow;
}

function writeLease(database: Database.Database, lease: ProjectWriteLease, lastFencingToken: number): void {
  database.prepare(`
    UPDATE project_write_lease
    SET last_fencing_token = ?, holder_id = ?, fencing_token = ?, acquired_at = ?,
        heartbeat_at = ?, expires_at = ?
    WHERE id = 1
  `).run(lastFencingToken, lease.holderId, lease.fencingToken, lease.acquiredAt, lease.heartbeatAt, lease.expiresAt);
}

function leaseFromRow(row: LeaseRow): ProjectWriteLease | null {
  if (!row.holderId || !row.fencingToken || !row.acquiredAt || !row.heartbeatAt || !row.expiresAt) return null;
  return {
    version: LEASE_VERSION,
    holderId: row.holderId,
    fencingToken: row.fencingToken,
    acquiredAt: row.acquiredAt,
    heartbeatAt: row.heartbeatAt,
    expiresAt: row.expiresAt,
  };
}

function requireCurrentLease(row: LeaseRow, identity: ProjectWriteLeaseIdentity, now: Date): ProjectWriteLease {
  const lease = leaseFromRow(row);
  if (!lease || lease.holderId !== identity.holderId || lease.fencingToken !== identity.fencingToken) {
    throw new Error("Project write lease is not owned by the supplied holder and fencing token.");
  }
  if (Date.parse(lease.expiresAt) <= now.getTime()) throw new Error("Project write lease has expired.");
  return lease;
}

function assertClaim(claim: ProjectWriteLeaseClaim): void {
  if (!claim.holderId.trim()) throw new Error("Project write lease holderId must not be empty.");
  assertTtl(claim.ttlMs);
}

function assertTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error("Project write lease ttlMs must be a positive integer.");
}
