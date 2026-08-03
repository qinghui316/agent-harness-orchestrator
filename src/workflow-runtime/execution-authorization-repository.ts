import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { LocalExecutionAuthorization, TransitionExecution } from "../types/index.js";
import { localExecutionAuthorizationSchema, transitionExecutionSchema } from "./execution-authorization-schema.js";

interface JsonRow { json: string }
const projectionWrites = new Map<string, Promise<void>>();

export interface ExecutionAuthorizationTransaction {
  getAuthorization(id: string): LocalExecutionAuthorization | null;
  putAuthorization(value: LocalExecutionAuthorization): void;
  getExecution(operationId: string): TransitionExecution | null;
  putExecution(value: TransitionExecution): void;
  countCompletionReservations(authorizationId: string): number;
}

function root(memory: ProjectRunsPathPort): string {
  return join(memory.runsRoot, "execution-authorization");
}

export function executionAuthorizationDatabasePath(memory: ProjectRunsPathPort): string {
  return join(root(memory), "coordination.sqlite");
}

export function executionAuthorizationPath(memory: ProjectRunsPathPort, authorizationId: string): string {
  return join(root(memory), "authorizations", `${authorizationId}.json`);
}

export function transitionExecutionPath(memory: ProjectRunsPathPort, operationId: string): string {
  return join(root(memory), "operations", operationId, "execution.json");
}

export function runExecutionAuthorizationTransaction<T>(
  memory: ProjectRunsPathPort,
  action: (transaction: ExecutionAuthorizationTransaction) => T,
): T {
  return withDatabase(memory, (database) => database.transaction(() => action(transactionStore(database))).immediate());
}

export async function projectExecutionAuthorizationState(
  memory: ProjectRunsPathPort,
  authorization?: LocalExecutionAuthorization | null,
  execution?: TransitionExecution | null,
): Promise<void> {
  if (authorization) {
    const path = executionAuthorizationPath(memory, authorization.id);
    await serializeProjectionWrite(path, () => writeJsonFile(path, authorization));
  }
  if (execution) {
    const path = transitionExecutionPath(memory, execution.operationId);
    await serializeProjectionWrite(path, () => writeJsonFile(path, execution));
  }
}

async function serializeProjectionWrite(path: string, write: () => Promise<void>): Promise<void> {
  const previous = projectionWrites.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(write);
  projectionWrites.set(path, current);
  try {
    await current;
  } finally {
    if (projectionWrites.get(path) === current) projectionWrites.delete(path);
  }
}

export async function readExecutionAuthorization(memory: ProjectRunsPathPort, authorizationId: string) {
  const value = withDatabase(memory, (database) => transactionStore(database).getAuthorization(authorizationId));
  if (!value) throw missing(`Execution authorization not found: ${authorizationId}.`);
  await projectExecutionAuthorizationState(memory, value);
  return value;
}

export async function readTransitionExecution(memory: ProjectRunsPathPort, operationId: string) {
  const value = withDatabase(memory, (database) => transactionStore(database).getExecution(operationId));
  if (!value) throw missing(`Transition execution not found: ${operationId}.`);
  await projectExecutionAuthorizationState(memory, null, value);
  return value;
}

export async function rebuildExecutionAuthorizationProjections(memory: ProjectRunsPathPort): Promise<void> {
  const state = withDatabase(memory, (database) => ({
    authorizations: (database.prepare("SELECT json FROM execution_authorizations").all() as JsonRow[])
      .map((row) => localExecutionAuthorizationSchema.parse(JSON.parse(row.json))),
    executions: (database.prepare("SELECT json FROM transition_executions").all() as JsonRow[])
      .map((row) => transitionExecutionSchema.parse(JSON.parse(row.json))),
  }));
  for (const authorization of state.authorizations) await projectExecutionAuthorizationState(memory, authorization);
  for (const execution of state.executions) await projectExecutionAuthorizationState(memory, null, execution);
}

// Projection-only readers are useful for diagnostics; coordination never reads them.
export function readExecutionAuthorizationProjection(memory: ProjectRunsPathPort, authorizationId: string) {
  return readRequiredJsonFile(executionAuthorizationPath(memory, authorizationId), localExecutionAuthorizationSchema);
}

function withDatabase<T>(memory: ProjectRunsPathPort, action: (database: Database.Database) => T): T {
  const path = executionAuthorizationDatabasePath(memory);
  mkdirSync(root(memory), { recursive: true });
  const database = new Database(path);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 10000");
    database.exec(`
      CREATE TABLE IF NOT EXISTS execution_authorizations (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transition_executions (
        operation_id TEXT PRIMARY KEY,
        authorization_id TEXT NOT NULL,
        status TEXT NOT NULL,
        fencing_token INTEGER NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS transition_execution_authorization_status
        ON transition_executions (authorization_id, status);
    `);
    return action(database);
  } finally {
    database.close();
  }
}

function transactionStore(database: Database.Database): ExecutionAuthorizationTransaction {
  return {
    getAuthorization(id) {
      const row = database.prepare("SELECT json FROM execution_authorizations WHERE id = ?").get(id) as JsonRow | undefined;
      return row ? localExecutionAuthorizationSchema.parse(JSON.parse(row.json)) : null;
    },
    putAuthorization(value) {
      const parsed = localExecutionAuthorizationSchema.parse(value);
      database.prepare(`
        INSERT INTO execution_authorizations (id, status, epoch, json) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, epoch = excluded.epoch, json = excluded.json
      `).run(parsed.id, parsed.status, parsed.epoch, JSON.stringify(parsed));
    },
    getExecution(operationId) {
      const row = database.prepare("SELECT json FROM transition_executions WHERE operation_id = ?").get(operationId) as JsonRow | undefined;
      return row ? transitionExecutionSchema.parse(JSON.parse(row.json)) : null;
    },
    putExecution(value) {
      const parsed = transitionExecutionSchema.parse(value);
      database.prepare(`
        INSERT INTO transition_executions (operation_id, authorization_id, status, fencing_token, json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(operation_id) DO UPDATE SET
          authorization_id = excluded.authorization_id,
          status = excluded.status,
          fencing_token = excluded.fencing_token,
          json = excluded.json
      `).run(parsed.operationId, parsed.authorizationId, parsed.status, parsed.fencingToken, JSON.stringify(parsed));
    },
    countCompletionReservations(authorizationId) {
      const rows = database.prepare("SELECT json FROM transition_executions WHERE authorization_id = ?").all(authorizationId) as JsonRow[];
      return rows
        .map((row) => transitionExecutionSchema.parse(JSON.parse(row.json)))
        .filter((execution) => execution.commitPointReservedAt !== null || execution.status === "completed")
        .length;
    },
  };
}

function missing(message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}
