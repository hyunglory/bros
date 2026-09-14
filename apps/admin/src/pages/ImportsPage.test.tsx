import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportsPage } from "./ImportsPage";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";
const batch = {
  publicId,
  platformCode: "MUSINSA",
  sourceName: "sample.xlsx",
  importType: "XLSX",
  status: "PARTIAL_FAILED",
  processingStatus: "FAILED",
  counts: { total: 2, success: 1, failed: 1, skipped: 0, review: 0 },
  progress: { phase: "pipeline", chunks: 1, visitedCount: 2 },
  pipelineCompleted: true,
  startedAt: "2026-09-14T00:00:00.000Z",
  finishedAt: "2026-09-14T00:01:00.000Z",
  createdAt: "2026-09-14T00:00:00.000Z",
} as const;
const detail = {
  batch,
  items: [
    {
      publicId: "01890f47-0c4d-7abc-8def-1234567890ac",
      rowNumber: 7,
      externalProductId: null,
      sourceProductPublicId: null,
      status: "FAILED" as const,
      action: "FAILED" as const,
      errorCode: "MISSING_EXTERNAL_PRODUCT_ID",
      errorMessage: "Required identifier is missing",
      processedAt: "2026-09-14T00:01:00.000Z",
      createdAt: "2026-09-14T00:00:00.000Z",
    },
  ],
  nextItemCursor: null,
};

describe("ImportsPage", () => {
  it("shows business and processing results with a safe failure reason", async () => {
    const loadList = vi.fn().mockResolvedValue({ items: [batch], nextCursor: null });
    const loadDetail = vi.fn().mockResolvedValue(detail);
    render(<ImportsPage loadList={loadList} loadDetail={loadDetail} />);
    expect(await screen.findByText("sample.xlsx")).toBeVisible();
    expect(screen.getAllByText("일부 실패").at(-1)).toBeVisible();
    expect(screen.getByText("Worker 중단")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }));
    expect(await screen.findByText("MISSING_EXTERNAL_PRODUCT_ID")).toBeVisible();
    expect(screen.getByText("Required identifier is missing")).toBeVisible();
  });

  it("renders a recoverable API error state", async () => {
    const loadList = vi
      .fn()
      .mockRejectedValueOnce(new Error("Import API가 준비되지 않았습니다."))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<ImportsPage loadList={loadList} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Import API가 준비되지 않았습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("조건에 맞는 Batch가 없습니다.")).toBeVisible();
  });

  it("submits an explicit resume and preserves the detail view", async () => {
    const loadList = vi.fn().mockResolvedValue({ items: [batch], nextCursor: null });
    const loadDetail = vi.fn().mockResolvedValue(detail);
    const retryBatch = vi.fn().mockResolvedValue({
      publicId,
      status: "QUEUED",
      statusUrl: `/api/v1/import-batches/${publicId}`,
    });
    render(<ImportsPage loadList={loadList} loadDetail={loadDetail} retryBatch={retryBatch} />);
    fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: "처리 재개" }));
    expect(await screen.findByText("재개 요청을 접수했습니다.")).toBeVisible();
    expect(retryBatch).toHaveBeenCalledWith(publicId, "resume");
  });
});
