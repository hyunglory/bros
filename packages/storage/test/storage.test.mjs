import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReadableStream } from "node:stream/web";
import test from "node:test";
import { TextEncoder } from "node:util";
import {
  StorageError,
  buildObjectKey,
  createLocalObjectStorage,
  createObjectStorage,
  validateObjectKey,
} from "../dist/index.js";

async function createFixture(context, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "bros-storage-"));
  context.after(async () => {
    await rm(root, { force: true, recursive: true });
  });
  return {
    root,
    storage: createLocalObjectStorage({
      root,
      signingSecret: new Uint8Array(32).fill(7),
      ...options,
    }),
  };
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

test("validates portable object keys and rejects traversal variants", () => {
  assert.equal(
    buildObjectKey(
      "automation",
      "2026",
      "09",
      "13",
      "01890f47-0c4d-7abc-8def-1234567890ab",
      "final.png",
    ),
    "automation/2026/09/13/01890f47-0c4d-7abc-8def-1234567890ab/final.png",
  );

  for (const key of [
    "../outside.txt",
    "safe/../../outside.txt",
    "/absolute.txt",
    "safe\\outside.txt",
    "safe//file.txt",
    "safe/./file.txt",
    "safe/%2e%2e/file.txt",
    "safe/C:/file.txt",
    "safe/CON.txt",
    "safe/file.txt/",
  ]) {
    assert.throws(
      () => validateObjectKey(key),
      (error) => {
        assert.ok(error instanceof StorageError);
        assert.equal(error.code, "INVALID_OBJECT_KEY");
        assert.doesNotMatch(error.message, /outside|absolute|CON/);
        return true;
      },
    );
  }
});

test("puts buffers and streams atomically, reads them, and reports logical metadata", async (context) => {
  const { root, storage } = await createFixture(context, { bucket: "development" });
  const first = await storage.putObject({
    body: new TextEncoder().encode("first"),
    key: "images/one/source.bin",
  });
  assert.deepEqual(first, {
    bucket: "development",
    objectKey: "images/one/source.bin",
    provider: "LOCAL",
    size: 5,
  });

  const streamBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("second"));
      controller.enqueue(new TextEncoder().encode("-version"));
      controller.close();
    },
  });
  await storage.putObject({ body: streamBody, key: "images/one/source.bin" });

  assert.equal(
    (await readStream(await storage.getObject("images/one/source.bin"))).toString(),
    "second-version",
  );
  assert.equal(
    (await readFile(join(root, "images", "one", "source.bin"))).toString(),
    "second-version",
  );
  assert.deepEqual(await readdir(join(root, "images", "one")), ["source.bin"]);
});

test("delete is idempotent and missing reads have a stable safe error", async (context) => {
  const { storage } = await createFixture(context);
  await storage.putObject({ body: new Uint8Array([1, 2, 3]), key: "objects/item.bin" });
  await storage.deleteObject("objects/item.bin");
  await storage.deleteObject("objects/item.bin");

  await assert.rejects(storage.getObject("objects/item.bin"), (error) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, "OBJECT_NOT_FOUND");
    assert.equal(error.message, "Stored object does not exist");
    return true;
  });
});

test("rejects an ancestor symlink instead of escaping the storage root", async (context) => {
  const { root, storage } = await createFixture(context);
  const outside = await mkdtemp(join(tmpdir(), "bros-storage-outside-"));
  context.after(async () => {
    await rm(outside, { force: true, recursive: true });
  });
  await mkdir(join(root, "objects"));
  await writeFile(join(outside, "protected.bin"), "preserved");
  await symlink(outside, join(root, "objects", "escape"), "junction");

  await assert.rejects(
    storage.putObject({ body: new Uint8Array([1]), key: "objects/escape/outside.bin" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_IO_ERROR");
      return true;
    },
  );
  await assert.rejects(readFile(join(outside, "outside.bin")), { code: "ENOENT" });
  await assert.rejects(storage.getObject("objects/escape/protected.bin"), {
    code: "STORAGE_IO_ERROR",
  });
  await assert.rejects(storage.deleteObject("objects/escape/protected.bin"), {
    code: "STORAGE_IO_ERROR",
  });
  assert.equal((await readFile(join(outside, "protected.bin"))).toString(), "preserved");
});

test("creates root-private signed local URLs and rejects expiry or tampering", async (context) => {
  let now = new Date("2026-09-13T00:00:00.000Z");
  const { root, storage } = await createFixture(context, { now: () => now });
  await storage.putObject({ body: new TextEncoder().encode("preview"), key: "preview/item.bin" });

  const url = await storage.getSignedUrl("preview/item.bin", 60);
  assert.match(url, /^bros-local:\/\/local\/preview\/item\.bin\?/);
  assert.equal(url.includes(root), false);
  assert.equal((await readStream(await storage.getObjectBySignedUrl(url))).toString(), "preview");

  const tampered = url.replace("item.bin", "other.bin");
  await assert.rejects(storage.getObjectBySignedUrl(tampered), { code: "INVALID_SIGNED_URL" });

  now = new Date("2026-09-13T00:01:00.000Z");
  await assert.rejects(storage.getObjectBySignedUrl(url), { code: "INVALID_SIGNED_URL_EXPIRY" });
  await assert.rejects(storage.getSignedUrl("preview/item.bin", 86_401), {
    code: "INVALID_SIGNED_URL_EXPIRY",
  });
});

test("a provider-neutral Worker consumer uses the configured local adapter", async (context) => {
  const { root } = await createFixture(context);
  const storage = createObjectStorage({ driver: "local", localRoot: root });

  async function workerArtifactStep(objectStorage) {
    await objectStorage.putObject({
      body: new TextEncoder().encode("worker-artifact"),
      key: "automation/2026/09/13/run-id/result.json",
    });
    return readStream(await objectStorage.getObject("automation/2026/09/13/run-id/result.json"));
  }

  assert.equal((await workerArtifactStep(storage)).toString(), "worker-artifact");
  assert.equal(storage.provider, "LOCAL");
});

test("does not leave a partial target or temporary file when stream writing fails", async (context) => {
  const { root, storage } = await createFixture(context);
  await storage.putObject({
    body: new TextEncoder().encode("preserved"),
    key: "failure/item.bin",
  });
  const failingBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.error(new Error("raw-stream-error"));
    },
  });

  await assert.rejects(
    storage.putObject({ body: failingBody, key: "failure/item.bin" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_IO_ERROR");
      assert.doesNotMatch(error.message, /raw-stream-error/);
      return true;
    },
  );

  assert.equal((await readFile(join(root, "failure", "item.bin"))).toString(), "preserved");
  assert.deepEqual(await readdir(join(root, "failure")), ["item.bin"]);
});

test("concurrent writes can create the same directory without a race failure", async (context) => {
  const { storage } = await createFixture(context);

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      storage.putObject({
        body: new Uint8Array([index]),
        key: `concurrent/shared/item-${String(index)}.bin`,
      }),
    ),
  );

  assert.equal(results.length, 8);
  for (let index = 0; index < results.length; index += 1) {
    assert.deepEqual(
      [
        ...(await readStream(
          await storage.getObject(`concurrent/shared/item-${String(index)}.bin`),
        )),
      ],
      [index],
    );
  }
});

test("rejects unsupported drivers without reading provider secrets", () => {
  assert.throws(() => createObjectStorage({ driver: "r2" }), {
    code: "UNSUPPORTED_STORAGE_DRIVER",
  });
});
