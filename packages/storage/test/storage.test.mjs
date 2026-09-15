import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import test from "node:test";
import { TextEncoder } from "node:util";
import { URL } from "node:url";
import {
  StorageError,
  buildObjectKey,
  createLocalObjectStorage,
  createObjectStorage,
  createR2ObjectStorage,
  validateObjectKey,
} from "../dist/index.js";
import { EnvSecretProvider } from "../../core/dist/index.js";

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

test("lists only portable objects under a bounded prefix", async (context) => {
  const { storage } = await createFixture(context);
  await storage.putObject({ body: new Uint8Array([1]), key: "database-backup/2026/one.enc" });
  await storage.putObject({ body: new Uint8Array([1, 2]), key: "database-backup/2026/two.json" });
  await storage.putObject({ body: new Uint8Array([3]), key: "automation/unrelated.json" });
  assert.deepEqual(
    (await storage.listObjects("database-backup")).map(({ objectKey, size }) => ({
      objectKey,
      size,
    })),
    [
      { objectKey: "database-backup/2026/one.enc", size: 1 },
      { objectKey: "database-backup/2026/two.json", size: 2 },
    ],
  );
  assert.deepEqual(await storage.listObjects("missing-prefix"), []);
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

test("uses the R2 S3 contract with retries, private metadata, and expiring signed URLs", async () => {
  const attempts = { put: 0 };
  const requests = [];
  const storage = createR2ObjectStorage({
    bucket: "private-artifacts",
    endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    requestHandler: {
      async handle(request) {
        requests.push({ headers: request.headers, method: request.method });
        if (request.method === "PUT") {
          attempts.put += 1;
          if (attempts.put === 1)
            return { response: { body: Readable.from([]), headers: {}, statusCode: 503 } };
          return { response: { body: Readable.from([]), headers: {}, statusCode: 200 } };
        }
        if (request.method === "GET" && request.query?.["list-type"] === "2") {
          return {
            response: {
              body: Readable.from([
                Buffer.from(
                  '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>database-backup/2026/item.enc</Key><LastModified>2026-09-15T00:00:00.000Z</LastModified><Size>9</Size></Contents></ListBucketResult>',
                ),
              ]),
              headers: { "content-type": "application/xml" },
              statusCode: 200,
            },
          };
        }
        if (request.method === "GET") {
          return {
            response: {
              body: Readable.from([Buffer.from("from-r2")]),
              headers: { "content-length": "7" },
              statusCode: 200,
            },
          };
        }
        return { response: { body: Readable.from([]), headers: {}, statusCode: 204 } };
      },
    },
    secretProvider: new EnvSecretProvider({
      BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID: "r2-access-key",
      BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY: "r2-secret-key",
    }),
  });

  const stored = await storage.putObject({
    body: new TextEncoder().encode("payload"),
    contentHash: "a".repeat(64),
    contentType: "application/json",
    key: "automation/2026/09/14/run-id/result.json",
  });
  assert.deepEqual(stored, {
    bucket: "private-artifacts",
    objectKey: "automation/2026/09/14/run-id/result.json",
    provider: "R2",
    size: 7,
  });
  assert.equal(attempts.put, 2);
  const put = requests.find((request) => request.method === "PUT");
  assert.equal(put.headers["content-type"], "application/json");
  assert.equal(put.headers["x-amz-meta-content-sha256"], "a".repeat(64));
  assert.equal(
    (
      await readStream(await storage.getObject("automation/2026/09/14/run-id/result.json"))
    ).toString(),
    "from-r2",
  );
  await storage.deleteObject("automation/2026/09/14/run-id/result.json");
  assert.equal(requests.at(-1).method, "DELETE");
  assert.deepEqual(
    (await storage.listObjects("database-backup")).map(({ objectKey, size }) => ({
      objectKey,
      size,
    })),
    [{ objectKey: "database-backup/2026/item.enc", size: 9 }],
  );

  const signedUrl = new URL(
    await storage.getSignedUrl("automation/2026/09/14/run-id/result.json", 300),
  );
  assert.equal(signedUrl.protocol, "https:");
  assert.equal(signedUrl.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(signedUrl.toString().includes("r2-secret-key"), false);
  await assert.rejects(storage.getSignedUrl("automation/2026/09/14/run-id/result.json", 604_801), {
    code: "INVALID_SIGNED_URL_EXPIRY",
  });
});

test("maps missing R2 credentials to a stable storage authentication error", async () => {
  const storage = createR2ObjectStorage({
    bucket: "private-artifacts",
    endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    secretProvider: new EnvSecretProvider({}),
  });
  await assert.rejects(storage.getSignedUrl("automation/2026/09/14/run-id/result.json", 60), {
    code: "STORAGE_AUTH_FAILED",
  });
});

test("requires a SecretProvider when selecting the R2 driver", () => {
  assert.throws(
    () =>
      createObjectStorage({
        bucket: "private-artifacts",
        driver: "r2",
        endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      }),
    { code: "STORAGE_AUTH_FAILED" },
  );
});
