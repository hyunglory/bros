import assert from "node:assert/strict";
import test from "node:test";
import { Value } from "@sinclair/typebox/value";

import {
  ProductMasterListQuerySchema,
  ProductMasterListResponseSchema,
  ProductMasterUpdateRequestSchema,
} from "../dist/index.js";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";
const summary = {
  publicId,
  brand: null,
  productName: "Air Max 90",
  categoryKey: "SHOES",
  productType: "SNEAKERS",
  status: "REVIEW_REQUIRED",
  identifierStatus: "CANDIDATE",
  createdMethod: "IMPORT_STRONG_IDENTIFIER",
  version: 1,
  counts: { sources: 0, skus: 0, identifiers: 0, sourceImages: 0 },
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

test("MASTER list contract exposes public summaries and rejects internal fields", () => {
  assert.equal(
    Value.Check(ProductMasterListResponseSchema, { items: [summary], nextCursor: null }),
    true,
  );
  assert.equal(
    Value.Check(ProductMasterListResponseSchema, {
      items: [{ ...summary, id: "1", metadata_json: { secret: true } }],
      nextCursor: null,
    }),
    false,
  );
});

test("MASTER filter and update contracts are closed, bounded, and versioned", () => {
  assert.equal(
    Value.Check(ProductMasterListQuerySchema, {
      limit: 100,
      status: "ACTIVE",
      identifierStatus: "VERIFIED",
      brand: "Nike",
      source: "MUSINSA",
      query: "HF3835",
    }),
    true,
  );
  assert.equal(Value.Check(ProductMasterListQuerySchema, { limit: 101 }), false);
  assert.equal(Value.Check(ProductMasterListQuerySchema, { query: "   " }), false);
  assert.equal(Value.Check(ProductMasterListQuerySchema, { sort: "metadata_json" }), false);
  assert.equal(
    Value.Check(ProductMasterUpdateRequestSchema, {
      expectedVersion: 1,
      changeReason: "운영자 검수 완료",
      status: "ACTIVE",
    }),
    true,
  );
  assert.equal(
    Value.Check(ProductMasterUpdateRequestSchema, {
      expectedVersion: 1,
      changeReason: "운영자 검수 완료",
    }),
    false,
  );
  assert.equal(
    Value.Check(ProductMasterUpdateRequestSchema, {
      expectedVersion: 1,
      changeReason: "   ",
      status: "ACTIVE",
    }),
    false,
  );
});
