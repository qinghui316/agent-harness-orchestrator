import { createServer } from "node:http";

export function createApp() {
  return createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ service: "provider-golden", status: "ready" }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not-found" }));
  });
}
