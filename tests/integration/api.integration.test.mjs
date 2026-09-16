import assert from "node:assert/strict";
import test from "node:test";
import { createServer, connect } from "node:net";
import { once } from "node:events";
import { URL } from "node:url";
import { createApiApp } from "../../apps/api/dist/index.js";
import { createRedactedLogger, loadConfig } from "../../packages/core/dist/index.js";
import {
  PublicIdParamsSchema,
  ErrorEnvelopeSchema,
  validateRequest,
} from "../../packages/contracts/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

function quietLogger(lines = []) {
  return createRedactedLogger({ write: (line) => lines.push(line) });
}

test("HTTP contracts reject invalid input and hide raw failures", async (t) => {
  const lines = [];
  const runtime = createApiApp(
    loadConfig({ DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused" }),
    quietLogger(lines),
  );
  t.after(() => runtime.close());
  runtime.app.post(
    "/contract/:publicId",
    {
      schema: {
        params: PublicIdParamsSchema,
        response: { 200: PublicIdParamsSchema, 400: ErrorEnvelopeSchema },
      },
    },
    async (request) => ({ ...request.params, internalId: "123", password: "hidden-extra" }),
  );
  runtime.app.get("/failure", async () => {
    throw new Error("SELECT raw_json secret-marker personal-data");
  });
  const health = await runtime.app.inject("/health");
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });
  assert.equal(runtime.data.database.poolStats().total, 0);
  const valid = await runtime.app.inject({
    method: "POST",
    url: "/contract/01890f47-0c4d-7abc-8def-1234567890ab",
  });
  assert.deepEqual(valid.json(), { publicId: "01890f47-0c4d-7abc-8def-1234567890ab" });
  for (const [options, status] of [
    [
      { method: "POST", url: "/contract/123", headers: { "x-request-id": "untrusted-secret" } },
      400,
    ],
    [
      {
        method: "POST",
        url: "/contract/123",
        headers: { "content-type": "application/json" },
        payload: "{",
      },
      400,
    ],
    [
      {
        method: "POST",
        url: "/contract/123",
        headers: { "content-type": "text/plain" },
        payload: "x".repeat(1048577),
      },
      413,
    ],
    [{ url: "/missing?private=secret-marker" }, 404],
    [{ url: "/failure" }, 500],
  ]) {
    const response = await runtime.app.inject(options);
    assert.equal(response.statusCode, status);
    assert.ok(validateRequest(ErrorEnvelopeSchema, response.json(), "test").ok);
    assert.equal(response.json().error.requestId, response.headers["x-request-id"]);
    assert.notEqual(response.headers["x-request-id"], "untrusted-secret");
    assert.doesNotMatch(response.body, /secret-marker|personal-data|SELECT|untrusted-secret/);
  }
  assert.doesNotMatch(
    lines.join(""),
    /secret-marker|personal-data|SELECT|untrusted-secret|hidden-extra/,
  );
});

test(
  "readiness follows real DB connectivity, coalesces timed-out probes, and HTTP close drains work",
  { timeout: 20000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const target = new URL(fixture.connectionString);
    const sockets = new Set();
    let online = true;
    const proxy = createServer((client) => {
      if (!online) {
        client.destroy();
        return;
      }
      const upstream = connect({ host: target.hostname, port: Number(target.port || 5432) });
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on("error", () => {
          client.destroy();
          upstream.destroy();
        });
        socket.on("close", () => sockets.delete(socket));
      }
      client.pipe(upstream).pipe(client);
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const proxyUrl = new URL(target);
    proxyUrl.hostname = "127.0.0.1";
    proxyUrl.port = String(proxy.address().port);
    const config = loadConfig({
      DATABASE_URL: proxyUrl.toString(),
      DB_POOL_MAX: "1",
      DB_CONNECTION_TIMEOUT_MS: "500",
      API_READINESS_TIMEOUT_MS: "50",
    });
    const runtime = createApiApp(config, quietLogger());
    t.after(async () => {
      release?.();
      await runtime.close();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => proxy.close(resolve));
      await fixture.cleanup();
    });
    let release;
    let entered;
    const held = new Promise((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    runtime.app.get("/held", async () =>
      runtime.data.database.transaction(async () => {
        entered();
        await barrier;
        return { done: true };
      }),
    );
    const address = await runtime.app.listen({ host: "127.0.0.1", port: 0 });
    assert.equal((await runtime.app.inject("/ready")).statusCode, 200);
    online = false;
    for (const socket of sockets) socket.destroy();
    // Terminate both sides of existing DB connections, then reject new ones.
    assert.equal((await runtime.app.inject("/ready")).statusCode, 503);
    assert.equal((await runtime.app.inject("/health")).statusCode, 200);
    online = true;
    assert.equal((await runtime.app.inject("/ready")).statusCode, 200);
    await runtime.data.database.transaction(async () => {
      const probes = await Promise.all(
        Array.from({ length: 8 }, () => runtime.app.inject("/ready")),
      );
      assert.ok(probes.every((response) => response.statusCode === 503));
      assert.equal(runtime.data.database.poolStats().waiting, 1);
      assert.equal((await runtime.app.inject("/health")).statusCode, 200);
    });
    assert.equal((await runtime.app.inject("/ready")).statusCode, 200);
    const request = globalThis.fetch(`${address}/held`);
    await held;
    let closed = false;
    const closing = runtime.close().then(() => {
      closed = true;
    });
    assert.equal(closed, false);
    assert.equal(runtime.data.database.poolStats().total, 1);
    release();
    const response = await request;
    assert.equal(response.headers.get("connection"), "close");
    assert.deepEqual(await response.json(), { done: true });
    await closing;
    assert.equal(runtime.data.database.poolStats().total, 0);
    await assert.rejects(globalThis.fetch(`${address}/health`));
    await runtime.close();
  },
);
