import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandReviewClientError } from "../api/brand-reviews";
import { BrandReviewsPage } from "./BrandReviewsPage";

const reviewId = "01890f47-0c4d-7abc-8def-1234567890ab";
const brandId = "01890f47-0c4d-7abc-8def-1234567890ac";
const review = {
  publicId: reviewId,
  sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ad",
  platform: { publicId: "01890f47-0c4d-7abc-8def-1234567890ae", code: "MUSINSA", name: "무신사" },
  externalProductId: "EXT-1",
  productName: "검수 상품",
  rawBrandName: "나익히",
  normalizedName: "나익히",
  unresolvedReason: "UNKNOWN_ALIAS" as const,
  matchReason: null,
  decision: "PENDING" as const,
  selectedBrand: null,
  aliasScope: null,
  decisionReason: null,
  decidedAt: null,
  reprocessBatchPublicId: null,
  version: 0,
  createdAt: "2026-09-14T00:00:00.000Z",
};

describe("BrandReviewsPage", () => {
  it("approves an alias with an explicit brand, scope, reason, and version", async () => {
    const loadList = vi.fn().mockResolvedValue({ items: [review], nextCursor: null });
    const approve = vi.fn().mockResolvedValue({
      publicId: reviewId,
      decision: "APPROVED",
      version: 1,
      aliasCreated: true,
      reprocessBatchPublicId: brandId,
    });
    render(
      <BrandReviewsPage
        loadList={loadList}
        loadBrands={vi.fn().mockResolvedValue({
          items: [{ publicId: brandId, key: "NIKE", nameKo: "나이키", nameEn: "Nike" }],
        })}
        approve={approve}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "검수" }));
    fireEvent.change(await screen.findByLabelText("연결 브랜드"), { target: { value: brandId } });
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "공식 브랜드 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "Alias 승인 및 재처리" }));
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith(reviewId, {
        expectedVersion: 0,
        brandPublicId: brandId,
        scope: "PLATFORM",
        changeReason: "공식 브랜드 확인",
      }),
    );
    expect(await screen.findByText(/재처리 batch/)).toBeVisible();
  });

  it("records rejection without selecting a brand", async () => {
    const reject = vi.fn().mockResolvedValue({
      publicId: reviewId,
      decision: "REJECTED",
      version: 1,
      aliasCreated: false,
      reprocessBatchPublicId: null,
    });
    render(
      <BrandReviewsPage
        loadList={vi.fn().mockResolvedValue({ items: [review], nextCursor: null })}
        loadBrands={vi.fn().mockResolvedValue({ items: [] })}
        reject={reject}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "검수" }));
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "브랜드 아님" } });
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith(reviewId, {
        expectedVersion: 0,
        changeReason: "브랜드 아님",
      }),
    );
  });

  it("refreshes after a concurrent decision conflict", async () => {
    const loadList = vi.fn().mockResolvedValue({ items: [review], nextCursor: null });
    const approve = vi
      .fn()
      .mockRejectedValue(
        new BrandReviewClientError("http", "검수 대상이나 alias가 변경되었습니다.", 409),
      );
    render(
      <BrandReviewsPage
        loadList={loadList}
        loadBrands={vi.fn().mockResolvedValue({
          items: [{ publicId: brandId, key: "NIKE", nameKo: null, nameEn: "Nike" }],
        })}
        approve={approve}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "검수" }));
    fireEvent.change(await screen.findByLabelText("연결 브랜드"), { target: { value: brandId } });
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "충돌 검증" } });
    fireEvent.click(screen.getByRole("button", { name: "Alias 승인 및 재처리" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("변경되었습니다");
    await waitFor(() => expect(loadList).toHaveBeenCalledTimes(2));
  });
});
