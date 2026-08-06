import type { RunMetadata } from "../types/index.js";

export function assertPortableRunId(runId: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,199}$/.test(runId)) {
    throw new Error(`Run id is not portable: ${runId}`);
  }
}

export function expectedRunArtifactDirectory(runId: string): string {
  assertPortableRunId(runId);
  return `runs/${runId}`;
}

export function assertRunArtifactDirectory(
  run: Pick<RunMetadata, "id" | "artifacts">,
): string {
  const expected = expectedRunArtifactDirectory(run.id);
  if (run.artifacts.directory !== expected) {
    throw new Error(
      `Run artifact directory mismatch for ${run.id}: expected ${expected}, found ${run.artifacts.directory}.`,
    );
  }
  return expected;
}
