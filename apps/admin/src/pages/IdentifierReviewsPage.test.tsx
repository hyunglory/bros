import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IdentifierReviewsPage } from "./IdentifierReviewsPage";
import type { IdentifierReviewApi } from "../api/identifier-reviews";
const id = "01890f47-0c4d-7abc-8def-1234567890ab",
  runId = "01890f47-0c4d-7abc-8def-1234567890ac";
const run = {
  publicId: runId,
  sourceProductPublicId: id,
  productPublicId: id,
  productName: "검수 운동화",
  brandName: "Fixture",
  productVersion: 3,
  status: "SUCCEEDED" as const,
  outcome: "CANDIDATES",
  errorCode: null,
  createdAt: "2026-09-15T00:00:00Z",
  finishedAt: "2026-09-15T00:00:01Z",
  candidateCount: 1,
};
const detail = {
  publicId: id,
  runPublicId: runId,
  sourceProductPublicId: id,
  productPublicId: id,
  productName: run.productName,
  brandName: "Fixture",
  identifierType: "MODEL_NO" as const,
  candidateValue: "AB-123",
  candidateNorm: "AB123",
  confidenceScore: "75.00",
  rankNo: 1,
  decisionStatus: "CANDIDATE" as const,
  versionNo: 2,
  createdAt: run.createdAt,
  decidedAt: null,
  run,
  evidence: [
    {
      type: "SOURCE_FIELD",
      source: "SOURCE_EXTRACTOR",
      strength: "WEAK",
      weight: 45,
      locator: "/raw/model",
      matchedText: "AB-123",
      sourceUrl: null,
    },
  ],
  conflicts: [],
  audit: [],
};
function mockApi(): IdentifierReviewApi {
  return {
    list: vi.fn().mockResolvedValue({ items: [detail], nextCursor: null }),
    runs: vi.fn().mockResolvedValue({ items: [run], nextCursor: null }),
    detail: vi.fn().mockResolvedValue(detail),
    run: vi.fn().mockResolvedValue({ ...run, providerFailures: [], truncated: false }),
    accept: vi
      .fn()
      .mockResolvedValue({ candidatePublicId: id, decisionStatus: "ACCEPTED", versionNo: 3 }),
    reject: vi
      .fn()
      .mockResolvedValue({ candidatePublicId: id, decisionStatus: "REJECTED", versionNo: 3 }),
    manual: vi
      .fn()
      .mockResolvedValue({ candidatePublicId: id, decisionStatus: "ACCEPTED", versionNo: 2 }),
    reresolve: vi.fn().mockResolvedValue({
      publicId: runId,
      status: "QUEUED",
      statusUrl: `/api/v1/identifier/runs/${runId}`,
    }),
  };
}
async function select() {
  fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
  await screen.findByRole("heading", { name: /AB-123/ });
}
describe("IdentifierReviewsPage", () => {
  it("shows evidence and sends the observed candidate version once while saving", async () => {
    const api = mockApi();
    let complete: (() => void) | undefined;
    api.accept = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    render(<IdentifierReviewsPage api={api} />);
    await select();
    expect(screen.getByText("원본 필드")).toBeVisible();
    const button = screen.getByRole("button", { name: "후보 승인" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.accept).toHaveBeenCalledExactlyOnceWith(id, 2);
    expect(button).toBeDisabled();
    complete?.();
    await screen.findByText("검수 결정을 기록했습니다.");
  });
  it("requires rejection reason and passes reason/version without actor", async () => {
    const api = mockApi();
    render(<IdentifierReviewsPage api={api} />);
    await select();
    fireEvent.click(screen.getByRole("button", { name: "후보 거절" }));
    expect(api.reject).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("판단 사유"), { target: { value: "색상 불일치" } });
    fireEvent.click(screen.getByRole("button", { name: "후보 거절" }));
    await waitFor(() => expect(api.reject).toHaveBeenCalledWith(id, 2, "색상 불일치"));
  });
  it("keeps the same manual request identity after an uncertain failure and supports empty runs", async () => {
    const api = mockApi();
    api.runs = vi
      .fn()
      .mockResolvedValue({ items: [{ ...run, candidateCount: 0 }], nextCursor: null });
    api.run = vi.fn().mockResolvedValue({
      ...run,
      candidateCount: 0,
      outcome: "NOT_FOUND",
      providerFailures: [],
      truncated: false,
    });
    api.manual = vi
      .fn()
      .mockRejectedValueOnce(new Error("응답 확인 실패"))
      .mockResolvedValue({ candidatePublicId: id, decisionStatus: "ACCEPTED", versionNo: 2 });
    render(<IdentifierReviewsPage api={api} />);
    fireEvent.change(screen.getByLabelText("조회 대상"), { target: { value: "run" } });
    fireEvent.click(await screen.findByRole("button", { name: "상세 보기" }));
    await screen.findByText(/후보 없음/);
    fireEvent.change(screen.getByLabelText("판단 사유"), { target: { value: "라벨 확인" } });
    fireEvent.change(screen.getByLabelText("직접입력 품번"), { target: { value: "XY-123" } });
    fireEvent.click(screen.getByRole("button", { name: "입력값 검증·승인" }));
    await screen.findByText("응답 확인 실패");
    fireEvent.click(screen.getByRole("button", { name: "입력값 검증·승인" }));
    await waitFor(() => expect(api.manual).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(api.manual).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]?.[1]).toMatchObject({
      expectedVersion: 3,
      candidateValue: "XY-123",
      reason: "라벨 확인",
    });
  });
  it("disables approval for conflicts and terminal candidates and preserves 409 feedback", async () => {
    const api = mockApi();
    api.detail = vi.fn().mockResolvedValue({ ...detail, conflicts: ["CONFLICT_MODEL"] });
    render(<IdentifierReviewsPage api={api} />);
    await select();
    expect(screen.getByRole("button", { name: "후보 승인" })).toBeDisabled();
    expect(screen.getByText("CONFLICT_MODEL")).toBeVisible();
    api.reject = vi.fn().mockRejectedValue(new Error("다른 검수자가 결정했습니다."));
    fireEvent.change(screen.getByLabelText("판단 사유"), { target: { value: "충돌" } });
    fireEvent.click(screen.getByRole("button", { name: "후보 거절" }));
    await screen.findByText("다른 검수자가 결정했습니다.");
  });
  it("re-resolve switches to the returned run and never reports analysis success early", async () => {
    const api = mockApi();
    render(<IdentifierReviewsPage api={api} />);
    await select();
    fireEvent.click(screen.getByRole("button", { name: "다시 탐색" }));
    await screen.findByText(/재분석을 접수했습니다/);
    expect(api.reresolve).toHaveBeenCalledWith(runId, expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(screen.getByLabelText("조회 대상")).toHaveValue("run");
  });
});
