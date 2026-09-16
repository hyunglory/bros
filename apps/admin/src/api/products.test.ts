import { describe, expect, it, vi } from "vitest";
import { fetchProduct, fetchProducts, updateProduct } from "./products";

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
} as const;

describe("Product API client", () => {
  it("loads a validated filtered cursor page", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [summary], nextCursor: "next" }), { status: 200 }),
      );
    await expect(
      fetchProducts(
        {
          cursor: "cursor",
          limit: 20,
          status: "REVIEW_REQUIRED",
          identifierStatus: "CANDIDATE",
          brand: "Nike",
          source: "MUSINSA",
          query: "HF3835",
        },
        fetcher,
      ),
    ).resolves.toMatchObject({ items: [summary] });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/v1/products?cursor=cursor&limit=20&status=REVIEW_REQUIRED&identifierStatus=CANDIDATE&brand=Nike&source=MUSINSA&query=HF3835",
    );
  });

  it("rejects malformed detail without exposing its body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ raw_json: "secret" }), { status: 200 }));
    await expect(fetchProduct(publicId, fetcher)).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("sends expectedVersion and the explicit operation header", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ...summary, version: 2 }), { status: 200 }));
    await updateProduct(
      publicId,
      { expectedVersion: 1, changeReason: "검수 완료", status: "ACTIVE" },
      fetcher,
    );
    const init = fetcher.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: "PATCH",
      headers: expect.objectContaining({ "x-bros-operation": "product-update" }),
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      expectedVersion: 1,
      changeReason: "검수 완료",
      status: "ACTIVE",
    });
  });
});
