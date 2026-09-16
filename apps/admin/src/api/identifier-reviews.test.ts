import { afterEach, describe, expect, it, vi } from "vitest";
import { identifierReviewApi, createReviewRequestId } from "./identifier-reviews";
const id = "01890f47-0c4d-7abc-8def-1234567890ab";
afterEach(() => vi.unstubAllGlobals());
describe("identifier review client", () => {
  it("uses a same-origin JSON operation and validates response", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ candidatePublicId: id, decisionStatus: "ACCEPTED", versionNo: 2 }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await identifierReviewApi.accept(id, 1);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/identifier/candidates/${id}/accept`,
      expect.objectContaining({
        method: "POST",
        body: '{"expectedVersion":1}',
        headers: expect.objectContaining({ "x-bros-operation": "identifier-review" }),
      }),
    );
  });
  it("hides raw server errors and refuses extra response fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private-error-marker", { status: 409 })),
    );
    await expect(identifierReviewApi.accept(id, 1)).rejects.toThrow("이미 결정됐거나");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ items: [], nextCursor: null, raw: "private-marker" })),
        ),
    );
    await expect(identifierReviewApi.list({})).rejects.toThrow("응답 형식");
  });
  it("generates distinct UUIDv7 identities", () => {
    const first = createReviewRequestId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createReviewRequestId()).not.toBe(first);
  });
});
