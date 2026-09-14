import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createBrowserArtifactService,
  createBrowserManager,
} from "../../packages/browser/dist/index.js";
import { createLocalObjectStorage } from "../../packages/storage/dist/index.js";

const runPublicId = "018f0cb2-ef9d-7b29-a13d-9a4f00000010";

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("captures a real browser artifact and enforces signed preview expiry", async () => {
  const root = await mkdtemp(join(tmpdir(), "bros-p5-10-"));
  let now = new Date("2026-09-14T02:03:04.000Z");
  const storage = createLocalObjectStorage({
    now: () => now,
    root,
    signingSecret: new Uint8Array(32).fill(10),
  });
  const service = createBrowserArtifactService({
    authorization: {
      authorize: async ({ actor }) => actor?.role === "ADMIN",
    },
    now: () => now,
    storage,
  });
  const manager = createBrowserManager();

  try {
    const artifact = await manager.withBrowser(undefined, async (browser) => {
      const page = await browser.newPage();
      await page.setContent("<main><h1>BROS artifact integration</h1></main>");
      return service.createRun({ runPublicId }).captureScreenshot("failure", page);
    });

    assert.equal(artifact.objectKey, `automation/2026/09/14/${runPublicId}/failure.png`);
    assert.equal(artifact.retainUntil, "2026-09-28T02:03:04.000Z");

    await assert.rejects(
      service.getAuthorizedPreviewUrl({ actor: { role: "VIEWER" }, objectKey: artifact.objectKey }),
      { code: "ARTIFACT_ACCESS_DENIED" },
    );

    const previewUrl = await service.getAuthorizedPreviewUrl({
      actor: { role: "ADMIN" },
      objectKey: artifact.objectKey,
    });
    const png = await readStream(await storage.getObjectBySignedUrl(previewUrl));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    now = new Date("2026-09-14T02:08:04.000Z");
    await assert.rejects(storage.getObjectBySignedUrl(previewUrl), {
      code: "INVALID_SIGNED_URL_EXPIRY",
    });
  } finally {
    await manager.close();
    await rm(root, { force: true, recursive: true });
  }
});
