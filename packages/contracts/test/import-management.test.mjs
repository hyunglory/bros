import assert from "node:assert/strict";
import test from "node:test";
import { Value } from "@sinclair/typebox/value";

import {
  ImportBatchListQuerySchema,
  ImportBatchListResponseSchema,
  ImportRetryRequestSchema,
} from "../dist/index.js";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";
const batch = {
  publicId,
  platformCode: "MUSINSA",
  sourceName: "sample.xlsx",
  importType: "XLSX",
  status: "PARTIAL_FAILED",
  processingStatus: "SUCCESS",
  counts: { total: 2, success: 1, failed: 1, skipped: 0, review: 0 },
  progress: { phase: "pipeline", chunks: 1, visitedCount: 2 },
  pipelineCompleted: true,
  startedAt: "2026-09-14T00:00:00.000Z",
  finishedAt: "2026-09-14T00:01:00.000Z",
  createdAt: "2026-09-14T00:00:00.000Z",
};

test("Import management list contract separates business and processing state", () => {
  assert.equal(
    Value.Check(ImportBatchListResponseSchema, { items: [batch], nextCursor: null }),
    true,
  );
  assert.equal(
    Value.Check(ImportBatchListResponseSchema, {
      items: [{ ...batch, raw_json: {} }],
      nextCursor: null,
    }),
    false,
  );
  assert.equal(
    Value.Check(ImportBatchListResponseSchema, {
      items: [{ ...batch, status: "SUCCESS" }],
      nextCursor: null,
    }),
    false,
  );
});

test("Import management query and retry contracts are closed and bounded", () => {
  assert.equal(Value.Check(ImportBatchListQuerySchema, { limit: 100, status: "FAILED" }), true);
  assert.equal(Value.Check(ImportBatchListQuerySchema, { limit: 101 }), false);
  assert.equal(Value.Check(ImportBatchListQuerySchema, { limit: 10, sort: "raw_json" }), false);
  assert.equal(Value.Check(ImportRetryRequestSchema, { mode: "resume" }), true);
  assert.equal(Value.Check(ImportRetryRequestSchema, { mode: "reset" }), false);
  assert.equal(Value.Check(ImportRetryRequestSchema, { mode: "resume", publicId }), false);
});
