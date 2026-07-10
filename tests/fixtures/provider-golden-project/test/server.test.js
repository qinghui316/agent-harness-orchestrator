import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/server.js";

test("GET / returns the service identity", async () => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await globalThis.fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: "provider-golden", status: "ready" });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
