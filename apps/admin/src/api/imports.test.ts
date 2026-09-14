import { describe, expect, it, vi } from "vitest";
import { fetchImportBatch, fetchImportBatches, retryImportBatch } from "./imports";

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
} as const;

describe("Import API client", () => {
  it("loads a validated filtered cursor page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [batch], nextCursor: "next" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      fetchImportBatches({ cursor: "cursor", limit: 20, status: "FAILED" }, fetcher),
    ).resolves.toMatchObject({ items: [batch] });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/v1/import-batches?cursor=cursor&limit=20&status=FAILED",
    );
  });

  it("rejects malformed detail data without exposing its body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ raw_json: "secret" }), { status: 200 }));
    await expect(fetchImportBatch(publicId, {}, fetcher)).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("sends the explicit operation header and maps backpressure safely", async () => {
    const success = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          publicId,
          status: "QUEUED",
          statusUrl: `/api/v1/import-batches/${publicId}`,
        }),
        { status: 202 },
      ),
    );
    await expect(retryImportBatch(publicId, "resume", success)).resolves.toMatchObject({
      status: "QUEUED",
    });
    expect(success.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "x-bros-operation": "import-retry" }),
    });
    const limited = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(retryImportBatch(publicId, "resume", limited)).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("대기 한도"),
    });
  });
});
