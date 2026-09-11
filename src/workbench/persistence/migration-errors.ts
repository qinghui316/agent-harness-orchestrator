export class WorkbenchMigrationBusyError extends Error {
  readonly name = "WorkbenchMigrationBusyError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
