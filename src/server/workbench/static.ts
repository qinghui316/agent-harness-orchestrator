import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isWithinDirectory, sendJson } from "./http.js";

export async function serveStatic(staticRoot: string, pathname: string, response: ServerResponse): Promise<void> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(staticRoot, `.${safePath}`);
  if (!isWithinDirectory(filePath, staticRoot)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }
  const target = existsSync(filePath) ? filePath : resolve(staticRoot, "index.html");
  if (!isWithinDirectory(target, staticRoot) || !existsSync(target)) {
    sendJson(response, 404, { error: "Workbench web build not found. Run `npm run build` first." });
    return;
  }
  const stats = await stat(target);
  if (!stats.isFile()) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentTypeFor(target),
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(await readFile(target));
}

export function defaultStaticRoot(): string {
  return join(fileURLToPath(new URL("../../../dist", import.meta.url)), "web");
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    case ".webp":
      return "image/webp";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
