import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductClientError } from "../api/products";
import { ProductsPage } from "./ProductsPage";

const masterId = "01890f47-0c4d-7abc-8def-1234567890ab";
const skuId = "01890f47-0c4d-7abc-8def-1234567890ac";
const identifierId = "01890f47-0c4d-7abc-8def-1234567890ad";
const sourceId = "01890f47-0c4d-7abc-8def-1234567890ae";
const sourceSkuId = "01890f47-0c4d-7abc-8def-1234567890af";
const imageId = "01890f47-0c4d-7abc-8def-1234567890b0";
const platformId = "01890f47-0c4d-7abc-8def-1234567890b1";
const now = "2026-09-14T00:00:00.000Z";
const master = {
  publicId: masterId,
  brand: {
    publicId: "01890f47-0c4d-7abc-8def-1234567890b2",
    key: "NIKE",
    nameKo: "나이키",
    nameEn: "Nike",
  },
  productName: "Air Max 90",
  categoryKey: "UNKNOWN",
  productType: "UNKNOWN",
  status: "REVIEW_REQUIRED" as const,
  identifierStatus: "CANDIDATE" as const,
  createdMethod: "IMPORT_STRONG_IDENTIFIER",
  version: 3,
  counts: { sources: 1, skus: 1, identifiers: 1, sourceImages: 1 },
  createdAt: now,
  updatedAt: now,
};
const detail = {
  master,
  skus: [
    {
      publicId: skuId,
      skuName: "270",
      optionKey: "size=270",
      status: "REVIEW_REQUIRED" as const,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
  ],
  identifiers: [
    {
      publicId: identifierId,
      skuPublicId: skuId,
      type: "STYLE_CODE" as const,
      value: "HF3835-100",
      isPrimary: true,
      isVerified: false,
      confidence: 91.25,
      evidenceType: "SOURCE_EMBEDDED",
      sourceUrl: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  sources: [
    {
      publicId: sourceId,
      platform: { publicId: platformId, code: "MUSINSA", name: "MUSINSA" },
      externalProductId: "EXT-001",
      productUrl: null,
      rawProductName: "나이키 에어맥스",
      rawBrandName: "NIKE",
      currentPrice: "129000.0000",
      normalPrice: null,
      currencyCode: "KRW",
      stockStatus: "IN_STOCK" as const,
      matchStatus: "MATCHED" as const,
      matchConfidence: 91.25,
      skus: [
        {
          publicId: sourceSkuId,
          canonicalSkuPublicId: skuId,
          externalSkuId: "SKU-270",
          rawOptionName: "270",
          optionKey: "size=270",
          currentPrice: "129000.0000",
          stockStatus: "IN_STOCK" as const,
        },
      ],
      collectedAt: now,
      lastSeenAt: now,
      updatedAt: now,
    },
  ],
  sourceImages: [
    {
      publicId: imageId,
      sourceProductPublicId: sourceId,
      skuPublicId: skuId,
      type: "SOURCE_MAIN" as const,
      sourceUrl: "https://example.test/image.jpg",
      processStatus: "REGISTERED" as const,
      stored: false,
      mimeType: null,
      width: null,
      height: null,
      sourceRevision: 1,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

describe("ProductsPage", () => {
  it("shows every public relationship and submits a versioned safe edit", async () => {
    const listLoader = vi.fn().mockResolvedValue({ items: [master], nextCursor: null });
    const detailLoader = vi.fn().mockResolvedValue(detail);
    const updateAction = vi.fn().mockResolvedValue({ ...master, version: 4, status: "ACTIVE" });
    render(
      <ProductsPage
        listLoader={listLoader}
        detailLoader={detailLoader}
        updateAction={updateAction}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
    expect(await screen.findByText(identifierId)).toBeVisible();
    expect(screen.getByText(sourceId)).toBeVisible();
    expect(screen.getByText(sourceSkuId)).toBeVisible();
    expect(screen.getByText(imageId)).toBeVisible();
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "운영자 검수 완료" } });
    fireEvent.change(
      screen.getByLabelText("MASTER 상태", { selector: ".product-edit-form select" }),
      { target: { value: "ACTIVE" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "기본 정보 저장" }));
    await waitFor(() => expect(updateAction).toHaveBeenCalled());
    expect(updateAction).toHaveBeenCalledWith(
      masterId,
      expect.objectContaining({
        expectedVersion: 3,
        changeReason: "운영자 검수 완료",
        status: "ACTIVE",
      }),
    );
  });

  it("renders missing relationships as explicit empty states", async () => {
    const emptyMaster = {
      ...master,
      brand: null,
      counts: { sources: 0, skus: 0, identifiers: 0, sourceImages: 0 },
    };
    render(
      <ProductsPage
        listLoader={vi.fn().mockResolvedValue({ items: [emptyMaster], nextCursor: null })}
        detailLoader={vi.fn().mockResolvedValue({
          master: emptyMaster,
          skus: [],
          identifiers: [],
          sources: [],
          sourceImages: [],
        })}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
    expect(await screen.findByText("연결된 표준 SKU가 없습니다.")).toBeVisible();
    expect(screen.getByText("등록된 Identifier가 없습니다.")).toBeVisible();
    expect(screen.getByText("연결된 Source 상품이 없습니다.")).toBeVisible();
    expect(screen.getByText("등록된 원본 이미지가 없습니다.")).toBeVisible();
  });

  it("reloads current detail after an expectedVersion conflict", async () => {
    const detailLoader = vi.fn().mockResolvedValue(detail);
    const updateAction = vi
      .fn()
      .mockRejectedValue(
        new ProductClientError(
          "http",
          "다른 작업자가 먼저 수정했습니다. 최신 정보를 다시 확인하세요.",
          409,
        ),
      );
    render(
      <ProductsPage
        listLoader={vi.fn().mockResolvedValue({ items: [master], nextCursor: null })}
        detailLoader={detailLoader}
        updateAction={updateAction}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
    await screen.findByText(identifierId);
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "충돌 검증" } });
    fireEvent.click(screen.getByRole("button", { name: "기본 정보 저장" }));
    expect(await screen.findByText(/다른 작업자가 먼저 수정했습니다/)).toBeVisible();
    expect(detailLoader).toHaveBeenCalledTimes(2);
  });
});
