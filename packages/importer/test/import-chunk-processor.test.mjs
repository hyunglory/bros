import assert from "node:assert/strict";
import test from "node:test";
import { createImportChunkProcessor, importChunkDefaults } from "../dist/index.js";

test("import chunk budgets and public IDs fail before opening a connection", async () => {
  assert.deepEqual(importChunkDefaults, { chunkSize: 100, concurrency: 2 });
  for (const options of [
    { chunkSize: 0 },
    { chunkSize: 1001 },
    { concurrency: 0 },
    { concurrency: 17 },
    { chunkSize: 1.5 },
  ]) {
    assert.throws(() => createImportChunkProcessor({ db: null }, options), {
      code: "INVALID_IMPORT_CHUNK_OPTIONS",
    });
  }
  await assert.rejects(
    createImportChunkProcessor({ db: null }).process("internal-id", {
      signal: new globalThis.AbortController().signal,
      finalAttempt: false,
    }),
    { code: "INVALID_IMPORT_BATCH_ID" },
  );
});
