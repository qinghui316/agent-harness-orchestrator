import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const officeCalibrationPath = resolve("design-assets/agent-office/calibration/scene-calibration-v3.json");
const officeCalibrationHistoryDirectory = resolve("design-assets/agent-office/calibration/history");
const officeCalibrationEndpoint = "/__aho/agent-office-calibration";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "agent-office-calibration-storage",
      configureServer(server) {
        let sessionBackupCreated = false;
        server.middlewares.use(officeCalibrationEndpoint, async (request, response) => {
          try {
            if (request.method === "GET") {
              const [source, fileStat] = await Promise.all([
                readFile(officeCalibrationPath, "utf8"),
                stat(officeCalibrationPath),
              ]);
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.setHeader("X-Calibration-Modified-At", String(fileStat.mtimeMs));
              response.end(source);
              return;
            }
            if (request.method === "PUT") {
              const source = await readRequestBody(request);
              const value: unknown = JSON.parse(source);
              if (!isCalibrationDocument(value)) throw new Error("Invalid Agent Office calibration document.");
              if (!sessionBackupCreated) {
                try {
                  const currentStat = await stat(officeCalibrationPath);
                  await mkdir(officeCalibrationHistoryDirectory, { recursive: true });
                  const timestamp = new Date(currentStat.mtimeMs).toISOString().replaceAll(":", "-");
                  await copyFile(officeCalibrationPath, resolve(officeCalibrationHistoryDirectory, `scene-calibration-v3.${timestamp}.json`));
                } catch (error) {
                  const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
                  if (!missing) throw error;
                }
                sessionBackupCreated = true;
              }
              await mkdir(dirname(officeCalibrationPath), { recursive: true });
              await writeFile(officeCalibrationPath, source.endsWith("\n") ? source : `${source}\n`, "utf8");
              const fileStat = await stat(officeCalibrationPath);
              response.statusCode = 204;
              response.setHeader("X-Calibration-Modified-At", String(fileStat.mtimeMs));
              response.end();
              return;
            }
            response.statusCode = 405;
            response.end();
          } catch (error) {
            const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
            response.statusCode = missing ? 404 : 400;
            response.end(missing ? "" : error instanceof Error ? error.message : String(error));
          }
        });
      },
    },
  ],
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});

async function readRequestBody(request: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2_000_000) throw new Error("Agent Office calibration document is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isCalibrationDocument(value: unknown): value is { schemaVersion: 3 } {
  return typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 3;
}
