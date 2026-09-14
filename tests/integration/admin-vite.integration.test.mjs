import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { createServer as createViteServer } from "../../apps/admin/node_modules/vite/dist/node/index.js";

test("Admin Vite dev server serves the SPA and proxies /health", async (context) => {
  const healthServer = createHttpServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    response.writeHead(404).end();
  });
  healthServer.listen(0, "127.0.0.1");
  await once(healthServer, "listening");

  const healthAddress = healthServer.address();
  assert.notEqual(healthAddress, null);
  assert.equal(typeof healthAddress, "object");
  process.env.VITE_API_PROXY_TARGET = `http://127.0.0.1:${String(healthAddress.port)}`;

  const adminRoot = resolve(import.meta.dirname, "../../apps/admin");
  const vite = await createViteServer({
    configFile: resolve(adminRoot, "vite.config.ts"),
    logLevel: "silent",
    root: adminRoot,
    server: { port: 0, strictPort: false },
  });

  context.after(async () => {
    delete process.env.VITE_API_PROXY_TARGET;
    await vite.close();
    healthServer.close();
    await once(healthServer, "close");
  });

  await vite.listen();
  const address = vite.httpServer?.address();
  assert.notEqual(address, null);
  assert.notEqual(address, undefined);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${String(address.port)}`;

  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>BROS Admin<\/title>/);

  const entry = await fetch(`${origin}/src/main.tsx`);
  assert.equal(entry.status, 200);
  const entrySource = await entry.text();
  assert.match(entrySource, /createRoot/);
  assert.match(entrySource, /BrowserRouter/);

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
});
