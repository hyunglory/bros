import assert from "node:assert/strict";
import test from "node:test";

import {
  isBrandReviewDecisionResponse,
  isBrandReviewListResponse,
  isBrandSearchResponse,
} from "../dist/brand-review.js";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";
const now = "2026-09-14T00:00:00.000Z";

test("accepts the public unresolved-brand review contract", () => {
  assert.equal(
    isBrandReviewListResponse({
      items: [
        {
          publicId,
          sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ac",
          platform: {
            publicId: "01890f47-0c4d-7abc-8def-1234567890ad",
            code: "MUSINSA",
            name: "무신사",
          },
          externalProductId: "EXT-1",
          productName: "상품",
          rawBrandName: "Unknown Brand",
          normalizedName: "unknown brand",
          unresolvedReason: "UNKNOWN_ALIAS",
          matchReason: null,
          decision: "PENDING",
          selectedBrand: null,
          aliasScope: null,
          decisionReason: null,
          decidedAt: null,
          reprocessBatchPublicId: null,
          version: 0,
          createdAt: now,
        },
      ],
      nextCursor: null,
    }),
    true,
  );
});

test("rejects leaked persistence fields and malformed decision responses", () => {
  assert.equal(
    isBrandSearchResponse({
      items: [{ publicId, key: "NIKE", nameKo: null, nameEn: "Nike", id: 1 }],
    }),
    false,
  );
  assert.equal(
    isBrandReviewDecisionResponse({
      publicId,
      decision: "PENDING",
      version: 0,
      aliasCreated: false,
      reprocessBatchPublicId: null,
    }),
    false,
  );
});
