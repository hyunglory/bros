import { describe, expect, it, vi } from "vitest";
import {
  approveBrandReview,
  fetchBrandReviews,
  rejectBrandReview,
  searchBrands,
} from "./brand-reviews";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";

describe("Brand review API client", () => {
  it("loads encoded list and brand-search queries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));
    await fetchBrandReviews(
      { decision: "PENDING", platform: "무신사", query: "A&B", limit: 25 },
      fetcher,
    );
    await searchBrands("Nike Korea", fetcher);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/v1/brand-reviews?limit=25&decision=PENDING&platform=%EB%AC%B4%EC%8B%A0%EC%82%AC&query=A%26B",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/v1/brands?limit=50&query=Nike+Korea");
  });

  it("sends versioned approve and reject operations", async () => {
    const approveResult = {
      publicId,
      decision: "APPROVED",
      version: 1,
      aliasCreated: true,
      reprocessBatchPublicId: "01890f47-0c4d-7abc-8def-1234567890ac",
    };
    const rejectResult = {
      publicId,
      decision: "REJECTED",
      version: 1,
      aliasCreated: false,
      reprocessBatchPublicId: null,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(approveResult)))
      .mockResolvedValueOnce(new Response(JSON.stringify(rejectResult)));
    await approveBrandReview(
      publicId,
      { expectedVersion: 0, brandPublicId: publicId, scope: "PLATFORM", changeReason: "확인" },
      fetcher,
    );
    await rejectBrandReview(publicId, { expectedVersion: 0, changeReason: "오인식" }, fetcher);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "x-bros-operation": "brand-review-approve" }),
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      expectedVersion: 0,
      scope: "PLATFORM",
    });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "x-bros-operation": "brand-review-reject" }),
    });
  });

  it("rejects a response containing internal data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], nextCursor: null, raw_json: {} })),
      );
    await expect(fetchBrandReviews({}, fetcher)).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });
});
