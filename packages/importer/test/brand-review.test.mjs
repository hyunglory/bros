import assert from "node:assert/strict";
import test from "node:test";

import { createBrandReviewService } from "../dist/brand-review.js";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";

test("brand review rejects invalid options and decision input before DB access", async () => {
  let transactions = 0;
  const database = {
    transaction() {
      transactions += 1;
      throw new Error("database must not be reached");
    },
  };
  const queue = {
    publish() {
      throw new Error("queue must not be reached");
    },
  };
  assert.throws(() => createBrandReviewService(database, { maxQueuedBatches: 0 }), {
    code: "INVALID_BRAND_REVIEW_OPTIONS",
  });
  const service = createBrandReviewService(database, { queue });
  await assert.rejects(service.reject(publicId, { expectedVersion: 0, changeReason: "   " }), {
    code: "INVALID_BRAND_REVIEW_INPUT",
  });
  await assert.rejects(
    service.approve(publicId, {
      expectedVersion: -1,
      brandPublicId: publicId,
      scope: "PLATFORM",
      changeReason: "검수",
    }),
    { code: "INVALID_BRAND_REVIEW_INPUT" },
  );
  await assert.rejects(
    service.approve(publicId, {
      expectedVersion: 0,
      brandPublicId: publicId,
      scope: "UNKNOWN",
      changeReason: "검수",
    }),
    { code: "INVALID_BRAND_REVIEW_INPUT" },
  );
  await assert.rejects(
    service.approve(publicId, {
      expectedVersion: 0,
      brandPublicId: "not-a-public-id",
      scope: "PLATFORM",
      changeReason: "검수",
    }),
    { code: "INVALID_BRAND_ID" },
  );
  assert.equal(transactions, 0);
});
